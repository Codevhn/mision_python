import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './databaseUI.jsx';

export function SelectField({label,value,onChange,choices,empty,disabled=false,help}){
  return <label className="adb-field"><span>{label}</span><select aria-label={label} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value)}>{empty&&<option value="">{empty}</option>}{choices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>{help&&<small className="adb-help">{help}</small>}</label>;
}
export function ToggleField({label,checked,onChange,disabled=false}){
  return <label className="adb-toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={!!checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/></label>;
}
export function DatabaseDialog({title,owner,anchor,busy,onClose,children}){
  const ref=useRef(null);
  useEffect(()=>{
    (ref.current?.querySelector('select,input,button:not(:disabled)')||ref.current)?.focus();
    return ()=>{if(anchor?.isConnected)anchor.focus();};
  },[]);
  return createPortal(<div className="adb-modal-backdrop" data-peek-owner={owner} onPointerDown={e=>{e.stopPropagation();if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="adb-popover adb-modal-panel" onKeyDown={e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();if(!busy)onClose();}
      if(e.key==='Tab'){
        const nodes=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
        if(!nodes.length){e.preventDefault();ref.current.focus();return;}
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}
      }
    }}><div className="adb-config-heading"><strong>{title}</strong><IconButton icon="close" label={title==='Importar base de datos'?'Cerrar importación':'Cerrar exportación'} disabled={busy} onClick={onClose}/></div>{children}</div>
  </div>,document.body);
}
