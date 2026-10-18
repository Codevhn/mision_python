import React from 'react';
import {defaultFilterOperator,storedFilterOperations,validateFilterTree,FILTER_LIMITS} from './databaseFilters.js';
import {PropertyFilterValue} from './PropertyFilterValue.jsx';

// The same immutable tree editor is used by views and Dashboard widgets.
export function FilterRules({rules=[],columns,onChange,depth=0,path=''}){
  const change=(index,value)=>onChange(rules.map((r,i)=>i===index?value:r));
  const add=value=>{try{const next=[...rules,value];validateFilterTree(next,depth);onChange(next);}catch(e){onChange(rules,e.message);}};
  return <div className="adb-filter-tree">{rules.map((rule,i)=>Array.isArray(rule.rules)?<fieldset className="adb-filter-group" key={i}>
    <legend>Grupo {path}{i+1}</legend><div className="adb-rule"><select aria-label={'Combinar grupo '+path+(i+1)} value={rule.mode} onChange={e=>change(i,{...rule,mode:e.target.value})}><option value="and">Todas (Y)</option><option value="or">Cualquiera (O)</option></select><button type="button" aria-label={'Quitar grupo '+path+(i+1)} onClick={()=>onChange(rules.filter((_,n)=>n!==i))}>×</button></div>
    <FilterRules rules={rule.rules} columns={columns} depth={depth+1} path={path+(i+1)+'.'} onChange={(children,error)=>error?onChange(rules,error):change(i,{...rule,rules:children})}/>
  </fieldset>:<div className="adb-rule" key={i}>
    <select aria-label="Propiedad" value={rule.colId} onChange={e=>change(i,{...rule,colId:e.target.value,op:defaultFilterOperator(columns.find(c=>c.id===e.target.value)?.type),value:''})}>{!columns.some(c=>c.id===rule.colId)&&<option value={rule.colId}>Propiedad no disponible</option>}{columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <select aria-label="Operador" value={rule.op||'contains'} onChange={e=>change(i,{...rule,op:e.target.value,...(e.target.value==='relative'?{value:'today'}:{})})}>{storedFilterOperations(columns.find(c=>c.id===rule.colId)?.type,rule.op).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
    {!['empty','not_empty'].includes(rule.op)&&<PropertyFilterValue column={columns.find(c=>c.id===rule.colId)} rule={rule} label="Valor del filtro" onChange={value=>change(i,{...rule,value})}/>}
    <button type="button" aria-label="Quitar condición" onClick={()=>onChange(rules.filter((_,n)=>n!==i))}>×</button>
  </div>)}<div className="adb-filter-add"><button type="button" onClick={()=>add({colId:columns[0].id,op:defaultFilterOperator(columns[0].type),value:''})}>＋ Añadir condición</button><button type="button" disabled={depth>=FILTER_LIMITS.depth} onClick={()=>add({mode:'and',rules:[]})}>＋ Añadir grupo</button></div></div>;
}
