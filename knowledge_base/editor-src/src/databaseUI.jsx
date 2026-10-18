import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {numberDraft,dateLabel} from './databasePropertyValues.js';
import {DatePropertyInput} from './DatePropertyInput.jsx';
import {relationIssueLabel,relationTitle} from './databaseRelations.js';
import { menuKeyDown, focusMenuItem } from './databaseMenuNavigation.js';
import { DatabaseIcon as Icon } from './databaseIcons.jsx';
import { PROPERTY_TYPES, COMPUTED, optionsFor, displayValue, valueOf, api } from './databaseModel.js';
import {applyRecordPresentation,clearRecordPresentation,recordLayout,mutateRecordSource} from './databasePeekModel.js';
const pendingEditors = new Map();
const cellDrafts = new Map();
const configurationEditors = new Set();
export function trackDatabaseEditor(key,flush,readDraft,{configuration=false}={}) {
  pendingEditors.set(key,flush);
  if(configuration)configurationEditors.add(key);
  if(readDraft)cellDrafts.set(key,readDraft);
  return ()=>{pendingEditors.delete(key);cellDrafts.delete(key);configurationEditors.delete(key);};
}
export const databaseDrafts = () => [...cellDrafts.values()].map(read => read());
export async function flushDatabaseEditors({configurations=true}={}) {
  for (const [key,flush] of [...pendingEditors.entries()]) if(configurations||!configurationEditors.has(key))await flush();
}
export const notifyDatabase = base => window.dispatchEvent(new CustomEvent('atlas:database-changed', {
  detail: base
}));
export function IconButton({
  icon,
  label,
  active,
  onClick,
  ...props
}) {
  return <button type="button" className={'adb-icon-button' + (active ? ' active' : '')} aria-label={label} title={label} aria-pressed={active === undefined ? undefined : !!active} onClick={onClick} {...props}><Icon type={icon} /></button>;
}
export function MenuItem({icon,label,onClick,danger,children,disabled,submenu=false,checked,...props}) {
  return <button type="button" className={'adb-menu-item'+(danger?' danger':'')} disabled={disabled}
    aria-haspopup={submenu?'dialog':undefined} data-menu-submenu={submenu||undefined}
    aria-pressed={checked===undefined?undefined:!!checked} onClick={onClick} {...props}>
    {icon&&<Icon type={icon}/>}<span>{label}</span>{children}
    {checked&&<Icon type="check"/>}{submenu&&<Icon type="right"/>}
  </button>;
}
export function Popover({
  anchor,
  children,
  onClose,
  wide = false,
  label = 'Menú',
  owner,
  onBack,
  focusLabel,
  className = ''
}) {
  const ref = useRef(null);
  const [style, setStyle] = useState({
    visibility: 'hidden'
  });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const peekOwner = owner || anchor?.closest?.('#pagePeekOverlay')?.dataset.peekOwner;
  useEffect(() => {
    const place = () => {
      const rect = anchor?.getBoundingClientRect?.() || {
        bottom: innerHeight / 3,
        left: innerWidth / 2 - 160
      };
      const width = ref.current?.offsetWidth || 320;
      const height = ref.current?.offsetHeight || 300;
      setStyle({
        left: Math.max(10, Math.min(rect.left, innerWidth - width - 10)),
        top: Math.max(10, Math.min(rect.bottom + 5, innerHeight - height - 10))
      });
    };
    const outside = e => {
      if (ref.current?.contains(e.target) || anchor?.contains?.(e.target)) return;
      Promise.resolve(closeRef.current?.()).catch(() => {});
    };
    place();
    // Move focus into a newly opened menu so Escape is handled by the portal,
    // rather than closing its owning Peek while the anchor still has focus.
    const frame = requestAnimationFrame(place);
    const observer=new ResizeObserver(place);
    if(ref.current)observer.observe(ref.current);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    const surface=ref.current;
    return () => {
      const restore=surface?.contains(document.activeElement)||document.activeElement===document.body;
      if(restore)requestAnimationFrame(()=>{
        if(document.activeElement===document.body&&anchor?.isConnected)anchor.focus({preventScroll:true});
      });
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [anchor,label,focusLabel]);
  // The first placement removes visibility:hidden in a React commit. Focusing
  // before that commit is ignored by the browser, especially on submenu return.
  useLayoutEffect(()=>{if(style.visibility!=='hidden')focusMenuItem(ref.current,focusLabel);},[anchor,label,focusLabel,style.visibility]);
  return createPortal(<div ref={ref} tabIndex={-1} className={'adb-popover' + (wide ? ' wide' : '')+' '+className} style={style} contentEditable={false} role="dialog" aria-label={label} data-peek-owner={peekOwner} onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation();
    menuKeyDown(e, {onBack, onClose:()=>{
      const portal=e.currentTarget;
      Promise.resolve(closeRef.current?.()).then(()=>requestAnimationFrame(()=>{
        if(!portal.isConnected&&anchor?.isConnected)anchor.focus({preventScroll:true});
      })).catch(()=>{});
    }});
  }}>{onBack&&<button type="button" className="adb-menu-back" aria-label="Volver al menú anterior" onClick={onBack}><Icon type="left"/><span>Volver</span></button>}{children}</div>, document.body);
}
export function Tag({
  value,
  col
}) {
  const option = optionsFor(col).find(o => o.label === value);
  return <span className={'adb-tag' + (col.type === 'status' ? ' status' : '')} style={{
    '--tag-color': option?.color || '#888888'
  }}>{col.type === 'status' && <i />}{value}</span>;
}
export function CellValue({
  row,
  col
}) {
  const prop = row.properties?.find(p => p.id === col.id);
  const value = col.id === 'title' ? row.title : valueOf(row, col);
  if (prop?.calculation_error) return <span className="adb-cell-error" title={prop.calculation_error}>⚠ {prop.calculation_error}</span>;
  if (prop?.conversion_pending) return <span className="adb-cell-error" title="Valor original conservado. Edítalo o recupera el respaldo.">⚠ {displayValue(value)}</span>;
  if (col.type === 'relation') return <>{(Array.isArray(value) ? value : []).map(id => {const issue=prop?.relation_issues?.find(r=>r.id===id);return <span className={'adb-relation-chip'+(issue?' adb-cell-error':'')} title={issue?relationIssueLabel(issue.reason)+' · '+id:relationTitle(prop,id)} key={id}><Icon type="page" />{issue?'⚠ ':''}{relationTitle(prop,id)}</span>;})}{prop?.relation_source_available===false&&!value.length&&<span className="adb-cell-error">Base de destino no disponible</span>}</>;
  if (['select', 'status', 'multi_select'].includes(col.type)) return <>{(Array.isArray(value) ? value : value ? [value] : []).map(v => <Tag key={v} value={v} col={col} />)}</>;
  if (col.type === 'number' && typeof value === 'number' && ['percent', 'currency'].includes(col.number_format)) return <span>{new Intl.NumberFormat('es', {
      style: col.number_format,
      currency: col.number_format === 'currency' ? 'USD' : undefined,
      maximumFractionDigits: 2
    }).format(value)}</span>;
  if (col.type === 'checkbox') return <span aria-label={value ? 'Marcada' : 'Sin marcar'} className={'adb-check' + (value ? ' checked' : '')}>{value ? '✓' : ''}</span>;
  if (col.type === 'button') return <span className="adb-action-label">{col.name} ↗</span>;
  if (col.type === 'date' && value) return <span>{dateLabel(value,col)}</span>;
  return <span>{displayValue(value, col.type)}</span>;
}
export function Cell({
  row,
  col,
  base,
  onRow,
  placeholder = false,
  readonly = false
}) {
  const [anchor, setAnchor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const draft = useRef(null);
  const dirty = useRef(false);
  const draftVersion = useRef(0);
  const running = useRef(null);
  const [renderDraft, setRenderDraft] = useState(null);
  const related = useRef([]);
  const [relations, setRelations] = useState([]);
  const relationProp=row.properties?.find(p=>p.id===col.id);
  const restoreRelation=async issue=>{
    setBusy(true);setError('');
    try{
      const target=`/api/databases/${col.target_parent}/${col.target_database}`;
      await api(target+'/deleted/'+issue.id,{},'POST');
      const next=await api(target);setRelations(next.rows);related.current=next.rows;
      const own=await api(base);onRow?.(own.rows.find(r=>r.id===row.id)||row);
      notifyDatabase(target);notifyDatabase(base);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const editable = !readonly && !row.database_locked && !COMPUTED.has(col.type);
  const token=useRef({});
  const untrack=()=>{pendingEditors.delete(token.current);cellDrafts.delete(token.current);};
  const retain=()=>{
    pendingEditors.set(token.current,commit);
    cellDrafts.set(token.current,()=>({entry_id:row.id,column_id:col.id,value:draft.current,dirty:dirty.current}));
  };
  const setDraft = value => {
    draft.current = value;
    dirty.current = true;
    draftVersion.current++;
    retain();
    setRenderDraft(value);
    try {
      sessionStorage.setItem('atlas-cell-draft:' + row.id + ':' + col.id, JSON.stringify(value));
    } catch {}
  };
  const commit = () => {
    if (running.current) return running.current;
    if (!dirty.current) return Promise.resolve();
    setBusy(true);
    setError('');
    running.current = (async () => {
      try {
        while (dirty.current) {
          const version = draftVersion.current;
          let value = draft.current;
          if (col.type === 'number') value = numberDraft(value);
          const result = await api(base + '/rows/' + row.id, col.id === 'title' ? {
            title: value
          } : {
            values: {
              [col.id]: value
            }
          });
          if (version === draftVersion.current) {
            dirty.current = false;
            try {
              sessionStorage.removeItem('atlas-cell-draft:' + row.id + ':' + col.id);
            } catch {}
          }
          onRow?.(result.row);
          notifyDatabase(base);
        }
      } catch (err) {
        setError(err.message);
        throw err;
      }
    })().finally(() => {
      running.current = null;
      if(!dirty.current)untrack();
      setBusy(false);
    });
    return running.current;
  };
  const close = async () => {
    try {
      await commit();
      setAnchor(null);
    } catch {/* Leave draft and editor available. */}
  };
  useEffect(()=>{
    if(col.type==='checkbox'){
      try{
        const saved=sessionStorage.getItem('atlas-cell-draft:'+row.id+':'+col.id);
        if(saved!==null){setDraft(JSON.parse(saved));setError('Casilla pendiente recuperada. Reintenta el guardado.');}
      }catch{}
    }
    return ()=>{
      // Filtering or switching representations can unmount a cell. Its failed
      // write must still block a destructive close and remain retryable.
      if(!dirty.current&&!running.current)untrack();
    };
  },[row.id,col.id]);
  const open = async event => {
    if (!editable) return;
    if (col.type === 'button') {
      try {
        const result = await api(base + '/rows/' + row.id + '/button/' + col.id, {}, 'POST');
        onRow?.(result.row);
        notifyDatabase(base);
      } catch (e) {
        setError(e.message);
      }
      return;
    }
    if (col.type === 'checkbox') {
      setDraft(!(dirty.current?draft.current:valueOf(row,col)));
      try {
        await commit();
      } catch {}
      return;
    }
    setError('');
    draft.current = col.id === 'title' ? row.title : valueOf(row, col);
    dirty.current = false;
    try {
      const saved = sessionStorage.getItem('atlas-cell-draft:' + row.id + ':' + col.id);
      if (saved !== null) {
        draft.current = JSON.parse(saved);
        dirty.current = true;
        draftVersion.current++;
        retain();
        setError('Borrador recuperado de esta sesión');
      }
    } catch {}
    setRenderDraft(draft.current);
    setAnchor(event.currentTarget);
    if (col.type === 'relation' && col.target_parent && col.target_database) {
      try {
        const result = await api(`/api/databases/${col.target_parent}/${col.target_database}`);
        related.current = result.rows;
        setRelations(result.rows);
      } catch (e) {
        setError(e.message);
      }
    }
  };
  const multi = ['multi_select', 'person', 'relation', 'files'].includes(col.type);
  const toggle = async value => {
    const previous = Array.isArray(draft.current) ? draft.current : [];
    setDraft(previous.includes(value) ? previous.filter(v => v !== value) : [...previous, value]);
    try {
      await commit();
    } catch {}
  };
  const upload = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      const response = await fetch('/api/databases/files', {
        method: 'POST',
        body: form
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft([...(Array.isArray(draft.current) ? draft.current : []), data]);
      await commit();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const val = renderDraft ?? '';
  const displayedRow=col.type==='checkbox'&&dirty.current?{...row,properties:[...(row.properties||[]).filter(p=>p.id!==col.id),{id:col.id,value:draft.current}]}:row;
  return <>
    <button type="button" className={'adb-cell-value' + (!editable ? ' readonly' : '')} onClick={open} aria-label={`${col.name}: ${displayValue(col.id === 'title' ? row.title : valueOf(displayedRow, col), col.type) || 'Vacío'}`} title={!editable ? 'Calculado automáticamente' : undefined}>
      <CellValue row={displayedRow} col={col} />{placeholder && !displayValue(valueOf(row, col), col.type) && <span className="adb-placeholder">Vacío</span>}
    </button>
    {['url', 'email', 'phone'].includes(col.type) && valueOf(row, col) && <a className="adb-external-link" aria-label={'Abrir ' + col.name} title={'Abrir ' + col.name} href={(col.type === 'email' ? 'mailto:' : col.type === 'phone' ? 'tel:' : '') + valueOf(row, col)} target={col.type === 'url' ? '_blank' : undefined} rel="noreferrer">↗</a>}
    {error && !anchor && <span className="adb-cell-error" role="alert">{error}{dirty.current&&<button type="button" disabled={busy} onClick={()=>commit().catch(()=>{})}>Reintentar {col.name}</button>}</span>}
    {anchor && <Popover anchor={anchor} label={'Editar ' + col.name} onClose={close}>
      <div className="adb-popover-title"><Icon type={col.type} />{col.name}</div>
      {['select', 'status', 'multi_select'].includes(col.type) ? <>
        {optionsFor(col).map(opt => <MenuItem key={opt.label} label={<Tag value={opt.label} col={col} />} onClick={async () => {
          if (multi) await toggle(opt.label).catch(()=>{});else {
            setDraft(opt.label);
            await close();
          }
        }}>{(Array.isArray(val) ? val.includes(opt.label) : val === opt.label) ? '✓' : null}</MenuItem>)}
        {(Array.isArray(val)?val:val?[val]:[]).filter(v=>!optionsFor(col).some(o=>o.label===v)).map(v=><MenuItem key={'retired:'+v} label={String(v)+' · opción retirada (quitar)'} onClick={()=>{if(multi)toggle(v).catch(()=>{});else{setDraft('');close();}}}/>)}
        {!optionsFor(col).length && <p className="adb-help">Añade opciones desde «Editar propiedad» en el encabezado.</p>}
        <MenuItem label="Vaciar" onClick={() => {
          setDraft(multi ? [] : '');
          close();
        }} />
      </> : col.type === 'person' ? <><p className="adb-help">Usuario local de Atlas</p><MenuItem icon="person" label="Propietario" onClick={() => toggle('owner')}>{Array.isArray(val) && val.includes('owner') ? '✓' : ''}</MenuItem></> : col.type === 'relation' ? <>
        {!col.target_database&&<p className="adb-help">Selecciona la base de destino en «Editar propiedad».</p>}
        {relations.map(item=><MenuItem key={item.id} icon="page" label={item.title} onClick={()=>toggle(item.id).catch(()=>{})}>{Array.isArray(val)&&val.includes(item.id)?'✓':''}</MenuItem>)}
        {(relationProp?.relation_issues||[]).filter(issue=>Array.isArray(val)&&val.includes(issue.id)).map(issue=><div key={issue.id} className="adb-relation-issue"><p className="adb-help">{issue.title} · {relationIssueLabel(issue.reason)}<br/><code>{issue.id}</code></p><MenuItem label={'Quitar referencia a '+issue.title} onClick={()=>toggle(issue.id).catch(()=>{})}/>{issue.reason==='deleted'&&relationProp.relation_source_available&&<MenuItem icon="page" label={'Restaurar '+issue.title} disabled={busy} onClick={()=>restoreRelation(issue)}/>}</div>)}
        {!relations.length&&col.target_database&&<p className="adb-help">No hay registros disponibles en la base de destino. Las referencias guardadas se conservan.</p>}
      </> : col.type === 'files' ? <><label className="adb-upload">Adjuntar archivo (máximo 20 MB)<input type="file" onChange={upload} /></label>{(Array.isArray(val) ? val : []).map((file, i) => <div className="adb-file" key={file.id}><a href={'/api/databases/files/' + file.id} download={file.name}>{file.name}</a><button type="button" aria-label={'Quitar ' + file.name} onClick={() => {
            setDraft(val.filter((_, n) => n !== i));
            commit().catch(() => {});
          }}>×</button></div>)}</> : col.type === 'place' ? <><label>Nombre<input autoFocus value={val.name || ''} onChange={e => setDraft({
            ...val,
            name: e.target.value
          })} /></label><label>Latitud<input type="number" min="-90" max="90" step="any" value={val.lat ?? ''} onChange={e => setDraft({
            ...val,
            lat: e.target.value === '' ? '' : Number(e.target.value)
          })} /></label><label>Longitud<input type="number" min="-180" max="180" step="any" value={val.lng ?? ''} onChange={e => setDraft({
            ...val,
            lng: e.target.value === '' ? '' : Number(e.target.value)
          })} /></label></> : col.type==='date'?<DatePropertyInput value={val} label={col.name} onChange={setDraft}/>: <input autoFocus aria-label={col.name} inputMode={col.type==='number'?'decimal':undefined} type={col.type === 'number' ? 'text' : col.type === 'date' ? 'date' : col.type === 'email' ? 'email' : col.type === 'url' ? 'url' : col.type === 'phone' ? 'tel' : 'text'} step={col.type === 'number' ? 'any' : undefined} value={typeof val === 'object' ? displayValue(val) : val} onChange={e => setDraft(e.target.value)} onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close();
        }
        if (e.key === 'Escape') {
          dirty.current = false;
          untrack();
          try {
            sessionStorage.removeItem('atlas-cell-draft:' + row.id + ':' + col.id);
          } catch {}
          setAnchor(null);
        }
      }} />}
      {error && <p className="adb-error" role="alert">{error} — el valor sigue disponible para corregirlo.</p>}
      <div className="adb-popover-footer"><button type="button" onClick={() => {
          dirty.current = false;
          untrack();
          try {
            sessionStorage.removeItem('atlas-cell-draft:' + row.id + ':' + col.id);
          } catch {}
          setAnchor(null);
        }}>Cancelar</button><button type="button" className="adb-primary" disabled={busy} onClick={close}>{busy ? 'Guardando…' : 'Listo'}</button></div>
    </Popover>}
  </>;
}
export function TypePicker({
  anchor,
  onClose,
  onChoose,
  label = 'Nueva propiedad',
  initialName = '',
  showName = true,
  onBack
}) {
  const [name, setName] = useState(initialName);
  const [search, setSearch] = useState('');
  return <Popover anchor={anchor} label={label} onClose={onClose} onBack={onBack} className="adb-type-picker">
    <div className="adb-popover-title">{label}</div>{showName?<input aria-label="Nombre de propiedad" autoFocus placeholder="Nombre de propiedad" value={name} onChange={e => setName(e.target.value)} />:<div className="adb-menu-section-label">{initialName}</div>}
    <input aria-label="Buscar tipo de propiedad" placeholder="Buscar tipo de propiedad…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="adb-type-list" aria-label="Tipos de propiedad">{PROPERTY_TYPES.filter(([id, text]) => (text + ' ' + id).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(([id, text]) => <MenuItem key={id} icon={id} label={text} onClick={() => onChoose({
        type: id,
        name: name.trim() || text
      })} />)}</div>
  </Popover>;
}
export function RecordProperties({
  entryId,
  meta
}) {
  const base = `/api/databases/${meta.parent_id}/${meta.database_id}`;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const container=useRef(null);
  const [preview,setPreview]=useState(null);
  const [tab,setTab]=useState('properties');
  const [typeAnchor,setTypeAnchor]=useState(null);
  const reload = () => api(base).then(setData).catch(e => setError(e.message));
  useEffect(() => {
    reload();
    const listener = e => {
      if (e.detail === base) reload();
    };
    window.addEventListener('atlas:database-changed', listener);
    const previewListener=e=>{if(e.detail.base===base)setPreview(e.detail.layout);};
    window.addEventListener('atlas:record-layout-preview',previewListener);
    return () => {window.removeEventListener('atlas:database-changed', listener);window.removeEventListener('atlas:record-layout-preview',previewListener);};
  }, [base]);
  const row = data?.rows.find(r => r.id === entryId);
  const layout=recordLayout(preview||data?.schema.page_layout,data?.schema.columns);
  useEffect(()=>{
    const root=container.current?.closest('#pagePeekOverlay,#entryView');
    if(row){
      applyRecordPresentation(root,{property_icons:layout.property_icons,...row.database_presentation});
      root.dataset.recordStructure=layout.structure;root.dataset.recordTab=tab;
    }
    return ()=>clearRecordPresentation(root);
  },[row?.database_presentation,entryId,JSON.stringify(layout),tab]);
  const renderProperty=col=><div key={col.id} className="adb-record-property"><span className="adb-record-label" title={col.name}><Icon type={col.type}/><span className="adb-record-label-name">{col.name}</span></span><Cell row={row} col={col} base={base} readonly={!!row.database_locked||!!preview} placeholder onRow={updated=>setData(d=>({...d,rows:d.rows.map(r=>r.id===updated.id?updated:r)}))}/></div>;
  const ordered=layout.order.map(id=>data?.schema.columns.find(c=>c.id===id)).filter(Boolean);
  return <div ref={container} className="adb-record-properties" contentEditable={false}>
    {error && <p className="adb-error" role="alert">{error}</p>}
    {preview&&<div className="adb-layout-preview-notice">Vista previa del diseño · sin guardar</div>}
    {layout.structure==='tabbed'&&<div className="adb-record-tabs" role="tablist" aria-label="Secciones del registro">{[['properties','Propiedades'],['content','Contenido']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>}
    {row&&<div className="adb-record-property-groups"><section className="adb-record-main-properties">{ordered.filter(c=>!layout.hidden.includes(c.id)&&!layout.panel.includes(c.id)).map(renderProperty)}</section>{layout.panel.length>0&&<aside aria-label="Panel de propiedades" className="adb-record-panel"><span className="adb-record-panel-title">Propiedades</span>{ordered.filter(c=>layout.panel.includes(c.id)&&!layout.hidden.includes(c.id)).map(renderProperty)}</aside>}</div>}
    {row&&!row.database_locked&&!preview&&<button type="button" className="adb-record-add-property" onClick={e=>setTypeAnchor(e.currentTarget)}><Icon type="plus"/>Añadir una propiedad</button>}
    {typeAnchor&&<TypePicker anchor={typeAnchor} onClose={()=>setTypeAnchor(null)} onChoose={async column=>{try{await flushDatabaseEditors();await mutateRecordSource(meta,{operation:'add',column});setTypeAnchor(null);await reload();}catch(e){setError(e.message);}}}/>}
    {row?.database_unmapped_properties?.length>0&&<details className="adb-unmapped-properties"><summary>Propiedades conservadas del traslado ({row.database_unmapped_properties.length})</summary>{row.database_unmapped_properties.map((p,i)=><div key={i}><strong>{p.name}</strong><span>{displayValue(p.value,p.type)}</span></div>)}</details>}
    <div className="adb-record-divider" />
    <RecordOutline container={container} entryId={entryId}/>
  </div>;
}
function RecordOutline({container,entryId}){
  const [headings,setHeadings]=useState([]);
  useEffect(()=>{
    const root=container.current?.closest('#pagePeekOverlay,#entryView');
    const editor=root?.querySelector('#pagePeekEditor,#entryBody');if(!editor)return;
    let frame;
    const read=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setHeadings([...editor.querySelectorAll('.bn-block-content[data-content-type="heading"]')].map(node=>({id:node.closest('[data-id]')?.dataset.id,text:node.textContent,level:node.dataset.level||1})).filter(h=>h.id)));};
    read();const observer=new MutationObserver(read);observer.observe(editor,{childList:true,subtree:true,characterData:true});
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[entryId]);
  return <nav className="adb-record-outline" aria-label="Índice del contenido"><strong>Contenido</strong>{headings.length?headings.map(h=><button key={h.id} style={{paddingLeft:(Number(h.level)-1)*10+6}} onClick={()=>{
    const root=container.current?.closest('#pagePeekOverlay,#entryView');const node=[...root.querySelectorAll('[data-id]')].find(n=>n.dataset.id===h.id);node?.scrollIntoView({block:'start',behavior:'smooth'});
  }}>{h.text||'Sin título'}</button>):<span>Añade encabezados para crear el índice.</span>}</nav>;
}
const propertyRoots = new WeakMap();
export function mountRecordProperties(container, entryId, meta) {
  let root = propertyRoots.get(container);
  if (!root) {
    root = createRoot(container);
    propertyRoots.set(container, root);
  }
  root.render(<RecordProperties entryId={entryId} meta={meta} />);
}
export function unmountRecordProperties(container) {
  const root = propertyRoots.get(container);
  if (root) {
    root.unmount();
    propertyRoots.delete(container);
  }
}
