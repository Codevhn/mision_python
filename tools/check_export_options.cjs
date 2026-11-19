// End-to-end export options against the disposable Atlas fixture only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
function pdfText(file){return execFileSync('/workspace/.venvs/atlas/bin/python',['-c','import sys,pymupdf; d=pymupdf.open(sys.argv[1]);print("\\n".join(p.get_text() for p in d))',file],{encoding:'utf8'});}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,900,412]){
  const context=await browser.newContext({viewport:{width,height:1100},acceptDownloads:true});
  await context.addInitScript(()=>{window.print=()=>{window.didPrint=true;};});
  const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base||route.request().url()==='about:blank'?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const create=async data=>(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,...data}})).json()).id;
  const database='db_'+'6'.repeat(32),schema={database_id:database,columns:[{id:'s',name:'Estado',type:'text'}],views:[{id:'t',name:'Tabla',type:'table'}],activeView:'t'};
  const parent=await create({title:'DB exportación '+width,raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'});
  const endpoint=`/api/databases/${parent}/${database}`;
  const row=(await (await context.request.post(base+endpoint+'/rows',{data:{title:'Documento exportable',values:{s:'Pendiente'}}})).json()).row.id;
  const body='# Documento exportable\n\nContenido para exportar.\n\n| Material | Cantidad |\n|---|---|\n| Papel | 2 |';
  await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:body}});
  await create({title:'Hija exportable',parent_id:row,raw_text:'Contenido hija.'});
  const ordinary=await create({title:'Página independiente',raw_text:'## Encabezado\n\nContenido independiente.'});
  await context.request.patch(base+`/api/entry/${ordinary}/properties`,{data:{properties:[{id:'s',name:'Estado',type:'text',value:'Pendiente'}]}});
  await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');await page.evaluate(id=>_loadEntryById(id),parent);
  const exportDialog=()=>page.getByRole('dialog',{name:/Exportar (registro|página)/});
  const download=async()=>{const pending=page.waitForEvent('download');await exportDialog().getByRole('button',{name:'Exportar',exact:true}).click();const file=await pending;assert.equal(await file.failure(),null);return {name:file.suggestedFilename(),path:await file.path()};};
  const close=async()=>{await exportDialog().getByRole('button',{name:/^(Cerrar|Cancelar)$/}).click();await exportDialog().waitFor({state:'detached'});};
  const inspectDefaults=async()=>{
   assert.equal(await exportDialog().getByLabel('Formato de exportación').inputValue(),'pdf');
   assert.equal(await exportDialog().getByLabel('Incluir propiedades de la página').isChecked(),false);
   assert.equal(await exportDialog().getByLabel('Descargar como ZIP').isChecked(),false);
   assert.equal(await exportDialog().getByLabel('Incluir subpáginas').isDisabled(),true);
  };
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),row);
  await page.getByRole('button',{name:'Acciones del registro',exact:true}).click();await page.getByRole('button',{name:'Exportar…',exact:true}).click();await inspectDefaults();
  const first=await download();assert.ok(first.name.endsWith('.pdf'));assert.ok(fs.readFileSync(first.path).subarray(0,4).equals(Buffer.from('%PDF')));const clean=pdfText(first.path);assert.ok(clean.includes('Contenido para exportar')&&clean.includes('Papel'));assert.ok(!clean.includes('Estado'));assert.equal(clean.split('Documento exportable').length-1,1);
  await exportDialog().getByLabel('Incluir propiedades de la página').check();const withProps=await download();assert.ok(pdfText(withProps.path).includes('Estado'));
  await exportDialog().getByLabel('Incluir propiedades de la página').uncheck();await exportDialog().getByLabel('Descargar como ZIP').check();await exportDialog().getByLabel('Incluir subpáginas').check();const packed=await download();assert.ok(packed.name.endsWith('.zip'));
  const manifest=JSON.parse(execFileSync('/workspace/.venvs/atlas/bin/python',['-c','import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.read("manifest.json").decode())',packed.path],{encoding:'utf8'}));assert.equal(manifest.pages.length,2);assert.equal(manifest.options.include_properties,false);
  await exportDialog().getByLabel('Descargar como ZIP').uncheck();assert.equal(await exportDialog().getByLabel('Incluir subpáginas').isChecked(),false);
  const popupPromise=page.waitForEvent('popup');await exportDialog().getByRole('button',{name:'Imprimir página'}).click();const popup=await popupPromise;await popup.waitForFunction(()=>window.didPrint===true);assert.ok(!(await popup.locator('body').innerText()).includes('Estado'));assert.ok((await popup.locator('body').innerText()).includes('Papel'));await popup.close();
  await page.screenshot({path:`/tmp/atlas-export-options-${width}.png`});await close();
  // The record opened as a normal entry uses the same options, source and PDF.
  await page.evaluate(async id=>{await _closePagePeek();await _loadEntryById(id);openExportModal();},row);await inspectDefaults();const full=await download();assert.ok(!pdfText(full.path).includes('Estado'));await close();
  await page.evaluate(async id=>{await _loadEntryById(id);openExportModal();},ordinary);await inspectDefaults();
  const regular=await download();assert.ok(pdfText(regular.path).includes('Contenido independiente'));assert.ok(!pdfText(regular.path).includes('Estado'));
  await exportDialog().getByLabel('Formato de exportación').selectOption('html');await exportDialog().getByLabel('Incluir propiedades de la página').check();const regularHTML=await download();assert.ok(regularHTML.name.endsWith('.html'));assert.ok(fs.readFileSync(regularHTML.path,'utf8').includes('Estado'));await close();
  // A failed source save must not start a download or an export request.
  await page.evaluate(()=>{window.realFlush=AtlasDatabase.flush;AtlasDatabase.flush=async()=>{throw Error('Borrador pendiente de guardar');};openExportModal();});
  let attempted=false;const listener=request=>{if(request.url().endsWith('/document'))attempted=true;};page.on('request',listener);
  await exportDialog().getByRole('button',{name:'Exportar',exact:true}).click();await exportDialog().getByRole('alert').filter({hasText:'Borrador pendiente de guardar'}).waitFor();assert.equal(attempted,false);page.off('request',listener);
  await page.evaluate(()=>{AtlasDatabase.flush=window.realFlush;});const retry=await download();assert.ok(retry.name.endsWith('.pdf'));await close();
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: Peek/full-record/ordinary page defaults, real PDF and ZIP, opt-in properties, body tables, print popup, title, source-save failure/retry`);await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
