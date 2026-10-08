import {mkdir, copyFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url),out=new URL('../static/spelling/',base);
await mkdir(out,{recursive:true});
for(const language of ['es','en'])
 for(const [input,output] of [['index.aff',language+'.aff'],['index.dic',language+'.dic'],['license','LICENSE-'+language+'.txt']])
  await copyFile(new URL('node_modules/dictionary-'+language+'/'+input,base),new URL(output,out));
await copyFile(new URL('node_modules/nspell/license',base),new URL('LICENSE-nspell.txt',out));
