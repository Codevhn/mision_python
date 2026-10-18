import React,{useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {IconButton,MenuItem,Popover,notifyDatabase,trackDatabaseEditor} from './databaseUI.jsx';
import {DatabaseIcon as Icon} from './databaseIcons.jsx';
import {api,SaveQueue} from './databaseModel.js';
import {recordPresentation,peekNeighbors,applyRecordPresentation} from './databasePeekModel.js';
import {RecordExportDialog} from './databaseExport.jsx';
import {RecordLayoutPanel,RecordMovePanel,RecordHistoryPanel,RecordImportPanel} from './databaseRecordPanels.jsx';

function PeekToolbar({entryId,meta,recordIds=[],mode='side',actions}) {
  const base=meta.database_id?`/api/databases/${meta.parent_id}/${meta.database_id}`:null;
  const [menu,setMenu]=useState(null);
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [record,setRecord]=useState(meta);
  const storageKey='atlas-record-presentation:'+entryId;
  const recovered=useRef(null);
  const [presentation,setPresentation]=useState(()=>{
    try{recovered.current=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
    return recordPresentation({...meta.database_presentation,...recovered.current});
  });
  const queue=useRef(null);
  if(!queue.current){
    queue.current=new SaveQueue(async patch=>{
      const result=await api(`${base}/rows/${entryId}`,{presentation:patch});
      applyRecordPresentation(document.getElementById('pagePeekOverlay'),result.row.database_presentation);
      notifyDatabase(base);
    });
    if(recovered.current)queue.current.set(recovered.current);
  }
  const flush=async()=>{
    try{
      await queue.current.flush();
      try{sessionStorage.removeItem(storageKey);}catch{}
      setError('');
    }catch(e){setError(e.message);throw e;}
  };
  useEffect(()=>{
    const untrack=trackDatabaseEditor('peek-presentation:'+entryId,flush,()=>({entry_id:entryId,presentation:queue.current.pending}));
    const warn=event=>{if(queue.current.pending){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    if(recovered.current)setError('Se recuperó una apariencia pendiente de guardar.');
    return ()=>{untrack();window.removeEventListener('beforeunload',warn);};
  },[entryId]);
  useEffect(()=>{
    applyRecordPresentation(document.getElementById('pagePeekOverlay'),presentation);
  },[presentation]);
  const run=async(fn,close=true)=>{
    if(busy)return;
    setBusy(true);setError('');setStatus('');
    try{await fn();if(close)setMenu(null);}catch(e){setError(e.message||'No se pudo completar la acción');}
    finally{setBusy(false);}
  };
  const change=patch=>run(async()=>{
    setPresentation(p=>({...p,...patch}));queue.current.set(patch);
    try{sessionStorage.setItem(storageKey,JSON.stringify(queue.current.pending));}catch{}
    await flush();
  },false);
  const updateRecord=async patch=>{
    await actions.flush();
    const result=await api(`${base}/rows/${entryId}`,patch);setRecord(result.row);
    actions.setLocked?.(!!result.row.database_locked);notifyDatabase(base);
  };
  const {previous,next}=peekNeighbors(recordIds,entryId);
  const items=[
    {icon:'link',label:'Copiar enlace',action:async()=>{await navigator.clipboard.writeText(actions.link());setStatus('Enlace copiado');}},
    {icon:'copy',label:'Copiar contenido',action:async()=>{await navigator.clipboard.writeText(actions.markdown());setStatus('Contenido copiado');}},
    ...(base?[
      {icon:'copy',label:'Duplicar',action:async()=>{await actions.flush();const result=await api(`${base}/rows/${entryId}/duplicate`,{},'POST');notifyDatabase(base);await actions.openRecord(result.row.id,[...recordIds,result.row.id]);}},
      {icon:'move',label:'Mover a…',panel:'move'},
      {icon:'trash',label:'Mover a la papelera',danger:true,panel:'trash'},
      {icon:'settings',label:'Personalizar diseño',panel:'layout'},
      {icon:'history',label:'Historial de versiones',panel:'history'},
      {icon:'files',label:'Importar Markdown',panel:'import',disabled:!!record.database_locked},
      {icon:'download',label:'Exportar…',panel:'export'},
      ...(record.database_last_transfer?[{icon:'move',label:'Deshacer último traslado',action:async()=>{await actions.flush();await api(`${base}/rows/${entryId}/transfers/${record.database_last_transfer}/restore`,{},'POST');notifyDatabase(base);await actions.openRecord(entryId,[entryId]);}}]:[])
    ]:[])
  ];
  const filtered=items.filter(item=>item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const back=()=>setMenu({...menu,kind:'actions',focusLabel:menu.returnLabel});
  const renderItem=item=><MenuItem key={item.label} icon={item.icon} label={item.label} danger={item.danger} submenu={!!item.panel} disabled={busy||item.disabled} onClick={()=>item.panel?setMenu({...menu,kind:item.panel,returnLabel:item.label,focusLabel:undefined}):run(item.action,false)}/>;
  const appearance=[['small_text','text','Texto pequeño'],['full_width','expand','Ancho completo'],['table_of_contents','list','Tabla de contenido'],['property_icons','settings','Iconos de propiedades']];
  const wordCount=actions.markdown().replace(/^# [^\n]*\n*/,'').trim().split(/\s+/).filter(Boolean).length;
  return <div className="adb-peek-toolbar" aria-label="Controles del registro">
    <div className="adb-peek-nav">
      <IconButton icon="collapse" label="Cerrar Peek" disabled={busy} onClick={()=>run(actions.close)}/>
      <IconButton icon="expand" label="Abrir como página completa" disabled={busy} onClick={()=>run(actions.fullPage)}/>
      <IconButton icon="down" label="Cambiar modo Peek" active={menu?.kind==='mode'} aria-expanded={menu?.kind==='mode'} aria-haspopup="dialog" onClick={e=>{setSearch('');setMenu({kind:'mode',anchor:e.currentTarget});}}/>
      <span className="adb-peek-nav-divider"/>
      <IconButton icon="up" label="Registro anterior" disabled={!previous||busy} onClick={()=>run(()=>actions.navigate(previous))}/>
      <IconButton icon="down" label="Registro siguiente" disabled={!next||busy} onClick={()=>run(()=>actions.navigate(next))}/>
    </div>
    <span className="adb-peek-status" role="status">{busy?'Procesando…':status}</span>
    <div className="adb-peek-nav">
      <IconButton icon="link" label="Copiar enlace al registro" disabled={busy} onClick={()=>run(items[0].action)}/>
      {base&&<IconButton icon="star" label={record.starred?'Quitar de favoritos':'Añadir a favoritos'} active={!!record.starred} disabled={busy} onClick={()=>run(()=>updateRecord({favorite:!record.starred}))}/>}
      <IconButton icon="more" label="Acciones del registro" active={menu?.kind==='actions'} aria-expanded={menu?.kind==='actions'} aria-haspopup="dialog" onClick={e=>{setSearch('');setMenu({kind:'actions',anchor:e.currentTarget});}}/>
    </div>
    {error&&<span className="adb-peek-toolbar-error" role="alert">{error}<button onClick={()=>run(flush)}>Reintentar</button></span>}
    {menu?.kind==='export'?<RecordExportDialog base={base} entryId={entryId} meta={record} actions={actions} anchor={menu.anchor} onClose={back}/>:menu&&<Popover owner={entryId} anchor={menu.anchor} wide={!['mode','actions'].includes(menu.kind)} className={menu.kind==='actions'?'adb-peek-actions-menu':''} focusLabel={menu.focusLabel} onBack={!['mode','actions'].includes(menu.kind)?back:undefined} label={menu.kind==='mode'?'Modo de apertura':menu.kind==='actions'?'Acciones del registro':menu.kind+' · Configuración del registro'} onClose={()=>setMenu(null)}>
      {menu.kind==='mode'?<>
        <div className="adb-popover-title">Abrir el registro</div>
        {[['side','open','Side Peek','Mantiene la base visible e interactiva.'],['center','gallery','Center Peek','Abre un panel centrado.'],['page','expand','Página completa','Abre esta misma página.']].map(([value,icon,label,detail])=><MenuItem key={value} icon={icon} label={<>{label}<small>{detail}</small></>} disabled={busy} onClick={()=>run(()=>value==='page'?actions.fullPage():actions.mode(value))}>{mode===value&&<Icon type="check"/>}</MenuItem>)}
      </>:menu.kind==='layout'?<RecordLayoutPanel meta={meta} actions={actions} onClose={back}/>:menu.kind==='move'?<RecordMovePanel base={base} entryId={entryId} actions={actions} onClose={back}/>:menu.kind==='history'?<RecordHistoryPanel base={base} entryId={entryId} actions={actions} locked={!!record.database_locked}/>:menu.kind==='import'?<RecordImportPanel actions={actions} onClose={back}/>:menu.kind==='trash'?<div className="adb-record-panel-editor"><div className="adb-popover-title">Mover a la papelera</div><p>El registro desaparecerá de las vistas. Podrás restaurarlo desde la papelera de esta base con su contenido y propiedades.</p><div className="adb-panel-footer"><button onClick={back}>Cancelar</button><button className="adb-primary" disabled={busy} onClick={()=>run(async()=>{await actions.flush();await api(`${base}/rows/${entryId}`,{},'DELETE');notifyDatabase(base);await actions.close();})}>Mover a la papelera</button></div></div>:<>
        <div className="adb-menu-search"><Icon type="search"/><input autoFocus aria-label="Buscar acciones del registro" placeholder="Buscar acciones…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="adb-menu-scroll">
          {base&&!search&&<div className="adb-menu-group"><div className="adb-peek-fonts" role="group" aria-label="Tipografía del registro">{[['default','Default'],['serif','Serif'],['mono','Mono']].map(([font,label])=><button key={font} data-font={font} aria-label={label} aria-pressed={presentation.font===font} disabled={busy} onClick={()=>change({font})}><span aria-hidden="true">Ag</span>{label}</button>)}</div></div>}
          {filtered.some(item=>!['layout','history','import','export'].includes(item.panel))&&<div className="adb-menu-group">{filtered.filter(item=>!['layout','history','import','export'].includes(item.panel)).map(renderItem)}</div>}
          {base&&<>
            {(appearance.some(([, ,label])=>label.toLocaleLowerCase().includes(search.toLocaleLowerCase()))||filtered.some(item=>item.panel==='layout'))&&<div className="adb-menu-group">
              {appearance.filter(([, ,label])=>label.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(([key,icon,label])=><button key={key} className="adb-menu-item" role="switch" aria-checked={presentation[key]} disabled={busy} onClick={()=>change({[key]:!presentation[key]})}><Icon type={icon}/><span>{label}</span><i className={'adb-switch '+(presentation[key]?'checked':'')}/></button>)}
              {filtered.filter(item=>item.panel==='layout').map(renderItem)}
            </div>}
            {(!search||'bloquear página'.includes(search.toLocaleLowerCase()))&&<div className="adb-menu-group"><button className="adb-menu-item" role="switch" aria-checked={!!record.database_locked} disabled={busy} onClick={()=>run(()=>updateRecord({locked:!record.database_locked}),false)}><Icon type="lock"/><span>Bloquear página</span><i className={'adb-switch '+(record.database_locked?'checked':'')}/></button></div>}
            {filtered.some(item=>['import','export','history'].includes(item.panel))&&<div className="adb-menu-group">{['import','export','history'].flatMap(panel=>filtered.filter(item=>item.panel===panel)).map(renderItem)}</div>}
            {!search&&<footer className="adb-peek-menu-note adb-menu-group">{record.updated_at&&<>Última edición: {new Date(record.updated_at).toLocaleString('es')}<br/></>}{wordCount} palabras en Markdown</footer>}
          </>}
          {search&&!filtered.length&&!appearance.some(([, ,label])=>label.toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&!'bloquear página'.includes(search.toLocaleLowerCase())&&<p className="adb-help" role="status">No hay acciones coincidentes.</p>}
        </div>

      </>}
    </Popover>}
  </div>;
}
const roots=new WeakMap();
export function mountPeekToolbar(container,props) {
  let root=roots.get(container);if(!root){root=createRoot(container);roots.set(container,root);}
  root.render(<PeekToolbar key={props.entryId} {...props}/>);
}
export function unmountPeekToolbar(container){const root=roots.get(container);if(root){root.unmount();roots.delete(container);}}
