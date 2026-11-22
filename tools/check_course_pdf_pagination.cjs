// Disposable fixture only; verify the actual dialog, PDF range and download.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8135';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,412]){
   const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
   await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
   const course=(await (await context.request.post(base+'/api/courses',{data:{label:'Curso paginación '+width}})).json()).id;
   const create=async(title,raw_text)=>(await (await context.request.post(base+'/api/courses/entry',{data:{course,module:'Módulo 1',title,raw_text}})).json()).id;
   const first=await create('1.1 Primera','Contenido de la primera lección.');
   const second=await create('1.2 Segunda','## Concepto\n\nContenido de la segunda lección.');
   const counted=await context.request.post(base+`/api/export/${first}/document`,{data:{format:'pdf'}});
   assert.equal(counted.status(),200);const count=Number(counted.headers()['x-atlas-pdf-pages']);
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function');
   await page.evaluate(async id=>{await _loadEntryById(id);openExportModal();},second);
   const dialog=page.getByRole('dialog',{name:'Exportar página'});
   await dialog.getByText(/Numeración continua según/).waitFor();
   const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Exportar',exact:true}).click();
   const file=await pending;assert.equal(await file.failure(),null);
   const notice=dialog.getByRole('status');await notice.waitFor();
   assert.ok((await notice.innerText()).includes(`numeración ${count+1}–${count+1}`));
   assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),true);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: continuous numbering help, PDF download and actual page range`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
