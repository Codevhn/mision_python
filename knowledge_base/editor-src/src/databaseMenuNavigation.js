// Dialog menus also contain forms. Preserve native text/select navigation.
export function focusMenuItem(root,label) {
  const controls=[...(root?.querySelectorAll('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)')||[])];
  const target=label&&controls.find(el=>(el.getAttribute('aria-label')||el.textContent).trim()===label);
  (target||controls[0]||root)?.focus({preventScroll:true});
}
export function menuKeyDown(event,{onBack,onClose}={}) {
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
  const {key,target,currentTarget:root}=event;
  if(key==='Escape') {event.preventDefault();(onBack||onClose)?.();return;}
  const editing=target?.matches?.('input,textarea,select,[contenteditable="true"]');
  if(editing&&(key!=='ArrowDown'||target.tagName==='SELECT'||target.tagName==='TEXTAREA'||(target.tagName==='INPUT'&&!['text','search','email','url','tel','password'].includes(target.type))))return;
  if(key==='ArrowLeft'&&onBack){event.preventDefault();onBack();return;}
  if(key==='ArrowRight'&&target?.dataset?.menuSubmenu){event.preventDefault();target.click();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(key))return;
  const actions=[...root.querySelectorAll('button:not(:disabled),[role="switch"]:not(:disabled)')]
    .filter(el=>!el.hidden&&el.getAttribute('aria-hidden')!=='true'&&el.getClientRects().length);
  if(!actions.length)return;
  const index=actions.indexOf(target);
  const next=key==='Home'?0:key==='End'?actions.length-1:
    key==='ArrowDown'?(index+1)%actions.length:(index-1+actions.length)%actions.length;
  event.preventDefault();actions[next].focus({preventScroll:true});actions[next].scrollIntoView({block:'nearest'});
}
