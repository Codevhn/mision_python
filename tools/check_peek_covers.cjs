// Real Atlas cover picker/upload/storage with Board/Gallery previews; disposable fixture only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1697,height:1000},{width:1480,height:924},{width:412,height:915}]){
   const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(10000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
   const database='db_'+'e'.repeat(32),schema={database_id:database,columns:[],views:[{id:'b',name:'Board',type:'board',cardPreview:'cover',cardPreviewProperty:'__page_cover'},{id:'g',name:'Galería',type:'gallery',cardPreview:'cover',cardPreviewProperty:'__page_cover'}],activeView:'b'};
   const parent=(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'ROADMAPS portadas',already_markdown:true,raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'}})).json()).id;
   const endpoint=base+`/api/databases/${parent}/${database}/rows`;
   const row=(await (await context.request.post(endpoint,{data:{title:'Python Profesional 2028'}})).json()).row.id;
   const other=(await (await context.request.post(endpoint,{data:{title:'Otro roadmap'}})).json()).row.id;
   const image=base+'/static/icons/icon-192.png';
   await context.request.patch(base+`/api/entry/${row}/cover`,{data:{cover:`url(${image})`}});
   await context.request.patch(base+`/api/entry/${row}/icon`,{data:{icon:'logos:python'}});
   await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:'Contenido del roadmap.'}});
   const meta=async()=>await (await context.request.get(base+`/api/entry/${row}`)).json();
   await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');await page.evaluate(id=>_loadEntryById(id),parent);
   const card=()=>page.locator('.adb-record-card').filter({hasText:'Python Profesional 2028'}),picker=()=>page.getByRole('dialog',{name:'Elige una portada',exact:true});
   await card().waitFor();await page.waitForFunction(()=>{const img=document.querySelector('.adb-card-cover img');return img?.complete&&img.naturalWidth>0;});
   assert.equal(await card().locator('iconify-icon').getAttribute('icon'),'logos:python','Named card icon is a component, not printed text');
   assert.ok(!(await card().locator('.adb-card-title').innerText()).includes('logos:python'));
   await card().locator('.adb-card-title').click();await page.waitForSelector('#pagePeekEditor:not([inert]) .bn-editor');
   assert.ok((await page.locator('#pagePeekCover').evaluate(n=>getComputedStyle(n).backgroundImage)).includes('icon-192.png'));
   const openPicker=async()=>{await page.locator('#pagePeekCoverChange').click();await picker().waitFor();assert.equal(await picker().getAttribute('data-peek-owner'),row);};
   await openPicker();await picker().locator('#coverPickerGrid .cover-preset-swatch').first().click();await picker().waitFor({state:'detached'});
   assert.ok((await meta()).meta.cover.startsWith('linear-gradient('));
   await card().locator('.adb-card-cover [role="img"]').waitFor();assert.equal(await card().locator('.adb-card-cover img').count(),0,'Gradient does not become a broken image URL');
   // URL and upload tabs are the existing shared picker, not separate controls.
   await openPicker();await picker().getByRole('button',{name:'URL',exact:true}).click();await picker().locator('#coverUrlInput').fill(image);
   await picker().locator('#coverUrlApply').click();await picker().waitFor({state:'detached'});
   await page.waitForFunction(()=>{const img=document.querySelector('.adb-card-cover img');return img?.complete&&img.naturalWidth>0;});
   await openPicker();await picker().getByRole('button',{name:'URL',exact:true}).click();
   await picker().locator('#coverUrlInput').fill(base+'/qa-missing-cover.png');await picker().locator('#coverUrlApply').click();await picker().waitFor({state:'detached'});
   await card().locator('.adb-cover-unavailable').waitFor();assert.equal(await card().locator('.adb-card-cover img').count(),0,'Missing image gets a readable fallback');
   await openPicker();await picker().getByRole('button',{name:'Subir',exact:true}).click();
   await picker().locator('#coverFileInput').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:fs.readFileSync(path.resolve(__dirname,'../knowledge_base/static/icons/icon-192.png'))});
   await picker().locator('#coverUploadApply').click();await picker().waitFor({state:'detached'});
   const uploaded=(await meta()).meta.cover;assert.match(uploaded,/^url\(\/static\/covers\/[a-f0-9]+\.png\)$/);
   await page.waitForFunction(()=>{const img=document.querySelector('.adb-card-cover img');return img?.src.includes('/static/covers/')&&img.complete&&img.naturalWidth>0;});
   // A failed metadata save keeps both the old cover and the picker available.
   await page.route(`**/api/entry/${row}/cover`,route=>route.fulfill({status:503,json:{error:'Fallo simulado'}}));
   await openPicker();await picker().locator('#coverPickerGrid .cover-preset-swatch').first().click();await page.waitForTimeout(200);
   assert.equal(await picker().isVisible(),true);assert.equal((await meta()).meta.cover,uploaded);
   await picker().getByRole('button',{name:'Cancelar',exact:true}).click();await page.unroute(`**/api/entry/${row}/cover`);
   await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});
   await page.getByRole('tab',{name:'Galería',exact:true}).click();await card().waitFor();
   await page.waitForFunction(()=>{const img=document.querySelector('.adb-card-cover img');return img?.src.includes('/static/covers/')&&img.complete&&img.naturalWidth>0;});
   await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'center'}),row);
   assert.ok((await page.locator('#pagePeekCover').evaluate(n=>getComputedStyle(n).backgroundImage)).includes('/static/covers/'));
   await page.locator('#pagePeekCoverRemove').click();await page.waitForFunction(()=>document.getElementById('pagePeekCover').classList.contains('hidden'));
   await page.waitForFunction(()=>!document.querySelector('.adb-card-cover'));assert.equal((await meta()).meta.cover,'');
   // Closing immediately after choosing a cover waits for that cover to save.
   let release,started;const requested=new Promise(r=>started=r),delayed=new Promise(r=>release=r);
   await page.route(`**/api/entry/${row}/cover`,async route=>{started();await delayed;const response=await route.fetch();await route.fulfill({response});});
   await openPicker();await picker().locator('#coverPickerGrid .cover-preset-swatch').first().click();await requested;
   await page.keyboard.press('Escape');await picker().waitFor({state:'detached'});
   await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true);
   release();await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});await page.unroute(`**/api/entry/${row}/cover`);
   assert.ok((await meta()).meta.cover.startsWith('linear-gradient('));
   await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'center'}),row);
   await page.getByRole('button',{name:'Abrir como página completa',exact:true}).click();await page.waitForFunction(id=>currentEntryId===id,row);
   assert.ok((await page.locator('#entryCover').evaluate(n=>getComputedStyle(n).backgroundImage)).includes('linear-gradient('),'Same stored cover works in full-page editor');
   assert.equal((await meta()).markdown.trim(),'Contenido del roadmap.');
   assert.ok(!(await (await context.request.get(base+`/api/entry/${other}`)).json()).meta.cover,'Other records stay unchanged');
   assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: CSS image/gradient, Atlas picker URL/upload, live Board/Gallery, named icons, remove, save failure, immediate close and preserved record text`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
