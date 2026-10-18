import {dateStart,dateEnd} from './databasePropertyValues.js';
import React, { useState, useEffect } from 'react';
import {DatePropertyInput} from './DatePropertyInput.jsx';
import {DatabaseDashboard} from './DatabaseDashboard.jsx';
import { DatabaseIcon as Icon } from './databaseIcons.jsx';
import { Cell, CellValue, MenuItem, IconButton, notifyDatabase, flushDatabaseEditors } from './databaseUI.jsx';
import { api, columnsForView, emptyGroupLabel, valueOf, optionsFor, groupRows, aggregate, displayValue, COMPUTED } from './databaseModel.js';
import {boardGroups,boardInitialValues,moveBoardRow} from './boardModel.js';
import {cardCover,listRowHeight} from './databaseCardModel.js';
function RecordCard({
  row,
  view,
  columns,
  base,
  onRow,
  openRow,
  draggable,
  onDragStart,
  onDragOver,
  onDrop
}) {
  const [content, setContent] = useState('');
  useEffect(() => {
    let active = true;
    if (view.cardPreview === 'content' || view.type === 'feed') api('/api/entry/' + row.id).then(data => {
      if (active) setContent(data.markdown || '');
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [row.id, row.updated_at, view.cardPreview, view.type]);
  const cover=cardCover(row,view);
  return <article className={'adb-record-card ' + (view.cardSize || 'medium') + (view.wrap ? ' wrap' : ' nowrap')} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}>
    {view.cardPreview === 'cover' && cover && <button type="button" className="adb-card-cover" aria-label={'Abrir '+row.title+' desde imagen'} onClick={() => openRow(row)}><img alt={cover.alt} style={{objectFit:view.cardImageFit==='contain'?'contain':'cover'}} src={cover.url.startsWith('/api/databases/files/') ? cover.url + '?preview=1' : cover.url} /></button>}
    {view.type!=='feed' && view.cardPreview === 'content' && content && <button type="button" className="adb-card-preview" onClick={() => openRow(row)}>{content.replace(/^#+\s*/gm, '').slice(0, 300)}</button>}
    <button type="button" className="adb-card-title" onClick={() => openRow(row)}>{view.showIcon !== false && <span>{row.icon || <Icon type="page" />}</span>}<span className="adb-card-name">{row.title}</span></button>
    {view.type === 'feed' && <><time>{new Date(view.feedOrder === 'created' ? row.created_at : row.updated_at || row.created_at).toLocaleString('es')}</time><p className="adb-feed-content">{content.replace(/^#+\s*/gm, '').slice(0, 650)}</p></>}
    <div className="adb-card-properties">{columns.map(col => <div key={col.id} className="adb-card-property"><span title={col.name}><Icon type={col.type} /></span><Cell {...{
          row,
          col,
          base,
          onRow
        }} /></div>)}</div>
  </article>;
}
function Board({rows,view,schema,base,onRow,openRow,addRow,updateView}) {
  const [error,setError]=useState('');
  const col=schema.columns.find(c=>c.id===view.groupBy)||schema.columns.find(c=>['status','select'].includes(c.type));
  const groups=boardGroups(rows,col,view);
  const columns=columnsForView(schema,view).filter(c=>c.id!==col?.id);
  const canDrop=col&&['status','select','multi_select','text','person','checkbox','number'].includes(col.type);
  const canOrder=!!updateView&&!view.sorts?.length;
  const change=async patch=>{setError('');await flushDatabaseEditors();await updateView(patch);};
  const reorder=async(group,id,target,after=false)=>{
    try{await change({groupRowOrder:moveBoardRow(view,group,id,target,after)});}catch(e){setError(e.message);}
  };
  const drop=async(event,group,target)=>{
    event.preventDefault();event.stopPropagation();setError('');
    const rect=target?event.currentTarget.getBoundingClientRect():null;
    const after=rect?event.clientY>rect.top+rect.height/2:false;
    try{
      const data=JSON.parse(event.dataTransfer.getData('application/atlas-record')||'null');
      if(!data||data.base!==base||data.columnId!==(col?.id||null))return;
      const row=rows.find(r=>r.id===data.id);if(!row)return;
      await flushDatabaseEditors();
      if(data.groupKey===group.key){
        if(canOrder&&target&&target.id!==row.id)await change({groupRowOrder:moveBoardRow(view,group,row.id,target.id,after)});
        return;
      }
      if(!canDrop)return;
      const result=await api(base+'/rows/'+row.id,{group_move:{column_id:col.id,from:data.value,to:group.value}});
      onRow(result.row);notifyDatabase(base);
    }catch(e){setError(e.message);}
  };
  const create=group=>addRow(canDrop?boardInitialValues(col,group.value):{},'Sin título').catch(e=>setError(e.message));
  return <>{error&&<p className="adb-error" role="alert">{error}</p>}
    {col&&!canDrop&&<p className="adb-help">Esta agrupación es de sólo lectura. Para mover tarjetas, elige una propiedad editable.</p>}
    {!col&&<p className="adb-help">Selecciona una propiedad para agrupar en Configuración de vista.</p>}
    {view.sorts?.length>0&&<p className="adb-help">La ordenación de esta vista tiene prioridad sobre el orden manual de tarjetas.</p>}
    <div className={'adb-board '+(view.boardLayout==='list'?'list':'')} style={{'--card-width':view.cardSize==='small'?'220px':view.cardSize==='large'?'340px':'280px'}}>
    {groups.map(group=>{
      const {label:name,items,key}=group;
      const collapsed=(view.collapsedGroups||[]).includes(key);
      const option=optionsFor(col||{}).find(o=>o.label===group.value);
      return <section key={key} aria-label={'Grupo '+name} className={'adb-board-column'+(view.colorColumns?' colored':'')} style={{'--column-color':option?.color||'#888888'}} onDragOver={e=>{if(canDrop||canOrder)e.preventDefault();}} onDrop={e=>drop(e,group)}>
        <div className="adb-board-heading">{updateView&&<button type="button" className="adb-board-collapse" aria-label={(collapsed?'Expandir':'Colapsar')+' grupo '+name} aria-expanded={!collapsed} onClick={()=>change({collapsedGroups:collapsed?(view.collapsedGroups||[]).filter(k=>k!==key):[...(view.collapsedGroups||[]),key]}).catch(e=>setError(e.message))}>{collapsed?'›':'⌄'}</button>}
          <span className="adb-tag" style={{'--tag-color':option?.color||'#888888'}}>{name}</span><span>{items.length}</span><IconButton icon="plus" label={'Nueva página en '+name} onClick={()=>create(group)}/>
        </div>
        {!collapsed&&<>{items.map((row,index)=><div key={row.id} className="adb-board-card-slot"><RecordCard {...{row,view,base,onRow,openRow,columns}} draggable={!row.database_locked&&!!(canDrop||canOrder)} onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData('application/atlas-record',JSON.stringify({id:row.id,base,columnId:col?.id||null,groupKey:key,value:group.value}));}} onDragOver={e=>{if(canDrop||canOrder)e.preventDefault();}} onDrop={e=>drop(e,group,row)}/>
          {canOrder&&items.length>1&&<div className="adb-board-card-order"><IconButton icon="up" label={'Mover '+row.title+' antes en '+name} disabled={index===0} onClick={()=>reorder(group,row.id,items[index-1]?.id)}/><IconButton icon="down" label={'Mover '+row.title+' después en '+name} disabled={index===items.length-1} onClick={()=>reorder(group,row.id,items[index+1]?.id,true)}/></div>}
        </div>)}<button type="button" className="adb-board-new" onClick={()=>create(group)}>＋ Nueva página</button></>}
      </section>;
    })}</div></>;
}
const isoDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
function Calendar({
  rows,
  view,
  schema,
  openRow,
  addRow,base,onRow
}) {
  const [today, setToday] = useState(() => new Date());
  const [error,setError]=useState('');
  const year = today.getFullYear(),
    month = today.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const dateCol = schema.columns.find(c => c.id === view.dateProperty);
  const weekly=view.calendarLayout==='week';
  const firstCell = weekly?new Date(year,month,today.getDate()-((today.getDay()+6)%7)):new Date(year, month, 1 - offset);
  const cells = Array.from({
    length: weekly?7:42
  }, (_, n) => {
    const day = new Date(firstCell);
    day.setDate(day.getDate() + n);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return {
      day,
      iso
    };
  });
  const draggable=dateCol?.type==='date';
  const drag=(event,row)=>{event.stopPropagation();event.dataTransfer.setData('application/atlas-date-record',JSON.stringify({base,id:row.id,columnId:dateCol.id,day:isoDay(dateStart(valueOf(row,dateCol)))}));};
  const drop=async(event,day)=>{
    event.preventDefault();event.stopPropagation();setError('');
    try{
      const item=JSON.parse(event.dataTransfer.getData('application/atlas-date-record')||'null');
      if(!draggable||!item||item.base!==base||item.columnId!==dateCol.id||!rows.some(r=>r.id===item.id))return;
      await flushDatabaseEditors();
      const result=await api(base+'/rows/'+item.id,{date_move:{column_id:dateCol.id,from:item.day,to:day}});
      onRow(result.row);notifyDatabase(base);
    }catch(e){setError(e.message);}
  };
  if (!dateCol) return <div className="adb-empty">Selecciona una propiedad de fecha en la configuración de esta vista.</div>;
  return <div className="adb-calendar">{error&&<p role="alert" className="adb-error">{error}</p>}<div className="adb-date-navigation"><strong>{today.toLocaleDateString('es', {
          month: 'long',
          year: 'numeric'
        })}</strong><button type="button" aria-label={weekly?'Semana anterior':'Mes anterior'} onClick={() => setToday(weekly?new Date(year,month,today.getDate()-7):new Date(year, month - 1, 1))}>‹</button><button type="button" onClick={() => setToday(new Date())}>Hoy</button><button type="button" aria-label={weekly?'Semana siguiente':'Mes siguiente'} onClick={() => setToday(weekly?new Date(year,month,today.getDate()+7):new Date(year, month + 1, 1))}>›</button></div><div className="adb-calendar-grid">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div className="adb-weekday" key={d}>{d}</div>)}{cells.map(({
        day,
        iso
      }) => <div key={iso} role="group" aria-label={'Día '+iso} onDragOver={e=>{if(draggable)e.preventDefault();}} onDrop={e=>drop(e,iso)} className={'adb-calendar-day' + (day.getMonth() !== month ? ' muted' : '')}><div className="adb-day-heading"><time>{day.getDate()}</time>{dateCol.type === 'date' && <button type="button" aria-label={'Crear registro el ' + iso} onClick={() => addRow({
            [dateCol.id]: iso
          }).catch(e=>setError(e.message))}>＋</button>}</div>{rows.filter(r => {const raw=valueOf(r,dateCol),start=isoDay(dateStart(raw)),end=isoDay(dateEnd(raw));return start&&start<=iso&&iso<=(end||start);}).map(row => <button key={row.id} type="button" className="adb-calendar-record" draggable={draggable&&!row.database_locked} onDragStart={e=>drag(e,row)} onClick={() => openRow(row)}>{row.title}</button>)}</div>)}</div><div className="adb-unscheduled"><span>Sin fecha</span>{rows.filter(r => !isoDay(dateStart(valueOf(r, dateCol)))).map(row => <button type="button" key={row.id} draggable={draggable&&!row.database_locked} onDragStart={e=>drag(e,row)} onClick={() => openRow(row)}>{row.title}</button>)}</div></div>;
}
function Timeline({
  rows,
  view,
  schema,
  openRow
}) {
  const startCol = schema.columns.find(c => c.id === view.dateProperty);
  const endCol = schema.columns.find(c => c.id === view.endDateProperty);
  if (!startCol) return <div className="adb-empty">Selecciona la propiedad de inicio en la configuración de Timeline.</div>;
  const dated = rows.map(row => ({
    row,
    start: isoDay(dateStart(valueOf(row, startCol))),
    end: endCol ? isoDay(dateEnd(valueOf(row, endCol))) : isoDay(dateEnd(valueOf(row,startCol)))
  })).filter(item => item.start);
  if (!dated.length) return <div className="adb-empty">Los registros sin fecha siguen en esta base. Añade una fecha para situarlos en Timeline.</div>;
  const dayMs = 86400000;
  const number = iso => Date.parse(iso + 'T00:00:00Z') / dayMs;
  const origin = Math.min(...dated.map(d => number(d.start)));
  const end = Math.max(...dated.map(d => number(d.end || d.start)));
  const range = Math.max(14, Math.min(730, end - origin + 3));
  const dayWidth = Math.max(20, Math.min(60, 900 / range));
  return <div className="adb-timeline-scroll"><div className="adb-timeline" style={{
      width: 230 + range * dayWidth
    }}><div className="adb-timeline-dates" style={{
        marginLeft: 230,
        gridTemplateColumns: `repeat(${range},${dayWidth}px)`
      }}>{Array.from({
          length: range
        }, (_, i) => <time key={i}>{new Date((origin + i) * dayMs).toLocaleDateString('es', {
            day: 'numeric',
            month: range > 60 ? undefined : 'short',
            timeZone: 'UTC'
          })}</time>)}</div>{dated.map(({
        row,
        start,
        end
      }) => <div className="adb-timeline-row" key={row.id}><button className="adb-timeline-name" type="button" onClick={() => openRow(row)}>{row.title}</button><button type="button" className="adb-timeline-bar" style={{
          left: 230 + (number(start) - origin) * dayWidth,
          width: Math.max(1, number(end || start) - number(start) + 1) * dayWidth
        }} title={start + ' — ' + (end || start)} onClick={() => openRow(row)}>{row.title}</button></div>)}</div><div className="adb-unscheduled"><span>Sin fecha</span>{rows.filter(row => !isoDay(dateStart(valueOf(row, startCol)))).map(row => <button type="button" key={row.id} onClick={() => openRow(row)}>{row.title}</button>)}</div></div>;
}
function Chart({
  rows,
  view,
  schema,
  openRow
}) {
  const [chosen, setChosen] = useState(null);
  const col = schema.columns.find(c => c.id === view.groupBy);
  const measure = view.chartProperty;
  const method = view.chartAggregation || 'count';
  const groups = groupRows(rows, col);
  const values = groups.map(([name, items]) => ({
    name,
    items,
    value: aggregate(items, measure, method)
  }));
  const max = Math.max(1, ...values.map(v => typeof v.value === 'number' ? Math.abs(v.value) : 0));
  return <div className="adb-chart"><div className="adb-chart-heading">{method === 'count' ? 'Registros' : schema.columns.find(c => c.id === measure)?.name || 'Selecciona una propiedad numérica'} {col ? 'por ' + col.name : ''}</div>{values.map(({
      name,
      items,
      value
    }) => <button type="button" key={name} className="adb-chart-row" onClick={() => setChosen(chosen === name ? null : name)}><span>{name}</span><span className="adb-chart-track"><i style={{
          width: `${typeof value === 'number' ? Math.abs(value) / max * 100 : 0}%`,
          background: optionsFor(col || {}).find(o => o.label === name)?.color || '#529cca'
        }} /></span><strong>{typeof value === 'number' ? Math.round(value * 100) / 100 : value}</strong></button>)}{chosen !== null && <div className="adb-chart-records">{values.find(v => v.name === chosen)?.items.map(row => <button type="button" key={row.id} onClick={() => openRow(row)}><Icon type="page" />{row.title}</button>)}</div>}</div>;
}
function MapView({
  rows,
  view,
  schema,
  openRow
}) {
  const col = schema.columns.find(c => c.id === view.placeProperty);
  const [active, setActive] = useState(null);
  if (!col) return <div className="adb-empty">Selecciona una propiedad Lugar con coordenadas para representar los registros.</div>;
  const places = rows.map(row => ({
    row,
    place: valueOf(row, col)
  })).filter(item => item.place && typeof item.place.lat === 'number' && typeof item.place.lng === 'number');
  return <div className="adb-map"><div className="adb-map-caption">Coordenadas geográficas · mapa local sin calles</div><svg viewBox="0 0 900 450" role="img" aria-label="Registros por latitud y longitud"><rect width="900" height="450" fill="var(--adb-hover)" />{Array.from({
        length: 13
      }, (_, i) => <g key={'x' + i}><path d={`M${i * 75} 0V450`} stroke="var(--adb-border)" /><text x={i * 75 + 3} y="440">{i * 30 - 180}°</text></g>)}{Array.from({
        length: 7
      }, (_, i) => <g key={'y' + i}><path d={`M0 ${i * 75}H900`} stroke="var(--adb-border)" /><text x="4" y={i * 75 + 12}>{90 - i * 30}°</text></g>)}{places.map(({
        row,
        place
      }) => <g key={row.id} role="button" tabIndex="0" aria-label={row.title + ' · ' + place.name} onClick={() => setActive(row.id)} onKeyDown={e => {
        if (e.key === 'Enter') openRow(row);
      }} className="adb-map-marker"><title>{row.title + ' · ' + place.name}</title><circle cx={(place.lng + 180) * 2.5} cy={(90 - place.lat) * 2.5} r={active === row.id ? 8 : 5} /></g>)}</svg>{active && <div className="adb-map-record"><button type="button" onClick={() => openRow(rows.find(r => r.id === active))}>{rows.find(r => r.id === active)?.title} ↗</button></div>}{!places.length && <p className="adb-help">No hay registros con coordenadas. Añádelas desde la propiedad Lugar.</p>}<div className="adb-unscheduled"><span>Sin coordenadas</span>{rows.filter(row => !places.some(item => item.row.id === row.id)).map(row => <button type="button" key={row.id} onClick={() => openRow(row)}>{row.title}</button>)}</div></div>;
}
export function FormField({
  col,
  value,
  onChange
}) {
  const [related, setRelated] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (col.type === 'relation' && col.target_database) api(`/api/databases/${col.target_parent}/${col.target_database}`).then(data => setRelated(data.rows)).catch(e => setError(e.message));
  }, [col.target_database, col.target_parent]);
  const multi = ['multi_select', 'person', 'relation'].includes(col.type);
  if (['select', 'status', 'multi_select', 'person', 'relation'].includes(col.type)) {
    const choices = col.type === 'person' ? [{
      label: 'Propietario',
      value: 'owner'
    }] : col.type === 'relation' ? related.map(r => ({
      label: r.title,
      value: r.id
    })) : optionsFor(col).map(o => ({
      ...o,
      value: o.label
    }));
    return <><select aria-label={col.name} multiple={multi} value={multi ? Array.isArray(value) ? value : [] : value ?? ''} onChange={e => onChange(multi ? [...e.target.selectedOptions].map(o => o.value) : e.target.value)}>{!multi && <option value="">Seleccionar…</option>}{choices.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{error && <span className="adb-error">{error}</span>}</>;
  }
  if (col.type === 'checkbox') return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />;
  if (col.type === 'place') return <div className="adb-form-place">{['name', 'lat', 'lng'].map(key => <input key={key} aria-label={key} placeholder={key === 'name' ? 'Nombre' : key === 'lat' ? 'Latitud' : 'Longitud'} type={key === 'name' ? 'text' : 'number'} step="any" value={value?.[key] ?? ''} onChange={e => onChange({
      ...value,
      [key]: key === 'name' ? e.target.value : Number(e.target.value)
    })} />)}</div>;
  if (col.type === 'files') return <><input type="file" onChange={async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/databases/files', {
          method: 'POST',
          body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        onChange([...(value || []), data]);
      } catch (e) {
        setError(e.message);
      }
    }} />{(value || []).map(f => <span className="adb-tag" key={f.id}>{f.name}</span>)}{error && <span className="adb-error">{error}</span>}</>;
  if(col.type==='date')return <DatePropertyInput value={value||''} onChange={onChange} label={col.name}/>;
  return <input aria-label={col.name} type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : col.type === 'email' ? 'email' : col.type === 'url' ? 'url' : col.type === 'phone' ? 'tel' : 'text'} step="any" value={value ?? ''} onChange={e => onChange(col.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />;
}
function FormView({
  schema,
  view,
  addRow
}) {
  const [title, setTitle] = useState('');
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const columns = columnsForView(schema,view).filter(c=>!COMPUTED.has(c.type)&&c.type!=='button');
  return <form className="adb-form" onSubmit={async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const row = await addRow(values, title, false);
      setSaved(row);
      setValues({});
      setTitle('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }}><h3>{view.name}</h3>{view.description && <p>{view.description}</p>}<label>Nombre<input required value={title} onChange={e => setTitle(e.target.value)} /></label>{columns.map(col => <label key={col.id}><span><Icon type={col.type} />{col.name}</span><FormField col={col} value={values[col.id]} onChange={value => setValues(v => ({
        ...v,
        [col.id]: value
      }))} /></label>)}{error && <p className="adb-error" role="alert">{error}</p>}{saved && <p className="adb-form-success" role="status">Registro creado: {saved.title}</p>}<button className="adb-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Enviar'}</button></form>;
}
export function DatabaseAlternateView(props) {
  const {
    view,
    rows,
    schema,
    base,
    onRow,
    openRow
  } = props;
  const columns = columnsForView(schema,view);
  switch (view.type) {
    case 'board':
      return <Board {...props} />;
    case 'gallery':
      return <div className={'adb-gallery ' + (view.cardSize || 'medium')}>{rows.map(row => <RecordCard key={row.id} {...{
          row,
          view,
          columns,
          base,
          onRow,
          openRow
        }} />)}</div>;
    case 'list':
      return <div className={'adb-list' + (view.wrap ? ' wrap' : '')+(view.listPropertyLayout==='below'?' properties-below':'')} style={{'--list-row-height':listRowHeight(view)+'px','--list-title-padding':view.listDensity==='compact'?'2px':view.listDensity==='comfortable'?'10px':'6px'}}>{rows.map(row => <div className="adb-list-row" key={row.id}><button type="button" className="adb-list-title" onClick={() => openRow(row)}>{view.showIcon !== false && <Icon type="page" />}{row.title}</button>{columns.map(col => <div key={col.id} className="adb-list-property" title={col.name}><Cell {...{
              row,
              col,
              base,
              onRow
            }} /></div>)}</div>)}</div>;
    case 'calendar':
      return <Calendar {...props} />;
    case 'timeline':
      return <Timeline {...props} />;
    case 'chart':
      return <Chart {...props} />;
    case 'dashboard':
      return <DatabaseDashboard key={view.id || "dashboard"} {...props} renderView={widgetProps=><DatabaseAlternateView {...widgetProps}/>} />;
    case 'feed':
      return <div className="adb-feed">{[...rows].sort((a, b) => view.sorts?.length?0:String(view.feedOrder === 'created' ? b.created_at : b.updated_at || b.created_at).localeCompare(String(view.feedOrder === 'created' ? a.created_at : a.updated_at || a.created_at))).map(row => <RecordCard key={row.id} {...{
          row,
          view,
          columns,
          base,
          onRow,
          openRow
        }} />)}</div>;
    case 'map':
      return <MapView {...props} />;
    case 'form':
      return <FormView {...props} />;
    default:
      return <div className="adb-empty">Tipo de vista no reconocido. Los registros se conservan.</div>;
  }
}
