// Shared settings and contextual review transport for the editor and Abc panel.
const LANGUAGES = new Set(['es','en-US']);
const storageKey = 'atlas_spelling_settings';
let settings = {language:'es', method:'languagetool', underline:true};
try {const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
  if(typeof saved.underline==='boolean')settings.underline=saved.underline;
  if(LANGUAGES.has(saved.language))settings.language=saved.language;
  if(['local','languagetool'].includes(saved.method))settings.method=saved.method;
} catch {}
export function getSpellingSettings(){return {...settings};}
export function setSpellingSettings(next){
  settings={language:LANGUAGES.has(next.language)?next.language:settings.language,
    method:['local','languagetool'].includes(next.method)?next.method:settings.method,
    underline:typeof next.underline==='boolean'?next.underline:settings.underline};
  try {localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}
  window.dispatchEvent(new CustomEvent('atlas-spelling-settings',{detail:getSpellingSettings()}));
}
const cache=new Map(),pending=new Map();
let cooldown=0;
export function clearSpellingCache(){cache.clear();}
export async function reviewContext(text, language=getSpellingSettings().language){
  if(!LANGUAGES.has(language)||!text.trim()||text.length>10000)throw Error('Revisa un párrafo de hasta 10 000 caracteres.');
  const key=JSON.stringify([text,language]);
  const saved=cache.get(key);
  if(saved&&saved.expires>Date.now())return saved.value;
  if(pending.has(key))return pending.get(key);
  if(Date.now()<cooldown)throw Error('LanguageTool alcanzó su límite. Espera un momento o elige revisión local en Abc✓.');
  const operation=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
    try {
      const response=await fetch('/api/proofreading/check',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({text,language,mode:'languagetool'})});
      const data=await response.json();
      if(!response.ok){if(response.status===429)cooldown=Date.now()+60000;throw Error(data.error||'No se pudo revisar el párrafo.');}
      if(!Array.isArray(data.matches))throw Error('Respuesta de revisión inválida.');
      const matches=data.matches.filter(m=>Number.isInteger(m.offset)&&Number.isInteger(m.length)&&m.offset>=0&&m.length>=0&&m.offset+m.length<=text.length&&Array.isArray(m.replacements));
      cache.set(key,{value:matches,expires:Date.now()+300000});
      while(cache.size>64)cache.delete(cache.keys().next().value);
      return matches;
    } catch(error){if(error.name==='AbortError')throw Error('La revisión tardó demasiado. Inténtalo de nuevo.');throw error;}
    finally{clearTimeout(timer);}
  })();
  pending.set(key,operation);
  try{return await operation;}finally{pending.delete(key);}
}
// Map a reviewed fragment to actual document positions. Reject protected atoms,
// split surrogate pairs and cross-block findings instead of guessing offsets.
export function mappedFinding(fragment, match){
  const {offset,length}=match,end=offset+length;
  const boundary=i=>i===0||i===fragment.text.length||!(/[\uD800-\uDBFF]/.test(fragment.text[i-1])&&/[\uDC00-\uDFFF]/.test(fragment.text[i]));
  if(!Number.isInteger(offset)||!Number.isInteger(length)||length<0||offset<0||end>fragment.text.length||!boundary(offset)||!boundary(end))return null;
  if(length===0){
    if(fragment.blocked[offset]||fragment.blocked[offset-1])return null;
    const position=fragment.positions[offset]??(fragment.positions.at(-1)+1);
    if(!Number.isFinite(position))return null;
    return {word:'',offset,from:position,to:position,paragraph:fragment.paragraph,text:fragment.text,
      replacements:match.replacements.filter(value=>typeof value==='string'),message:match.message};
  }
  if(fragment.blocked.slice(offset,end).some(Boolean))return null;
  if(fragment.positions.slice(offset,end).some((p,i)=>p!==fragment.positions[offset]+i))return null;
  return {word:fragment.text.slice(offset,end),offset,from:fragment.positions[offset],to:fragment.positions[end-1]+1,
    paragraph:fragment.paragraph,text:fragment.text,replacements:match.replacements.filter(value=>typeof value==='string'),message:match.message};
}
if(typeof window!=='undefined')window.AtlasSpellingSettings={get:getSpellingSettings,set:setSpellingSettings,reviewContext};
