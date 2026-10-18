import React,{useState,useEffect} from 'react';
import {api,displayValue} from './databaseModel.js';
import {IconButton} from './databaseUI.jsx';
import {recordLayout,mutateRecordSource} from './databasePeekModel.js';

export function RecordLayoutPanel({meta,actions,onClose}){
  const base=`/api/databases/${meta.parent_id}/${meta.database_id}`;
  const [data,setData]=useState(null),[layout,setLayout]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api(base).then(d=>{setData(d);setLayout(recordLayout(d.schema.page_layout,d.schema.columns));}).catch(e=>setError(e.message));return ()=>window.dispatchEvent(new CustomEvent('atlas:record-layout-preview',{detail:{base,layout:null}}));},[base]);
  useEffect(()=>{if(layout)window.dispatchEvent(new CustomEvent('atlas:record-layout-preview',{detail:{base,layout}}));},[layout]);
  const reorder=(index,direction)=>{const order=[...layout.order];const target=index+direction;if(target<0||target>=order.length)return;[order[index],order[target]]=[order[target],order[index]];setLayout({...layout,order});};
  return <div className="adb-record-panel-editor"><div className="adb-popover-title">Personalizar diseño</div>
    <p>Diseño compartido por las páginas de esta base. La previsualización no guarda cambios.</p>
    {error&&<p role="alert" className="adb-error">{error}</p>}
    {layout&&<><label>Estructura<select aria-label="Estructura de página" value={layout.structure} onChange={e=>setLayout({...layout,structure:e.target.value})}><option value="simple">Simple</option><option value="tabbed">Con pestañas</option></select></label>
      <label className="adb-layout-toggle"><input type="checkbox" checked={layout.property_icons} onChange={e=>setLayout({...layout,property_icons:e.target.checked})}/>Iconos por defecto en las propiedades</label>
      <p>Orden y ubicación de propiedades</p><div className="adb-layout-properties">{layout.order.map((id,index)=>{
        const col=data.schema.columns.find(c=>c.id===id);if(!col)return null;
        const location=layout.hidden.includes(id)?'hidden':layout.panel.includes(id)?'panel':'main';
        return <div key={id}><span>{col.name}</span><select aria-label={'Ubicación de '+col.name} value={location} onChange={e=>setLayout({...layout,hidden:e.target.value==='hidden'?[...layout.hidden.filter(x=>x!==id),id]:layout.hidden.filter(x=>x!==id),panel:e.target.value==='panel'?[...layout.panel.filter(x=>x!==id),id]:layout.panel.filter(x=>x!==id)})}><option value="main">Página</option><option value="panel">Panel</option><option value="hidden">Oculta</option></select><IconButton icon="up" label={'Subir '+col.name} disabled={index===0} onClick={()=>reorder(index,-1)}/><IconButton icon="down" label={'Bajar '+col.name} disabled={index===layout.order.length-1} onClick={()=>reorder(index,1)}/></div>;
      })}</div>
      <div className="adb-panel-footer"><button onClick={onClose} disabled={busy}>Cancelar</button><button className="adb-primary" disabled={busy} onClick={async()=>{
        setBusy(true);setError('');try{await actions.flush();await mutateRecordSource(meta,{operation:'page_layout',layout,expected_layout:data.schema.page_layout??null});onClose();}catch(e){setError(e.message);}finally{setBusy(false);}
      }}>{busy?'Guardando…':'Aplicar a todas las páginas'}</button></div>
    </>}
  </div>;
}

