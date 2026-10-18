"""Database workspace API. Sources remain serialized in their owning Markdown.

Stable IDs and existing entry files are preserved. Database cell writes update
one SQLite entry, and schema changes keep a recoverable before/after journal.
"""
from database_filters import validate_filters, checked_zone
from database_dates import checked_date, date_start, shift_date
import ast
from contextlib import closing
from datetime import datetime
import hashlib
import json
import math
import operator
from pathlib import Path
import re
import threading
import uuid
from flask import request, jsonify, send_file
from database_identity import database_blocks, valid_id, write_json

TYPES = ('text','number','select','multi_select','status','date','person','files','checkbox','url','phone','email','relation','rollup','formula','button','id','place','created_time','edited_time','created_by','edited_by')
COMPUTED = {'rollup','formula','id','created_time','edited_time','created_by','edited_by'}
LOCK = threading.RLock()


def now():
    return datetime.now().isoformat(timespec='microseconds')


def revision(text):
    return hashlib.sha256(text.encode()).hexdigest()


def empty(kind):
    return [] if kind in ('multi_select','person','files','relation') else False if kind == 'checkbox' else ''


def validate(kind, value):
    if value is None or value == '':
        return empty(kind)
    if kind == 'number':
        if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(value):
            raise ValueError('Se requiere un número finito')
    elif kind == 'date':
        return checked_date(value)
    elif kind == 'checkbox':
        if not isinstance(value, bool): raise ValueError('Se requiere verdadero o falso')
    elif kind in ('multi_select','person','relation'):
        if not isinstance(value, list) or any(not isinstance(v,str) for v in value): raise ValueError('Se requiere una lista de identificadores/opciones')
        if kind == 'person' and any(v != 'owner' for v in value): raise ValueError('Atlas dispone del usuario local Propietario')
    elif kind == 'files':
        if not isinstance(value,list) or any(not isinstance(v,dict) or not re.fullmatch(r'[a-f0-9]{32}',v.get('id','')) for v in value): raise ValueError('Archivo no válido')
    elif kind == 'place':
        if not isinstance(value,dict): raise ValueError('Lugar requiere nombre, latitud y longitud')
        if not isinstance(value.get('name',''),str) or not isinstance(value.get('lat'),(int,float)) or not isinstance(value.get('lng'),(int,float)) or not -90 <= value['lat'] <= 90 or not -180 <= value['lng'] <= 180: raise ValueError('Coordenadas no válidas')
    else:
        if not isinstance(value,str): raise ValueError('Se requiere texto')
        if kind == 'url' and value and not re.match(r'^https?://',value,re.I): raise ValueError('URL debe comenzar por http:// o https://')
        if kind == 'email' and value and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value): raise ValueError('Correo no válido')
    return value


def convert(value, old, new):
    if old == new: return value
    if value is None or value == '' or value == []: return empty(new)
    if new == 'text': return json.dumps(value,ensure_ascii=False) if isinstance(value,(list,dict,bool)) else str(value)
    if new == 'number' and isinstance(value,str):
        number = float(value)
        return validate(new,number)
    if new == 'multi_select' and old in ('select','status'): return [value]
    if new in ('select','status') and old == 'multi_select' and len(value) == 1: return value[0]
    if new == 'checkbox' and isinstance(value,str) and value.lower() in ('true','false'): return value.lower() == 'true'
    return validate(new,value)


def formula(expression, getter):
    """Bounded expression interpreter; no eval, attributes or Python execution."""
    if len(expression) > 1000: raise ValueError('Fórmula demasiado larga')
    tree = ast.parse(expression or '0', mode='eval')
    if sum(1 for _ in ast.walk(tree)) > 120: raise ValueError('Fórmula demasiado compleja')
    operations = {ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Mod:operator.mod}
    def run(node):
        if isinstance(node,ast.Constant) and isinstance(node.value,(str,int,float,bool)): return node.value
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)): return (+1 if isinstance(node.op,ast.UAdd) else -1)*run(node.operand)
        if isinstance(node,ast.BinOp) and type(node.op) in operations:
            left,right=run(node.left),run(node.right)
            if isinstance(node.op,ast.Mult) and (isinstance(left,str) or isinstance(right,str)): raise ValueError('Usa concat para texto')
            result=operations[type(node.op)](left,right)
            if len(str(result)) > 10000: raise ValueError('Resultado demasiado grande')
            return result
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and not node.keywords:
            name=node.func.id
            if name=='ifelse' and len(node.args)==3: return run(node.args[1] if run(node.args[0]) else node.args[2])
            args=[run(arg) for arg in node.args]
            if name=='prop' and len(args)==1 and isinstance(args[0],str): return getter(args[0])
            if name=='concat': return ''.join(map(str,args))[:10000]
            if name=='round' and 1 <= len(args) <= 2: return round(*args)
            if name=='length' and len(args)==1: return len(args[0])
            if name=='ifelse' and len(args)==3: return args[1] if args[0] else args[2]
        raise ValueError('Fórmula no admitida: usa prop, concat, round, length, ifelse y aritmética')
    result=run(tree.body)
    if isinstance(result,float) and not math.isfinite(result): raise ValueError('Resultado numérico no finito')
    return result


