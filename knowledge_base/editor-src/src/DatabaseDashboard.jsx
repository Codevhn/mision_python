import React,{useCallback,useEffect,useRef,useState} from 'react';
import {DatabaseIcon as Icon} from './databaseIcons.jsx';
import {Cell,IconButton,Popover,notifyDatabase,trackDatabaseEditor} from './databaseUI.jsx';
import {api,columnsForView,clone,uid,groupRows,VIEW_TYPES} from './databaseModel.js';
import {DASHBOARD_TYPES,sourceKey,dashboardConfig,createWidget,duplicateWidget,moveWidget,compatibleFilterProperty,widgetRows,mappedGlobalRules,widgetWidth,widgetSize} from './dashboardModel.js';
import {DashboardResizeHandle} from './DashboardResizeHandle.jsx';
import {dashboardWriter} from './dashboardSave.js';
import {localFilterZone,storedFilterOperations,defaultFilterOperator} from './databaseFilters.js';
import {PropertyFilterValue as FilterValue} from './PropertyFilterValue.jsx';
import {FilterRules} from './FilterRules.jsx';
import {CardPreviewSettings,ListLayoutSettings} from './databaseCardSettings.jsx';
import './database-dashboard.css';

const columnsFor=schema=>[{id:'title',name:'Nombre',type:'title'},...(schema?.columns||[])];
const types=VIEW_TYPES.filter(([type])=>DASHBOARD_TYPES.includes(type));
function Rules({rules=[],columns,onChange,sort=false}){
  return <>{rules.map((rule,index)=><div className="adb-dashboard-rule" key={index}>
    <select aria-label={(sort?'Ordenar':'Filtrar')+' propiedad '+(index+1)} value={rule.colId} onChange={e=>onChange(rules.map((r,n)=>n===index?{...r,colId:e.target.value,...(!sort?{op:defaultFilterOperator(columns.find(c=>c.id===e.target.value)?.type),value:''}:{})}:r))}>{columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <select aria-label={sort?'Dirección de orden':'Condición de filtro'} value={sort?rule.dir||'asc':rule.op||'contains'} onChange={e=>onChange(rules.map((r,n)=>n===index?{...r,[sort?'dir':'op']:e.target.value}:r))}>{(sort?[['asc','Ascendente'],['desc','Descendente']]:storedFilterOperations(columns.find(c=>c.id===rule.colId)?.type,rule.op)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    {sort?<span/>:!['empty','not_empty'].includes(rule.op)?<FilterValue column={columns.find(c=>c.id===rule.colId)} rule={rule} label={'Valor de filtro '+(index+1)} onChange={value=>onChange(rules.map((r,n)=>n===index?{...r,value}:r))}/>:<span/>}
    <button type="button" aria-label={'Quitar '+(sort?'orden':'filtro')+' '+(index+1)} onClick={()=>onChange(rules.filter((_,n)=>n!==index))}>×</button>
  </div>)}<button type="button" className="adb-dashboard-add" onClick={()=>onChange([...rules,{colId:'title',...(sort?{dir:'asc'}:{op:'contains',value:''})}])}>＋ {sort?'Añadir orden':'Añadir filtro'}</button></>;
}
function WidgetTable({rows,view,schema,base,onRow,openRow}){
  const columns=columnsForView(schema,view);
  const groupColumn=columnsFor(schema).find(c=>c.id===view.groupBy);
  const groups=groupRows(rows,groupColumn);
  return <table className="adb-dashboard-widget-table"><thead><tr><th>Nombre</th>{columns.map(c=><th key={c.id}><Icon type={c.type}/> {c.name}</th>)}</tr></thead>{groups.map(([name,items])=><tbody key={name}>{groupColumn&&<tr className="adb-dashboard-table-group"><th colSpan={columns.length+1}>{name} <small>{items.length}</small></th></tr>}{items.map(row=><tr key={row.id}><td><button type="button" onClick={()=>openRow(row)}><Icon type="page"/>{row.title}</button></td>{columns.map(col=><td key={col.id}><Cell row={row} col={col} base={base} onRow={onRow}/></td>)}</tr>)}</tbody>)}</table>;
}
function WidgetOptions({widget,source,catalog,patch,ensureSource}){
  const schema=source?.schema||{columns:[],views:[]};
  const columns=columnsFor(schema);
  const [filterError,setFilterError]=useState('');
  const changeView=patchView=>patch({view:{...widget.view,...patchView}});
  const chooseSource=async base=>{
    const next=await ensureSource(base);
    const chosen=next.schema.views.find(v=>DASHBOARD_TYPES.includes(v.type))||{type:'table',name:'Tabla'};
    patch({base,sourceViewId:chosen.id||null,view:clone(chosen)});
  };
  return <><label>Nombre del widget<input value={widget.title} onChange={e=>patch({title:e.target.value})}/></label>
    <details open><summary>Fuente y vista</summary><label>Base de datos<select aria-label="Fuente del widget" value={widget.base} onChange={e=>chooseSource(e.target.value).catch(()=>{})}>{catalog.map(s=><option key={sourceKey(s)} value={sourceKey(s)}>{s.name} · {s.id.slice(0,7)}</option>)}</select></label>
    <label>Usar una vista existente<select value={widget.sourceViewId||''} onChange={e=>{const chosen=schema.views.find(v=>v.id===e.target.value);if(chosen)patch({sourceViewId:chosen.id,view:clone(chosen)});}}><option value="">Configuración propia</option>{(schema.views||[]).filter(v=>DASHBOARD_TYPES.includes(v.type)).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><p className="adb-help">La configuración se copia al widget; los registros siguen perteneciendo a la base original. Los ajustes siguientes afectan sólo a este widget.</p>
    <label>Representación<select value={widget.view.type} onChange={e=>patch({sourceViewId:null,view:{...widget.view,type:e.target.value}})}>{types.map(([type,label])=><option value={type} key={type}>{label}</option>)}</select></label></details>
    <details><summary>Distribución y apertura</summary><div className="adb-dashboard-inline"><label>Ancho (%)<input aria-label="Ancho del widget (%)" type="number" min="10" max="100" step="0.1" value={Number(widgetWidth(widget).toFixed(2))} onChange={e=>{if(e.target.value!=='')patch(widgetSize(Number(e.target.value),widget.height));}}/></label><label>Altura (px)<input aria-label="Altura del widget (px)" type="number" min="160" max="1600" step="1" value={widget.height} onChange={e=>{if(e.target.value!=='')patch(widgetSize(widgetWidth(widget),Number(e.target.value)));}}/></label></div><p className="adb-help">Arrastra la esquina inferior para ajustar libremente. En paneles estrechos los widgets ocupan todo el ancho sin cambiar su tamaño guardado.</p>
    <label>Abrir registros<select value={widget.view.openMode||'side'} onChange={e=>changeView({openMode:e.target.value})}><option value="side">Side Peek</option><option value="center">Peek central</option><option value="page">Página completa</option></select></label></details>
    <details><summary>Filtros</summary><label>Combinar condiciones<select value={widget.view.filterMode||'and'} onChange={e=>changeView({filterMode:e.target.value})}><option value="and">Todas (Y)</option><option value="or">Cualquiera (O)</option></select></label><p className="adb-help">Fechas relativas · zona {widget.view.filterTimeZone||localFilterZone()} · semana de lunes a domingo.</p><FilterRules columns={columns} rules={widget.view.filters} onChange={(filters,error)=>{if(error){setFilterError(error);return;}setFilterError('');changeView({filters,filterTimeZone:widget.view.filterTimeZone||localFilterZone()});}}/>{filterError&&<p className="adb-error" role="alert">{filterError}</p>}</details>
    <details><summary>Orden</summary><Rules sort columns={columns} rules={widget.view.sorts} onChange={sorts=>changeView({sorts})}/></details>
    <details><summary>Agrupación y diseño</summary>{['table','board','gallery','list','chart','feed'].includes(widget.view.type)&&<label>Agrupar por<select value={widget.view.groupBy||''} onChange={e=>changeView({groupBy:e.target.value})}><option value="">Sin agrupación</option>{columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {['board','gallery','feed'].includes(widget.view.type)&&<><label>Tamaño de tarjeta<select value={widget.view.cardSize||'medium'} onChange={e=>changeView({cardSize:e.target.value})}><option value="small">Pequeño</option><option value="medium">Mediano</option><option value="large">Grande</option></select></label><label>Previsualización<select value={widget.view.cardPreview||'none'} onChange={e=>changeView({cardPreview:e.target.value})}><option value="none">Ninguna</option><option value="content">Contenido</option><option value="cover">Portada</option></select></label></>}
    {widget.view.type==='board'&&<><label className="adb-dashboard-check"><input type="checkbox" checked={!!widget.view.colorColumns} onChange={e=>changeView({colorColumns:e.target.checked})}/>Colorear columnas</label><label>Distribución<select value={widget.view.boardLayout||'compact'} onChange={e=>changeView({boardLayout:e.target.value})}><option value="compact">Compacta</option><option value="list">En lista</option></select></label></>}
    {['board','gallery','feed'].includes(widget.view.type)&&widget.view.cardPreview==='cover'&&<CardPreviewSettings view={widget.view} columns={schema.columns} onChange={changeView}/>}
    {widget.view.type==='list'&&<ListLayoutSettings view={widget.view} onChange={changeView}/>}
    {['calendar','timeline'].includes(widget.view.type)&&<label>Propiedad de fecha<select value={widget.view.dateProperty||''} onChange={e=>changeView({dateProperty:e.target.value})}><option value="">Elegir fecha</option>{schema.columns.filter(c=>['date','created_time','edited_time'].includes(c.type)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {widget.view.type==='calendar'&&<label>Mostrar calendario<select value={widget.view.calendarLayout||'month'} onChange={e=>changeView({calendarLayout:e.target.value})}><option value="month">Mes</option><option value="week">Semana</option></select></label>}
    {widget.view.type==='timeline'&&<label>Fecha final<select value={widget.view.endDateProperty||''} onChange={e=>changeView({endDateProperty:e.target.value})}><option value="">Igual al inicio</option>{schema.columns.filter(c=>c.type==='date').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {widget.view.type==='map'&&<label>Lugar<select value={widget.view.placeProperty||''} onChange={e=>changeView({placeProperty:e.target.value})}><option value="">Elegir lugar</option>{schema.columns.filter(c=>c.type==='place').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {widget.view.type==='chart'&&<><label>Cálculo<select value={widget.view.chartAggregation||'count'} onChange={e=>changeView({chartAggregation:e.target.value})}>{[['count','Conteo'],['sum','Suma'],['average','Promedio'],['min','Mínimo'],['max','Máximo']].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>Propiedad numérica<select value={widget.view.chartProperty||''} onChange={e=>changeView({chartProperty:e.target.value})}><option value="">Elegir propiedad</option>{schema.columns.filter(c=>['number','formula','rollup'].includes(c.type)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}
    <label className="adb-dashboard-check"><input type="checkbox" checked={widget.view.showIcon!==false} onChange={e=>changeView({showIcon:e.target.checked})}/>Mostrar icono de página</label><label className="adb-dashboard-check"><input type="checkbox" checked={!!widget.view.wrap} onChange={e=>changeView({wrap:e.target.checked})}/>Ajustar contenido</label></details>
    <details><summary>Propiedades visibles</summary>{schema.columns.map(c=><label className="adb-dashboard-check" key={c.id}><input type="checkbox" checked={!(widget.view.hidden||[]).includes(c.id)} onChange={e=>changeView({hidden:e.target.checked?(widget.view.hidden||[]).filter(id=>id!==c.id):[...new Set([...(widget.view.hidden||[]),c.id])]})}/><Icon type={c.type}/>{c.name}</label>)}</details>
  </>;
}
function GlobalFilters({config,sources,onChange}){
  const filters=config.globalFilters;
  const change=(id,patch)=>onChange(filters.map(f=>f.id===id?{...f,...patch}:f));
  return <><p className="adb-help">Cada condición sólo afecta a las fuentes que vincules expresamente. Sólo se ofrecen propiedades de tipo compatible. Todas las condiciones globales se combinan con Y.</p>{filters.map(filter=><div key={filter.id} className="adb-dashboard-global"><label>Nombre<input value={filter.name} onChange={e=>change(filter.id,{name:e.target.value})}/></label><label>Tipo<select value={filter.type} onChange={e=>change(filter.id,{type:e.target.value,mapping:{},op:'is',value:e.target.value==='checkbox'?false:''})}>{[['text','Texto'],['option','Selección / Estado'],['number','Número'],['date','Fecha'],['checkbox','Casilla'],['person','Persona'],['multi_select','Selección múltiple']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><div className="adb-dashboard-inline"><label>Condición<select value={filter.op} onChange={e=>change(filter.id,{op:e.target.value,...(e.target.value==='relative'?{value:'today',timeZone:filter.timeZone||localFilterZone()}:{})})}>{storedFilterOperations(filter.type,filter.op).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{!['empty','not_empty'].includes(filter.op)&&<label>Valor<FilterValue column={{type:filter.type}} rule={filter} onChange={value=>change(filter.id,{value})}/></label>}</div>
    {filter.op==='relative'&&<p className="adb-help">Fecha relativa · zona {filter.timeZone||'UTC'} · semana de lunes a domingo.</p>}
    {sources.map(([base,data])=><label key={base}>{data.name||data.schema.name||base} · {base.split('/').pop().slice(0,7)}<select value={filter.mapping?.[base]||''} onChange={e=>change(filter.id,{mapping:{...filter.mapping,[base]:e.target.value}})}><option value="">No aplicar a esta fuente</option>{columnsFor(data.schema).filter(c=>compatibleFilterProperty(filter.type,c)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>)}<label className="adb-dashboard-check"><input type="checkbox" checked={filter.enabled!==false} onChange={e=>change(filter.id,{enabled:e.target.checked})}/>Filtro activo</label><button type="button" className="adb-menu-item danger" onClick={()=>onChange(filters.filter(f=>f.id!==filter.id))}>Quitar filtro global</button></div>)}<button type="button" className="adb-dashboard-add" onClick={()=>onChange([...filters,{id:uid(),name:'Filtro global',type:'text',op:'contains',value:'',mapping:{},enabled:true}])}>＋ Añadir filtro global</button></>;
}
export function DatabaseDashboard({view,base,schema,rows,onRow,updateView,renderView}){
  const [config,setConfig]=useState(()=>dashboardConfig(view.dashboard));
  const configRef=useRef(config);configRef.current=config;
  const [editing,setEditing]=useState(false),[catalog,setCatalog]=useState([]),[data,setData]=useState({}),[sourceErrors,setSourceErrors]=useState({}),[error,setError]=useState(''),[saving,setSaving]=useState(0),[panel,setPanel]=useState(null),[dragged,setDragged]=useState(null);
  const [resizing,setResizing]=useState(null);
  const dataRef=useRef(data);dataRef.current=data;
  const mounted=useRef(true),token=useRef({}),release=useRef(null),writer=useRef(null),updateViewRef=useRef(updateView);updateViewRef.current=updateView;
  if(!writer.current)writer.current=dashboardWriter({initial:dashboardConfig(view.dashboard),normalize:dashboardConfig,
    storage:typeof sessionStorage==='undefined'?null:sessionStorage,key:`atlas:dashboard-draft:${base}:${view.id}`,
    write:async next=>{
      if(!updateViewRef.current)throw new Error('No se puede guardar este Dashboard fuera de una base editable');
      await updateViewRef.current({dashboard:next});
    },onState:state=>{configRef.current=state.value;if(mounted.current){setConfig(state.value);setSaving(state.pending);setError(state.error);}},
    onDirty:()=>{release.current=trackDatabaseEditor(token.current,()=>writer.current.flush(),()=>({base,view_id:view.id,dashboard:writer.current.snapshot().value,dirty:true}),{configuration:true});},
    onClean:()=>{release.current?.();release.current=null;}});
  const external=JSON.stringify(view.dashboard||{});
  useEffect(()=>{writer.current.install(dashboardConfig(view.dashboard));},[external]);
  useEffect(()=>{
    const state=writer.current.snapshot();configRef.current=state.value;setConfig(state.value);setSaving(state.pending);setError(state.error);
    if(state.dirty)release.current=trackDatabaseEditor(token.current,()=>writer.current.flush(),()=>({base,view_id:view.id,dashboard:writer.current.snapshot().value,dirty:true}),{configuration:true});
    const warn=e=>{if(writer.current.snapshot().dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return()=>{window.removeEventListener('beforeunload',warn);if(!writer.current.snapshot().dirty)release.current?.();};
  },[]);
  useEffect(()=>{mounted.current=true;api('/api/databases/catalog').then(result=>{if(mounted.current)setCatalog(result.sources||[]);}).catch(e=>{if(mounted.current)setError(e.message);});return()=>{mounted.current=false;};},[base]);
  const load=useCallback(async target=>{
    try{const result=await api(target);if(mounted.current){setData(items=>({...items,[target]:result}));setSourceErrors(items=>({...items,[target]:null}));}return result;}
    catch(e){if(mounted.current)setSourceErrors(items=>({...items,[target]:e.message}));throw e;}
  },[]);
  const bases=[...new Set([base,...config.widgets.map(w=>w.base),...(panel?.base?[panel.base]:[])])].sort().join('|');
  useEffect(()=>{for(const target of bases.split('|'))load(target).catch(()=>{});},[bases,load]);
  useEffect(()=>{const changed=event=>{if(bases.split('|').includes(event.detail))load(event.detail).catch(()=>{});};window.addEventListener('atlas:database-changed',changed);return()=>window.removeEventListener('atlas:database-changed',changed);},[bases,load]);
  // Cell changes in the owning DB also refresh widgets while they remain mounted.
  useEffect(()=>{if(dataRef.current[base])load(base).catch(()=>{});},[rows,base,load]);
  const save=next=>writer.current.save(next);
  const change=fn=>save(fn(configRef.current)).catch(()=>{});
  const patchWidget=(id,patch)=>change(current=>({...current,widgets:current.widgets.map(w=>w.id===id?{...w,...patch}:w)}));
  const currentCatalog=catalog.some(s=>sourceKey(s)===base)?catalog:[{base,id:schema.database_id||'',name:schema.name||'Base actual',columns:schema.columns},...catalog];
  const widget=panel?.id?config.widgets.find(w=>w.id===panel.id):null;
  const source=widget?data[widget.base]:null;
  const usedSources=[...new Set(config.widgets.map(w=>w.base))].flatMap(target=>data[target]?[[target,{...data[target],name:currentCatalog.find(s=>sourceKey(s)===target)?.name}]]:[]);
  const addWidget=target=>load(target).then(result=>{
    const first=result.schema.views.find(v=>DASHBOARD_TYPES.includes(v.type))||{type:'table',name:'Tabla'};
    const next=createWidget(target,first);change(c=>({...c,widgets:[...c.widgets,next]}));setPanel(p=>({...p,kind:'widget',id:next.id}));
  }).catch(()=>{});
  return <div className="adb-dashboard-builder"><div className="adb-dashboard-bar"><div><Icon type="dashboard"/><span>{editing?'Editar Dashboard':'Dashboard'}</span><small role="status">{saving?'Guardando…':`${config.widgets.length} widgets`}</small></div><div><button type="button" aria-pressed={editing} onClick={()=>{setEditing(v=>!v);setPanel(null);setResizing(null);}}><Icon type="settings"/>{editing?'Listo':'Editar'}</button><button type="button" onClick={e=>setPanel({kind:'globals',anchor:e.currentTarget})}><Icon type="filter"/>Filtros globales{config.globalFilters.length?` (${config.globalFilters.length})`:''}</button>{editing&&<button type="button" className="adb-primary" onClick={e=>setPanel({kind:'add',anchor:e.currentTarget,base})}>＋ Añadir widget</button>}</div></div>
    {error&&<div className="adb-error" role="alert">{error}<button type="button" onClick={()=>save(configRef.current).catch(()=>{})}>Reintentar guardar configuración</button></div>}
    {config.globalFilters.filter(f=>f.enabled!==false).map(f=><p className="adb-dashboard-global-status" key={f.id}>{f.name}: {String(f.value??'')} · {usedSources.filter(([target,d])=>mappedGlobalRules([f],target,d.schema.columns).length).length}/{usedSources.length} fuentes vinculadas</p>)}
    {!config.widgets.length&&<div className="adb-dashboard-empty"><p>Combina vistas de tus bases de datos en un panel configurable.</p><button type="button" onClick={e=>{setEditing(true);setPanel({kind:'add',anchor:e.currentTarget,base});}}>＋ Añadir el primer widget</button></div>}
    <div className="adb-dashboard-grid">{config.widgets.map((item,index)=>{
      const size=resizing?.id===item.id?resizing:item;
      const content=data[item.base];
      const items=content?widgetRows(content.rows,item,config.globalFilters,content.schema.columns):[];
      const updateRow=row=>{setData(all=>({...all,[item.base]:{...all[item.base],rows:all[item.base].rows.map(r=>r.id===row.id?row:r)}}));if(item.base===base)onRow?.(row);};
      const openRecord=row=>{if(item.view.openMode==='page')window._loadEntryById?.(row.id);else window._openPagePeek?.(row.id,{databasePreview:true,mode:item.view.openMode==='center'?'center':'side',recordIds:items.map(r=>r.id),onClose:()=>load(item.base)});};
      const addRow=async(values={},title='Sin título')=>{const result=await api(item.base+'/rows',{values,title},'POST');await load(item.base);notifyDatabase(item.base);return result.row;};
      const widgetProps=content?{view:item.view,rows:items,schema:content.schema,base:item.base,onRow:updateRow,openRow:openRecord,addRow,reload:()=>load(item.base),updateView:patch=>save({...configRef.current,widgets:configRef.current.widgets.map(w=>w.id===item.id?{...w,view:{...w.view,...patch}}:w)})}:null;
      let representation=content?(item.view.type==='table'?<WidgetTable {...widgetProps}/>:renderView?.(widgetProps)):null;
      if(content&&['gallery','list','feed'].includes(item.view.type)&&item.view.groupBy){
        const col=columnsFor(content.schema).find(c=>c.id===item.view.groupBy);
        if(col)representation=groupRows(items,col).map(([name,group])=><section key={name} className="adb-dashboard-group"><h5>{name} <small>{group.length}</small></h5>{renderView?.({...widgetProps,rows:group})}</section>);
      }
      return <section key={item.id} className={'adb-dashboard-widget'+(editing?' editing':'')+(dragged===item.id?' is-dragged':'')+(resizing?.id===item.id?' is-resizing':'')} aria-label={'Widget '+item.title} style={{'--widget-width':widgetWidth(size)/100,'--widget-height':size.height+'px'}} onDragOver={e=>{if(editing&&dragged)e.preventDefault();}} onDrop={e=>{if(!editing||!dragged)return;e.preventDefault();change(c=>moveWidget(c,dragged,item.id));setDragged(null);}}>
        <header className="adb-dashboard-widget-heading">{editing&&<button type="button" className="adb-dashboard-handle" draggable aria-label={'Arrastrar widget '+item.title} title="Arrastrar para reordenar" onDragStart={e=>{setDragged(item.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/atlas-dashboard-widget',item.id);}} onDragEnd={()=>setDragged(null)}>⠿</button>}<Icon type={item.view.type}/><h4>{item.title}</h4><small>{content?`${items.length} registros`:'Cargando…'}</small>{editing&&<div className="adb-dashboard-widget-tools"><IconButton icon="up" label={'Mover '+item.title+' antes'} disabled={index===0} onClick={()=>change(c=>moveWidget(c,item.id,c.widgets[index-1].id))}/><IconButton icon="down" label={'Mover '+item.title+' después'} disabled={index===config.widgets.length-1} onClick={()=>change(c=>moveWidget(c,item.id,c.widgets[index+1].id))}/><IconButton icon="settings" label={'Configurar widget '+item.title} onClick={e=>setPanel({kind:'widget',anchor:e.currentTarget,id:item.id})}/></div>}</header>
        <div className="adb-dashboard-widget-body">{sourceErrors[item.base]?<div className="adb-error" role="alert">{sourceErrors[item.base]}<button type="button" onClick={()=>load(item.base).catch(()=>{})}>Reintentar cargar fuente</button></div>:!content?<p className="adb-help">Cargando la fuente canónica…</p>:representation}</div><div className="adb-dashboard-widget-caption">{currentCatalog.find(s=>sourceKey(s)===item.base)?.name||item.base} · {item.sourceViewId?'Vista adaptada al widget':'Vista propia'}</div>
        {editing&&<DashboardResizeHandle widget={item} onPreview={next=>setResizing({id:item.id,...next})} onCancel={()=>setResizing(null)} onCommit={next=>{setResizing(null);patchWidget(item.id,next);}}/>}
        {editing&&<span className="adb-sr-only" role="status" aria-live="polite">{Math.round(widgetWidth(size))}% de ancho, {size.height} píxeles de alto</span>}
      </section>;
    })}</div>
    {panel&&<Popover anchor={panel.anchor} wide label={panel.kind==='globals'?'Filtros globales':panel.kind==='add'?'Añadir widget':'Configurar widget'} onClose={()=>setPanel(null)}><div className="adb-dashboard-panel"><h3>{panel.kind==='globals'?'Filtros globales':panel.kind==='add'?'Añadir widget':'Configurar widget'}</h3>
      {panel.kind==='add'&&<><p className="adb-help">Elige una fuente. Después podrás seleccionar una vista existente o configurar otra representación sin duplicar registros.</p>{currentCatalog.map(s=><button key={sourceKey(s)} type="button" className="adb-menu-item" onClick={()=>addWidget(sourceKey(s))}><Icon type="table"/><span>{s.name}</span><small>{s.id.slice(0,7)}</small></button>)}</>}
      {panel.kind==='globals'&&<GlobalFilters config={config} sources={usedSources} onChange={globalFilters=>change(c=>({...c,globalFilters}))}/>}
      {panel.kind==='widget'&&widget&&<><WidgetOptions widget={widget} source={source} catalog={currentCatalog} ensureSource={load} patch={patch=>patchWidget(widget.id,patch)}/><div className="adb-menu-separator"/><button type="button" className="adb-menu-item" onClick={()=>change(c=>duplicateWidget(c,widget.id))}><Icon type="copy"/>Duplicar widget</button><button type="button" className="adb-menu-item danger" onClick={()=>{change(c=>({...c,widgets:c.widgets.filter(w=>w.id!==widget.id)}));setPanel(null);}}><Icon type="trash"/>Quitar widget</button></>}
    </div></Popover>}
  </div>;
}
