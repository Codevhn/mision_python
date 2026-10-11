/* Theme-controlled calendars with native form values and validation. */
(() => {
  'use strict';
  let closeCalendar = null;
  const pad = n => String(n).padStart(2,'0');
  const today = () => {const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const months = Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('es',{month:'long'}).format(new Date(2024,i,1)));
  function mount(root) {
    root.querySelectorAll('input:is([type=month],[type=date]):not([data-atlas-date])').forEach(input=>{
      input.dataset.atlasDate='true';
      const label=[...input.labels].map(n=>[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent.trim()).join(' ')).join(' ')||'Fecha';
      const wrapper=document.createElement('span');wrapper.className='atlas-date';input.before(wrapper);wrapper.append(input);input.classList.add('atlas-date-native');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
      const trigger=document.createElement('button');trigger.type='button';trigger.className='atlas-date-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');wrapper.append(trigger);
      let signature='';
      const sync=()=>{const next=JSON.stringify([input.value,input.disabled]);if(next===signature)return;signature=next;const [y,m,d]=input.value.split('-').map(Number);const text=y&&m?(input.type==='month'?`${months[m-1]} ${y}`:`${d} de ${months[m-1]} de ${y}`):'Elegir fecha';trigger.replaceChildren();const value=document.createElement('span');value.textContent=text;const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 20 20');icon.setAttribute('aria-hidden','true');icon.innerHTML='<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M6 2v4m8-4v4M3 8h14m-11 4h2m3 0h2"/>';trigger.append(value,icon);trigger.setAttribute('aria-label',`${label}: ${text}`);trigger.disabled=input.disabled;};
      input._atlasDateSync=sync;sync();if(input.required)trigger.setAttribute('aria-required','true');if(document.activeElement===input)trigger.focus({preventScroll:true});input.addEventListener('change',sync);input.addEventListener('input',sync);input.addEventListener('invalid',e=>{e.preventDefault();trigger.focus();});
      input.labels.forEach(n=>n.addEventListener('click',e=>{if(!e.target.closest('button,input,a')){e.preventDefault();trigger.focus();}}));
      function open(){
        if(input.disabled)return;window.closeAtlasSelectPopup?.();closeCalendar?.();
        const isMonth=input.type==='month',initial=(input.value||today()).split('-').map(Number);let year=initial[0],month=initial[1]-1;
        const popup=document.createElement('div');popup.className='atlas-calendar';popup.id='atlas-calendar-'+crypto.randomUUID();popup.setAttribute('role','dialog');popup.setAttribute('aria-label',isMonth?'Elegir mes':'Elegir fecha');
        (input.closest('dialog[open]')||document.body).append(popup);if(typeof popup.showPopover==='function'){popup.popover='manual';popup.showPopover();}
        trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',popup.id);
        const position=()=>{const r=trigger.getBoundingClientRect(),width=Math.min(300,innerWidth-16),height=popup.getBoundingClientRect().height,below=innerHeight-r.bottom-8,up=below<height+6&&r.top>below;popup.style.width=width+'px';popup.style.left=Math.max(8,Math.min(r.left,innerWidth-width-8))+'px';popup.style.top=up?Math.max(8,r.top-height-6)+'px':Math.min(r.bottom+6,Math.max(8,innerHeight-height-8))+'px';popup.style.maxHeight=Math.max(80,innerHeight-16)+'px';};
        const close=(focus=false)=>{popup.remove();trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',position);observer.disconnect();if(closeCalendar===close)closeCalendar=null;if(focus&&trigger.isConnected)trigger.focus();};
        const choose=value=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close(true);};
        const button=(text,action,aria)=>{const b=document.createElement('button');b.type='button';b.textContent=text;if(aria)b.setAttribute('aria-label',aria);b.addEventListener('click',action);return b;};
        function render(focusIndex){
          popup.replaceChildren();const head=document.createElement('header');head.className='atlas-calendar-head';
          const change=delta=>{if(isMonth)year+=delta;else{month+=delta;if(month<0){month=11;year--;}if(month>11){month=0;year++;}}year=Math.max(1,Math.min(9999,year));render();};
          const heading=document.createElement('strong');heading.textContent=isMonth?String(year):`${months[month]} ${year}`;
          head.append(button('‹',()=>change(-1),isMonth?'Año anterior':'Mes anterior'),heading,button('›',()=>change(1),isMonth?'Año siguiente':'Mes siguiente'));
          const grid=document.createElement('div');grid.className='atlas-calendar-grid '+(isMonth?'calendar-months':'calendar-days');
          if(!isMonth){['L','M','X','J','V','S','D'].forEach(day=>{const s=document.createElement('span');s.className='calendar-weekday';s.textContent=day;grid.append(s);});const first=new Date(0);first.setFullYear(year,month,1);const offset=(first.getDay()+6)%7;for(let i=0;i<offset;i++){const s=document.createElement('span');s.setAttribute('aria-hidden','true');grid.append(s);}}
          const last=new Date(0);last.setFullYear(year,month+1,0);const count=isMonth?12:last.getDate();
          for(let i=0;i<count;i++){const value=isMonth?`${String(year).padStart(4,'0')}-${pad(i+1)}`:`${String(year).padStart(4,'0')}-${pad(month+1)}-${pad(i+1)}`;const b=button(isMonth?months[i].slice(0,3):String(i+1),()=>choose(value),isMonth?`${months[i]} ${year}`:`${i+1} de ${months[month]} de ${year}`);b.dataset.calendarValue=value;b.setAttribute('aria-pressed',String(value===input.value));b.disabled=Boolean((input.min&&value<input.min)||(input.max&&value>input.max));grid.append(b);}
          const current=button(isMonth?'Este mes':'Hoy',()=>choose(isMonth?today().slice(0,7):today()));current.className='calendar-today';
          popup.append(head,grid,current);position();const options=[...grid.querySelectorAll('button:not(:disabled)')];(options[focusIndex]||options.find(b=>b.getAttribute('aria-pressed')==='true')||options[0])?.focus({preventScroll:true});
        }
        const outside=e=>{if(!wrapper.contains(e.target)&&!popup.contains(e.target))close();};
        const scroll=e=>{if(!popup.contains(e.target))position();};
        const observer=new MutationObserver(()=>{if(!input.isConnected||input.disabled||!trigger.getClientRects().length)close();});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','disabled','class']});
        popup.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)&&e.target.dataset.calendarValue){e.preventDefault();const options=[...popup.querySelectorAll('[data-calendar-value]:not(:disabled)')],index=options.indexOf(e.target),delta=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='ArrowUp'?-(isMonth?3:7):(isMonth?3:7);const next=e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,index+delta));options[next]?.focus();}else if(e.key==='Tab'){close();trigger.focus();}});
        closeCalendar=close;render();document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',position);
      }
      trigger.addEventListener('click',()=>{if(trigger.getAttribute('aria-expanded')==='true')closeCalendar?.(true);else open();});trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}});
    });
  }
  window.mountAtlasDates=mount;
  window.closeAtlasDatePopup=()=>closeCalendar?.();
  let scheduled=false;function refresh(){scheduled=false;document.querySelectorAll('.finance-filters,.transaction-dialog').forEach(mount);document.querySelectorAll('[data-atlas-date]').forEach(input=>input._atlasDateSync?.());}
  function start(){refresh();new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','disabled','value']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
