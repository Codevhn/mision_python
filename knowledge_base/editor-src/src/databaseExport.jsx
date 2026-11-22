import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DatabaseDialog,SelectField,ToggleField} from './databaseControls.jsx';

export function RecordExportDialog({base,entryId,meta,actions,anchor,onClose}){
  const [format,setFormat]=useState('pdf'),[databaseView,setDatabaseView]=useState('current');
  const [content,setContent]=useState('all'),[subpages,setSubpages]=useState(false),[folders,setFolders]=useState(true);
  const [properties,setProperties]=useState(false),[archive,setArchive]=useState(false);
  const [pdfLayout,setPdfLayout]=useState('normal'),[fontSize,setFontSize]=useState('10.5');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const hasDatabases=/^\s*:::database\s*$/m.test(actions.markdown());
  const hasProperties=!!meta.database_id||!!meta.properties?.length;
  const title=base?'Exportar registro':'Exportar página';
  const perform=async(print=false)=>{
    const preview=print?window.open('about:blank','_blank'):null;
    if(print&&!preview){setError('Permite abrir la ventana de impresión e inténtalo de nuevo.');return;}
    if(preview)preview.opener=null;
    setBusy(true);setError('');setNotice(!print&&format==='pdf'&&meta.type==='course'?'Calculando la paginación del curso con el tamaño elegido…':'');
    try{
      await actions.flush();
      const endpoint=base?`${base}/rows/${entryId}/export`:`/api/export/${encodeURIComponent(entryId)}/document`;
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:print?'html':format,database_view:databaseView,include_content:content,include_subpages:!print&&archive&&subpages,folders:!print&&archive&&subpages&&folders,include_properties:properties,archive:!print&&archive,pdf_layout:!print&&format==='pdf'?pdfLayout:'normal',pdf_font_size:format==='pdf'?Number(fontSize):10.5})});
      if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||`No se pudo exportar (${response.status})`);}
      if(print){
        if(preview.closed)throw new Error('Se cerró la vista de impresión.');
        preview.document.open();preview.document.write(await response.text());preview.document.close();
        await preview.document.fonts?.ready;
        await Promise.all([...preview.document.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=image.onerror=resolve;})));
        if(!preview.closed){preview.focus();preview.print();}
      }
      else {
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const file=document.createElement('a');file.href=url;file.download=response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/)?.[1]||`atlas-export.${archive?'zip':format==='markdown_csv'?'md':format}`;
      document.body.append(file);file.click();file.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
      const omitted=Number(response.headers.get('X-Atlas-Export-Omissions')||0);
      const propertyIssues=Number(response.headers.get('X-Atlas-Export-Property-Issues')||0);
      const issues=[omitted?`${omitted} recursos no incluidos`:'',propertyIssues?`${propertyIssues} propiedades con diagnóstico pendiente`:''].filter(Boolean).join(' y ');
      const pages=Number(response.headers.get('X-Atlas-PDF-Pages')||0),actualFont=response.headers.get('X-Atlas-PDF-Font-Size');
      const start=Number(response.headers.get('X-Atlas-PDF-Start-Page')||1),end=Number(response.headers.get('X-Atlas-PDF-End-Page')||pages);
      const range=meta.type==='course'?` · numeración ${start}–${end}`:'';
      const ready=pages?`PDF preparado: ${pages} ${pages===1?'página':'páginas'} · texto ${Number(actualFont).toLocaleString('es')} pt${range}.`:'Archivo preparado para descargar.';
      setNotice(issues?`Archivo preparado con ${issues}. ${archive?'El ZIP incluye los detalles en manifest.json.':'Puedes elegir ZIP para obtener el informe detallado.'}`:print?'Vista de impresión preparada.':archive?'ZIP preparado con los documentos, recursos y manifest.json.':ready);
    }catch(e){if(preview&&!preview.closed)preview.close();setError(e.message);}finally{setBusy(false);}
  };
  return <DatabaseDialog className="adb-export-dialog" title={title} owner={entryId} anchor={anchor} busy={busy} onClose={onClose}>
    <div className="adb-export-body">
    <p className="adb-export-scope"><strong>{meta.title||'Sin título'}</strong><br/>Se exporta el contenido de esta página. La base padre y sus otros registros quedan fuera.</p>
    <section className="adb-export-section" aria-label="Formato y presentación">
    <h3>Formato y presentación</h3>
    <SelectField label="Formato de exportación" value={format} onChange={setFormat} disabled={busy} choices={[
      ['pdf','PDF'],['html','HTML'],['markdown_csv',archive?'Markdown & CSV':'Markdown'],['json','JSON · Atlas']
    ]}/>
    {format==='pdf'&&<>
      {meta.type==='course'&&<p className="adb-help">Numeración continua según el orden del roadmap y el tamaño elegido. Si cambias lecciones anteriores, sus páginas se recalculan. Para conservar la secuencia al imprimir, usa los mismos ajustes.</p>}
      <SelectField label="Tamaño del texto del PDF" value={fontSize} onChange={setFontSize} disabled={busy} choices={[
        ['9','9 pt · Pequeño'],['10','10 pt · Compacto'],['10.5','10,5 pt · Normal'],['12','12 pt · Grande'],['14','14 pt · Muy grande']
      ]}/>
      <ToggleField label="Ajustar a una hoja" checked={pdfLayout==='one_page'} disabled={busy} onChange={value=>setPdfLayout(value?'one_page':'normal')}/>
      <p className="adb-help">{pdfLayout==='one_page'?'Ajusta espacios, márgenes y texto hasta 9 pt como mínimo, sin recortar contenido. Si no cabe, te avisará. Para imprimir el ajuste exacto, descarga e imprime el PDF.':'La paginación se calcula según el tamaño del texto elegido. El contenido de la nota no cambia.'}{archive&&pdfLayout==='one_page'?' Cada PDF del ZIP se ajusta por separado.':''}</p>
    </>}
    </section>
    <section className="adb-export-section" aria-label="Contenido y descarga">
    <h3>Contenido y descarga</h3>
    <ToggleField label="Incluir propiedades de la página" checked={properties} onChange={setProperties} disabled={busy||!hasProperties}/>
    <p className="adb-help">{hasProperties?'Añade campos como Estado. Desactivado: se exporta el contenido sin la tabla de propiedades.':'Esta página no tiene propiedades para incluir.'}</p>
    <ToggleField label="Descargar como ZIP" checked={archive} disabled={busy} onChange={value=>{setArchive(value);if(!value)setSubpages(false);}}/>
    {hasDatabases&&<SelectField label="Vistas de bases de datos" value={databaseView} onChange={setDatabaseView} disabled={busy} choices={[
      ['current','Vista actual'],['default','Vista predeterminada']
    ]} help="Se aplica a las bases contenidas; se respetan sus filtros y orden. La predeterminada es la primera vista guardada."/>}
    <SelectField label="Contenido" value={content} onChange={setContent} disabled={busy} choices={[
      ['all','Incluir archivos e imágenes'],['no_files','Excluir archivos e imágenes']
    ]}/>
    <ToggleField label="Incluir subpáginas" checked={subpages} onChange={setSubpages} disabled={busy||!archive}/>
    {archive&&<ToggleField label="Crear carpetas para subpáginas" checked={folders} onChange={setFolders} disabled={busy||!subpages}/>}
    <p className="adb-help">{archive?'El ZIP permite incluir subpáginas, archivos separados y el informe de exportación.':'Se descarga un archivo individual. Para incluir subpáginas o descargar los recursos por separado, activa ZIP.'} Las tablas escritas dentro del contenido se conservan.</p>
    </section>
    </div>
    {(error||notice)&&<div className="adb-export-feedback">
      {error&&<p role="alert" className="adb-error">{error}</p>}
      {notice&&<p role="status" className="adb-export-notice">{notice}</p>}
    </div>}
    <div className="adb-panel-footer"><button type="button" disabled={busy} onClick={onClose}>{notice?'Cerrar':'Cancelar'}</button><button type="button" disabled={busy||archive||(format==='pdf'&&pdfLayout==='one_page')} onClick={()=>perform(true)}>Imprimir página</button><button type="button" className="adb-primary" disabled={busy} onClick={()=>perform(false)}>{busy?'Exportando…':'Exportar'}</button></div>
  </DatabaseDialog>;
}

// The ordinary entry and DB Peek share the same options and renderer contract.
export function openDocumentExport({entryId,meta,actions,anchor}){
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  const close=()=>queueMicrotask(()=>{root.unmount();container.remove();});
  root.render(<RecordExportDialog entryId={entryId} meta={meta} actions={actions} anchor={anchor} onClose={close}/>);
}
