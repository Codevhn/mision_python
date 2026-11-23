// Destructive actions run only against disposable local entries.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1440,412]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
 const create=async(title,extra={})=>(await(await context.request.post(base+'/api/entry',{data:{entry_type:'knowledge',title:title+' '+width+' '+Date.now(),category:'Programación',topic:'Pruebas',raw_text:'CONTENIDO CONSERVADO',already_markdown:true,...extra}})).json()).id;
 const keep=await create('Conservar'),target=await create('Eliminar desde sidebar'),child=await create('Hija',{entry_type:'page',parent_id:target});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function');await page.evaluate(async id=>{switchSpace('knowledge');await loadTree();await _loadEntryById(id);},keep);
 const originalTitle=await page.locator('#inlineTitle').innerText();
 async function menu(id){
  if(width<700&&!await page.locator('#sidebar').evaluate(n=>n.classList.contains('mobile-open')))await page.locator('#sidebarToggle').click();
  await page.evaluate(id=>{const node=document.querySelector('#tree .tree-entry[data-id="'+id+'"]');for(let n=node.parentElement;n&&n.id!=='tree';n=n.parentElement){if(n.matches('.tree-category,.tree-topic'))n.classList.add('open');}},id);
  await page.locator(`#tree [data-id="${id}"] .tree-page-menu-btn`).click();
  const menu=page.locator('.course-actions-menu');assert.deepEqual(await menu.locator('button').allTextContents(),['Renombrar','⇄ Mover a…','Eliminar']);
  assert.ok(await menu.evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  await menu.locator('[data-action=delete]').click();await page.locator('#confirmOverlay:not(.hidden)').waitFor();
 }
 await menu(target);assert.ok((await page.locator('#confirmMsg').innerText()).includes('subpáginas'));await page.locator('#confirmCancel').click();
 assert.equal((await context.request.get(base+'/api/entry/'+target)).status(),200);
 await menu(target);await page.locator('#confirmOk').click();await page.waitForFunction(id=>!document.querySelector('#tree .tree-entry[data-id="'+id+'"]'),target);
 assert.equal((await context.request.get(base+'/api/entry/'+target)).status(),404);assert.equal((await context.request.get(base+'/api/entry/'+child)).status(),404);
 assert.equal(await page.locator('#inlineTitle').innerText(),originalTitle);assert.equal(await page.locator('#entryView').isVisible(),true);
 await menu(keep);await page.locator('#confirmOk').click();await page.locator('#entryView').waitFor({state:'hidden'});assert.equal((await context.request.get(base+'/api/entry/'+keep)).status(),404);
 assert.equal(await page.evaluate(()=>currentEntryId),null);
 // The existing header action still accepts a MouseEvent; a server rejection
 // leaves the open editor and entry intact.
 const fail=await create('Conservar si falla');await page.evaluate(id=>_loadEntryById(id),fail);
 await page.route('**/api/entry/'+fail,route=>route.request().method()==='DELETE'?route.fulfill({status:500,contentType:'application/json',body:'{"error":"Fallo de prueba al eliminar"}'}):route.continue());
 await page.evaluate(()=>document.getElementById('deleteBtn').click());await page.locator('#confirmOk').click();
 await page.getByText('Fallo de prueba al eliminar',{exact:true}).waitFor();assert.equal(await page.locator('#entryView').isVisible(),true);assert.equal((await context.request.get(base+'/api/entry/'+fail)).status(),200);
 assert.deepEqual(errors,[]);console.log(`PASS ${width}px: sidebar Delete, cancel, correct inactive target, descendants, active-page cleanup, existing header and failure preservation`);await context.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
