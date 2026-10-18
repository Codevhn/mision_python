import React,{useState} from 'react';
import {dateParts,dateWithTime,isDateRange,dateStart} from './databasePropertyValues.js';
function DatePointInput({value='',onChange,label,onKeyDown}){
  const parts=dateParts(value);const [withTime,setWithTime]=useState(!!parts.time);
  return <div className="adb-date-editor">
    {parts.original&&<p className="adb-help">Valor conservado: {parts.original}. Elige una fecha para reemplazarlo.</p>}
    <input aria-label={label} type="date" value={parts.day} onKeyDown={onKeyDown} onChange={e=>onChange(dateWithTime(e.target.value,withTime?(parts.time||'00:00'):'',parts.zone))}/>
    <label className="adb-toggle"><span>Incluir hora</span><input aria-label={'Incluir hora de '+label} type="checkbox" checked={withTime} onChange={e=>{setWithTime(e.target.checked);if(parts.day)onChange(dateWithTime(parts.day,e.target.checked?(parts.time||'00:00'):'',parts.zone));}}/></label>
    {withTime&&<><input aria-label={'Hora de '+label} type="time" disabled={!parts.day} step="any" value={parts.time} onKeyDown={onKeyDown} onChange={e=>onChange(dateWithTime(parts.day,e.target.value,parts.zone))}/>{parts.zone&&<small className="adb-help">Zona conservada: {parts.zone==='Z'?'UTC':parts.zone}</small>}</>}
  </div>;
}
export function DatePropertyInput({value='',onChange,label='Fecha',onKeyDown}){
  const ranged=isDateRange(value);const [confirmEnd,setConfirmEnd]=useState(false);
  return <div className="adb-date-property"><DatePointInput value={dateStart(value)} label={ranged?'Inicio de '+label:label} onKeyDown={onKeyDown} onChange={start=>onChange(ranged?{...value,start}:start)}/>
    <label className="adb-toggle"><span>Fecha final</span><input aria-label={'Fecha final de '+label} type="checkbox" checked={ranged} onChange={e=>{
      if(e.target.checked){setConfirmEnd(false);onChange({start:value||'',end:value||''});}
      else if(value.start===value.end){onChange(value.start);setConfirmEnd(false);}
      else setConfirmEnd(true);
    }}/></label>
    {ranged&&<DatePointInput value={value.end} label={'Fin de '+label} onKeyDown={onKeyDown} onChange={end=>onChange({...value,end})}/>}
    {confirmEnd&&<div role="group" aria-label="Confirmar retirada de fecha final"><p className="adb-help">Se conservará el inicio. El fin permanece hasta que confirmes y guardes. Puedes cancelar la edición para conservar el rango.</p><button type="button" onClick={()=>{onChange(value.start);setConfirmEnd(false);}}>Retirar fecha final</button><button type="button" onClick={()=>setConfirmEnd(false)}>Conservar rango</button></div>}
  </div>;
}