export function RecordMovePanel({base,entryId,actions,onClose}){
  const [sources,setSources]=useState([]),[target,setTarget]=useState(''),[plan,setPlan]=useState(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api('/api/databases/catalog').then(d=>setSources(d.sources.filter(s=>`/api/databases/${s.parent_id}/${s.id}`!==base))).catch(e=>setError(e.message));},[base]);
  const destination=()=>{const s=sources[Number(target)];return {target_parent:s.parent_id,target_database:s.id};};
  return <div className="adb-record-panel-editor"><div className="adb-popover-title">Mover a otra base</div><p>Conserva la identidad y el contenido. Las propiedades compatibles se vinculan por nombre y tipo.</p>
    {error&&<p className="adb-error" role="alert">{error}</p>}
    <select aria-label="Base de destino" value={target} onChange={e=>{setTarget(e.target.value);setPlan(null);setAck(false);}}><option value="">Seleccionar base…</option>{sources.map((s,i)=><option key={s.parent_id+s.id} value={String(i)}>{s.name} · {s.parent_id} · {s.id.slice(-6)}</option>)}</select>
    {!plan?<button className="adb-primary" disabled={target===''||busy} onClick={async()=>{setBusy(true);try{await actions.flush();setPlan(await api(`${base}/rows/${entryId}/move`,{...destination(),preview:true},'POST'));}catch(e){setError(e.message);}finally{setBusy(false);}}}>Revisar traslado</button>:<>
      <ul>{plan.matched.map((p,i)=><li key={i}>{p.from_name} → {p.to_name}</li>)}</ul>
      {plan.unmapped.length>0&&<><p>Sin equivalencia en el destino:</p><ul>{plan.unmapped.map((p,i)=><li key={i}>{p.name}: {displayValue(p.value,p.type)||'Vacío'}</li>)}</ul><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Conservar estos valores como propiedades del traslado y guardar una copia recuperable.</label></>}
      <div className="adb-panel-footer"><button onClick={onClose}>Cancelar</button><button className="adb-primary" disabled={busy||plan.unmapped.length>0&&!ack} onClick={async()=>{setBusy(true);try{await actions.flush();await api(`${base}/rows/${entryId}/move`,{...destination(),revision:plan.revision,preserve_unmapped:ack},'POST');onClose();await actions.openRecord(entryId,[entryId]);}catch(e){setError(e.message);}finally{setBusy(false);}}}>Mover registro</button></div>
    </>}
  </div>;
}

export function RecordHistoryPanel({base,entryId,actions,locked}){
  const [data,setData]=useState(null),[selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{actions.flush().then(()=>api(`${base}/rows/${entryId}/content-history`)).then(setData).catch(e=>setError(e.message));},[base,entryId]);
  return <div className="adb-record-panel-editor"><div className="adb-popover-title">Historial del contenido</div><p>Las versiones conservan el cuerpo de la página. Restaurar no modifica sus propiedades ni su base.</p>
    {error&&<p role="alert" className="adb-error">{error}</p>}
    {data&&<><p>Última edición: {data.updated_at?new Date(data.updated_at).toLocaleString():'Sin fecha'}</p><p>{data.word_count} palabras en Markdown</p>
      <div className="adb-history-versions">{data.versions.length?data.versions.map(v=><button key={v.timestamp} aria-pressed={selected?.timestamp===v.timestamp} onClick={async()=>{try{setSelected(await api(`${base}/rows/${entryId}/content-history/${v.timestamp}`));}catch(e){setError(e.message);}}}>{v.timestamp.slice(0,8)} · {v.timestamp.slice(9,15)} · {v.size} B</button>):<p>Se guardará una versión cuando cambie el contenido.</p>}</div>
      {selected&&<><pre className="adb-version-preview">{selected.markdown||'(Contenido vacío)'}</pre><button className="adb-primary" disabled={locked||busy} onClick={async()=>{setBusy(true);try{await api(`${base}/rows/${entryId}/content-history/${selected.timestamp}`,{revision:data.revision},'POST');await actions.refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Restaurar esta versión</button>{locked&&<p>Desbloquea la página para restaurar.</p>}</>}
    </>}
  </div>;
}

export function RecordImportPanel({actions,onClose}){
  const [text,setText]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="adb-record-panel-editor"><div className="adb-popover-title">Importar Markdown</div><p>Añade el archivo al final del contenido. Conserva el cuerpo existente y las propiedades.</p>
    <input aria-label="Archivo Markdown" type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async e=>{const file=e.target.files[0];if(!file)return;if(file.size>2*1024*1024){setError('Máximo 2 MB');return;}setText(await file.text());setError('');}}/>
    <label>O pega el contenido<textarea aria-label="Pegar Markdown" placeholder="## Título\n\nContenido en Markdown…" value={text??''} onChange={e=>{setText(e.target.value);setError(new Blob([e.target.value]).size>2*1024*1024?'Máximo 2 MB':'');}}/></label>
    {text!==null&&<pre className="adb-version-preview">{text.slice(0,3000)}{text.length>3000?'\n…':''}</pre>}{error&&<p className="adb-error" role="alert">{error}</p>}
    <div className="adb-panel-footer"><button onClick={onClose}>Cancelar</button><button className="adb-primary" disabled={!text||busy||!!error} onClick={async()=>{setBusy(true);try{await actions.appendMarkdown(text);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Añadir contenido</button></div>
  </div>;
}
