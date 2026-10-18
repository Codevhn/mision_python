import React,{useEffect,useState,useRef} from 'react';
import {menuKeyDown,focusMenuItem} from './databaseMenuNavigation.js';
import {DatabaseIcon as Icon} from './databaseIcons.jsx';
import {IconButton,MenuItem} from './databaseUI.jsx';
import {SelectField,ToggleField} from './databaseControls.jsx';
import {VIEW_TYPES,columnsForView,moveViewColumn} from './databaseModel.js';
import {CardPreviewSettings,ListLayoutSettings} from './databaseCardSettings.jsx';

export function ViewConfig({view,schema,isNew,busy,onChange,onSave,onClose,onRules}){
  const panel=useRef(null);
  useEffect(()=>{
    const element=panel.current;
    const trigger=element?.closest('.adb-workspace')?.querySelector('.adb-toolbar-actions [aria-label="Configuración de vista"]')||document.activeElement;
    element?.querySelector('button')?.focus({preventScroll:true});
    return ()=>{if(element?.contains(document.activeElement)||document.activeElement===document.body)requestAnimationFrame(()=>{if(trigger?.isConnected)trigger.focus({preventScroll:true});});};
  },[]);
  const [section,setSection]=useState(isNew?'layout':''),[name,setName]=useState(view.name),[error,setError]=useState('');
  useEffect(()=>setName(view.name),[view.name]);
  const change=async(key,value)=>{try{setError('');await onChange({[key]:value});}catch(e){setError(e.message);}};
  const select=(label,key,choices,empty)=><SelectField label={label} value={view[key]??(key==='cardSize'?'medium':undefined)} onChange={value=>change(key,value)} choices={choices} empty={empty}/>;
  const toggle=(label,key,fallback=false)=><ToggleField label={label} checked={view[key]??fallback} onChange={value=>change(key,value)}/>;
  const dates=schema.columns.filter(c=>['date','created_time','edited_time'].includes(c.type)).map(c=>[c.id,c.name]);
  const sections=[['layout',view.type,'Diseño'],['properties','settings','Propiedades visibles'],['open','open','Abrir páginas en'],['group','group','Agrupar']].filter(([id])=>id!=='group'||['table','board','chart'].includes(view.type)).filter(([id])=>!(['open','properties'].includes(id)&&['form','dashboard'].includes(view.type)));
  const openSection=(id,event)=>{setSection(id);requestAnimationFrame(()=>panel.current?.querySelector('.adb-config-back')?.focus({preventScroll:true}));};
  const back=()=>{const label=names[section];setSection('');requestAnimationFrame(()=>focusMenuItem(panel.current,label));};
  const names=Object.fromEntries(sections.map(([id,,label])=>[id,label]));
  return <aside ref={panel} className="adb-view-config" aria-label="Configuración de vista" role="dialog" onKeyDown={e=>{e.stopPropagation();menuKeyDown(e,{onBack:section?back:undefined,onClose});}}>
    <div className="adb-config-heading"><strong>{isNew?'Nueva vista':'Configuración de vista'}</strong><IconButton icon="close" label="Cerrar configuración" onClick={onClose}/></div>
    <label className="adb-field"><span>Nombre</span><input aria-label="Nombre de vista" value={name} onChange={e=>{setName(e.target.value);if(isNew)change('name',e.target.value);}} onBlur={()=>{if(!isNew&&name.trim()&&name!==view.name)change('name',name.trim());}} onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}/></label>
    <div className="adb-config-type"><Icon type={view.type}/>{VIEW_TYPES.find(([id])=>id===view.type)?.[1]}</div>
    {section?<>
      <button type="button" className="adb-config-back" aria-label="Volver a configuración de vista" onClick={back}>‹ <span>{names[section]}</span></button>
      {section==='open'&&select('Abrir páginas en','openMode',[['side','Side Peek'],['center','Center Peek'],['page','Página completa']])}
      {section==='group'&&select('Agrupar por','groupBy',schema.columns.filter(c=>!['files','button','place'].includes(c.type)).map(c=>[c.id,c.name]),'Sin agrupación')}
      {section==='properties'&&<><p className="adb-help">Sólo afecta a esta vista. El diseño de las páginas se configura desde el menú de un registro.</p>{columnsForView(schema,view,true).map((col,i,columns)=><div className="adb-view-property-order" key={col.id}><ToggleField label={col.name} checked={!(view.hidden||[]).includes(col.id)} onChange={checked=>change('hidden',checked?(view.hidden||[]).filter(id=>id!==col.id):[...(view.hidden||[]),col.id])}/><IconButton icon="up" label={'Subir propiedad '+col.name} disabled={i===0} onClick={()=>change('columnOrder',moveViewColumn(schema,view,col.id,columns[i-1]?.id))}/><IconButton icon="down" label={'Bajar propiedad '+col.name} disabled={i===columns.length-1} onClick={()=>change('columnOrder',moveViewColumn(schema,view,col.id,columns[i+1]?.id,true))}/></div>)}</>}
      {section==='layout'&&<>
        {['table','board','gallery','list'].includes(view.type)&&toggle('Ajustar el contenido','wrap')}
        {['board','gallery','list','feed'].includes(view.type)&&toggle('Mostrar icono de página','showIcon',true)}
        {view.type==='table'&&select('Altura de fila','rowHeight',[['small','Pequeña'],['medium','Mediana'],['large','Grande']])}
        {view.type==='board'&&<>{toggle('Colorear columnas','colorColumns')}{select('Distribución','boardLayout',[['compact','Compacta'],['list','En lista']])}</>}
        {['board','gallery'].includes(view.type)&&<>{select('Previsualización de tarjeta','cardPreview',[['none','Ninguna'],['content','Contenido de la página'],['cover','Portada / archivo multimedia']])}{select('Tamaño de tarjeta','cardSize',[['small','Pequeña'],['medium','Mediana'],['large','Grande']])}</>}
        {['board','gallery'].includes(view.type)&&view.cardPreview==='cover'&&<CardPreviewSettings view={view} columns={schema.columns} onChange={patch=>Object.entries(patch).forEach(([key,value])=>change(key,value))}/>}
        {view.type==='list'&&<ListLayoutSettings view={view} onChange={patch=>Object.entries(patch).forEach(([key,value])=>change(key,value))}/>}
        {['calendar','timeline'].includes(view.type)&&select(view.type==='timeline'?'Inicio':'Fecha','dateProperty',dates,'Seleccionar fecha')}
        {view.type==='calendar'&&select('Mostrar calendario','calendarLayout',[['month','Mes'],['week','Semana']])}
        {view.type==='timeline'&&select('Fin (opcional)','endDateProperty',dates,'Un día')}
        {view.type==='chart'&&<>{select('Cálculo','chartAggregation',[['count','Contar registros'],['sum','Suma'],['average','Promedio']])}{select('Propiedad numérica','chartProperty',schema.columns.filter(c=>['number','formula','rollup'].includes(c.type)).map(c=>[c.id,c.name]),'Seleccionar…')}</>}
        {view.type==='map'&&<>{select('Coordenadas','placeProperty',schema.columns.filter(c=>c.type==='place').map(c=>[c.id,c.name]),'Seleccionar lugar')}<p className="adb-help">Mapa local de coordenadas. Sin proveedor de calles ni geocodificación.</p></>}
        {view.type==='feed'&&select('Cronología','feedOrder',[['edited','Última edición'],['created','Creación']])}
        {view.type==='form'&&<><label className="adb-field">Descripción<textarea value={view.description||''} onChange={e=>change('description',e.target.value)}/></label><p className="adb-help">Formulario interno. No publica enlaces externos.</p></>}
        {view.type==='dashboard'&&<p className="adb-help">Activa Editar diseño en el Dashboard para añadir vistas como widgets, organizar su distribución y configurar filtros globales.</p>}
        {view.type==='list'&&<p className="adb-help">Configura sus propiedades visibles desde el menú anterior.</p>}
      </>}
    </>:<nav className="adb-config-navigation" aria-label="Ajustes de esta vista">
      {sections.filter(([id])=>['layout','properties'].includes(id)).map(([id,icon,label])=><MenuItem key={id} icon={icon} label={label} submenu onClick={e=>openSection(id,e)}/>)}
      {!['dashboard','form'].includes(view.type)&&<><div className="adb-menu-separator"/><MenuItem icon="filter" label="Filtrar" submenu onClick={e=>onRules?.('filter',e.currentTarget)}/><MenuItem icon="sort" label="Ordenar" submenu onClick={e=>onRules?.('sort',e.currentTarget)}/></>}
      {sections.filter(([id])=>['group','open'].includes(id)).sort(([a],[b])=>a==='group'?-1:1).map(([id,icon,label])=><MenuItem key={id} icon={icon} label={label} submenu onClick={e=>openSection(id,e)}/>)}
    </nav>}
    {error&&<p role="alert" className="adb-error">{error}</p>}
    {isNew&&<div className="adb-config-footer"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="adb-primary" disabled={busy||!name.trim()} onClick={onSave}>{busy?'Guardando…':'Crear vista'}</button></div>}
  </aside>;
}
