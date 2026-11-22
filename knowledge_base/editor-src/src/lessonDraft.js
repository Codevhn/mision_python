import {inlineText} from './courseTopicTables.js';

// Match the lesson's existing section anchors before changing any block.
// Generated headings are delimiters; the original heading blocks stay intact.
export function lessonDraftBlocks(original, generated){
  const text=block=>inlineText(block.content||[]).trim();
  const key=block=>text(block).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase();
  const headings=original.filter(block=>block.type==='heading');
  if(!headings.length)throw Error('La lección necesita encabezados para distribuir las explicaciones.');
  const level=Math.min(...headings.map(block=>block.props?.level||1));
  const anchors=original.filter(block=>block.type==='heading'&&(block.props?.level||1)===level);
  const names=anchors.map(key);
  if(new Set(names).size!==names.length||anchors.some(block=>block.children?.length))throw Error('Los encabezados deben ser únicos y no tener contenido anidado para aplicar la lección completa.');
  const matches=generated.flatMap((block,index)=>block.type==='heading'&&names.includes(key(block))?[{block,index,name:key(block)}]:[]);
  if(matches.length!==anchors.length||matches.some((row,index)=>row.name!==names[index]))throw Error('El borrador no coincide con todos los encabezados y su orden. Pide al asistente conservarlos exactamente.');
  const meaningful=block=>block.type!=='paragraph'||text(block)||block.children?.length;
  if(generated.slice(0,matches[0].index).some(meaningful))throw Error('El borrador debe empezar por el primer tema para distribuirlo sin perder contenido.');
  const sections=matches.map((row,index)=>{
    const body=generated.slice(row.index+1,matches[index+1]?.index??generated.length);
    if(!body.some(meaningful))throw Error('El borrador contiene un tema sin desarrollar.');
    if(body.some(block=>block.type==='heading'&&(block.props?.level||1)<=(row.block.props?.level||1)))throw Error('El borrador contiene encabezados que no corresponden a la lección.');
    return body;
  });
  const start=original.indexOf(anchors[0]);
  return [...original.slice(0,start),...anchors.flatMap((anchor,index)=>[anchor,...sections[index]])];
}
