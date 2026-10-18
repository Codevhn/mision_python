import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function exportEntry('),source.indexOf('\nfunction closeExportModal'));
function setup({gate,saveError,httpError}={}){
  const events=[],errors=[],downloads=[];
  const context={currentEntryId:'curso-qa',_autoSaveTimer:1,
    AtlasDatabase:{flush:async()=>{events.push('cells');if(gate)await gate;if(saveError)throw new Error('Borrador conservado');}},
    Properties:{flush:async()=>events.push('properties')},
    _pageSaveQueues:new Map([['curso-qa',{flush:async()=>events.push('body')}]]),
    fetch:async url=>{events.push(url);return {ok:!httpError,status:httpError?503:200,headers:{get:()=> 'attachment; filename="curso-qa.pdf"'},json:async()=>({error:'PDF no disponible'}),blob:async()=>new Blob(['documento guardado'])};},
    URL:{createObjectURL:blob=>{assert(blob.size>0);return 'blob:qa';},revokeObjectURL:()=>{}},
    document:{body:{append:()=>{}},createElement:()=>{const a={click:()=>downloads.push({href:a.href,name:a.download}),remove:()=>{}};return a;}},
    clearTimeout:()=>{},setTimeout:()=>{},_setAutosaveStatus:state=>events.push(state),
    $:()=>({set textContent(message){errors.push(message);},classList:{remove:()=>{}}}),showToast:()=>{}};
  vm.createContext(context);vm.runInContext(code,context);return {context,events,errors,downloads};
}
let release;const deferred=new Promise(resolve=>release=resolve);const s=setup({gate:deferred});
const exporting=s.context.exportEntry('pdf');await Promise.resolve();assert.deepEqual(s.events,['cells']);assert.equal(s.downloads.length,0);
s.context.currentEntryId='otra-pagina';release();assert.equal(await exporting,true);
assert.deepEqual(s.events,['cells','properties','body','/api/export/curso-qa/pdf']);assert.equal(s.downloads[0].name,'curso-qa.pdf');
const failed=setup({saveError:true});assert.equal(await failed.context.exportEntry('pdf'),false);assert.equal(failed.downloads.length,0);assert(!failed.events.some(e=>e.startsWith('/api/')));assert.equal(failed.errors[0],'Borrador conservado');
const server=setup({httpError:true});assert.equal(await server.context.exportEntry('pdf'),false);assert.equal(server.downloads.length,0);assert.equal(server.errors[0],'PDF no disponible');assert(!server.events.includes('error'),'Exporter failure must not claim a failed content save');
console.log('page/course export: waits for drafts, captures source identity, preserves failed saves for retry, reports exporter failures before download');

failed.context.AtlasDatabase.flush=async()=>{};assert.equal(await failed.context.exportEntry('pdf'),true);assert.equal(failed.downloads.length,1,'The retained operation can be retried');
