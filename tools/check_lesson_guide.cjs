// Disposable local fixture only; no real courses or model calls.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8132';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {for(const [width,theme] of [[1440,'terracotta-dark'],[1440,'paper'],[412,'terracotta-light']]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const course=(await (await context.request.post(base+'/api/courses',{data:{label:`Guía QA ${width} ${theme}`}})).json()).id;
  const created=await context.request.post(base+'/api/courses/entry',{data:{course,module:'Introducción',title:'1.4 Entornos de desarrollo integrados',raw_text:'## IntelliJ IDEA\n\n## Eclipse IDE\n\n## Visual Studio Code con extensiones Java'}});
  assert.ok(created.ok());const id=(await created.json()).id;
  const before=(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown;
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function');
  await page.evaluate(({id,theme})=>{setAtlasTheme(theme,true);return _loadEntryById(id);},{id,theme});
  const panel=page.locator('#lessonGuide'),goal=panel.getByLabel('Objetivo de la lección'),guide=panel.getByLabel('Orientación del desarrollo');
  await goal.fill('Distinguir los entornos para Java.');await guide.fill('Explicar funciones comunes una sola vez.');
  await panel.getByRole('button',{name:'Guardar guía',exact:true}).click();await panel.getByRole('status').filter({hasText:'Guía guardada'}).waitFor();
  const after=await (await context.request.get(base+`/api/entry/${id}`)).json();
  assert.equal(after.markdown,before);assert.equal(after.meta.lesson_objective,'Distinguir los entornos para Java.');
  assert.equal(await page.locator('#entryBody').getByText('Distinguir los entornos para Java.').count(),0);
  assert.ok(await panel.evaluate(node=>!node.closest('#entryBody')));
  assert.ok(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await page.screenshot({path:`/tmp/atlas-lesson-guide-${theme}-${width}.png`});
  await page.reload();await page.waitForFunction(()=>typeof _loadEntryById==='function');await page.evaluate(id=>_loadEntryById(id),id);
  await panel.locator('summary').waitFor();assert.equal(await panel.locator('details').evaluate(e=>e.open),false);
  await panel.locator('summary').click();assert.equal(await goal.inputValue(),'Distinguir los entornos para Java.');
  await goal.fill('Borrador pendiente');
  const normal=await (await context.request.post(base+'/api/entry',{data:{title:'Página normal QA',entry_type:'page',raw_text:'Texto'}})).json();
  await page.evaluate(id=>_loadEntryById(id),normal.id);await panel.waitFor({state:'hidden'});
  await page.evaluate(id=>_loadEntryById(id),id);assert.equal(await goal.inputValue(),'Borrador pendiente');
  const save=panel.getByRole('button',{name:'Guardar guía',exact:true});
  await context.route('**/learning-guide',route=>route.fulfill({status:503,json:{error:'Error de prueba; conserva el borrador'}}));
  await save.click();await panel.getByRole('status').filter({hasText:'Error de prueba'}).waitFor();
  assert.equal(await goal.inputValue(),'Borrador pendiente');assert.equal(await save.isDisabled(),false);
  await context.unroute('**/learning-guide');await save.click();await panel.getByRole('status').filter({hasText:'Guía guardada'}).waitFor();
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px ${theme}: separate fields, save/reload, compact panel, draft/navigation/error recovery, document preserved.`);
  await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
