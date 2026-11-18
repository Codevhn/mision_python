// Atlas page covers are CSS backgrounds; file properties are image URLs.
export function pageCover(value,title=''){
  if(typeof value!=='string'||!value.trim())return null;
  const cover=value.trim(),alt='Portada de '+title;
  const wrapped=cover.match(/^url\(\s*(?:"([\s\S]*)"|'([\s\S]*)'|([\s\S]*?))\s*\)$/i);
  if(wrapped){const url=(wrapped[1]??wrapped[2]??wrapped[3]).trim();return url?{url,alt}:null;}
  if(/^(?:(?:repeating-)?(?:linear|radial|conic)-gradient\(|#|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\()/i.test(cover)||/^[a-z]+$/i.test(cover))return {background:cover,alt};
  return {url:cover,alt};
}
export function cardCover(row,view){
  const selected=view.cardPreviewProperty;
  if(selected==='__page_cover')return pageCover(row.cover,row.title);
  if(!selected&&row.cover)return pageCover(row.cover,row.title);
  const files=(row.properties||[]).filter(p=>p.type==='files'&&(!selected||p.id===selected)).flatMap(p=>Array.isArray(p.value)?p.value:[]);
  const file=files.find(f=>/\.(png|jpe?g|webp|gif)$/i.test(f.name||'')&&(typeof f.url==='string'||/^[a-f0-9]{32}$/.test(f.id||'')));
  return file?{url:/^[a-f0-9]{32}$/.test(file.id||'')?'/api/databases/files/'+file.id:file.url,alt:file.name}:null;
}
export const listRowHeight=view=>({compact:30,normal:38,comfortable:48})[view.listDensity]||38;
