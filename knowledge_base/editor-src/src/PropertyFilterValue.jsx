import React from 'react';
import {optionsFor} from './databaseModel.js';
import {DATE_FILTER_TYPES,filterNumber,RELATIVE_DATES} from './databaseFilters.js';

export function PropertyFilterValue({column,rule,label,onChange}){
  if(DATE_FILTER_TYPES.has(column?.type)&&rule.op==='relative')return <select aria-label={label} value={rule.value||''} onChange={e=>onChange(e.target.value)}><option value="">Elegir período</option>{rule.value&&!RELATIVE_DATES.some(([id])=>id===rule.value)&&<option value={rule.value}>Valor guardado: {rule.value}</option>}{RELATIVE_DATES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>;
  if(column?.type==='checkbox')return <select aria-label={label} value={String(rule.value??'')} onChange={e=>onChange(e.target.value===''?'':e.target.value==='true')}><option value="">Elegir valor</option><option value="true">Sí</option><option value="false">No</option></select>;
  if(column?.type==='person')return <select aria-label={label} value={rule.value||''} onChange={e=>onChange(e.target.value)}><option value="">Sin persona</option><option value="owner">Propietario</option></select>;
  const options=column?optionsFor(column):[];
  if(options.length&&['is','not','contains'].includes(rule.op))return <select aria-label={label} value={rule.value??''} onChange={e=>onChange(e.target.value)}><option value="">Elegir opción</option>{rule.value&&!options.some(o=>o.label===rule.value)&&<option value={rule.value}>Valor guardado: {rule.value}</option>}{options.map(o=><option key={o.label} value={o.label}>{o.label}</option>)}</select>;
  const value=String(rule.value??'');
  const numeric=['number','formula','rollup'].includes(column?.type)&&(!value||filterNumber(value)!==null);
  const date=DATE_FILTER_TYPES.has(column?.type)&&(!value||/^\d{4}-\d{2}-\d{2}$/.test(value));
  return <input aria-label={label} type={numeric?'number':date?'date':'text'} step="any" value={value} onChange={e=>onChange(e.target.value)}/>;
}
