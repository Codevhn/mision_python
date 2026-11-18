// Recognize positioned PDF text, before source styles are discarded. Ordinary
// HTML paragraphs, tables, lists and code remain authoritative. No vocabulary
// or filename is used to classify a document as a PDF.
import {proseSeparator} from './clipboardProse.js';
const semantic = 'h1,h2,h3,h4,h5,h6,ul,ol,li,table,pre,blockquote,img,video,audio';
const measure = value => {
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)(px|pt|%)$/);
  return match ? {value:Number(match[1]),unit:match[2]} : null;
};
const median = values => [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)/2)];
export function normalizePDFTextLayer(document) {
  // A text layer is a flat collection of absolutely positioned text spans.
  // Never flatten mixed content or guess reading order in multi-column pages.
  const roots = [...document.body.querySelectorAll('div')].reverse();roots.push(document.body);
  for (const root of roots) {
    if (root.querySelector(semantic) || root.closest('pre,code,table,ul,ol,li,blockquote,h1,h2,h3,h4,h5,h6')) continue;
    const spans = [...root.children].filter(node=>node.tagName==='SPAN');
    if (spans.length < 4 || [...root.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())
      || [...root.children].some(node=>!node.matches('span,br'))) continue;
    const items = spans.map(node=>({node,top:measure(node.style.top),left:measure(node.style.left),size:measure(node.style.fontSize)}));
    if (items.some(item=>item.node.style.position!=='absolute'||!item.top||!item.left)
      || new Set(items.map(item=>item.top.unit)).size!==1 || new Set(items.map(item=>item.left.unit)).size!==1) continue;
    // Rotated text and non-monotonic baselines need the producer's reading order.
    if (items.some(item=>item.node.style.transform&&!/^scaleX\([\d.]+\)$/.test(item.node.style.transform))) continue;
    const lines=[];
    for(const item of items){
      const previous=lines[lines.length-1];
      if(previous&&Math.abs(item.top.value-previous.top)<=.1){
        if(item.left.value<previous.items[previous.items.length-1].left.value){lines.length=0;break;}
        previous.items.push(item);
      } else {
        if(previous&&item.top.value<previous.top){lines.length=0;break;}
        lines.push({top:item.top.value,items:[item]});
      }
    }
    if(lines.length<3)continue;
    const proseLines=lines.filter(line=>{const text=line.items.map(item=>item.node.textContent).join(' ');return text.length>=45&&text.trim().split(/\s+/).length>=7;});
    if(proseLines.length<2)continue;
    const gaps=lines.slice(1).map((line,i)=>line.top-lines[i].top);
    const weights=new Map();for(const item of items)if(item.size&&item.size.unit!=='%'){const key=item.size.value+item.size.unit,previous=weights.get(key);weights.set(key,{...item.size,weight:(previous?.weight||0)+item.node.textContent.length});}
    const base=[...weights.values()].sort((a,b)=>b.weight-a.weight)[0];
    const lineGap=base&&base.unit===items[0].top.unit?Math.min(median(gaps),base.value*1.5):median(gaps);
    if(!lineGap)continue;
    const fragment=document.createDocumentFragment();let paragraph=null,list=null,lastHeading=false;
    for(let i=0;i<lines.length;i++){
      const line=lines[i],marker=line.items[0].node.textContent.match(/^\s*(?:([•●▪◦])\s*|(\d+)[.)](?:\s+|$))/u);
      const large=base&&line.items.every(item=>item.size&&item.size.unit===base.unit&&item.size.value>=base.value*1.2);
      if(marker){
        const type=marker[2]?'ol':'ul';if(!list||list.tagName.toLowerCase()!==type){list=document.createElement(type);if(marker[2])list.start=Number(marker[2]);fragment.append(list);}
        paragraph=document.createElement('li');list.append(paragraph);
        // Remove only the actual marker text, preserving the styled contents.
        let remaining=marker[0].length;
        for(const item of line.items.slice(0,1)){const walker=document.createTreeWalker(item.node,4);let node;while(remaining&&(node=walker.nextNode())){const count=Math.min(node.textContent.length,remaining);node.textContent=node.textContent.slice(count);remaining-=count;}}
      }else if(large){if(!lastHeading){paragraph=document.createElement('h2');fragment.append(paragraph);}else paragraph.append(document.createTextNode(' '));list=null;}
      else if(!paragraph||lastHeading||(i&&gaps[i-1]>lineGap*1.4)){
        paragraph=document.createElement('p');fragment.append(paragraph);list=null;
      }else paragraph.append(document.createElement('br'));
      line.items.forEach((item,index)=>{if(index)paragraph.append(document.createTextNode(proseSeparator(line.items[index-1].node.textContent,item.node.textContent)));paragraph.append(item.node);});lastHeading=!!large;
    }
    root.replaceChildren(fragment);
  }
}

export function normalizeInlineTextRuns(document) {
  // Some PDF clipboards encode font runs as block SPANs. Keep those breaks
  // available for contextual reflow instead of losing their meaning with CSS.
  for(const node of [...document.body.querySelectorAll('span,font')]){
    if(node.closest('pre,code')||node.querySelector('p,div,br,table,ul,ol'))continue;
    const display=node.style.display;
    if(display==='block'){
      if(node.previousSibling&&!node.previousSibling?.matches?.('br'))node.before(document.createElement('br'));
      if(node.nextSibling&&!node.nextSibling?.matches?.('br'))node.after(document.createElement('br'));
    }
    const family=node.style.fontFamily||node.getAttribute('face')||'';
    if(/(?:monospace|courier|consolas|menlo|liberation mono)/i.test(family)&&node.textContent.trim()){
      const code=document.createElement('code');code.append(...node.childNodes);node.append(code);
    }
  }
}
