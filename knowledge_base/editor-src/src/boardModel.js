import {groupRows,emptyGroupLabel,optionsFor} from './databaseModel.js';

export function boardGroups(rows,col,view){
  return groupRows(rows,col).map(([label,items])=>{
    const value=!col||label===emptyGroupLabel(rows,col)?null:col.type==='person'&&label==='Propietario'?'owner':col.type==='checkbox'?label==='Sí':col.type==='number'?Number(label):label;
    const option=optionsFor(col||{}).find(o=>o.label===value);
    const key=JSON.stringify([col?.id||'__all',option?.id?['option',option.id]:['value',value]]);
    const order=Array.isArray(view.groupRowOrder?.[key])?view.groupRowOrder[key]:[];
    const rank=new Map([...new Set(order)].map((id,i)=>[id,i]));
    return {label,value,key,items:view.sorts?.length?items:[...items].sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity))};
  });
}
export const boardInitialValues=(col,value)=>!col||value===null?{}:{[col.id]:['multi_select','person'].includes(col.type)?[value]:value};
export function moveBoardRow(view,group,rowId,targetId,after=false){
  const old=Array.isArray(view.groupRowOrder?.[group.key])?view.groupRowOrder[group.key]:[];
  const order=[...new Set([...old,...group.items.map(r=>r.id)])].filter(id=>id!==rowId);
  const index=order.indexOf(targetId);
  if(index<0||rowId===targetId)return view.groupRowOrder||{};
  order.splice(index+(after?1:0),0,rowId);
  return {...view.groupRowOrder,[group.key]:order};
}
