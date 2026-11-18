export const inlineText=items=>(items||[]).map(item=>item.type==='link'?inlineText(item.content):item.text||'').join('');
const cellItems=cell=>Array.isArray(cell)?cell:cell?.content||[];
const headerKey=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function courseTopics(blocks){
  const result=[];let module='';
  const visit=items=>{for(const block of items){
    if(block.type==='heading')module=inlineText(block.content);
    if(block.type==='table'){
      const rows=block.content?.rows||[],column=(rows[0]?.cells||[]).findIndex(cell=>['leccion','tema','subtema','topic'].includes(headerKey(inlineText(cellItems(cell)))));
      if(column>=0)rows.slice(1).forEach((row,i)=>{
        const content=cellItems(row.cells[column]),text=inlineText(content).trim();
        if(text&&!/^(subtotal|total)\b/i.test(text))result.push({key:`${block.id}:${i+1}:${column}`,blockId:block.id,row:i+1,column,text,module,href:content.find(item=>item.type==='link')?.href||null});
      });
    }
    visit(block.children||[]);
  }};visit(blocks);return result;
}
function unlinked(items){return items.flatMap(item=>item.type==='link'?unlinked(item.content):[item]);}
export function linkedTopicTables(blocks,assignments){
  const changes=new Map(),targets=new Map(assignments.map(item=>[item.key,item.href]));
  for(const topic of courseTopics(blocks))if(targets.has(topic.key)){
    let content=changes.get(topic.blockId);
    if(!content){
      const find=items=>{for(const block of items){if(block.id===topic.blockId)return block;const nested=find(block.children||[]);if(nested)return nested;}};
      const table=find(blocks);content={...table.content,rows:table.content.rows.map(row=>({...row,cells:row.cells.map(cell=>Array.isArray(cell)?[...cell]:{...cell,content:[...(cell.content||[])]})}))};changes.set(topic.blockId,content);
    }
    const cell=content.rows[topic.row].cells[topic.column],text=unlinked(cellItems(cell)),href=targets.get(topic.key);
    const value=href?[{type:'link',href,content:text}]:text;
    content.rows[topic.row].cells[topic.column]=Array.isArray(cell)?value:{...cell,content:value};
  }
  return [...changes].map(([id,content])=>({id,content}));
}
