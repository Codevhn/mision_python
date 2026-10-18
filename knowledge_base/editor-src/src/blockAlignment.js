// Measure the rendered first text fragment, not the block's outer box. Heading
// margins, wrapped text and page fonts make those two anchors very different.
export function firstLineCenter(element) {
  const content=element?.matches?.('.bn-block-content')?element:element?.querySelector?.('.bn-block-content');
  const inline=content?.querySelector('.bn-inline-content')||content||element;
  if(!inline)return null;
  const document=inline.ownerDocument;
  const walker=document.createTreeWalker(inline,4);
  let text;
  while((text=walker.nextNode())) {
    const offset=text.textContent.search(/\S/u);
    if(offset<0)continue;
    const range=document.createRange();
    range.setStart(text,offset);
    range.setEnd(text,Math.min(offset+1,text.length));
    const rect=Array.from(range.getClientRects()).find(r=>r.height>0&&r.width>0);
    if(rect)return rect.top+rect.height/2;
  }
  // Empty paragraphs and non-text blocks still have an editable line/preview.
  const rect=inline.getBoundingClientRect();
  const style=document.defaultView.getComputedStyle(inline);
  const padding=parseFloat(style.paddingTop)||0;
  const line=parseFloat(style.lineHeight)||parseFloat(style.fontSize)||rect.height;
  return rect.top+padding+Math.min(line,Math.max(0,rect.height-padding))/2;
}

export function firstLineAlignment() {
  return {name:'atlasFirstLine',fn(state){
    const reference=state.elements.reference;
    const element=reference.contextElement||reference;
    if(!element?.getBoundingClientRect)return {};
    const center=firstLineCenter(element);
    if(center===null)return {};
    const viewport=element.getBoundingClientRect();
    // Floating UI uses offset-parent coordinates; DOM ranges use viewport
    // coordinates. Account for scale/zoom instead of adding a font-specific px.
    const scale=viewport.height&&state.rects.reference.height?viewport.height/state.rects.reference.height:1;
    return {y:state.rects.reference.y+(center-viewport.top)/scale-state.rects.floating.height/2};
  }};
}
