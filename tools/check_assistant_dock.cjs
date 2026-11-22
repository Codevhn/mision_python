// Real editor/layout against a disposable local fixture, no model requests.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='## Gestión de múltiples JDK con SDKMAN\n\n'+('Contenido de lectura que debe ajustarse al espacio disponible sin quedar detrás del asistente.\n\n').repeat(12)+'### Siguiente paso natural\n\nUna explicación del tema.\n\n```python\nprint("Atlas")\n```';
const profiles=[[1916,'terracotta-dark'],[1916,'paper'],[1916,'aero-amber'],[1916,'hyprland'],[1440,'terracotta-light'],[900,'paper'],[412,'terracotta-dark']];
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const [width,theme] of profiles){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const res=await context.request.post(base+'/api/entry',{data:{title:`Panel asistente ${width} ${theme}`,raw_text:body,already_markdown:true,entry_type:'page'}});assert.ok(res.ok());const id=(await res.json()).id;
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof AssistantApp==='object');await page.evaluate(({theme,id})=>{setAtlasTheme(theme,true);return _loadEntryById(id);},{theme,id});
  await page.locator('#entryBody h2').waitFor();
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));
  const before=await page.locator('#contentArea').boundingBox();
  const verify=async selector=>{
   await page.waitForFunction(selector=>{
    const panel=document.getElementById('assistantArea').getBoundingClientRect(),content=document.querySelector(selector).getBoundingClientRect();
    return document.documentElement.classList.contains('atlas-assistant-stacked')?content.bottom<=panel.top+1:content.right<=panel.left+1;
   },selector);
  };
  const headings=async surface=>{
   const sizes=await page.locator(surface).evaluate(node=>Object.fromEntries(['h2','h3','p'].map(tag=>[tag,parseFloat(getComputedStyle(node.querySelector(tag)).fontSize)])));
   assert.ok(sizes.h2>=sizes.p*1.35&&sizes.h3>=sizes.p*1.12&&sizes.h2>sizes.h3,JSON.stringify(sizes));
  };
  await headings('#entryBody');await page.locator('#contentArea').evaluate(node=>node.scrollTop=200);
  await page.evaluate(()=>AssistantApp.open());await verify('#contentArea');
  if(width>700)assert.ok((await page.locator('#contentArea').boundingBox()).width<before.width);
  else assert.ok((await page.locator('#contentArea').boundingBox()).height<before.height);
  await page.locator('#assistantInput').fill('Borrador que se conserva');
  await page.screenshot({path:`/tmp/atlas-assistant-dock-${theme}-${width}.png`});
  if(await page.locator('#assistantExpand').isVisible()){await page.locator('#assistantExpand').click();await verify('#contentArea');await page.locator('#assistantExpand').click();await verify('#contentArea');}
  await page.locator('#assistantMinimize').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('atlas-assistant-docked')&&!document.documentElement.classList.contains('atlas-assistant-stacked'));
  await page.waitForFunction(before=>{const rect=document.getElementById('contentArea').getBoundingClientRect();return Math.abs(before.width-rect.width)<=1&&Math.abs(before.height-rect.height)<=1;},before);
  // Opening/closing chat beside a Peek must resize that foreground editor too.
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);await page.locator('#pagePeekEditor h2').waitFor();await headings('#pagePeekEditor');
  const peekBefore=await page.locator('#pagePeekOverlay .page-peek-modal').boundingBox();
  await page.evaluate(()=>AssistantApp.open());await verify('#pagePeekOverlay .page-peek-modal');assert.equal(await page.locator('#assistantInput').inputValue(),'Borrador que se conserva');
  await page.locator('#assistantInput').click();assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true);
  await page.screenshot({path:`/tmp/atlas-assistant-dock-peek-${theme}-${width}.png`});
  await page.locator('#assistantClose').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('atlas-assistant-docked')&&!document.documentElement.classList.contains('atlas-assistant-stacked'));
  await page.waitForFunction(before=>{const rect=document.querySelector('#pagePeekOverlay .page-peek-modal').getBoundingClientRect();return Math.abs(before.width-rect.width)<=1&&Math.abs(before.height-rect.height)<=1;},peekBefore);
  await page.evaluate(()=>_closePagePeek());
  assert.equal((await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown,body);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px ${theme}: content reflow, no overlap, expand/minimize/restore, draft/source retained, Peek and H2/H3 hierarchy.`);await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
