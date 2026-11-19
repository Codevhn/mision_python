// Real PDF downloads via normal and DB Peek export controls. Disposable server.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
function content(steps=9){return '## Materiales\n\n- Papel y un cuaderno.\n- Un lugar tranquilo para trabajar.\n\n## Pasos de la práctica\n\n'+Array.from({length:steps},(_,i)=>`### Paso ${i+1}\n\n- Marcador${String(i+1).padStart(3,'0')}: Observa el espacio con atención y escribe una idea importante en tu cuaderno. Lee lo escrito con calma y conserva todos los detalles para volver a consultarlos.\n\n`).join('')+'\nÚltimo marcador: FINAL-CONSERVADO.\n';}
const inspect=file=>JSON.parse(execFileSync('/workspace/.venvs/atlas/bin/python',['-c','import sys,json,pymupdf;d=pymupdf.open(sys.argv[1]);print(json.dumps(dict(pages=len(d),text="\\n".join(p.get_text() for p in d))))',file],{encoding:'utf8'}));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,412]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const create=async data=>(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,...data}})).json()).id;
  const body=content(),normal=await create({title:'Práctica breve',raw_text:body});
  const db='db_'+'7'.repeat(32),schema={database_id:db,columns:[],views:[{id:'t',name:'Tabla',type:'table'}],activeView:'t'};
  const parent=await create({title:'Documentos para imprimir',raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'});
  const row=(await (await context.request.post(base+`/api/databases/${parent}/${db}/rows`,{data:{title:'Práctica breve'}})).json()).row.id;
  await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:body}});
  const originals={};for(const key of [normal,row])originals[key]=(await (await context.request.get(base+`/api/entry/${key}`)).json()).markdown;
  await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function');
  const dialog=()=>page.getByRole('dialog',{name:/Exportar (página|registro)/});
  const download=async()=>{const pending=page.waitForEvent('download');await dialog().getByRole('button',{name:'Exportar',exact:true}).click();const file=await pending;assert.ok(file.suggestedFilename().endsWith('.pdf'));return inspect(await file.path());};
  for(const mode of ['normal','peek']){
   if(mode==='normal')await page.evaluate(async id=>{await _loadEntryById(id);openExportModal();},normal);
   else{await page.evaluate(async({parent,row})=>{await _loadEntryById(parent);await _openPagePeek(row,{databasePreview:true});},{parent,row});await page.getByRole('button',{name:'Acciones del registro',exact:true}).click();await page.getByRole('button',{name:'Exportar…',exact:true}).click();}
   assert.equal(await dialog().getByLabel('Ajustar a una hoja').isChecked(),false);
   assert.equal(await dialog().getByLabel('Tamaño del texto del PDF').inputValue(),'10.5');
   const original=await download();assert.equal(original.pages,2);
   await dialog().getByLabel('Ajustar a una hoja').check();assert.equal(await dialog().getByRole('button',{name:'Imprimir página'}).isDisabled(),true);
   const fitted=await download();assert.equal(fitted.pages,1);for(let i=1;i<=9;i++)assert.ok(fitted.text.includes('Marcador'+String(i).padStart(3,'0')));assert.ok(fitted.text.includes('FINAL-CONSERVADO'));
   await dialog().getByRole('status').filter({hasText:'PDF preparado: 1 página'}).waitFor();
   await page.screenshot({path:`/tmp/atlas-pdf-fit-${width}-${mode}.png`});
   await dialog().getByLabel('Ajustar a una hoja').uncheck();await dialog().getByLabel('Tamaño del texto del PDF').selectOption('9');const small=await download();assert.ok(small.text.includes('FINAL-CONSERVADO'));await dialog().getByRole('status').filter({hasText:'texto 9 pt'}).waitFor();
   await dialog().getByRole('button',{name:'Cerrar',exact:true}).click();await dialog().waitFor({state:'detached'});
   assert.equal((await (await context.request.get(base+`/api/entry/${mode==='normal'?normal:row}`)).json()).markdown,originals[mode==='normal'?normal:row]);
   if(mode==='peek')await page.evaluate(()=>_closePagePeek());
  }
  if(width===1440){
   const long=await create({title:'Documento extenso',raw_text:content(80)});await page.evaluate(async id=>{await _loadEntryById(id);openExportModal();},long);
   await dialog().getByLabel('Ajustar a una hoja').check();const downloads=[];page.on('download',file=>downloads.push(file));await dialog().getByRole('button',{name:'Exportar',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'no cabe'}).waitFor();assert.equal(downloads.length,0);
   await dialog().getByLabel('Ajustar a una hoja').uncheck();const full=await download();assert.ok(full.pages>4&&full.text.includes('Marcador080')&&full.text.includes('FINAL-CONSERVADO'));
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: two pages -> one real A4 PDF, content intact, font control, normal/Peek, source unchanged and safe fit failure/retry`);await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