def normalize_schema(schema):
    """Read-time compatibility; legacy presentation survives the next edit."""
    schema.setdefault('columns',[dict(id='col_status',name='Estado',type='status')])
    if not schema.get('views'):
        view=dict(id='view_default',name='Tabla',type='table')
        view.update({key:schema[key] for key in ('filter','sort','groupBy','calc','rowHeight','titleWidth') if key in schema})
        schema['views']=[view]
    aliases={'count_all':'count','count_not_empty':'filled'}
    for i,view in enumerate(schema['views']):
        view.setdefault('id','view_'+str(i));view.setdefault('name','Tabla' if i==0 else 'Vista '+str(i+1));view.setdefault('type','table')
        if view.get('groupBy')=='__title': view['groupBy']='title'
        if 'calculations' not in view and view.get('calc'):
            view['calculations']={('title' if key=='__title' else key):aliases.get(method,method) for key,method in view['calc'].items()}
        if 'filters' not in view and view.get('filter',{}):
            legacy=view['filter'];key=legacy.get('colId');col=next((c for c in schema['columns'] if c['id']==key),{})
            if key:
                rule=dict(colId='title' if key=='__title' else key,op='is' if col.get('type') in ('select','multi_select','status','checkbox') else 'contains',value=legacy.get('value',''))
                if col.get('type')=='checkbox': rule['value']=legacy.get('value')!='unchecked'
                view['filters']=[rule] if rule['value']!='' else []
        if 'sorts' not in view and view.get('sort',{}):
            legacy=view['sort']
            if legacy.get('colId'): view['sorts']=[dict(legacy,colId='title' if legacy['colId']=='__title' else legacy['colId'])]
    if schema.get('activeView') not in {v['id'] for v in schema['views']}: schema['activeView']=schema['views'][0]['id']
    return schema


