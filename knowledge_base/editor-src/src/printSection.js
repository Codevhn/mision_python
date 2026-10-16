import { blocksToMd } from './markdown.js';

// Folded headings own their children. Ordinary headings own following siblings
// up to the next heading of the same or a higher level, within the same parent.
export function printableSection(document, id) {
  function find(siblings) {
    const index=siblings.findIndex(block=>block.id===id);
    if(index>=0){
      const block=siblings[index];let end=index+1;
      if(block.type==='heading'&&!block.props?.isToggleable){
        while(end<siblings.length && !(siblings[end].type==='heading' && siblings[end].props.level<=block.props.level))end++;
      }
      const title=(block.content||[]).map(run=>run.type==='link'?(run.content||[]).map(r=>r.text||'').join(''):run.text||'').join('').trim();
      return {title:title||'Tema',markdown:blocksToMd(siblings.slice(index,end))};
    }
    for(const block of siblings){const result=find(block.children||[]);if(result)return result;}
    return null;
  }
  return find(document);
}
