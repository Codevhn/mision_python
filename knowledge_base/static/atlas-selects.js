/* Shared themed single-selects; native fields retain values, validation and events. */
(() => {
  'use strict';
  const uid=()=>crypto.randomUUID();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Keep native values for forms while rendering a theme-controlled popup.
  let closeSelectPopup=null;
  const selectDescriptions={socratic:'Aprende mediante preguntas y decisiones propias.',guided:'Avanza con explicaciones y propuestas por pasos.',review:'Revisa un diagrama que ya has construido.',automatic:'Obtén una propuesta completa a partir del objetivo.',manual:'Edita libremente y consulta cuando lo necesites.'};
  function mountSelects(root){
    root.querySelectorAll('select:not([data-atlas-mounted]):not([multiple]):not([size])').forEach(select=>{
      select.dataset.atlasMounted='true';
      const wrapper=document.createElement('span');wrapper.className='atlas-select';
      select.before(wrapper);wrapper.append(select);
      select.classList.add('atlas-select-native');select.setAttribute('aria-hidden','true');select.tabIndex=-1;
      const trigger=document.createElement('button');trigger.type='button';trigger.className='atlas-select-trigger';
      trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
      const label=Array.from(select.labels||[]).map(n=>Array.from(n.childNodes).filter(c=>c.nodeType===3).map(c=>c.textContent.trim()).join(' ')).join(' ')||(wrapper.previousElementSibling?.tagName==='LABEL'?wrapper.previousElementSibling.textContent.trim():'')||select.getAttribute('aria-label')||'Elegir opción';
      let signature='';
      const sync=()=>{const next=JSON.stringify([select.selectedOptions[0]?.textContent,select.matches(':disabled'),select.getAttribute('aria-describedby'),select.required]);if(signature===next)return;signature=next;trigger.innerHTML=`<span>${esc(select.selectedOptions[0]?.textContent||'Elegir opción')}</span><span class="atlas-select-arrow" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;trigger.setAttribute('aria-label',label+': '+(select.selectedOptions[0]?.textContent||''));trigger.disabled=select.matches(':disabled'); if(select.getAttribute('aria-describedby'))trigger.setAttribute('aria-describedby',select.getAttribute('aria-describedby')); if(select.required)trigger.setAttribute('aria-required','true');};
      wrapper.append(trigger);sync();select.addEventListener('change',sync);select.addEventListener('input',sync);select._atlasSync=sync;select.addEventListener('invalid',event=>{event.preventDefault();trigger.focus();});select.labels?.forEach(label=>label.addEventListener('click',event=>{if(!event.target.closest('button,input,textarea,a')){event.preventDefault();trigger.focus();}}));
      function open(initial){
        sync();if(trigger.disabled||!select.options.length)return;
        closeSelectPopup?.();
        const popup=document.createElement('div');popup.className='atlas-select-popup';popup.id='atlas-options-'+uid();popup.setAttribute('role','listbox');popup.setAttribute('aria-label',label);popup.tabIndex=-1;
        const items=Array.from(select.options),selected=Math.max(0,select.selectedIndex);const enabled=items.map((o,i)=>!o.disabled&&!o.hidden&&!o.parentElement.disabled?i:-1).filter(i=>i>=0);if(!enabled.length)return;let active=enabled.includes(initial??selected)?(initial??selected):enabled[0],typed='',lastType=0;
        popup.innerHTML=items.map((o,index)=>`<div class="atlas-select-option" id="${popup.id}-${index}" role="option" aria-disabled="${!enabled.includes(index)}" aria-selected="${index===selected}" data-index="${index}"><span class="atlas-select-check" aria-hidden="true">${index===selected?'✓':''}</span><span><span class="atlas-select-label">${esc(o.textContent)}</span>${select.dataset.config==='mode'?`<span class="atlas-select-description">${esc(selectDescriptions[o.value]||'')}</span>`:''}</span></div>`).join('');
        (select.closest('dialog[open]')||document.body).append(popup);trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',popup.id);
        const position=()=>{const r=trigger.getBoundingClientRect(),gap=6,padding=8,below=innerHeight-r.bottom-padding,above=r.top-padding,up=below<Math.min(popup.scrollHeight,260)&&above>below;popup.style.width=Math.min(r.width,innerWidth-padding*2)+'px';popup.style.left=Math.max(padding,Math.min(r.left,innerWidth-r.width-padding))+'px';popup.style.maxHeight=Math.max(80,Math.min(360,up?above-gap:below-gap))+'px';popup.style.top=up?'auto':r.bottom+gap+'px';popup.style.bottom=up?innerHeight-r.top+gap+'px':'auto';};
        const highlight=()=>{popup.querySelectorAll('[role=option]').forEach((n,index)=>n.classList.toggle('atlas-option-active',index===active));popup.setAttribute('aria-activedescendant',popup.id+'-'+active);const row=popup.children[active];if(row){if(row.offsetTop<popup.scrollTop)popup.scrollTop=row.offsetTop;else if(row.offsetTop+row.offsetHeight>popup.scrollTop+popup.clientHeight)popup.scrollTop=row.offsetTop+row.offsetHeight-popup.clientHeight;}};
        const close=(focus=false)=>{popup.remove();trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',position);document.removeEventListener('scroll',scroll,true);observer.disconnect();if(closeSelectPopup===close)closeSelectPopup=null;if(focus&&trigger.isConnected)trigger.focus();};
        const choose=index=>{if(!enabled.includes(index))return;select.selectedIndex=index;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));close(true);};
        const outside=e=>{if(!wrapper.contains(e.target)&&!popup.contains(e.target))close();};
        const scroll=e=>{if(popup.contains(e.target))return;const r=trigger.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)close();else position();};
        const observer=new MutationObserver(records=>{if(records.some(record=>record.target===select||select.contains(record.target))||!select.isConnected||!trigger.getClientRects().length||!!select.closest('.hidden,[hidden]')||select.matches(':disabled'))close();});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','disabled','open']});
        closeSelectPopup=close;position();popup.focus({preventScroll:true});highlight();
        popup.onpointermove=e=>{const row=e.target.closest('[data-index]');if(row&&enabled.includes(Number(row.dataset.index))){active=Number(row.dataset.index);highlight();}};
        popup.onclick=e=>{const row=e.target.closest('[data-index]');if(row)choose(Number(row.dataset.index));};
        popup.onkeydown=e=>{
          if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();active=e.key==='Home'?enabled[0]:e.key==='End'?enabled.at(-1):enabled[(enabled.indexOf(active)+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length];highlight();}
          else if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(active);}
          else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}
          else if(e.key==='Tab'){e.preventDefault();const scope=trigger.closest('.modal,.lib-modal,.assistant-confirm-dialog,.atlas-spelling-review')||document;const fields=[...scope.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(n=>n.tabIndex>=0&&!n.matches(':disabled')&&n.getClientRects().length&&!n.closest('.hidden,[hidden]'));const index=fields.indexOf(trigger);close();fields[(index+(e.shiftKey?-1:1)+fields.length)%fields.length]?.focus();}
          else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){const now=Date.now();typed=now-lastType>700?e.key:typed+e.key;lastType=now;const found=items.findIndex((o,i)=>enabled.includes(i)&&o.textContent.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()));if(found>=0){active=found;highlight();}}
        };
        document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',position);document.addEventListener('scroll',scroll,true);
      }
      trigger.onclick=()=>{if(trigger.getAttribute('aria-expanded')==='true')closeSelectPopup?.(true);else open();};
      trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();open(e.key==='Home'?0:e.key==='End'?select.options.length-1:undefined);}};
    });
  }

  window.mountAtlasSelects=mountSelects;
  window.closeAtlasSelectPopup=()=>closeSelectPopup?.();
  let scheduled=false;
  function refresh(){scheduled=false;document.querySelectorAll('.modal,.lib-modal,.assistant-confirm-dialog,.atlas-spelling-review').forEach(root=>mountSelects(root));document.querySelectorAll('select[data-atlas-mounted]').forEach(select=>select._atlasSync?.());document.querySelectorAll('.modal-header h2,.modal-header > span,.modal-footer > button,.ir-mode-tab').forEach(node=>{if(/^[✨📋]/u.test(node.textContent.trim())&&!node.querySelector('svg'))setAtlasSystemLabel(node,node.textContent.trim());});}
  const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}});
  function start(){refresh();observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','disabled','selected','hidden','open']});document.addEventListener('reset',()=>requestAnimationFrame(refresh));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
