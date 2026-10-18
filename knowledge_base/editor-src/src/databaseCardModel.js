export function cardCover(row,view){
  const selected=view.cardPreviewProperty;
  if(selected==='__page_cover')return row.cover?{url:row.cover,alt:'Portada de '+row.title}:null;
  if(!selected&&row.cover)return {url:row.cover,alt:'Portada de '+row.title};
  const files=(row.properties||[]).filter(p=>p.type==='files'&&(!selected||p.id===selected)).flatMap(p=>Array.isArray(p.value)?p.value:[]);
  const file=files.find(f=>/\.(png|jpe?g|webp|gif)$/i.test(f.name||'')&&(typeof f.url==='string'||/^[a-f0-9]{32}$/.test(f.id||'')));
  return file?{url:/^[a-f0-9]{32}$/.test(file.id||'')?'/api/databases/files/'+file.id:file.url,alt:file.name}:null;
}
export const listRowHeight=view=>({compact:30,normal:38,comfortable:48})[view.listDensity]||38;
