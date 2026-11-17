// Build profiling-only assets outside the repository. Production sources and
// shipped bundles are never rewritten by this diagnostic tool.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../knowledge_base/editor-src/package.json',import.meta.url));
const {build}=await import(require.resolve('vite'));
const root=fileURLToPath(new URL('../knowledge_base/editor-src/',import.meta.url));
const targets={
 '/inlineSpelling.js':['scan','check','positionPopup','showPopup','closePopup','fragmentFor'],
 '/spellingWords.js':['suggestionsFor'],
 '/markdown.js':['blocksToMd'],
 '/databaseIdentity.js':['duplicateIdentityRepairs'],
};
await build({root,configFile:root+'vite.config.js',plugins:[{name:'atlas-scroll-audit',enforce:'pre',transform(source,id){
 if(!id.startsWith(root+'src/'))return null;
 let changed=false;
 for(const [suffix,names] of Object.entries(targets))if(id.endsWith(suffix))for(const name of names){
  const pattern=new RegExp(`(export )?function ${name}\\(`);
  if(!pattern.test(source))throw Error('Missing audit target '+name);
  source=source.replace(pattern,(match,prefix)=>`${prefix||''}function ${name}(...args){return window.__atlasPerf.measure(${JSON.stringify(name)},()=>__audit_${name}(...args));}\nfunction __audit_${name}(`);
  changed=true;
 }
 return changed?{code:source,map:null}:null;
}}],build:{outDir:process.env.ATLAS_AUDIT_ASSETS||'/tmp/atlas-scroll-audit-assets',emptyOutDir:true,sourcemap:true}});
