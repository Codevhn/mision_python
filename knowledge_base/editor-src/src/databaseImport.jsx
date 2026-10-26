import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DatabaseDialog,SelectField} from './databaseControls.jsx';
import {flushDatabaseEditors,notifyDatabase} from './databaseUI.jsx';
import {api} from './databaseModel.js';
import './database-import.css';
const types=[['text','Texto'],['number','Número'],['select','Selección'],['multi_select','Selección múltiple'],['status','Estado'],['date','Fecha'],['checkbox','Casilla'],['url','URL'],['email','Correo'],['phone','Teléfono']];
const labelStatus={ready:'Listo',created:'Creado',duplicate_existing:'Ya existe · conservado',duplicate_in_file:'Repetido en archivo',duplicate_in_trash:'En papelera · conservado',invalid:'Error'};
export function ImportReport({report}){
  return <section aria-label="Informe de importación"><p>{Object.entries(report.counts).filter(([,n])=>n).map(([k,n])=>`${labelStatus[k]}: ${n}`).join(' · ')}</p>
    <div className="adb-import-scroll"><table><thead><tr><th>Fila</th><th>ID de Drive</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.row}><td>{row.row}</td><td>{row.drive_id||'—'}</td><td>{labelStatus[row.status]}</td><td>{row.error||row.record_id||(row.first_row?`Primera fila: ${row.first_row}`:'')}</td></tr>)}</tbody></table></div>
  </section>;
}
export function DatabaseImportDialog({base,schema,anchor,onClose}){
  const [upload,setUpload]=useState(null),[collection,setCollection]=useState(null),[sample,setSample]=useState(null);
  const [mapping,setMapping]=useState([]),[title,setTitle]=useState(''),[identity,setIdentity]=useState('');
  const [name,setName]=useState('Base importada'),[mode,setMode]=useState(base?'existing':'new');
  const [validated,setValidated]=useState(null),[report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [delimiter,setDelimiter]=useState('');
  const target=mode==='existing'&&base?{parent:base.split('/')[3],database_id:base.split('/')[4]}:null;
  const config={token:upload?.token,collection,title_field:title,identity_field:identity,name,target,columns:mapping.filter(m=>m.include).map(({include,...m})=>m)};
  const configKey=JSON.stringify(config);
  useEffect(()=>{setValidated(null);},[configKey]);
  const run=async action=>{setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const chooseCollection=async path=>{
    setCollection(path);setSample(null);setMapping([]);setTitle('');setIdentity('');
    const result=await api('/api/databases/import/inspect',{token:upload.token,collection:path},'POST');setSample(result);
    const suggested=result.profile?.columns;
    setMapping(result.fields.map(f=>{const preset=suggested?.find(m=>m.field===f.path);const col=schema?.columns.find(c=>c.name===(preset?.name||f.name));return {field:f.path,name:preset?.name||f.name,type:col?.type||preset?.type||'text',target_column:col?.id||'',include:mode==='existing'?!!col:!suggested||!!preset};}));
    if(result.profile){setTitle(result.profile.title_field);setIdentity(result.profile.identity_field);if(mode==='new')setName(result.profile.name);}

  };
  const uploadFile=async file=>{
    if(!file)return;
    setReport(null);setUpload(null);setSample(null);setCollection(null);setMapping([]);setValidated(null);
    if(file.size>8*1024*1024)throw new Error('Máximo 8 MiB por archivo');
    const body=new FormData();body.append('file',file);if(delimiter)body.append('delimiter',delimiter);
    const res=await fetch('/api/databases/import/preview',{method:'POST',body});const result=await res.json();
    if(!res.ok)throw new Error(result.error||'No se pudo leer el archivo');
    setUpload(result);setName(file.name.replace(/\.(json|csv)$/i,''));
  };
  const validate=async()=>{await flushDatabaseEditors();setValidated(await api('/api/databases/import/validate',config,'POST'));};
  const apply=async()=>{
    await flushDatabaseEditors();
    const result=await api('/api/databases/import/apply',{...config,confirmation:validated.fingerprint},'POST');
    setReport(result);if(base)notifyDatabase(base);
  };
  const changeMapping=(i,patch)=>setMapping(current=>current.map((m,n)=>n===i?{...m,...patch}:m));
  const download=()=>{
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='atlas-informe-importacion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  return <DatabaseDialog title="Importar base de datos" anchor={anchor} owner={base?.split('/')[3]} busy={busy} onClose={onClose}>
    <div className="adb-import-content"><p className="adb-help">JSON anidado o CSV UTF-8. Se crean registros nativos; no se descargan archivos de Drive. Los repetidos de la base destino se omiten sin sobrescribir notas, valoraciones, cuerpo ni progreso. No se fusionan grupos ni se confirma información provisional.</p>
    {!report&&<fieldset disabled={busy}><legend>Archivo y alcance</legend>
      <SelectField label="Separador CSV (antes de elegir el archivo)" value={delimiter} onChange={setDelimiter} choices={[["","Detectar"],[",","Coma"],[";","Punto y coma"],["\t","Tabulación"]]}/>
      <label className="adb-field">Archivo JSON o CSV<input type="file" accept=".json,.csv,application/json,text/csv" onChange={e=>{const file=e.target.files?.[0];run(()=>uploadFile(file));e.target.value='';}}/></label>
      {upload?.profile&&<p role="status" className="adb-help">{upload.profile.description} {upload.profile.warning} Grupos candidatos: {upload.profile.context_counts.candidate_groups}; metadatos originales: {upload.profile.context_counts.original_drive_metadata}. No se incluyen en el conteo de libros.</p>}
      {upload&&<SelectField label="Colección de registros · ruta JSON Pointer" value={collection===null?'__choose__':collection} onChange={path=>run(()=>chooseCollection(path))} choices={[["__choose__","Seleccionar explícitamente…"],...upload.collections.map(c=>[c.path,`${c.path||'/ (lista raíz)'} · ${c.count} registros`])]} />}
      {sample&&<><p>{sample.count} registros. Vista previa de {sample.sample.length}.</p>
        <div className="adb-import-scroll" aria-label="Muestra del archivo"><table><thead><tr>{sample.fields.map(f=><th key={f.path}>{f.name}</th>)}</tr></thead><tbody>{sample.sample.map((row,i)=><tr key={i}>{sample.fields.map(f=>{let value=row;for(const p of f.path.slice(1).split('/'))value=value?.[p.replace(/~1/g,'/').replace(/~0/g,'~')];return <td key={f.path}>{typeof value==='object'?JSON.stringify(value):String(value??'')}</td>;})}</tr>)}</tbody></table></div>
        {base&&<SelectField label="Destino" value={mode} onChange={v=>{setMode(v);setMapping(m=>m.map(x=>({...x,include:v==='new'||!!x.target_column})));}} choices={[["existing","Añadir a esta base (sin modificar registros existentes)"],["new","Crear una base independiente"]]}/>}
        {mode==='new'&&<p className="adb-help">Para actualizar una importación con un archivo cambiado, abre su base existente → (…) → Importar. Una base independiente conserva su propio conjunto de registros. Repetir exactamente el archivo y la asignación reutiliza el resultado previo.</p>}
        {mode==='new'&&<label className="adb-field">Nombre de la nueva base<input value={name} onChange={e=>setName(e.target.value)}/></label>}
        <SelectField label="Campo para el título" value={title} onChange={setTitle} choices={[["","Seleccionar…"],...sample.fields.map(f=>[f.path,f.name])]}/>
        <SelectField label="ID o enlace de Drive · clave para evitar duplicados" value={identity} onChange={setIdentity} choices={[["","Seleccionar…"],...sample.fields.map(f=>[f.path,f.name])]}/>
        <p className="adb-help">Conserva una columna para el ID. Las listas y objetos no se separan automáticamente: Texto conserva su JSON; multiselección exige un array de textos. Mantén etiquetas como «autor provisional» al nombrar columnas. El archivo original se conserva en el almacén privado.</p>
        <div className="adb-import-mapping"><h3>Asignación de columnas</h3>{mapping.map((m,i)=><div className="adb-import-map-row" key={m.field}>
          <label><input type="checkbox" aria-label={'Importar '+m.field} checked={m.include} onChange={e=>changeMapping(i,{include:e.target.checked})}/>{m.field}</label>
          {m.include&&(mode==='existing'?<SelectField label={'Columna destino '+m.field} value={m.target_column} onChange={id=>{const c=schema.columns.find(c=>c.id===id);changeMapping(i,{target_column:id,name:c?.name||m.name,type:c?.type||'text'});}} choices={[["","Seleccionar…"],...schema.columns.filter(c=>types.some(([id])=>id===c.type)).map(c=>[c.id,c.name])]} />:<><label className="adb-field">Nombre<input aria-label={'Nombre de '+m.field} value={m.name} onChange={e=>changeMapping(i,{name:e.target.value})}/></label><SelectField label={'Tipo de '+m.field} value={m.type} onChange={v=>changeMapping(i,{type:v})} choices={types}/></>)}
        </div>)}</div>
        <button type="button" onClick={()=>run(validate)}>Validar asignación</button>
      </>}
    </fieldset>}
    {validated&&!report&&<><h3>Resultado previsto</h3><ImportReport report={validated}/><p className="adb-help">Se comprueban de nuevo los duplicados al confirmar. Si hay errores no se importa ninguna fila.</p></>}
    {report&&<><h3>Importación {report.replay?'ya realizada · no se duplicó':'completada'}</h3><ImportReport report={report}/><button type="button" onClick={download}>Descargar informe JSON</button><a href={'/api/databases/import/reports/'+report.id} download="atlas-informe-importacion.json">Informe guardado en Atlas</a><button type="button" onClick={async()=>{await flushDatabaseEditors();onClose();window._loadEntryById?.(report.parent_id);}}>Abrir base importada</button></>}
    {error&&<p role="alert" className="adb-error">{error}</p>}
    <div className="adb-panel-footer"><button type="button" onClick={onClose} disabled={busy}>{report?'Cerrar':'Cancelar'}</button>{validated&&!report&&<button type="button" className="adb-primary" disabled={busy||validated.counts.invalid>0} onClick={()=>run(apply)}>{busy?'Importando…':'Confirmar importación'}</button>}</div></div>
  </DatabaseDialog>;
}
export function openDatabaseImport(options={}){
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  root.render(<DatabaseImportDialog {...options} onClose={()=>{root.unmount();host.remove();}}/>);
}
