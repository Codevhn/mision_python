// Real editor/layout checks against a disposable local fixture only.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8140';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='## Comprender el problema\n\n'+Array.from({length:28},(_,i)=>`Párrafo ${i+1}. Leer con calma, formular una hipótesis y comprobar el resultado permite avanzar sin perder el contexto. `.repeat(3)).join('\n\n')+'\n\n```python\n# Un ejemplo\ndef saludo(nombre):\n    return "Hola " + nombre\n```\n\n## Último tema\n\nFINAL-CONSERVADO';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const width of [1440,412]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
 const course=(await(await context.request.post(base+'/api/courses',{data:{label:'Curso focus '+width+' '+Date.now()}})).json()).id;
 const create=async title=>(await(await context.request.post(base+'/api/courses/entry',{data:{course,module:'Módulo 1',title,raw_text:body}})).json()).id;
 const first=await create('1.1 Una lectura sin distracciones'),second=await create('1.2 La siguiente lección');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(base);await page.waitForFunction(()=>typeof enterFocusMode==='function');await page.evaluate(async({course,id})=>{sessionStorage.setItem('activeSpace','courses');_activeCourseSlug=course;_coursesTreeData=await(await fetch('/api/courses/tree')).json();await openCourseLesson(id);window.__focusEditorNode=document.querySelector('#entryBody .bn-editor');},{course,id:first});
 const before=(await(await context.request.get(base+`/api/entry/${first}`)).json()).markdown;
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 const rect=selector=>page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
 for(const theme of ['atmosphere-charcoal','atmosphere-rust','paper','aero-night','hyprland']){
  await page.evaluate(id=>setAtlasTheme(id,true),theme);await settle();
  // Enter through the actual menu, not only the public function.
  await page.locator('#ctxMore').click();await page.locator('#cmFocus').click();await settle();
  assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('focus-mode')),true);
  for(const id of ['activityBar','sidebar','topbar','ctxBar','entryCover'])assert.equal(await page.locator('#'+id).isVisible(),false,id+' hidden');
  const area=await rect('#contentArea'),toolbar=await rect('#focusToolbar');
  assert.ok(Math.abs(area.left)<1&&Math.abs(area.right-width)<1,JSON.stringify({theme,width,area}));
  assert.ok(area.top<1&&area.bottom<=901);assert.ok(toolbar.left>=area.left&&toolbar.right<=area.right+1);
  assert.ok((await rect('#entryBody')).width>width*.8);
  assert.ok((await rect('#inlineTitle')).top>=toolbar.bottom);
  assert.equal(await page.locator('#focusExit').evaluate(n=>n===document.activeElement),true);
  assert.equal(await page.locator('.lesson-guide-panel').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.__focusEditorNode===document.querySelector('#entryBody .bn-editor')),true,'Focus reuses the same editor');
  const nav=await rect('#courseNavBar');assert.ok(nav.left>=area.left&&nav.right<=area.right+1);
  assert.equal(await page.locator('#focusTitle').innerText(),'1.1 Una lectura sin distracciones');
  const prose=page.locator('#entryBody .bn-editor > .bn-block-group > .bn-block-outer').nth(2);
  assert.ok((await prose.boundingBox()).width<=881);
  assert.ok(Math.abs((await rect('#inlineTitle')).left-(await prose.boundingBox()).x)<2,'Title and prose share the reading column');
  if(width<600)assert.equal(await page.locator('#entryBody [data-content-type=paragraph] > .bn-inline-content').first().evaluate(n=>getComputedStyle(n).textAlign),'start');
  // A paragraph stays at the same reading position across both transitions.
  await page.evaluate(()=>exitFocusMode());await settle();
  const anchor=page.locator('#entryBody .bn-editor > .bn-block-group > .bn-block-outer').nth(8);
  await anchor.evaluate(n=>{const area=document.getElementById('contentArea');area.scrollTop+=n.getBoundingClientRect().top-area.getBoundingClientRect().top-110;});
  const tracked=await page.evaluateHandle(()=>_focusReadingPosition().anchor);
  const relative=()=>tracked.evaluate(n=>{const area=document.getElementById('contentArea'),bar=document.getElementById('focusToolbar');return n.getBoundingClientRect().top-area.getBoundingClientRect().top-(bar.hidden?12:bar.offsetHeight+12);});
  const original=await relative();await page.evaluate(()=>enterFocusMode());await settle();assert.ok(Math.abs(await relative()-original)<4,`enter preserves first visible paragraph offset: ${original} -> ${await relative()}`);
  const focused=await relative();await page.getByRole('button',{name:/Salir de focus/}).click();await settle();assert.ok(Math.abs(await relative()-focused)<4,'exit preserves paragraph offset');
  await page.evaluate(()=>{document.getElementById('contentArea').scrollTop=0;enterFocusMode();});await settle();
  await page.screenshot({path:`/tmp/atlas-focus-${theme}-${width}.png`});
  await page.evaluate(()=>exitFocusMode());await settle();
 }
 // Focus + assistant get separate columns or rows, and an unobscured toolbar.
 await page.evaluate(()=>{enterFocusMode();return AssistantApp.open({focusInput:false});});await page.waitForFunction(()=>document.documentElement.classList.contains('atlas-assistant-docked')||document.documentElement.classList.contains('atlas-assistant-stacked'));await settle();
 const area=await rect('#contentArea'),assistant=await rect('#assistantArea');
 assert.ok(width>700?area.right<=assistant.left+1:area.bottom<=assistant.top+1,JSON.stringify({area,assistant}));
 assert.ok((await rect('#focusToolbar')).right<=area.right+1);
 await page.evaluate(()=>AssistantApp.close());await settle();
 // Escape belongs to a code dropdown before it exits reading mode.
 await page.locator('#entryBody .code-block-lang-btn').click();await page.locator('.code-block-lang-menu').waitFor();
 await page.keyboard.press('Escape');await page.locator('.code-block-lang-menu').waitFor({state:'detached'});await settle();assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('focus-mode')),true);
 await page.locator('#focusExit').focus();await page.keyboard.press('Escape');await settle();assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('focus-mode')),false);
 // Moving between lessons keeps focus and updates its title; going Home exits.
 await page.evaluate(()=>enterFocusMode());await page.locator('#courseNavBar .course-nav-next').click();await page.waitForFunction(id=>_getAssistantVisibleContext()?.id===id,second);await settle();
 assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('focus-mode')),true);
 assert.equal(await page.locator('#focusTitle').innerText(),'1.2 La siguiente lección');
 await page.evaluate(()=>switchSpace('home'));await settle();assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('focus-mode')),false);
 assert.equal(await page.locator('#focusToolbar').isVisible(),false);
 assert.equal((await(await context.request.get(base+`/api/entry/${first}`)).json()).markdown,before);
 assert.deepEqual(errors,[]);console.log(`PASS focus ${width}px: five themes, cover/navigation hidden, reading width, scroll anchors, assistant, Escape, lesson changes and source preservation`);await context.close();
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
