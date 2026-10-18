import {dateStart} from './databasePropertyValues.js';
export const DATE_FILTER_TYPES=new Set(['date','created_time','edited_time']);
const base=[['contains','Contiene'],['is','Es'],['not','No es'],['empty','Está vacío'],['not_empty','No está vacío']];
export function filterOperations(type){
  if(DATE_FILTER_TYPES.has(type))return [...base.slice(1),['lt','Antes de'],['gt','Después de'],['relative','Fecha relativa']];
  if(['number','formula','rollup'].includes(type))return [...base.slice(1),['gt','Mayor que'],['lt','Menor que']];
  if(type==='checkbox')return base.slice(1,3);
  if(['select','status','option'].includes(type))return base.slice(1);
  return base;
}
export const defaultFilterOperator=type=>filterOperations(type)[0][0];
export function storedFilterOperations(type,op){
  const operations=filterOperations(type);
  return op&&!operations.some(([id])=>id===op)?[...operations,[op,`Operador guardado (${op})`]]:operations;
}
export function filterDay(value){value=dateStart(value);return typeof value==='string'?(/^\d{4}-\d{2}-\d{2}(?=$|T)/.exec(value)?.[0]||'').slice(0,10):'';}
export function filterNumber(value){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const raw=String(value).trim();
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)&&Number.isFinite(Number(raw))?Number(raw):null;
}
// A day chosen in the date picker matches the stored calendar day, preserving
// its explicit zone. It is not converted through the viewer's time zone.
export function dateRule(value,rule,type,today){
  if(DATE_FILTER_TYPES.has(type)&&rule.op==='relative'){const range=relativeRange(rule.value,today);const day=filterDay(value);const parsed=new Date(day+'T00:00:00Z');const valid=Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day;return !!(range&&valid&&day>=range[0]&&day<=range[1]);}
  if(!DATE_FILTER_TYPES.has(type)||!/^\d{4}-\d{2}-\d{2}$/.test(String(rule.value||'')))return null;
  const day=filterDay(value),expected=String(rule.value);
  if(rule.op==='is')return day===expected;
  if(rule.op==='not')return day!==expected;
  if(rule.op==='gt')return !!day&&day>expected;
  if(rule.op==='lt')return !!day&&day<expected;
  return null;
}

export const RELATIVE_DATES=[['today','Hoy'],['yesterday','Ayer'],['tomorrow','Mañana'],['this_week','Esta semana'],['last_week','Semana pasada'],['next_week','Próxima semana'],['this_month','Este mes'],['last_month','Mes pasado'],['next_month','Próximo mes'],['past_7_days','Últimos 7 días'],['next_7_days','Próximos 7 días']];
export const FILTER_LIMITS={depth:8,rules:100};
export const localFilterZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
export function filterToday(zone='UTC',now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function relativeRange(period,today){
  const d=new Date(today+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return null;
  const day=n=>{const v=new Date(d);v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);};
  const month=n=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1));
  const week=-((d.getUTCDay()+6)%7);
  if(period==='today')return [today,today];
  if(period==='yesterday')return [day(-1),day(-1)];
  if(period==='tomorrow')return [day(1),day(1)];
  if(period==='past_7_days')return [day(-6),today];
  if(period==='next_7_days')return [today,day(6)];
  if(['this_week','last_week','next_week'].includes(period)){const start=week+({this_week:0,last_week:-7,next_week:7})[period];return [day(start),day(start+6)];}
  if(['this_month','last_month','next_month'].includes(period)){const n=({this_month:0,last_month:-1,next_month:1})[period],end=month(n+1);end.setUTCDate(0);return [month(n).toISOString().slice(0,10),end.toISOString().slice(0,10)];}
  return null;
}
export function validateFilterTree(rules,depth=0,budget={count:0}){
  if(!Array.isArray(rules)||depth>FILTER_LIMITS.depth)throw new Error('Filtros: máximo 8 niveles y 100 condiciones');
  for(const rule of rules){
    if(!rule||typeof rule!=='object'||++budget.count>FILTER_LIMITS.rules)throw new Error('Filtros: máximo 8 niveles y 100 condiciones');
    if('rules' in rule){if(!['and','or'].includes(rule.mode))throw new Error('Combinación de filtros no válida');validateFilterTree(rule.rules,depth+1,budget);}
  }
}
// Empty groups add no condition, even under OR. Leaves retain legacy operators.
export function matchFilterTree(rules,mode,matches){
  const active=rules.filter(r=>!Array.isArray(r.rules)||hasFilterLeaves(r.rules));
  if(!active.length)return true;
  const test=rule=>Array.isArray(rule.rules)?matchFilterTree(rule.rules,rule.mode,matches):matches(rule);
  return mode==='or'?active.some(test):active.every(test);
}
export const hasFilterLeaves=rules=>rules.some(r=>Array.isArray(r.rules)?hasFilterLeaves(r.rules):true);
