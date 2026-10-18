"""Record operations preserve IDs, raw values and body; no whole-index writes."""
from contextlib import closing
import copy
import hashlib
import json
from pathlib import Path
import re
import uuid
from flask import request, jsonify, Response
from database_identity import fresh_copy, write_json


def checked_layout(value,columns):
    if not isinstance(value,dict) or set(value)-{'structure','order','hidden','panel','property_icons'}:
        raise ValueError('Configuración de diseño no válida')
    result=dict(structure=value.get('structure','simple'),property_icons=value.get('property_icons',True))
    if result['structure'] not in ('simple','tabbed') or type(result['property_icons']) is not bool:
        raise ValueError('Estructura/iconos no válidos')
    ids={c['id'] for c in columns}
    for key in ('order','hidden','panel'):
        items=value.get(key,[])
        if not isinstance(items,list) or any(not isinstance(v,str) or v not in ids for v in items) or len(set(items))!=len(items):
            raise ValueError('Propiedades del diseño no válidas')
        result[key]=items
    if set(result['hidden'])&set(result['panel']):raise ValueError('Una propiedad oculta no puede estar en el panel')
    return result


def register_record_actions(app,g,h):
    from database_api import LOCK,now,revision
    from database_export import register_record_export
    register_record_export(app,g,h)
    connect,read,source,projected,put=(h[k] for k in ('connect','read','source','projected','put'))
    def own(index,parent,db,row):
        meta=index.get(row)
        if not meta or meta.get('database_deleted') or meta.get('parent_id')!=parent or meta.get('database_id')!=db:
            raise ValueError('Registro fuera de esta base')
        return meta
    def comparable(meta):return {k:v for k,v in meta.items() if k!='last_viewed_at'}
    def state(meta,body):return revision(json.dumps(comparable(meta),sort_keys=True,ensure_ascii=False)+'\n'+body)
    def transfer_plan(row_id,meta,old,new,index,target_parent,target_db):
        matched=[];unmapped=[];values=[];used=set()
        displayed={p['id']:p for p in projected(row_id,meta,old,index)['properties']}
        properties=[(p,next((c for c in old['columns'] if c['id']==p.get('id')),p)) for p in meta.get('properties',[])]
        stored={p.get('id') for p in meta.get('properties',[])}
        properties.extend((dict(id=c['id'],name=c['name'],type=c['type']),c) for c in old['columns'] if c['id'] not in stored and c['type'] in ('formula','rollup','id','created_time','edited_time','created_by','edited_by'))
        properties.extend((p,p) for p in meta.get('database_unmapped_properties',[]))
        for prop,definition in properties:
            candidates=[c for c in new['columns'] if c['type']==definition.get('type') and c['name']==definition.get('name')]
            target=next((c for c in candidates if c['id'] not in used),None)
            if target and not prop.get('conversion_pending') and target['type'] not in ('formula','rollup','id','created_time','edited_time','created_by','edited_by','button'):
                candidate=dict(prop,id=target['id'],name=target['name'],type=target['type'])
                try:
                    h['checked_cell'](index,dict(meta,parent_id=target_parent,database_id=target_db),target,candidate.get('value'))
                except (ValueError,TypeError):target=None
            else:target=None
            if target:
                used.add(target['id']);values.append(candidate)
                matched.append(dict(from_name=definition.get('name'),to_name=target['name']))
            else:
                preserved=dict(prop,name=definition.get('name',prop.get('id')),type=definition.get('type'))
                preserved.setdefault('definition',copy.deepcopy(definition))
                if definition.get('type') in ('formula','rollup','id','created_time','edited_time','created_by','edited_by') and prop.get('id') in displayed:
                    preserved['value']=displayed[prop['id']].get('value')
                unmapped.append(preserved)
        return matched,unmapped,values

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/export',methods=['GET'])
    def export_record(parent,source_id,row_id):
        kind=request.args.get('format','json')
        if kind not in ('json','markdown'):return jsonify(error='Formato no válido'),400
        try:
            with LOCK,closing(connect()) as conn:
                index=read(conn);schema=source(parent,source_id,index)[4];meta=own(index,parent,source_id,row_id)
                body=g['_entry_path'](row_id,meta).read_text()
                content=('# '+meta.get('title','Sin título')+'\n\n'+body) if kind=='markdown' else json.dumps(dict(format='atlas.database-record',row=projected(row_id,meta,schema,index),schema=schema,markdown=body),ensure_ascii=False,indent=2)
                return Response(content,mimetype='text/markdown' if kind=='markdown' else 'application/json',headers={'Content-Disposition':'attachment; filename="registro-atlas.'+('md' if kind=='markdown' else 'json')+'"','Cache-Control':'no-store'})
        except (ValueError,FileNotFoundError) as e:return jsonify(error=str(e)),404

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/duplicate',methods=['POST'])
    def duplicate_record(parent,source_id,row_id):
        try:
            with LOCK,closing(connect()) as conn:
                conn.execute('BEGIN IMMEDIATE');index=read(conn);schema=source(parent,source_id,index)[4];meta=own(index,parent,source_id,row_id)
                path=g['_entry_path'](row_id,meta);body=fresh_copy(path.read_text())
                identifier='record-'+uuid.uuid4().hex[:16];new=copy.deepcopy(meta)
                new.pop('database_last_transfer',None)
                new.update(uid=uuid.uuid4().hex[:8],title=meta.get('title','Sin título')+' (copia)',created_at=now(),updated_at=now(),created_by='owner',edited_by='owner',database_locked=False)
                new['order']=max((m.get('order',0) for m in index.values() if m.get('parent_id')==parent and m.get('database_id')==source_id),default=-1)+1
                target=g['_entry_path'](identifier,new);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(body)
                try:put(conn,identifier,new);conn.commit()
                except Exception:target.unlink(missing_ok=True);raise
                index[identifier]=new
                return jsonify(row=projected(identifier,new,schema,index)),201
        except (ValueError,TypeError,FileNotFoundError) as e:return jsonify(error=str(e)),400

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/move',methods=['POST'])
    def move_record(parent,source_id,row_id):
        try:
            data=request.get_json() or {}
            with LOCK,closing(connect()) as conn:
                conn.execute('BEGIN IMMEDIATE');index=read(conn);old=source(parent,source_id,index)[4];meta=own(index,parent,source_id,row_id)
                target_parent=data.get('target_parent');target_db=data.get('target_database')
                if (parent,source_id)==(target_parent,target_db):raise ValueError('El registro ya pertenece a esa base')
                new=source(target_parent,target_db,index)[4]
                # Do not move an ancestor into a source owned by its descendants.
                ancestor=target_parent;seen=set()
                while ancestor in index and ancestor not in seen:
                    if ancestor==row_id:raise ValueError('No se puede mover una página dentro de sí misma')
                    seen.add(ancestor);ancestor=index[ancestor].get('parent_id')
                body=g['_entry_path'](row_id,meta).read_text();token=state(meta,body)
                matched,unmapped,values=transfer_plan(row_id,meta,old,new,index,target_parent,target_db)
                preview=dict(matched=matched,unmapped=unmapped,revision=token,title=meta.get('title'),target_parent=target_parent,target_database=target_db)
                if data.get('preview'):return jsonify(preview)
                if data.get('revision')!=token:return jsonify(error='El registro cambió; revisa de nuevo el traslado'),409
                if unmapped and data.get('preserve_unmapped') is not True:return jsonify(error='Hay propiedades sin equivalencia. Confirma su conservación antes de mover.',**preview),409
                updated=copy.deepcopy(meta);updated.update(parent_id=target_parent,database_id=target_db,properties=values,updated_at=now(),edited_by='owner')
                updated['database_unmapped_properties']=unmapped
                updated['order']=max((m.get('order',0) for m in index.values() if m.get('parent_id')==target_parent and m.get('database_id')==target_db),default=-1)+1
                folder=g['DATA_DIR']/'database_transfers'/uuid.uuid4().hex
                updated['database_last_transfer']=folder.name
                old_path=g['_entry_path'](row_id,meta);new_path=g['_entry_path'](row_id,updated)
                if new_path!=old_path:raise ValueError('La ubicación del archivo no es compatible con un traslado conservador')
                folder.mkdir(parents=True,exist_ok=True)
                write_json(folder/'record.json',dict(id=row_id,before=meta,after=updated,source_schema=old,target_schema=new,markdown=body,created_at=now()))
                put(conn,row_id,updated);conn.commit();index[row_id]=updated
                return jsonify(row=projected(row_id,updated,new,index),recovery=folder.name)
        except (ValueError,TypeError,KeyError,FileNotFoundError) as e:return jsonify(error=str(e)),400

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/transfers/<transfer_id>/restore',methods=['POST'])
    def restore_transfer(parent,source_id,row_id,transfer_id):
        if not re.fullmatch(r'[a-f0-9]{32}',transfer_id):return jsonify(error='Copia no válida'),400
        path=g['DATA_DIR']/'database_transfers'/transfer_id/'record.json'
        if not path.exists():return jsonify(error='Copia no encontrada'),404
        snapshot=json.loads(path.read_text())
        with LOCK,closing(connect()) as conn:
            conn.execute('BEGIN IMMEDIATE');index=read(conn)
            try:meta=own(index,parent,source_id,row_id)
            except ValueError as e:return jsonify(error=str(e)),404
            if snapshot['id']!=row_id or comparable(snapshot['after'])!=comparable(meta) or g['_entry_path'](row_id,meta).read_text()!=snapshot['markdown']:
                return jsonify(error='El registro cambió después del traslado; se conserva la copia sin sobrescribir los cambios posteriores'),409
            before=copy.deepcopy(snapshot['before']);schema=source(before['parent_id'],before['database_id'],index)[4]
            if 'last_viewed_at' in meta:before['last_viewed_at']=meta['last_viewed_at']
            for prop in before.get('properties',[]):
                col=next((c for c in schema['columns'] if c['id']==prop.get('id')),None)
                if col:
                    try:h['checked_cell'](index,before,col,prop.get('value'))
                    except (ValueError,TypeError):prop['conversion_pending']=True
            put(conn,row_id,before);conn.commit();return jsonify(ok=True)

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/content-history',methods=['GET'])
    def record_history(parent,source_id,row_id):
        with LOCK,closing(connect()) as conn:
            index=read(conn)
            try:meta=own(index,parent,source_id,row_id)
            except ValueError as e:return jsonify(error=str(e)),404
            path=g['_entry_path'](row_id,meta);body=path.read_text();versions=[]
            directory=path.parent/'.history'
            for item in sorted(directory.glob(row_id+'_*.md'),reverse=True) if directory.exists() else []:
                timestamp=item.stem[len(row_id)+1:]
                if re.fullmatch(r'\d{8}T\d{6}(?:\d{6})?',timestamp):versions.append(dict(timestamp=timestamp,size=item.stat().st_size))
            return jsonify(versions=versions,revision=revision(body),updated_at=meta.get('updated_at'),word_count=len(body.split()))

    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/content-history/<timestamp>',methods=['GET','POST'])
    def record_history_version(parent,source_id,row_id,timestamp):
        if not re.fullmatch(r'\d{8}T\d{6}(?:\d{6})?',timestamp):return jsonify(error='Versión no válida'),400
        with LOCK,closing(connect()) as conn:
            conn.execute('BEGIN IMMEDIATE');index=read(conn)
            try:meta=own(index,parent,source_id,row_id)
            except ValueError as e:return jsonify(error=str(e)),404
            path=g['_entry_path'](row_id,meta);snapshot=path.parent/'.history'/(row_id+'_'+timestamp+'.md')
            if not snapshot.exists():return jsonify(error='Versión no encontrada'),404
            content=snapshot.read_text()
            if request.method=='GET':return jsonify(markdown=content,timestamp=timestamp)
            if meta.get('database_locked'):return jsonify(error='Desbloquea la página antes de restaurar'),423
            data=request.get_json() or {}
            if data.get('revision')!=revision(path.read_text()):return jsonify(error='El contenido cambió; revisa de nuevo el historial'),409
            # Preserve current content before restoring; do not roll properties
            # or membership back to a historical body snapshot.
            folder=g['DATA_DIR']/'database_content_recovery'/uuid.uuid4().hex
            previous=path.read_text()
            folder.mkdir(parents=True,exist_ok=True)
            write_json(folder/'record.json',dict(id=row_id,meta=meta,markdown=previous,restored_timestamp=timestamp,created_at=now()))
            g['_save_history_snapshot'](row_id,meta,path)
            temporary=path.with_suffix('.restore.tmp');temporary.write_text(content);temporary.replace(path)
            try:
                meta.update(updated_at=now(),edited_by='owner');put(conn,row_id,meta);conn.commit()
            except Exception:
                temporary.write_text(previous);temporary.replace(path)
                raise
            return jsonify(ok=True,markdown=content,recovery=folder.name)
