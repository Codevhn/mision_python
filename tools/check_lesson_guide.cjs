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
  await goal.waitFor();
  const [left,right]=await Promise.all([goal.boundingBox(),guide.boundingBox()]);
  if(width>700)assert.ok(right.x>left.x+left.width&&Math.abs(left.y-right.y)<1,'Two aligned columns on desktop');
  else assert.ok(right.y>left.y+left.height,'Stack the fields on mobile');
  assert.equal(await panel.getByRole('button',{name:'Guardar guía',exact:true}).isVisible(),false);
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
  await goal.waitFor();assert.equal(await goal.inputValue(),'Distinguir los entornos para Java.');
  await goal.fill('Borrador pendiente');
  const normal=await (await context.request.post(base+'/api/entry',{data:{title:'Página normal QA',entry_type:'page',raw_text:'Texto'}})).json();
  await page.evaluate(id=>_loadEntryById(id),normal.id);await panel.waitFor({state:'hidden'});
  await page.evaluate(id=>_loadEntryById(id),id);assert.equal(await goal.inputValue(),'Borrador pendiente');
  const save=panel.getByRole('button',{name:'Guardar guía',exact:true});
  await context.route('**/learning-guide',route=>route.fulfill({status:503,json:{error:'Error de prueba; conserva el borrador'}}));
  await save.click();await panel.getByRole('status').filter({hasText:'Error de prueba'}).waitFor();
  assert.equal(await goal.inputValue(),'Borrador pendiente');assert.equal(await save.isDisabled(),false);
  await context.unroute('**/learning-guide');await save.click();await panel.getByRole('status').filter({hasText:'Guía guardada'}).waitFor();
  // A full lesson is generated on explicit action, using all headings, and
  // remains a conversation draft until the replacement is confirmed.
  await page.evaluate(()=>AssistantApp.open({focusInput:false}));
  const originalAnchors=await page.evaluate(()=>_assistantStudySurface().editor.getInsertionTargets().filter(row=>row.type==='heading').map(row=>row.block_id));
  await page.locator('#assistantInput').fill('Pregunta pendiente que no se debe enviar.');
  const requests=[];page.on('request',request=>{
    if(request.method()==='POST'&&/\/api\/assistant\/conversations\/[^/]+\/messages$/.test(new URL(request.url()).pathname))requests.push(request.postDataJSON());
  });
  await panel.getByRole('button',{name:'Desarrollar lección completa',exact:true}).click();
  const apply=page.getByRole('button',{name:'Aplicar borrador a la lección',exact:true});await apply.waitFor();
  assert.equal(requests.length,1);assert.equal(requests[0].lesson_action,'develop');assert.equal(requests[0].selection_context,null);
  assert.equal(requests[0].current_context.lesson_outline.length,3);
  assert.equal(await page.locator('#assistantInput').inputValue(),'Pregunta pendiente que no se debe enviar.');
  assert.equal((await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown,before);
  assert.equal(await page.locator('#assistantDevelopLesson').isVisible(),true);
  await apply.click();await page.locator('dialog[open]').getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal((await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown,before);
  await apply.click();
  const persisted=page.waitForResponse(response=>response.url()===base+`/api/entry/${id}/content`&&response.request().method()==='PATCH'&&response.ok());
  await page.locator('dialog[open]').getByRole('button',{name:'Aplicar a los temas',exact:true}).click();await persisted;
  const applied=await (await context.request.get(base+`/api/entry/${id}`)).json();
  assert.equal(applied.meta.lesson_objective,'Borrador pendiente');
  assert.equal((applied.markdown.match(/Desarrollo conjunto de prueba/g)||[]).length,3,applied.markdown);
  assert.deepEqual(await page.evaluate(()=>_assistantStudySurface().editor.getInsertionTargets().filter(row=>row.type==='heading').map(row=>row.block_id)),originalAnchors,'Retain original heading anchors');
  if(theme==='terracotta-dark'||width===412){
    await page.evaluate(id=>_openPagePeek(id,{mode:'side'}),id);await page.locator('#pagePeekEditor h2').first().waitFor();
    await page.evaluate(()=>AssistantApp.open({focusInput:false}));
    await page.locator('#assistantDevelopLesson').click();
    await page.locator('.assistant-message-assistant').last().getByRole('button',{name:'Aplicar borrador a la lección',exact:true}).waitFor();
    assert.equal(requests.at(-1).current_context.id,id);assert.equal(requests.at(-1).lesson_action,'develop');
    assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true);
    const latest=page.locator('.assistant-message-assistant').last().getByRole('button',{name:'Aplicar borrador a la lección',exact:true});
    await latest.click();
    const peekSaved=page.waitForResponse(response=>response.url()===base+`/api/entry/${id}/content`&&response.request().method()==='PATCH'&&response.ok());
    await page.locator('dialog[open]').getByRole('button',{name:'Aplicar a los temas',exact:true}).click();await peekSaved;
    assert.equal(await page.locator('#pagePeekEditor').getByText('Desarrollo conjunto de prueba para esta lección.',{exact:true}).count(),3);
    await page.evaluate(()=>_closePagePeek());
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px ${theme}: integrated responsive columns, contextual save, reload, draft/navigation/error recovery, document preserved.`);
  await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
