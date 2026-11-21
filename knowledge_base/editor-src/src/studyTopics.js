import {inlineText} from './courseTopicTables.js';

// Empty sections are observable editing state, not a claim about mastery.
// Read native blocks so fenced code and generated subheadings cannot become
// candidates. No model call, document mutation or title-to-URL guessing.
export function studyTopics(blocks){
  const rows=[];
  const visit=items=>{for(const block of items||[]){rows.push(block);visit(block.children);}};
  visit(blocks);
  return rows.flatMap((block,index)=>{
    const text=Array.isArray(block.content)?inlineText(block.content).trim():'';
    if(block.type!=='heading'||!text)return [];
    const level=block.props?.level||1;
    let pending=true;
    for(let i=index+1;i<rows.length;i++){
      const next=rows[i];
      if(next.type==='heading'&&(next.props?.level||1)<=level)break;
      if(next.type==='heading'||next.type==='divider')continue;
      if(Array.isArray(next.content)?inlineText(next.content).trim():next.content || !['paragraph'].includes(next.type)){pending=false;break;}
    }
    return [{block_id:block.id,text,type:'heading',level,pending}];
  });
}

export function nextStudyTopic(topics,selection){
  if(!selection?.text)return null;
  let index=selection.block_id?topics.findIndex(topic=>topic.block_id===selection.block_id):-1;
  const key=value=>value.replace(/\s+/g,' ').trim();
  if(index>=0&&key(topics[index].text)!==key(selection.text))return null;
  if(index<0){
    if(selection.block_id)return null; // Deleted anchors must never move silently.
    const matches=topics.map((topic,i)=>key(topic.text)===key(selection.text)?i:-1).filter(i=>i>=0);
    if(matches.length!==1)return null;
    index=matches[0];
  }
  const level=topics[index].level;
  for(const topic of topics.slice(index+1)){
    if(topic.level<level)break;
    if(topic.level===level&&topic.pending)return topic;
  }
  return null;
}
