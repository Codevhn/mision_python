import nspell from 'nspell';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {closeHistory} from '@tiptap/pm/history';
import {wordRanges, suggestionsFor, createSpellingDictionary, isRomanNumeral} from './spellingWords.js';
import {getSpellingSettings, setSpellingSettings, reviewContext, mappedFinding, clearSpellingCache} from './spellingReview.js';

const key=new PluginKey('atlasSpelling');
const dictionaries=new Map();
function dictionary(language){
  if(!dictionaries.has(language)){
    const code=language==='en-US'?'en':'es';
    const request=Promise.all(['aff','dic'].map(async ext=>{
      const response=await fetch('/static/spelling/'+code+'.'+ext);
      if(!response.ok)throw Error('No se pudo cargar el diccionario '+code+'.');
      return response.text();
    })).then(([aff,dic])=>createSpellingDictionary(nspell(aff,dic))).catch(error=>{dictionaries.delete(language);throw error;});
    dictionaries.set(language,request);
  }
  return dictionaries.get(language);
}
const normalize=word=>word.normalize('NFC').toLocaleLowerCase('es');
const ignored=new Set(),personal=new Set();
for(const storageKey of ['atlas_spelling_dictionary','atlas_spelling_ignored']){
  try{JSON.parse(localStorage.getItem(storageKey)||'[]').filter(w=>typeof w==='string'&&w.length<100).forEach(w=>personal.add(normalize(w)));}catch{}
}
// Immutable ProseMirror nodes retain tokenization/diagnoses across edits to
// neighbouring blocks. Positions are reconstructed from the current document.
const fragments=new WeakMap(),analyses=new WeakMap(),contextualResults=new WeakMap();
function fragmentFor(node,pos){
  if(!node?.isTextblock||/code/i.test(node.type.name))return null;
  let value=fragments.get(node);
  if(!value){
    let text='',positions=[],blocked=[];
    node.descendants((child,offset)=>{
      if(child.isText){
        const skip=child.marks.some(mark=>/code|link/i.test(mark.type.name));
        for(let i=0;i<child.text.length;i++){text+=child.text[i];positions.push(1+offset+i);blocked.push(skip);}
      }else if(child.isLeaf){text+=' ';positions.push(1+offset);blocked.push(true);}
    });
    value={text,positions,blocked};fragments.set(node,value);
  }
  return {...value,positions:value.positions.map(offset=>pos+offset),paragraph:pos};
}
function scan(doc,spell,language,method){
  const issues=[];
  doc.descendants((node,pos)=>{
    if(!node.isTextblock)return;
    const fragment=fragmentFor(node,pos);if(!fragment)return false;
    const contextual=method==='languagetool'?contextualResults.get(node)?.get(language):null;
    if(contextual){
      for(const match of contextual){const item=mappedFinding(fragment,match);if(item&&item.word&&!personal.has(normalize(item.word))&&!ignored.has(normalize(item.word)))issues.push(item);}
      return false;
    }
    let perDictionary=analyses.get(node);
    if(!perDictionary){perDictionary=new WeakMap();analyses.set(node,perDictionary);}
    let tokens=perDictionary.get(spell);
    if(!tokens){tokens=wordRanges(fragment.text).filter(({word,offset})=>word.length>=2&&word.length<=60&&!isRomanNumeral(word)&&!fragment.blocked.slice(offset,offset+word.length).some(Boolean)&&!spell.correct(word));perDictionary.set(spell,tokens);}
    for(const {word,offset} of tokens){
      if(ignored.has(normalize(word))||personal.has(normalize(word)))continue;
      issues.push({word,offset,from:fragment.positions[offset],to:fragment.positions[offset+word.length-1]+1,paragraph:pos,text:fragment.text});
    }
    return false;
  });
  return issues;
}
export function installInlineSpelling(tip){
  let active=true,timer=null,spell=null,issues=[],scannedDoc=null,popup=null,popupAnchor=null,review=null,requestTimer=null,hoverTimer=null;
  let language=getSpellingSettings().language,loadSequence=0;
  function closePopup(){const hadPopup=Boolean(popup);clearTimeout(requestTimer);clearTimeout(hoverTimer);popup?.remove();popup=null;popupAnchor=null;
    if(hadPopup)queueMicrotask(()=>{if(!popup&&active&&spell&&!tip.isDestroyed)check();});
  }
  function rememberContext(doc,fragment,matches,reviewLanguage){
    const node=doc.nodeAt(fragment.paragraph);let values=contextualResults.get(node);
    if(!values){values=new Map();contextualResults.set(node,values);}values.set(reviewLanguage,matches);
  }
  function valid(issue){return active&&!tip.isDestroyed&&tip.state.doc===scannedDoc&&tip.state.doc.textBetween(issue.from,issue.to,'')===issue.word;}
  function apply(edits,doc){
    if(!active||tip.isDestroyed||!tip.isEditable)throw Error('La página está en solo lectura. Desbloquéala antes de corregir.');
    if(tip.state.doc!==doc)throw Error('El párrafo cambió. Revísalo de nuevo antes de corregir.');
    let tr=closeHistory(tip.state.tr);
    [...edits].sort((a,b)=>b.from-a.from).forEach(edit=>{tr=tr.insertText(edit.text,edit.from,edit.to);});
    if(edits.length){tr.setMeta('atlasSpellingApplied',true);tip.view.dispatch(tr);tip.view.dispatch(closeHistory(tip.state.tr).setMeta('addToHistory',false));tip.commands.focus();}
  }
  function check(){
    if(!active||!spell||tip.isDestroyed)return;
    scannedDoc=tip.state.doc;issues=scan(scannedDoc,spell,language,getSpellingSettings().method);
    const decorations=issues.map((issue,index)=>Decoration.inline(issue.from,issue.to,{class:'atlas-spelling-target'+(getSpellingSettings().underline?' atlas-spelling-error':''),'data-spelling-index':String(index),'aria-label':'Posible error ortográfico: '+issue.word}));
    tip.view.dispatch(tip.state.tr.setMeta(key,DecorationSet.create(scannedDoc,decorations)).setMeta('addToHistory',false));
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(check,450);}
  async function loadDictionary(){
    const sequence=++loadSequence;tip.view.dom.lang=language;spell=null;issues=[];scannedDoc=null;closePopup();review?.close();
    tip.view.dispatch(tip.state.tr.setMeta(key,DecorationSet.empty).setMeta('addToHistory',false));
    try{const value=await dictionary(language);if(active&&!tip.isDestroyed&&sequence===loadSequence){spell=value;check();}}
    catch(error){if(active&&sequence===loadSequence)window.showToast?.(error.message,'error');}
  }
  function settingsChanged(){language=getSpellingSettings().language;loadDictionary();}
  function paragraphFragment(issue){
    const cursor=tip.state.selection.$from;
    const pos=issue?.paragraph??(cursor.depth?cursor.before(cursor.depth):null);
    return pos===null?null:fragmentFor(tip.state.doc.nodeAt(pos),pos);
  }
  function reviewParagraph(issue,method=getSpellingSettings().method){
    if(!spell)return;
    check();
    const fragment=paragraphFragment(issue);
    if(!fragment?.text.trim()){window.showToast?.('Selecciona un párrafo de texto para revisar.','info');return;}
    const doc=tip.state.doc,reviewLanguage=language;
    review?.close();
    const dialog=document.createElement('dialog');review=dialog;
    dialog.className='assistant-confirm-dialog atlas-spelling-review';dialog.setAttribute('aria-label','Corregir párrafo');
    dialog.innerHTML='<form><header class="assistant-confirm-header"><h2>Corregir párrafo</h2></header><div class="assistant-confirm-body"><p class="atlas-spelling-review-hint"></p><div class="atlas-spelling-proposals"></div><blockquote class="atlas-spelling-preview"></blockquote><p role="status"></p><button type="button" class="atlas-spelling-context">Revisar contexto con LanguageTool</button></div><footer class="assistant-confirm-actions"><button type="button" class="atlas-spelling-cancel">Cerrar</button><button type="submit">Aplicar correcciones</button></footer></form>';
    const status=dialog.querySelector('[role="status"]'),submit=dialog.querySelector('[type="submit"]'),preview=dialog.querySelector('blockquote');
    dialog.querySelector('.atlas-spelling-review-hint').textContent=method==='local'?'Candidatos locales sin contexto. Elige únicamente los cambios que quieras aplicar.':'LanguageTool revisa este párrafo en '+(language==='es'?'español':'inglés')+'. No se envían otras páginas ni historial.';
    let picks=[];submit.disabled=true;preview.textContent=fragment.text;
    const current=()=>active&&!tip.isDestroyed&&review===dialog&&dialog.open&&tip.state.doc===doc&&language===reviewLanguage;
    const update=()=>{
      let text=fragment.text,boundary=text.length;
      const edits=picks.filter(({item,select})=>item.word!==select.value).sort((a,b)=>b.item.offset-a.item.offset);
      for(const {item,select} of edits){if(item.offset+item.word.length>boundary){status.textContent='Hay propuestas que se solapan. Conserva una de ellas.';submit.disabled=true;return;}text=text.slice(0,item.offset)+select.value+text.slice(item.offset+item.word.length);boundary=item.offset;}
      preview.textContent=text;submit.disabled=!tip.isEditable||!edits.length||!current();
    };
    function render(group){
      picks=[];dialog.querySelector('.atlas-spelling-proposals').replaceChildren();
      group.forEach(item=>{
        const label=document.createElement('label'),original=document.createElement('span'),select=document.createElement('select');original.textContent=item.word||'Insertar en posición '+item.offset;select.setAttribute('aria-label','Corrección de '+item.word);
        for(const replacement of [item.word,...new Set(item.replacements.filter(value=>value!==item.word))]){const option=document.createElement('option');option.value=replacement;option.textContent=replacement===item.word?'Conservar: '+item.word:replacement||'Quitar';select.append(option);}
        select.title=item.message||'Propuesta ortográfica';select.addEventListener('change',()=>{status.textContent='';update();});picks.push({item,select});label.append(original,select);dialog.querySelector('.atlas-spelling-proposals').append(label);
      });
      status.textContent=group.length?`${group.length} posibles errores. Se conserva el original hasta que elijas cambios.`:'No se encontraron propuestas en este párrafo.';update();
    }
    async function contextual(){
      submit.disabled=true;status.textContent='Revisando el contexto con LanguageTool…';
      try{const matches=await reviewContext(fragment.text,reviewLanguage);if(current()){rememberContext(doc,fragment,matches,reviewLanguage);render(matches.map(match=>mappedFinding(fragment,match)).filter(item=>item&&!personal.has(normalize(item.word))&&!ignored.has(normalize(item.word))));}}
      catch(error){if(current())status.textContent=error.message;}
    }
    dialog.querySelector('.atlas-spelling-context').hidden=method!=='local';
    dialog.querySelector('.atlas-spelling-context').addEventListener('click',()=>{picks=[];dialog.querySelector('.atlas-spelling-proposals').replaceChildren();contextual();});
    dialog.querySelector('.atlas-spelling-cancel').addEventListener('click',()=>dialog.close());
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();try{
      if(!current())throw Error('El párrafo cambió. Revísalo de nuevo antes de corregir.');
      apply(picks.filter(({item,select})=>item.word!==select.value).map(({item,select})=>({...item,text:select.value})),doc);dialog.close();
    }catch(error){status.textContent=error.message;submit.disabled=true;}});
    dialog.addEventListener('close',()=>{dialog.remove();if(review===dialog)review=null;if(active&&!tip.isDestroyed){check();if(tip.isEditable)tip.commands.focus();}},{once:true});
    closePopup();document.body.append(dialog);dialog.showModal();
    if(method==='local')render(issues.filter(item=>item.paragraph===fragment.paragraph).map(item=>({...item,replacements:suggestionsFor(spell,item.word)})));
    else contextual();
  }
  function showPopup(node){
    if(!spell)return;
    const issue=issues[Number(node.dataset.spellingIndex)];if(!issue||!valid(issue))return;
    if(popup?.dataset.from===String(issue.from))return;
    closePopup();
    const panel=document.createElement('div');popup=panel;panel.className='atlas-spelling-popover';panel.dataset.from=String(issue.from);panel.setAttribute('role','group');panel.setAttribute('aria-label','Sugerencias ortográficas');
    const heading=document.createElement('header');heading.className='atlas-spelling-heading';
    const title=document.createElement('span');title.textContent='Ortografía · '+(language==='es'?'Español':'English');
    const word=document.createElement('strong');word.textContent='«'+issue.word+'»';heading.append(title,word);panel.append(heading);
    const suggestions=document.createElement('div');suggestions.className='atlas-spelling-suggestions';panel.append(suggestions);
    function button(label,handler,parent=panel,edits=false){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',label);b.disabled=edits&&!tip.isEditable;b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{try{handler();}catch(error){window.showToast?.(error.message,'error');closePopup();}});parent.append(b);}
    function render(items,label){
      suggestions.replaceChildren();const caption=document.createElement('div');caption.className='atlas-spelling-section-label';caption.textContent=label;suggestions.append(caption);
      for(const item of items)for(const replacement of item.replacements){button(replacement||'Quitar',()=>{if(!valid(issue))throw Error('El texto cambió. Revisa la palabra de nuevo.');apply([{...item,text:replacement}],scannedDoc);closePopup();},suggestions,true);}
      if(!items.some(item=>item.replacements.length)){const empty=document.createElement('p');empty.textContent='Sin propuestas para esta palabra. Puedes conservarla o agregarla al diccionario.';suggestions.append(empty);}
      if(panel.isConnected)positionPopup();
    }
    const method=getSpellingSettings().method;
    // Local candidates are immediately usable, even during a slow/unavailable
    // contextual check. Never label them as LanguageTool's recommendations.
    render([{...issue,replacements:suggestionsFor(spell,issue.word)}],'Candidatos locales · sin contexto');
    const contextStatus=document.createElement('p');contextStatus.className='atlas-spelling-context-status';contextStatus.setAttribute('role','status');panel.append(contextStatus);
    if(method==='languagetool'){
      contextStatus.textContent='Consultando también el contexto con LanguageTool…';
      const fragment=paragraphFragment(issue),requestedLanguage=language;
      requestTimer=setTimeout(async()=>{
        try{
          const matches=await reviewContext(fragment.text,requestedLanguage);
          if(popup!==panel||!valid(issue)||language!==requestedLanguage)return;
          rememberContext(scannedDoc,fragment,matches,requestedLanguage);
          render(matches.map(match=>mappedFinding(fragment,match)).filter(item=>item&&item.from<issue.to&&item.to>issue.from),'LanguageTool · según el contexto');
          contextStatus.textContent='';
        }catch(error){if(popup===panel&&valid(issue)){contextStatus.textContent=error.message+' Se mantienen los candidatos locales, sin revisión contextual.';positionPopup();}}
      },350);
    }
    const actions=document.createElement('div');actions.className='atlas-spelling-actions';panel.append(actions);
    button('Corregir párrafo…',()=>reviewParagraph(issue),actions);
    button('Agregar al diccionario',()=>{if(!valid(issue))return;personal.add(normalize(issue.word));try{localStorage.setItem('atlas_spelling_dictionary',JSON.stringify([...personal]));}catch{}clearSpellingCache();closePopup();check();},actions);
    button('Ignorar esta palabra',()=>{if(!valid(issue))return;ignored.add(normalize(issue.word));closePopup();check();},actions);
    const select=document.createElement('select');select.setAttribute('aria-label','Idioma del corrector');
    for(const [value,label] of [['es','Español'],['en-US','English']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=language;select.addEventListener('change',()=>setSpellingSettings({language:select.value}));actions.append(select);
    button(method==='local'?'Usar LanguageTool':'Usar revisión local sin conexión',()=>setSpellingSettings({method:method==='local'?'languagetool':'local'}),actions);
    panel.addEventListener('mouseenter',()=>clearTimeout(hoverTimer));
    popupAnchor=node;document.body.append(panel);positionPopup();
  }
  function positionPopup(){
    if(!popup)return;if(!popupAnchor?.isConnected){closePopup();return;}
    const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
    popup.style.maxHeight=Math.max(80,height-16)+'px';popup.style.maxWidth=Math.max(120,width-16)+'px';popup.style.overflowY='auto';
    const rect=popupAnchor.getBoundingClientRect(),box=popup.getBoundingClientRect();
    popup.style.left=Math.max(left+8,Math.min(rect.left,left+width-box.width-8))+'px';
    const y=rect.bottom+box.height+8<top+height?rect.bottom+6:rect.top-box.height-6;
    popup.style.top=Math.max(top+8,Math.min(y,top+height-box.height-8))+'px';
  }
  const plugin=new Plugin({key,
    state:{init:()=>DecorationSet.empty,apply:(tr,old)=>tr.getMeta(key)||(tr.docChanged?DecorationSet.empty:old.map(tr.mapping,tr.doc))},
    props:{decorations:state=>key.getState(state),handleDOMEvents:{
      mouseover:(view,event)=>{
        const node=event.target.closest?.('.atlas-spelling-target');
        clearTimeout(hoverTimer);
        if(node){
          if(!popup)showPopup(node);
          else if(popup.dataset.from!==String(issues[Number(node.dataset.spellingIndex)]?.from))hoverTimer=setTimeout(()=>{if(node.isConnected)showPopup(node);},120);
        }
        return false;
      },
      mouseout:(view,event)=>{const node=event.target.closest?.('.atlas-spelling-target');if(node&&!node.contains(event.relatedTarget))clearTimeout(hoverTimer);return false;},
      click:(view,event)=>{const node=event.target.closest?.('.atlas-spelling-target');if(node)showPopup(node);return false;}
    }},
    view:()=>({update:(view,previous)=>{if(view.state.doc!==previous.doc){closePopup();if(review){review.querySelector('[type="submit"]').disabled=true;review.querySelector('[role="status"]').textContent='El párrafo cambió. Revísalo de nuevo antes de corregir.';}schedule();}else if(review&&!tip.isEditable){review.querySelector('[type="submit"]').disabled=true;}},destroy:()=>{active=false;clearTimeout(timer);closePopup();review?.close();}})
  });
  tip.registerPlugin(plugin);loadDictionary();
  const onKey=event=>{if(event.key==='Escape'&&popup){closePopup();event.stopPropagation();}};
  const dismiss=event=>{if(popup&&!popup.contains(event.target)&&!event.target.closest?.('.atlas-spelling-target'))closePopup();};
  document.addEventListener('keydown',onKey,true);document.addEventListener('pointerdown',dismiss);document.addEventListener('scroll',positionPopup,true);window.addEventListener('resize',positionPopup);window.visualViewport?.addEventListener('resize',positionPopup);window.visualViewport?.addEventListener('scroll',positionPopup);window.addEventListener('atlas-spelling-settings',settingsChanged);
  return {reviewParagraph:()=>{if(!spell){window.showToast?.('El diccionario se está cargando.','info');return;}reviewParagraph();},destroy:()=>{
    active=false;clearTimeout(timer);closePopup();review?.close();document.removeEventListener('keydown',onKey,true);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('scroll',positionPopup,true);window.removeEventListener('resize',positionPopup);window.visualViewport?.removeEventListener('resize',positionPopup);window.visualViewport?.removeEventListener('scroll',positionPopup);window.removeEventListener('atlas-spelling-settings',settingsChanged);if(!tip.isDestroyed)tip.unregisterPlugin(key);
  }};
}
