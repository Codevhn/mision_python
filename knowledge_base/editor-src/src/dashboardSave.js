// Serializes layout writes and keeps the latest failed configuration recoverable.
// A server refresh cannot replace a dirty draft with an older saved snapshot.
export function dashboardWriter({initial,write,storage,key,normalize=value=>value,onState=()=>{},onDirty=()=>{},onClean=()=>{}}){
  let value=initial,dirty=false,pending=0,error='',version=0,chain=Promise.resolve();
  try{const cached=storage?.getItem(key);if(cached){value=normalize(JSON.parse(cached));dirty=true;error='Configuración pendiente recuperada de esta sesión. Reintenta guardarla.';}}catch{}
  const snapshot=()=>({value,dirty,pending,error});
  const emit=()=>onState(snapshot());
  const persist=()=>{try{storage?.setItem(key,JSON.stringify(value));}catch{}};
  const save=next=>{
    value=next;dirty=true;pending++;error='';const current=++version;
    persist();onDirty();emit();
    const task=chain.catch(()=>{}).then(()=>write(next));
    chain=task;
    task.then(()=>{
      if(current===version){dirty=false;error='';try{storage?.removeItem(key);}catch{}onClean();}
    },failure=>{if(current===version)error=failure.message||String(failure);}).finally(()=>{pending--;emit();});
    return task;
  };
  const flush=async()=>{
    // Propagate an in-flight failure; only a subsequent explicit attempt retries.
    await chain;
    if(dirty)await save(value);
  };
  const retry=()=>save(value);
  const install=next=>{if(!dirty&&!pending){value=next;emit();}};
  return {snapshot,save,flush:async()=>{if(!pending&&dirty)return retry();return flush();},retry,install};
}
