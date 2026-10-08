import {mkdir, copyFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url),out=new URL('../static/spelling/',base);
await mkdir(out,{recursive:true});
for(const [input,output] of [['index.aff','es.aff'],['index.dic','es.dic'],['license','LICENSE-es.txt']])
 await copyFile(new URL('node_modules/dictionary-es/'+input,base),new URL(output,out));
await copyFile(new URL('node_modules/nspell/license',base),new URL('LICENSE-nspell.txt',out));
