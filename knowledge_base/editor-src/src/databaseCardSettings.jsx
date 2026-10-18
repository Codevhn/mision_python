import React from 'react';
import {SelectField} from './databaseControls.jsx';
export function CardPreviewSettings({view,columns,onChange}){
  const files=columns.filter(c=>c.type==='files');
  const selected=view.cardPreviewProperty||'';
  const missing=selected&&selected!=='__page_cover'&&!files.some(c=>c.id===selected);
  return <><SelectField label="Imagen de tarjeta" value={selected} onChange={cardPreviewProperty=>onChange({cardPreviewProperty})} choices={[
    ['','Portada de página o primer archivo'],['__page_cover','Sólo portada de página'],...files.map(c=>[c.id,c.name]),...(missing?[[selected,'Propiedad no disponible · '+selected]]:[])
  ]}/>{missing&&<p className="adb-help">La propiedad elegida ya no es de archivos o fue archivada. Elige otra; sus valores no se borran.</p>}
    <SelectField label="Ajuste de imagen" value={view.cardImageFit||'cover'} onChange={cardImageFit=>onChange({cardImageFit})} choices={[["cover","Recortar"],["contain","Imagen completa"]]}/></>;
}
export function ListLayoutSettings({view,onChange}){
  return <><SelectField label="Densidad de filas" value={view.listDensity||'normal'} onChange={listDensity=>onChange({listDensity})} choices={[["compact","Compacta"],["normal","Normal"],["comfortable","Cómoda"]]}/>
    <SelectField label="Distribución de propiedades" value={view.listPropertyLayout||'inline'} onChange={listPropertyLayout=>onChange({listPropertyLayout})} choices={[["inline","En línea"],["below","Debajo del título"]]}/></>;
}
