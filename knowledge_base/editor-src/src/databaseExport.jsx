import React,{useState} from 'react';
import {DatabaseDialog,SelectField,ToggleField} from './databaseControls.jsx';

export function RecordExportDialog({base,entryId,meta,actions,anchor,onClose}){
  const [format,setFormat]=useState('markdown_csv'),[databaseView,setDatabaseView]=useState('current');
  const [content,setContent]=useState('all'),[subpages,setSubpages]=useState(false),[folders,setFolders]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const hasDatabases=/^\s*:::database\s*$/m.test(actions.markdown());
  const perform=async()=>{
    setBusy(true);setError('');setNotice('');
    try{
      await actions.flush();
      const response=await fetch(`${base}/rows/${entryId}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,database_view:databaseView,include_content:content,include_subpages:subpages,folders:subpages&&folders})});
      if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||`No se pudo exportar (${response.status})`);}
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const file=document.createElement('a');file.href=url;file.download=response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/)?.[1]||'atlas-export.zip';
      document.body.append(file);file.click();file.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      const omitted=Number(response.headers.get('X-Atlas-Export-Omissions')||0);
      const propertyIssues=Number(response.headers.get('X-Atlas-Export-Property-Issues')||0);
      const issues=[omitted?`${omitted} recursos no incluidos`:'',propertyIssues?`${propertyIssues} propiedades con diagnóstico pendiente`:''].filter(Boolean).join(' y ');
      setNotice(issues?`Exportación preparada con ${issues}. Revisa los diagnósticos de manifest.json dentro del ZIP.`:'Exportación preparada. El ZIP incluye manifest.json con el alcance y los archivos generados.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <DatabaseDialog title="Exportar registro" owner={entryId} anchor={anchor} busy={busy} onClose={onClose}>
    <p className="adb-export-scope"><strong>{actions.markdown().split('\n')[0].replace(/^# /,'')||meta.title||'Sin título'}</strong><br/>Su contenido, propiedades y bases incluidas en su cuerpo. La base de datos padre y sus otros registros quedan fuera.</p>
    <SelectField label="Formato de exportación" value={format} onChange={setFormat} choices={[
      ['markdown_csv','Markdown & CSV'],['html','HTML'],['pdf','PDF'],['json','JSON · Atlas']
    ]}/>
    <SelectField label="Vistas de bases de datos" value={databaseView} onChange={setDatabaseView} disabled={!hasDatabases} choices={[
      ['current','Vista actual'],['default','Vista predeterminada']
    ]} help={hasDatabases?'Se aplica a las bases contenidas. En Atlas, la predeterminada es la primera vista guardada; se respetan sus filtros y orden.':'Este registro no contiene bases de datos; esta opción no se aplica.'}/>
    <SelectField label="Contenido" value={content} onChange={setContent} choices={[
      ['all','Todo'],['no_files','Excluir archivos e imágenes']
    ]}/>
    <ToggleField label="Incluir subpáginas" checked={subpages} onChange={setSubpages}/>
    <ToggleField label="Crear carpetas para subpáginas" checked={folders} onChange={setFolders} disabled={!subpages}/>
    <p className="adb-help">Se genera un ZIP. Los archivos locales se incluyen según la opción elegida. Los recursos públicos HTTP/HTTPS se incluyen con límites de tamaño y tiempo. Los que requieren sesión, fallan o están bloqueados se enumeran con su URL y motivo en el manifiesto; puedes corregir el enlace y reintentar.</p>
    {error&&<p role="alert" className="adb-error">{error}</p>}{notice&&<p role="status" className="adb-export-notice">{notice}</p>}
    <div className="adb-panel-footer"><button type="button" disabled={busy} onClick={onClose}>{notice?'Cerrar':'Cancelar'}</button><button type="button" className="adb-primary" disabled={busy} onClick={perform}>{busy?'Exportando…':'Exportar'}</button></div>
  </DatabaseDialog>;
}
