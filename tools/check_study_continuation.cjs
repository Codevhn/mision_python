// Local fixture only: real editor, assistant routes and simulated model output.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='## Ruff\n\nContenido existente.\n\n### Detalle interno\n\n## Mypy\n\nYa desarrollado.\n\n## Automatización pre-commit y hooks\n\n## Configuración de IDE';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,412])for(const mode of ['page','peek']){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>localStorage.setItem('kb_theme','paper'));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/ai/providers')return route.fulfill({json:{default:{provider:'deepseek',model:'deepseek-v4-pro'},providers:[{id:'deepseek',name:'QA',models:[{id:'deepseek-v4-pro',label:'Modelo de prueba'}]}],warnings:[]}});
   return route.continue();
  });
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const create=async(title,raw_text)=>(await (await context.request.post(base+'/api/entry',{data:{title,raw_text,already_markdown:true,entry_type:'page'}})).json()).id;
  const id=await create(`Temario ${mode} ${width}`,body),other=await create('Otra página '+mode+width,'## Otro concepto');
  const page=await context.newPage(),errors=[],requests=[];page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&/\/api\/assistant\/conversations\/[^/]+\/messages$/.test(r.url()))requests.push(r.postDataJSON());});
  await page.goto(base);await page.waitForFunction(()=>typeof AssistantApp==='object');await page.evaluate(id=>_loadEntryById(id),mode==='peek'?other:id);
  if(mode==='peek')await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);
  const surface=mode==='peek'?'#pagePeekEditor':'#entryBody';await page.locator(surface+' h2').first().waitFor();
  await page.evaluate(()=>AssistantApp.askSelection('Ruff','explain'));
  const card=page.getByRole('region',{name:'Siguiente subtema pendiente'});
  // A named section is exposed as a region; no automatic second model call.
  await card.waitFor();assert.equal(requests.length,1);assert.equal(requests[0].current_context.id,id);assert.ok((await card.innerText()).includes('Automatización pre-commit y hooks'));
  assert.ok(!(await card.innerText()).includes('Detalle interno'));assert.ok(!(await card.innerText()).includes('Mypy'));
  assert.ok(!(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown.includes('Desarrollo de prueba'));
  await page.locator('#assistantInput').fill('Borrador propio');await card.getByRole('button',{name:'Desarrollar siguiente tema'}).click();assert.equal(requests.length,1);assert.equal(await page.locator('#assistantInput').inputValue(),'Borrador propio');await page.locator('#assistantInput').fill('');
  await card.getByRole('button',{name:'Desarrollar siguiente tema'}).click();await page.locator('#assistantSend:not([disabled])').waitFor();await card.filter({hasText:'Configuración de IDE'}).waitFor();
  assert.equal(requests.length,2);assert.equal(requests[1].selection_context.text,'Automatización pre-commit y hooks');assert.equal(requests[1].selection_action,'explain');assert.equal(requests[1].current_context.id,id);assert.ok(requests[1].selection_context.block_id);
  await page.locator('.assistant-insert-explanation').last().click();await page.locator(surface).getByText('Desarrollo de prueba del subtema seleccionado.',{exact:true}).waitFor();
  await page.waitForFunction(()=>{const card=document.querySelector('.assistant-study-next'),transcript=document.getElementById('assistantTranscript');return card&&card.getBoundingClientRect().bottom<=transcript.getBoundingClientRect().bottom+1;});
  await page.screenshot({path:`/tmp/atlas-study-${mode}-${width}.png`});
  // Moving away invalidates the old action before any request is sent.
  if(mode==='peek')await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),other);else await page.evaluate(id=>_loadEntryById(id),other);
  await card.getByRole('button',{name:'Desarrollar siguiente tema'}).click();assert.equal(requests.length,2);assert.equal(await card.count(),0);
  if(mode==='peek')await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);else await page.evaluate(id=>_loadEntryById(id),id);
  await page.evaluate(()=>AssistantApp.askSelection('Configuración de IDE','explain'));assert.equal(requests.length,3);assert.equal(await card.count(),0,'End of the current outline has no invented next topic');
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px ${mode}: live pending siblings, no automatic generation/insertion, preserved draft, next-topic request with source ID, insertion and navigation safety.`);await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
