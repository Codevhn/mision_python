// Semantic clipboard for selections from Atlas's actual PDF.js text layer.
// Coordinates are PDF viewport baselines, independent of CSS calc()/zoom.
const mono = value => /monospace|courier|consolas|menlo/i.test(value || '');
const median = values => [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)/2)];
function appendRun(document, parent, run, text = run.text) {
  let node = document.createTextNode(text);
  if (mono(run.family)) { const code=document.createElement('code');code.append(node);node=code; }
  if (run.bold) { const strong=document.createElement('strong');strong.append(node);node=strong; }
  if (run.italic) { const em=document.createElement('em');em.append(node);node=em; }
  parent.append(node);
}
function lineText(line) { return line.runs.map(run=>run.text).join(''); }
function appendLine(document,parent,line) {
  line.runs.forEach((run,index)=>{
    const previous=line.runs[index-1];
    if(previous&&!/\s$/.test(previous.text)&&!/^\s|^[,.;:!?%)\]}]/u.test(run.text)){
      const gap=run.x-(previous.x+previous.width);
      if(gap>Math.min(previous.size,run.size)*.15)parent.append(document.createTextNode(' '));
    }
    appendRun(document,parent,run);
  });
}
function plain(node) {
  if(node.nodeType===3)return node.textContent;
  if(node.nodeName==='BR')return '\n';
  if(node.nodeName==='PRE')return node.textContent+'\n\n';
  let text=[...node.childNodes].map(plain).join('');
  if(node.nodeName==='LI')text=(node.parentNode.nodeName==='OL'?`${[...node.parentNode.children].indexOf(node)+(Number(node.parentNode.start)||1)}. `:'• ')+text+'\n';
  if(/^(P|H[1-6]|UL|OL)$/.test(node.nodeName))text+='\n\n';
  return text;
}
export function pdfSelectionClipboard(runs, {bodySize} = {}) {
  if(!runs.length||runs.some(run=>!Number.isFinite(run.x)||!Number.isFinite(run.y)||!(run.size>0)))return null;
  const document=globalThis.document.implementation.createHTMLDocument('');
  const lines=[];
  for(const run of runs){
    let line=lines[lines.length-1];
    if(!line||Math.abs(run.y-line.y)>Math.min(line.size,run.size)*.3){
      // Do not reorder columns or rotated/vertical reading flows.
      if(line&&run.y<line.y-run.size*.3)return null;
      line={y:run.y,size:run.size,runs:[]};lines.push(line);
    }
    if(line.runs.length&&run.x<line.runs[line.runs.length-1].x-.5)return null;
    line.runs.push(run);
  }
  const weighted=new Map();for(const run of runs)if(!mono(run.family))weighted.set(run.size,(weighted.get(run.size)||0)+run.text.length);
  const base=bodySize||[...weighted].sort((a,b)=>b[1]-a[1])[0]?.[0]||median(runs.map(run=>run.size));
  const gaps=lines.slice(1).map((line,i)=>line.y-lines[i].y).filter(gap=>gap>0);
  const step=Math.min(gaps.length?median(gaps):base*1.3,base*1.6);
  let paragraph=null,list=null,lastKind=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],text=lineText(line),first=line.runs[0];
    const isMono=value=>value.runs.every(run=>!run.text.trim()||mono(run.family));
    // Consecutive monospaced lines are a displayed example. A monospaced
    // token within a prose baseline remains inline code.
    if(isMono(line)&&(isMono(lines[i+1]||{runs:[{text:'x',family:''}]})||lastKind==='code')){
      let pre=lastKind==='code'?paragraph:null;
      if(!pre){pre=document.createElement('pre');pre.append(document.createElement('code'));document.body.append(pre);paragraph=pre;list=null;}
      const start=i;let end=i+1;
      while(end<lines.length&&isMono(lines[end])&&lines[end].y-lines[end-1].y<=step*2)end++;
      const subset=lines.slice(start,end),left=Math.min(...subset.flatMap(value=>value.runs.map(run=>run.x)));
      const unit=median(subset.flatMap(value=>value.runs.filter(run=>run.text.length&&run.width>0).map(run=>run.width/run.text.length)))||line.size*.6;
      const content=subset.map(value=>' '.repeat(Math.min(120,Math.max(0,Math.round((value.runs[0].x-left)/unit))))+lineText(value)).join('\n');
      pre.firstChild.append(document.createTextNode((pre.textContent?'\n':'')+content));i=end-1;lastKind='code';continue;
    }
    const marker=text.match(/^\s*(?:([•●▪◦\uF0B7])\s*|(\d+)[.)]\s+)/u);
    const large=line.runs.every(run=>!run.text.trim()||run.size>=base*1.2);
    const label=!large&&text.trim().length<85&&/:\s*$/.test(text);
    let kind=marker?'list':large?'heading':label?'label':'prose';
    if(marker){
      const tag=marker[2]?'ol':'ul';if(!list||list.localName!==tag){list=document.createElement(tag);if(marker[2])list.start=Number(marker[2]);document.body.append(list);}
      paragraph=document.createElement('li');list.append(paragraph);
      let remaining=marker[0].length;
      const copied={...line,runs:line.runs.map(run=>{const count=Math.min(remaining,run.text.length);remaining-=count;return {...run,text:run.text.slice(count)};})};
      appendLine(document,paragraph,copied);
    }else{
      const gap=i?line.y-lines[i-1].y:0;
      const continuation=paragraph&&((kind==='prose'&&(lastKind==='prose'||lastKind==='list')&&gap<=step*1.4)||(kind==='heading'&&lastKind==='heading'&&gap<=step*1.8));
      if(continuation){
        const previous=paragraph.textContent;
        if(!/\s$/.test(previous)&&!/^\s|^[,.;:!?%)\]}]/u.test(text))paragraph.append(document.createTextNode(' '));
      }else{paragraph=document.createElement(large?'h2':'p');document.body.append(paragraph);list=null;}
      if(label){const strong=document.createElement('strong');paragraph.append(strong);appendLine(document,strong,line);}
      else appendLine(document,paragraph,line);
      if(continuation&&lastKind==='list')kind='list';
    }
    lastKind=kind;
  }
  return {html:document.body.innerHTML,text:plain(document.body).trim()};
}
