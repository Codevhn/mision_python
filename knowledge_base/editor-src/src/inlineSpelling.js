import nspell from 'nspell';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {closeHistory} from '@tiptap/pm/history';
import {wordRanges, suggestionsFor} from './spellingWords.js';

const key=new PluginKey('atlasSpanishSpelling');
let dictionaryPromise;
function dictionary() {
  dictionaryPromise ||= Promise.all(['es','en'].map(async language=>{
    const [aff,dic]=await Promise.all(['aff','dic'].map(async ext=>{
      const response=await fetch('/static/spelling/'+language+'.'+ext);
      if(!response.ok)throw Error('No se pudo cargar el diccionario '+language+'.');
      return response.text();
    }));
    return nspell(aff,dic);
  })).then(([spanish,english])=>({
    correct:word=>spanish.correct(word)||english.correct(word),
    suggest:word=>{const spanishOptions=spanish.suggest(word);return spanishOptions.length?spanishOptions:english.suggest(word);}
  })).catch(error=>{dictionaryPromise=null;throw error;});
  return dictionaryPromise;
}
const known=new Set(['Atlas','OmniRoute','Python','JavaScript','TypeScript','GitHub','CSS','HTML','SQL','API','APIs','BlockNote','DeepSeek','OpenCode','Teamspace','Teamspaces','Markdown','Windows','Linux','Java','Docker']);
const ignored=new Set(),personal=new Set();
for(const storageKey of ['atlas_spelling_dictionary','atlas_spelling_ignored']) {
  try {JSON.parse(localStorage.getItem(storageKey)||'[]').filter(w=>typeof w==='string'&&w.length<100).forEach(w=>personal.add(w.toLocaleLowerCase('es')));}catch{}
}

/* Character positions retain styles and skip code, links and inline atoms. */
function scan(doc,spell) {
  const issues=[];
  doc.descendants((node,pos)=>{
    if(!node.isTextblock)return;
    if(/code/i.test(node.type.name))return false;
    let text='',positions=[],blocked=[];
    node.descendants((child,offset)=>{
      if(child.isText){
        const skip=child.marks.some(mark=>/code|link/i.test(mark.type.name));
        for(let i=0;i<child.text.length;i++){text+=child.text[i];positions.push(pos+1+offset+i);blocked.push(skip);}
      }else if(child.isLeaf){text+=' ';positions.push(pos+1+offset);blocked.push(true);}
    });
    for(const {word,offset}of wordRanges(text)){
      if(word.length<2||word.length>60||known.has(word)||ignored.has(word.toLocaleLowerCase('es'))||personal.has(word.toLocaleLowerCase('es'))||blocked.slice(offset,offset+word.length).some(Boolean)||spell.correct(word))continue;
      issues.push({word,offset,from:positions[offset],to:positions[offset+word.length-1]+1,paragraph:pos,text});
    }
    return false;
  });
  return issues;
}