def register_database_api(app, g):
    def connect():
        conn = g['_index_db_connect']()
        g['_migrate_index_json_to_sqlite_if_needed'](conn)
        return conn
    def read(conn): return {k:json.loads(v) for k,v in conn.execute('SELECT entry_id,meta FROM entries')}
    def source(parent, source_id, index):
        if not valid_id(source_id) or parent not in index: raise ValueError('Base no encontrada')
        path=g['_entry_path'](parent,index[parent])
        text=path.read_text()
        blocks=[b for b in database_blocks(text) if b[2].get('database_id')==source_id]
        if len(blocks)!=1: raise ValueError('La base no está guardada o su identidad está repetida; guarda la página primero')
        start,end,schema=blocks[0]
        normalize_schema(schema)
        return path,text,start,end,schema
    def all_sources(index):
        result=[]
        for parent,meta in index.items():
            if meta.get('database_deleted'):continue
            path=g['_entry_path'](parent,meta)
            if path.exists():
                try:
                    for _,_,schema in database_blocks(path.read_text()):
                        normalize_schema(schema)
                        if valid_id(schema.get('database_id')): result.append(dict(parent_id=parent,id=schema['database_id'],name=schema.get('name') or meta.get('title',parent),columns=schema.get('columns',[])))
                except (ValueError,TypeError): pass
        return result
    def raw_value(meta, col):
        return next((p.get('value') for p in meta.get('properties',[]) if p.get('id')==col['id']),empty(col['type']))
    def relation_schema(col,index):
        # One request sees one transactional index snapshot. Share only schema
        # availability within that request, never across later edits/restores.
        cache=getattr(request,'_atlas_relation_schemas',None)
        if cache is None:
            cache={};request._atlas_relation_schemas=cache
        key=(col.get('target_parent'),col.get('target_database'))
        if key not in cache:
            owner=index.get(key[0]);schema=None
            if owner and not owner.get('database_deleted'):
                try:schema=source(*key,index)[4]
                except (ValueError,KeyError,TypeError,OSError):pass
            cache[key]=schema
        return cache[key]
    def relation_state(meta,col,index):
        ids=raw_value(meta,col) or []
        available=relation_schema(col,index) is not None
        issues=[];records=[]
        if not isinstance(ids,list) or any(not isinstance(key,str) for key in ids):
            return [],[dict(id='',reason='invalid_value',title='Valor original conservado')],available
        for key in dict.fromkeys(ids):
            target=index.get(key)
            reason='source_missing' if not available else 'missing' if target is None else 'wrong_source' if target.get('parent_id')!=col.get('target_parent') or target.get('database_id')!=col.get('target_database') else 'deleted' if target.get('database_deleted') else None
            if reason:issues.append(dict(id=key,reason=reason,title=target.get('title',key) if target else key))
            else:records.append(dict(id=key,title=target.get('title',key)))
        return records,issues,available
    def value_for(row_id,meta,col,schema,index,seen=None):
        seen=set(seen or ())
        token=(row_id,col['id'])
        if token in seen: raise ValueError('Dependencia circular')
        seen.add(token)
        kind=col['type']
        if kind=='id': return str(col.get('prefix','AT'))+'-'+meta.get('uid',row_id)
        if kind in ('created_time','edited_time'): return meta.get('created_at','') if kind=='created_time' else meta.get('updated_at',meta.get('created_at',''))
        if kind in ('created_by','edited_by'): return 'Propietario'
        if kind=='formula':
            def get(name):
                dep=next((c for c in schema['columns'] if c['id']==name or c['name']==name),None)
                if not dep: raise ValueError('Propiedad de fórmula inexistente: '+name)
                return value_for(row_id,meta,dep,schema,index,seen)
            return formula(col.get('expression','0'),get)
        if kind=='rollup':
            relation=next((c for c in schema['columns'] if c['id']==col.get('relation_id') and c['type']=='relation'),None)
            if not relation: raise ValueError('Selecciona una propiedad Relación')
            ids=raw_value(meta,relation) or []
            records,issues,available=relation_state(meta,relation,index)
            if not available:raise ValueError('La base de destino de la relación no está disponible')
            if issues:raise ValueError('La relación contiene '+str(len(issues))+' referencias no disponibles; resuélvelas antes de calcular')
            ids=list(dict.fromkeys(ids))
            valid_ids={item['id'] for item in records}
            related=[index[key] for key in ids if key in valid_ids]
            if col.get('aggregation','count')=='count': return len(related)
            target_source=relation_schema(relation,index)
            target=next((c for c in target_source['columns'] if c['id']==col.get('target_property')),None)
            if not target: raise ValueError('Selecciona la propiedad de destino')
            values=[value_for(key,index[key],target,target_source,index,seen) for key in ids if key in index and index[key] in related]
            values=[v for v in values if isinstance(v,(int,float)) and not isinstance(v,bool)]
            agg=col.get('aggregation')
            return (sum(values) if agg=='sum' else sum(values)/len(values) if agg=='average' and values else min(values) if agg=='min' and values else max(values) if agg=='max' and values else '')
        return raw_value(meta,col)
    def projected(row_id,meta,schema,index):
        properties=[]
        originals={p['id']:p for p in meta.get('properties',[]) if 'id' in p}
        for col in schema['columns']:
            prop=dict(originals.get(col['id'],{}),**{k:col[k] for k in ('id','name','type')},options=col.get('options',[]),groups=col.get('groups',[]))
            if prop.get('conversion_pending'): prop['original_type']=originals[col['id']].get('type')
            try: prop['value']=value_for(row_id,meta,col,schema,index)
            except (ValueError,TypeError,ZeroDivisionError,SyntaxError,OverflowError) as error: prop.update(value='',calculation_error=str(error))
            if col['type']=='relation':
                records,issues,available=relation_state(meta,col,index)
                prop.update(related_records=records,relation_issues=issues,relation_source_available=available)
            properties.append(prop)
        return {**meta,'id':row_id,'properties':properties}
    def put(conn,row_id,meta):
        conn.execute('INSERT INTO entries(entry_id,meta) VALUES(?,?) ON CONFLICT(entry_id) DO UPDATE SET meta=excluded.meta',(row_id,json.dumps(meta,ensure_ascii=False)))
    def journal(path,text,after,changes,parent,source_id):
        folder=g['DATA_DIR']/'database_recovery'/uuid.uuid4().hex
        folder.mkdir(parents=True)
        payload=dict(parent_id=parent,database_id=source_id,path=str(path),before=text,after=after,changes=changes,created_at=now(),status='prepared')
        write_json(folder/'snapshot.json',payload)
        return folder,payload
    def checked_cell(index,meta,col,value):
        value=validate(col['type'],value)
        if col['type']=='relation':
            old=raw_value(meta,col) or []
            if any(key not in old for key in value):
                try:
                    owner=index.get(col.get('target_parent'))
                    if not owner or owner.get('database_deleted'):raise ValueError('Base no disponible')
                    source(col.get('target_parent'),col.get('target_database'),index)
                except (ValueError,KeyError,TypeError,OSError) as error:raise ValueError('La base de destino no está disponible') from error
            if any(key not in old and (key not in index or index[key].get('database_deleted') or index[key].get('parent_id')!=col.get('target_parent') or index[key].get('database_id')!=col.get('target_database')) for key in value): raise ValueError('La relación apunta fuera de la base seleccionada')
        if col['type']=='files':
            for item in value:
                if not (g['DATA_DIR']/'database_files'/item['id']).is_file(): raise ValueError('Archivo no encontrado')
        if col['type'] in ('select','multi_select','status'):
            options=col.get('options',[])
            labels=[opt['label'] for opt in options]
            if col['type']=='status' and not labels: labels=['No iniciado','En proceso','Revisión','Terminado','Cancelado']
            chosen=value if isinstance(value,list) else [value] if value else []
            old=raw_value(meta,col)
            retained=old if isinstance(old,list) else [old]
            if any(v not in labels and v not in retained for v in chosen): raise ValueError('Opción no definida en el esquema')
        return value

    @app.route('/api/databases/catalog')
    def database_catalog():
        return jsonify(sources=all_sources(g['load_index']()),users=[dict(id='owner',name='Propietario')],types=TYPES)

    @app.route('/api/databases/<parent>/<source_id>', methods=['GET','PATCH'])
    def database_source(parent,source_id):
        try:
            with LOCK,closing(connect()) as conn:
                conn.execute('BEGIN IMMEDIATE')
                index=read(conn)
                path,text,start,end,schema=source(parent,source_id,index)
                rows={key:meta for key,meta in index.items() if meta.get('parent_id')==parent and meta.get('database_id')==source_id and not meta.get('database_deleted')}
                if request.method=='GET':
                    result=[projected(key,meta,schema,index) for key,meta in rows.items()]
                    result.sort(key=lambda r:(r.get('order',0),r.get('created_at','')))
                    return jsonify(schema=schema,revision=revision(text),rows=result)
                data=request.get_json() or {}
                if data.get('revision')!=revision(text): return jsonify(error='La base cambió; vuelve a cargar antes de modificar el esquema'),409
                operation=data.get('operation')
                changed={}
                if operation=='schema':
                    incoming=data.get('schema',{})
                    # Column definitions must pass through property operations.
                    if incoming.get('database_id')!=source_id or incoming.get('columns')!=schema['columns']: raise ValueError('Identidad/propiedades no se cambian al guardar vistas')
                    for view in incoming.get('views',[]):
                        validate_filters(view)
                        dashboard=view.get('dashboard') or {}
                        for widget in dashboard.get('widgets',[]):validate_filters(widget.get('view') or {})
                        for rule in dashboard.get('globalFilters',[]):
                            if rule.get('timeZone'):checked_zone(rule['timeZone'])
                    schema=incoming
                elif operation=='page_layout':
                    from database_record_actions import checked_layout
                    if 'expected_layout' in data and data['expected_layout']!=schema.get('page_layout'):
                        return jsonify(error='El diseño cambió en otra sesión; vuelve a abrir su configuración'),409
                    schema['page_layout']=checked_layout(data.get('layout'),schema['columns'])
                elif operation in ('add','duplicate','restore'):
                    if operation=='restore':
                        col=next((c for c in schema.get('archived_columns',[]) if c['id']==data.get('column_id')),None)
                        if not col: raise ValueError('Propiedad archivada no encontrada')
                        schema['archived_columns']=[c for c in schema['archived_columns'] if c['id']!=col['id']]
                    elif operation=='duplicate':
                        original=next((c for c in schema['columns'] if c['id']==data.get('column_id')),None)
                        if not original: raise ValueError('Propiedad no encontrada')
                        col=dict(original,id='col_'+uuid.uuid4().hex[:12],name=original['name']+' (copia)')
                        for key,meta in rows.items():
                            updated=json.loads(json.dumps(meta));prop=next((p for p in meta.get('properties',[]) if p['id']==original['id']),None)
                            if prop: updated.setdefault('properties',[]).append(dict(prop,id=col['id'],name=col['name']))
                            changed[key]=dict(before=meta,after=updated)
                    else: col=dict(data.get('column',{}),id='col_'+uuid.uuid4().hex[:12])
                    if col.get('type') not in TYPES or not isinstance(col.get('name'),str) or not col['name'].strip(): raise ValueError('Nombre/tipo de propiedad no válido')
                    position=max(0,min(len(schema['columns']),int(data.get('position',len(schema['columns'])))))
                    schema['columns'].insert(position,col)
                elif operation in ('configure','convert','delete'):
                    col=next((c for c in schema['columns'] if c['id']==data.get('column_id')),None)
                    if not col: raise ValueError('Propiedad no encontrada')
                    if operation=='delete':
                        schema.setdefault('archived_columns',[]).append(col)
                        schema['columns']=[c for c in schema['columns'] if c['id']!=col['id']]
                    elif operation=='configure':
                        patch=data.get('patch',{})
                        allowed={'name','options','groups','expression','relation_id','target_property','aggregation','target_parent','target_database','prefix','action','width','number_format','date_format','time_format'}
                        if set(patch)-allowed: raise ValueError('Ajuste de propiedad no permitido')
                        if 'name' in patch and not str(patch['name']).strip(): raise ValueError('Nombre vacío')
                        for field,formats in [('date_format',('', 'locale','iso','long')),('time_format',('', '12','24'))]:
                            if field in patch and (col['type']!='date' or patch[field] not in formats):raise ValueError('Formato de fecha/hora no válido')
                        if 'options' in patch:
                            opts=patch['options']
                            if not isinstance(opts,list) or any(not isinstance(o,dict) or not isinstance(o.get('label'),str) or not o['label'].strip() or not re.fullmatch(r'#[0-9a-fA-F]{6}',o.get('color','#888888')) for o in opts): raise ValueError('Opciones no válidas')
                            if len({o['label'] for o in opts})!=len(opts): raise ValueError('Opciones repetidas')
                            if data.get('renames'):
                                if not isinstance(data['renames'],dict) or any(not isinstance(k,str) or not isinstance(v,str) or v not in [o['label'] for o in opts] for k,v in data['renames'].items()): raise ValueError('Renombrado de opciones no válido')
                                for key,meta in rows.items():
                                    updated=json.loads(json.dumps(meta))
                                    for prop in updated.get('properties',[]):
                                        if prop['id']==col['id']:
                                            mapping=data['renames'];val=prop.get('value');prop['value']=[mapping.get(v,v) for v in val] if isinstance(val,list) else mapping.get(val,val)
                                    changed[key]=dict(before=meta,after=updated)
                        col.update(patch)
                    else:
                        target=data.get('type')
                        if target not in TYPES: raise ValueError('Tipo no admitido')
                        pending=[]
                        for key,meta in rows.items():
                            updated=json.loads(json.dumps(meta))
                            for prop in updated.get('properties',[]):
                                if prop['id']!=col['id']: continue
                                try:
                                    if target in COMPUTED:
                                        if prop.get('value') not in (None,'',[]):
                                            pending.append(key)
                                            prop['conversion_original']=dict(type=prop.get('type',col['type']),value=prop.get('value'))
                                        converted=prop.get('value')
                                    else: converted=convert(prop.get('value'),prop.get('type',col['type']),target)
                                    prop.update(value=converted,type=target)
                                    prop.pop('conversion_pending',None)
                                except (ValueError,TypeError,OverflowError):
                                    prop['conversion_pending']=True;pending.append(key)
                            changed[key]=dict(before=meta,after=updated)
                        if pending and not data.get('allow_pending'): return jsonify(error='Hay valores incompatibles; se conservarán para resolverlos, sin convertirlos silenciosamente',pending=pending),409
                        col['type']=target
                        if target not in ('select','multi_select','status'): col.pop('options',None)
                else: raise ValueError('Operación desconocida')
                ids=[c.get('id') for c in schema.get('columns',[])]
                if len(set(ids))!=len(ids) or any(not isinstance(k,str) or not k or k=='title' for k in ids): raise ValueError('Identificadores de propiedad no válidos')
                if any(c.get('type') not in TYPES or not isinstance(c.get('name'),str) or not c['name'].strip() for c in schema['columns']): raise ValueError('Esquema de propiedades no válido')
                views=schema.get('views',[])
                if not views or len({v.get('id') for v in views})!=len(views) or any(v.get('type','table') not in ('table','board','gallery','list','calendar','timeline','chart','dashboard','feed','map','form') or not isinstance(v.get('name'),str) or not v['name'].strip() for v in views): raise ValueError('Configuración de vistas no válida')
                if schema.get('activeView') and schema['activeView'] not in {v['id'] for v in views}: raise ValueError('Vista activa inexistente')
                schema['_schema_version']=schema.get('_schema_version',0)+1
                after=text[:start]+json.dumps(schema,ensure_ascii=False)+'\n'+text[end:]
                folder,payload=journal(path,text,after,changed,parent,source_id)
                temporary=path.with_suffix('.database.tmp')
                temporary.write_text(after)
                temporary.replace(path)
                try:
                    for key,change in changed.items(): put(conn,key,change['after'])
                    conn.commit()
                except Exception:
                    path.write_text(text);raise
                payload['status']='complete';write_json(folder/'snapshot.json',payload)
                return jsonify(schema=schema,revision=revision(after),recovery=folder.name)
        except (ValueError,KeyError,TypeError,FileNotFoundError) as error: return jsonify(error=str(error)),400

    @app.route('/api/databases/<parent>/<source_id>/rows',methods=['POST'])
    def database_create_row(parent,source_id):
        try:
            with LOCK,closing(connect()) as conn:
                conn.execute('BEGIN IMMEDIATE');index=read(conn);schema=source(parent,source_id,index)[4]
                data=request.get_json() or {}
                identifier='record-'+uuid.uuid4().hex[:16]
                meta=dict(uid=uuid.uuid4().hex[:8],title=str(data.get('title','Sin título')).strip() or 'Sin título',type='page',
                          created_at=now(),updated_at=now(),created_by='owner',edited_by='owner',status='pendiente',
                          parent_id=parent,database_id=source_id,db_row=True,icon='',tags=[],properties=[],
                          order=max((m.get('order',0) for m in index.values() if m.get('parent_id')==parent),default=-1)+1)
                for col_id,value in data.get('values',{}).items():
                    col=next((c for c in schema['columns'] if c['id']==col_id),None)
                    if not col or col['type'] in COMPUTED or col['type']=='button': raise ValueError('Propiedad no editable')
                    meta['properties'].append(dict(id=col_id,name=col['name'],type=col['type'],value=checked_cell(index,meta,col,value)))
                path=g['_entry_path'](identifier,meta);path.parent.mkdir(parents=True,exist_ok=True)
                path.write_text('')
                try: put(conn,identifier,meta);conn.commit()
                except Exception:
                    path.unlink(missing_ok=True);raise
                index[identifier]=meta
                return jsonify(row=projected(identifier,meta,schema,index)),201
        except (ValueError,TypeError,KeyError) as error: return jsonify(error=str(error)),400

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/button/<column_id>',methods=['POST'])
    def database_button(parent,source_id,row_id,column_id):
        try:
            with LOCK,closing(connect()) as conn:
                conn.execute('BEGIN IMMEDIATE');index=read(conn);schema=source(parent,source_id,index)[4]
                meta=index.get(row_id)
                if not meta or meta.get('database_deleted') or meta.get('parent_id')!=parent or meta.get('database_id')!=source_id: return jsonify(error='Registro fuera de esta base'),404
                if meta.get('database_locked'):return jsonify(error='Desbloquea la página para editar sus propiedades'),423
                col=next((c for c in schema['columns'] if c['id']==column_id and c['type']=='button'),None)
                action=col.get('action',{}) if col else {}
                if action.get('type')!='set': raise ValueError('Configura el botón para actualizar una propiedad')
                target=next((c for c in schema['columns'] if c['id']==action.get('property')),None)
                if not target or target['type'] in COMPUTED or target['type']=='button': raise ValueError('Destino no editable')
                value=checked_cell(index,meta,target,action.get('value'))
                props=meta.setdefault('properties',[])
                prop=next((p for p in props if p['id']==target['id']),None)
                if not prop: prop=dict(id=target['id']);props.append(prop)
                prop.update(name=target['name'],type=target['type'],value=value)
                meta.update(updated_at=now(),edited_by='owner');put(conn,row_id,meta);conn.commit()
                return jsonify(row=projected(row_id,meta,schema,index))
        except (ValueError,TypeError,KeyError) as error: return jsonify(error=str(error)),400

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>',methods=['PATCH','DELETE'])
    def database_row(parent,source_id,row_id):
        try:
            with LOCK,closing(connect()) as conn:
                conn.execute('BEGIN IMMEDIATE');index=read(conn);schema=source(parent,source_id,index)[4]
                meta=index.get(row_id)
                if not meta or meta.get('database_deleted') or meta.get('parent_id')!=parent or meta.get('database_id')!=source_id: return jsonify(error='Registro fuera de esta base'),404
                if request.method=='DELETE':
                    folder=g['DATA_DIR']/'database_deleted'/uuid.uuid4().hex;folder.mkdir(parents=True)
                    path=g['_entry_path'](row_id,meta)
                    write_json(folder/'record.json',dict(id=row_id,meta=meta,markdown=path.read_text() if path.exists() else ''))
                    meta['database_deleted']=True;meta['deleted_at']=now();put(conn,row_id,meta);conn.commit()
                    # Keep Markdown in place too; recovery is additive and no file is erased.
                    return jsonify(ok=True,recovery=folder.name)
                data=request.get_json() or {}
                if meta.get('database_locked') and any(key in data for key in ('values','title','order','group_move','date_move')):
                    return jsonify(error='Desbloquea la página para editarla'),423
                if 'date_move' in data:
                    move=data['date_move']
                    if not isinstance(move,dict) or set(move)!={'column_id','from','to'}:raise ValueError('Movimiento de fecha no válido')
                    col=next((c for c in schema['columns'] if c['id']==move['column_id'] and c['type']=='date'),None)
                    if not col:raise ValueError('La fecha es de sólo lectura o no existe')
                    if col['id'] in data.get('values',{}):raise ValueError('No combines dos cambios de la misma fecha')
                    target=move['to']
                    if not isinstance(target,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',target):raise ValueError('Día no válido')
                    validate('date',target)
                    current=raw_value(meta,col) or ''
                    start=date_start(current)
                    if not isinstance(start,str) or start[:10]!=move['from']:
                        return jsonify(error='La fecha cambió; vuelve a cargar antes de mover el registro'),409
                    data['values']={**data.get('values',{}),col['id']:shift_date(current,target)}
                if 'group_move' in data:
                    move=data['group_move']
                    if not isinstance(move,dict) or set(move)!={'column_id','from','to'}:raise ValueError('Movimiento de grupo no válido')
                    col=next((c for c in schema['columns'] if c['id']==move['column_id']),None)
                    if not col or col['type'] not in ('status','select','multi_select','text','person','checkbox','number'):raise ValueError('Agrupación de sólo lectura')
                    if col['id'] in data.get('values',{}):raise ValueError('No combines un movimiento con otro valor de la misma propiedad')
                    current=raw_value(meta,col);origin,target=move['from'],move['to']
                    multiple=col['type'] in ('multi_select','person')
                    if origin is not None:validate(col['type'],[origin] if multiple else origin)
                    previous=current if multiple else [current] if current!='' and current is not None else []
                    if (origin is None and previous) or (origin is not None and origin not in previous):
                        return jsonify(error='La tarjeta cambió de grupo; vuelve a cargar antes de moverla'),409
                    remaining=[v for v in previous if v!=origin]
                    if multiple and target is None and remaining:
                        return jsonify(error='El registro conserva otras etiquetas. Retíralas explícitamente para dejarlo sin grupo'),409
                    value=list(dict.fromkeys([*remaining,*([target] if target is not None else [])])) if multiple else (target if target is not None else empty(col['type']))
                    data['values']={**data.get('values',{}),col['id']:value}
                for key,field in (('locked','database_locked'),('favorite','starred')):
                    if key in data:
                        if type(data[key]) is not bool:raise ValueError('Estado de página no válido')
                        meta[field]=data[key]
                if 'presentation' in data:
                    patch=data['presentation']
                    if not isinstance(patch,dict) or set(patch)-{'font','small_text','full_width','property_icons','table_of_contents'}:
                        raise ValueError('Presentación del registro no válida')
                    if 'font' in patch and patch['font'] not in ('default','serif','mono'):
                        raise ValueError('Tipografía no válida')
                    if any(type(value) is not bool for key,value in patch.items() if key!='font'):
                        raise ValueError('Las opciones de presentación deben ser booleanas')
                    meta['database_presentation']={**meta.get('database_presentation',{}),**patch}
                if 'order' in data:
                    if not isinstance(data['order'],(int,float)) or not math.isfinite(data['order']): raise ValueError('Orden no válido')
                    meta['order']=data['order']
                if 'title' in data: meta['title']=str(data['title']).strip() or 'Sin título'
                for col_id,val in data.get('values',{}).items():
                    col=next((c for c in schema['columns'] if c['id']==col_id),None)
                    if not col or col['type'] in COMPUTED or col['type']=='button': raise ValueError('Propiedad de sólo lectura o inexistente')
                    value=checked_cell(index,meta,col,val)
                    props=meta.setdefault('properties',[])
                    prop=next((p for p in props if p['id']==col_id),None)
                    if not prop: prop=dict(id=col_id);props.append(prop)
                    prop.update(name=col['name'],type=col['type'],value=value);prop.pop('conversion_pending',None)
                meta.update(updated_at=now(),edited_by='owner');put(conn,row_id,meta);conn.commit()
                return jsonify(row=projected(row_id,meta,schema,index))
        except (ValueError,TypeError,KeyError) as error: return jsonify(error=str(error)),400

    @app.route('/api/databases/<parent>/<source_id>/deleted')
    def database_deleted(parent,source_id):
        with LOCK,closing(connect()) as conn:
            index=read(conn)
            try: source(parent,source_id,index)
            except (ValueError,FileNotFoundError) as error: return jsonify(error=str(error)),400
            return jsonify([dict(id=key,title=meta.get('title',''),deleted_at=meta.get('deleted_at')) for key,meta in index.items() if meta.get('parent_id')==parent and meta.get('database_id')==source_id and meta.get('database_deleted')])

    @app.route('/api/databases/<parent>/<source_id>/deleted/<row_id>',methods=['POST'])
    def database_undelete(parent,source_id,row_id):
        with LOCK,closing(connect()) as conn:
            conn.execute('BEGIN IMMEDIATE');index=read(conn);meta=index.get(row_id)
            if not meta or not meta.get('database_deleted') or meta.get('parent_id')!=parent or meta.get('database_id')!=source_id: return jsonify(error='Registro no encontrado en esta papelera'),404
            meta.pop('database_deleted',None);meta.pop('deleted_at',None);put(conn,row_id,meta);conn.commit()
            return jsonify(ok=True)

    @app.route('/api/databases/<parent>/<source_id>/recoveries')
    def database_recoveries(parent,source_id):
        directory=g['DATA_DIR']/'database_recovery'
        result=[]
        for path in directory.glob('*/snapshot.json') if directory.exists() else []:
            item=json.loads(path.read_text())
            if item['parent_id']==parent and item['database_id']==source_id: result.append(dict(id=path.parent.name,created_at=item['created_at'],status=item['status']))
        return jsonify(sorted(result,key=lambda x:x['created_at'],reverse=True))

    @app.route('/api/databases/<parent>/<source_id>/recoveries/<recovery_id>',methods=['GET','POST'])
    def database_recovery(parent,source_id,recovery_id):
        if not re.fullmatch(r'[a-f0-9]{32}',recovery_id): return jsonify(error='Respaldo no válido'),400
        path=g['DATA_DIR']/'database_recovery'/recovery_id/'snapshot.json'
        if not path.exists(): return jsonify(error='No encontrado'),404
        item=json.loads(path.read_text())
        if item['parent_id']!=parent or item['database_id']!=source_id: return jsonify(error='No encontrado'),404
        if request.method=='GET': return jsonify(item)
        with LOCK,closing(connect()) as conn:
            conn.execute('BEGIN IMMEDIATE');index=read(conn)
            content=source(parent,source_id,index)
            if content[1]!=item['after'] or any(index.get(key)!=change['after'] for key,change in item['changes'].items()): return jsonify(error='La base cambió desde ese respaldo; descarga la copia y recupera los valores manualmente para no sobrescribir cambios posteriores'),409
            content[0].write_text(item['before'])
            for key,change in item['changes'].items(): put(conn,key,change['before'])
            conn.commit();return jsonify(ok=True)

    @app.route('/api/databases/files',methods=['POST'])
    def database_upload():
        file=request.files.get('file')
        if not file or not file.filename: return jsonify(error='Selecciona un archivo'),400
        content=file.read(20*1024*1024+1)
        if len(content)>20*1024*1024: return jsonify(error='Máximo 20 MB por archivo'),400
        folder=g['DATA_DIR']/'database_files';folder.mkdir(parents=True,exist_ok=True)
        identifier=uuid.uuid4().hex;(folder/identifier).write_bytes(content)
        write_json(folder/(identifier+'.json'),dict(name=Path(file.filename).name,size=len(content)))
        return jsonify(id=identifier,name=Path(file.filename).name,size=len(content),url='/api/databases/files/'+identifier)

    @app.route('/api/databases/files/<identifier>')
    def database_download(identifier):
        if not re.fullmatch(r'[a-f0-9]{32}',identifier): return jsonify(error='No encontrado'),404
        path=g['DATA_DIR']/'database_files'/identifier
        if not path.is_file(): return jsonify(error='No encontrado'),404
        metadata=path.with_suffix('.json')
        name=json.loads(metadata.read_text()).get('name','atlas-'+identifier) if metadata.exists() else 'atlas-'+identifier
        image_types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}
        preview=request.args.get('preview')=='1' and Path(name).suffix.lower() in image_types
        return send_file(path,as_attachment=not preview,download_name=name,mimetype=image_types[Path(name).suffix.lower()] if preview else 'application/octet-stream')

    from database_record_actions import register_record_actions
    register_record_actions(app,g,dict(connect=connect,read=read,source=source,projected=projected,put=put,checked_cell=checked_cell))
