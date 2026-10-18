import {api} from './databaseModel.js';
export const RECORD_PRESENTATION = Object.freeze({font:'default',small_text:false,full_width:false,property_icons:true,table_of_contents:false});

export function recordPresentation(value={}) {
  const result={...RECORD_PRESENTATION};
  if (['default','serif','mono'].includes(value?.font)) result.font=value.font;
  for(const key of ['small_text','full_width','property_icons','table_of_contents']) if(typeof value?.[key]==='boolean')result[key]=value[key];
  return result;
}

// Navigation uses the caller's visible, ordered records, never all pages or a
// different source. A newly created record can be outside an active filter.
export function peekNeighbors(ids=[],current) {
  const ordered=[...new Set(ids)];
  const index=ordered.indexOf(current);
  return {previous:index>0?ordered[index-1]:null,next:index>=0?ordered[index+1]??null:null};
}

export function applyRecordPresentation(root,value) {
  if(!root)return;
  const p=recordPresentation(value);
  root.classList.add('adb-record-page');
  root.dataset.recordFont=p.font;
  root.classList.toggle('adb-record-small',p.small_text);
  root.classList.toggle('adb-record-wide',p.full_width);
  root.classList.toggle('adb-record-no-icons',!p.property_icons);
  root.classList.toggle('adb-record-toc',p.table_of_contents);
  root.dispatchEvent(new Event('atlas:record-presentation'));
}

export function clearRecordPresentation(root) {
  if(!root)return;
  root.classList.remove('adb-record-page','adb-record-small','adb-record-wide','adb-record-no-icons','adb-record-toc');
  delete root.dataset.recordFont;
  delete root.dataset.recordStructure;delete root.dataset.recordTab;
}

export function recordLayout(value={},columns=[]) {
  value=value&&typeof value==='object'?value:{};
  const list=key=>Array.isArray(value[key])?value[key]:[];
  const ids=columns.map(c=>c.id),exists=id=>ids.includes(id);
  return {structure:value.structure==='tabbed'?'tabbed':'simple',property_icons:value.property_icons!==false,
    order:[...new Set([...list('order').filter(exists),...ids])],
    hidden:[...new Set(list('hidden').filter(exists))],panel:[...new Set(list('panel').filter(exists))]};
}

export async function mutateRecordSource(meta,body){
  await window._flushDatabaseSource?.(meta.parent_id);
  const base=`/api/databases/${meta.parent_id}/${meta.database_id}`;
  const current=await api(base);
  const result=await api(base,{...body,revision:current.revision});
  window.dispatchEvent(new CustomEvent('atlas:database-changed',{detail:base}));
  return result;
}