export function installInlineSpelling(tip) {
  let active=true,timer=null,spell=null,issues=[],scannedDoc=null,popup=null,popupAnchor=null,review=null;
  function closePopup(){popup?.remove();popup=null;popupAnchor=null;}
  function valid(issue){return active&&!tip.isDestroyed&&tip.state.doc===scannedDoc&&tip.state.doc.textBetween(issue.from,issue.to,'')===issue.word;}
  function apply(edits,doc){
    if(!active||tip.isDestroyed||tip.state.doc!==doc)throw Error('El párrafo cambió. Revísalo de nuevo antes de corregir.');
    let tr=closeHistory(tip.state.tr);edits.sort((a,b)=>b.from-a.from).forEach(edit=>{tr=tr.insertText(edit.text,edit.from,edit.to);});
    if(edits.length){tr.setMeta('atlasSpellingApplied',true);tip.view.dispatch(tr);tip.commands.focus();}
  }
  function check(){
    if(!active||!spell||tip.isDestroyed)return;
    scannedDoc=tip.state.doc;issues=scan(scannedDoc,spell);
    const decorations=issues.map((issue,index)=>Decoration.inline(issue.from,issue.to,{
      class:'atlas-spelling-error','data-spelling-index':String(index),'aria-label':'Posible error ortográfico: '+issue.word
    }));
    tip.view.dispatch(tip.state.tr.setMeta(key,DecorationSet.create(scannedDoc,decorations)).setMeta('addToHistory',false));
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(check,450);}
  function reviewParagraph(issue){
    if(!spell)return;
    check();
    const cursor=tip.state.selection.$from;
    const paragraph=issue?.paragraph??(cursor.depth?cursor.before(cursor.depth):null);
    const group=issues.filter(item=>item.paragraph===paragraph);
    if(!group.length){window.showToast?.('No se encontraron errores ortográficos en este párrafo.','success');return;}
    const doc=scannedDoc;
    review?.close();review=document.createElement('dialog');review.className='assistant-confirm-dialog atlas-spelling-review';review.setAttribute('aria-label','Corregir párrafo');
    review.innerHTML='<form><header class="assistant-confirm-header"><h2>Corregir párrafo</h2></header><div class="assistant-confirm-body"><p>Revisa las propuestas. Se aplicarán juntas al pulsar el botón; podrás deshacerlas con Ctrl+Z.</p><div class="atlas-spelling-proposals"></div><p role="status"></p></div><footer class="assistant-confirm-actions"><button type="button">Cancelar</button><button type="submit">Aplicar correcciones</button></footer></form>';
    const picks=[];
    group.forEach(item=>{
      const label=document.createElement('label'),original=document.createElement('span'),select=document.createElement('select');original.textContent=item.word;select.setAttribute('aria-label','Corrección de '+item.word);
      const suggestions=suggestionsFor(spell,item.word);
      for(const replacement of [...suggestions,item.word]){const option=document.createElement('option');option.value=replacement;option.textContent=replacement===item.word?'Conservar: '+item.word:replacement;select.append(option);}
      picks.push({item,select});label.append(original,select);review.querySelector('.atlas-spelling-proposals').append(label);
    });
    const preview=document.createElement('blockquote');preview.className='atlas-spelling-preview';review.querySelector('.atlas-spelling-proposals').after(preview);
    const updatePreview=()=>{let text=group[0].text;for(const {item,select}of [...picks].reverse())text=text.slice(0,item.offset)+select.value+text.slice(item.offset+item.word.length);preview.textContent=text;};
    picks.forEach(({select})=>select.addEventListener('change',updatePreview));updatePreview();
    review.querySelector('button[type="button"]').addEventListener('click',()=>review.close());
    review.querySelector('form').addEventListener('submit',event=>{event.preventDefault();try{
      apply(picks.filter(({item,select})=>item.word!==select.value).map(({item,select})=>({...item,text:select.value})),doc);review.close();
    }catch(error){review.querySelector('[role="status"]').textContent=error.message;}});
    review.addEventListener('close',()=>{review?.remove();review=null;if(active&&!tip.isDestroyed)tip.commands.focus();},{once:true});
    closePopup();document.body.append(review);review.showModal();
  }
  function showPopup(node){
    const issue=issues[Number(node.dataset.spellingIndex)];if(!issue||!valid(issue))return;
    if(popup?.dataset.from===String(issue.from))return;
    closePopup();popup=document.createElement('div');popup.className='atlas-spelling-popover';popup.dataset.from=String(issue.from);popup.setAttribute('role','group');popup.setAttribute('aria-label','Sugerencias ortográficas');
    const heading=document.createElement('header');heading.className='atlas-spelling-heading';
    const title=document.createElement('span');title.textContent='Ortografía';
    const word=document.createElement('strong');word.textContent='«'+issue.word+'»';heading.append(title,word);popup.append(heading);
    const suggestions=document.createElement('div');suggestions.className='atlas-spelling-suggestions';
    const label=document.createElement('div');label.className='atlas-spelling-section-label';label.textContent='Reemplazar por';suggestions.append(label);popup.append(suggestions);
    function button(label,handler,parent=popup){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',label);b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{try{handler();}catch(error){window.showToast?.(error.message,'error');closePopup();}});parent.append(b);}
    const proposals=suggestionsFor(spell,issue.word);
    proposals.forEach(replacement=>button(replacement,()=>{if(!valid(issue))throw Error('El texto cambió. Revisa la palabra de nuevo.');apply([{...issue,text:replacement}],scannedDoc);closePopup();},suggestions));
    if(!proposals.length){const empty=document.createElement('p');empty.textContent='Sin sugerencias. Puedes editar la palabra o ignorarla.';suggestions.append(empty);}
    const actions=document.createElement('div');actions.className='atlas-spelling-actions';popup.append(actions);
    button('Corregir párrafo…',()=>reviewParagraph(issue),actions);
    button('Agregar al diccionario',()=>{if(!valid(issue))throw Error('El texto cambió. Revisa la palabra de nuevo.');personal.add(issue.word.toLocaleLowerCase('es'));try{localStorage.setItem('atlas_spelling_dictionary',JSON.stringify([...personal]));}catch{}closePopup();check();},actions);
    button('Ignorar esta palabra',()=>{if(!valid(issue))throw Error('El texto cambió. Revisa la palabra de nuevo.');ignored.add(issue.word.toLocaleLowerCase('es'));closePopup();check();},actions);
    popupAnchor=node;document.body.append(popup);positionPopup();
  }
  function positionPopup(){
    if(!popup)return;
    if(!popupAnchor?.isConnected){closePopup();return;}
    const rect=popupAnchor.getBoundingClientRect(),box=popup.getBoundingClientRect();
    popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-box.width-8))+'px';
    const top=rect.bottom+box.height+8<innerHeight?rect.bottom+6:rect.top-box.height-6;
    popup.style.top=Math.max(8,Math.min(top,innerHeight-box.height-8))+'px';
  }
  const plugin=new Plugin({key,
    state:{init:()=>DecorationSet.empty,apply:(tr,old)=>tr.getMeta(key)|| (tr.docChanged?DecorationSet.empty:old.map(tr.mapping,tr.doc))},
    props:{decorations:state=>key.getState(state),handleDOMEvents:{
      mouseover:(view,event)=>{const node=event.target.closest?.('.atlas-spelling-error');if(node&&!popup)showPopup(node);return false;},
      click:(view,event)=>{const node=event.target.closest?.('.atlas-spelling-error');if(node)showPopup(node);return false;}
    }},
    view:()=>({update:(view,previous)=>{if(view.state.doc!==previous.doc){closePopup();schedule();}},destroy:()=>{active=false;clearTimeout(timer);closePopup();review?.close();}})
  });
  tip.registerPlugin(plugin);
  dictionary().then(value=>{if(active&&!tip.isDestroyed){spell=value;check();}}).catch(error=>{if(active)window.showToast?.(error.message,'error');});
  const onKey=event=>{if(event.key==='Escape'&&popup){closePopup();event.stopPropagation();}};
  const dismiss=event=>{if(popup&&!popup.contains(event.target)&&!event.target.closest?.('.atlas-spelling-error'))closePopup();};
  document.addEventListener('keydown',onKey,true);document.addEventListener('pointerdown',dismiss);document.addEventListener('scroll',positionPopup,true);window.addEventListener('resize',positionPopup);
  return {reviewParagraph:()=>{if(!spell){window.showToast?.('El diccionario español se está cargando.','info');return;}reviewParagraph();},destroy:()=>{
    active=false;clearTimeout(timer);closePopup();review?.close();document.removeEventListener('keydown',onKey,true);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('scroll',positionPopup,true);window.removeEventListener('resize',positionPopup);if(!tip.isDestroyed)tip.unregisterPlugin(key);
  }};
}
