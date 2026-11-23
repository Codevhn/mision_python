// The emphasis scale must survive every palette and each real reading surface.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='1. **Comprender el problema antes de tocar código.** Escribe en lenguaje natural qué entra, qué sale y qué condiciones deben cumplirse.\n\nUn párrafo normal con **énfasis visible** y *cursiva*.\n\n```python\ndef saludo():\n    return "Hola"\n```';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1440,412]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
 const id=(await(await context.request.post(base+'/api/entry',{data:{entry_type:'knowledge',title:'Énfasis uv '+width+' '+Date.now(),category:'Programación',topic:'Python',raw_text:body,already_markdown:true}})).json()).id;
 const original=(await(await context.request.get(base+'/api/entry/'+id)).json()).markdown;
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(base);await page.waitForFunction(()=>typeof setAtlasTheme==='function');await page.evaluate(id=>_loadEntryById(id),id);
 async function weights(surface){return page.locator(surface).evaluate(node=>{const strong=node.querySelector('strong'),plain=strong.closest('.bn-inline-content')||strong.parentElement;return {bold:getComputedStyle(strong).fontWeight,normal:getComputedStyle(plain).fontWeight,boldFamily:getComputedStyle(strong).fontFamily,normalFamily:getComputedStyle(plain).fontFamily};});}
 function assertScale(value,label){assert.equal(value.bold,'700',label+' bold');assert.equal(value.normal,'400',label+' normal');assert.equal(value.boldFamily,value.normalFamily,label+' keeps font family');}
 const themes=await page.evaluate(()=>THEME_CATALOG.map(row=>row[0]));
 for(const theme of themes){
  await page.evaluate(async theme=>{setAtlasTheme(theme,true);await new Promise(resolve=>requestAnimationFrame(resolve));await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})));},theme);
  assertScale(await weights('#entryBody'),theme+' page');
 }
 for(const theme of ['paper','atmosphere-charcoal','atmosphere-rust','aero-night','hyprland']){
  await page.evaluate(theme=>setAtlasTheme(theme,true),theme);
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);await page.locator('#pagePeekEditor strong').first().waitFor();
  assertScale(await weights('#pagePeekEditor'),theme+' Peek');await page.evaluate(()=>_closePagePeek());
  await page.evaluate(()=>enterFocusMode());assertScale(await weights('#entryBody'),theme+' focus');await page.evaluate(()=>exitFocusMode());
 }
 await page.evaluate(()=>{setAtlasTheme('atmosphere-charcoal',true);return AssistantApp.open({focusInput:false});});
 await page.locator('#assistantInput').fill('Explica uv');await page.locator('#assistantSend').click();
 const content=page.locator('.assistant-message-assistant .assistant-message-content').last();await content.locator('strong').waitFor();
 assertScale(await weights('.assistant-message-assistant .assistant-message-content'),'assistant');
 await page.screenshot({path:`/tmp/atlas-emphasis-${width}.png`});
 await page.evaluate(()=>AssistantApp.close());await page.evaluate(()=>switchSpace('finance'));
 const frame=page.frameLocator('#financeFrame');await frame.locator('strong').first().waitFor();assert.equal(await frame.locator('strong').first().evaluate(node=>getComputedStyle(node).fontWeight),'700');
 assert.equal((await(await context.request.get(base+'/api/entry/'+id)).json()).markdown,original);assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px: 400/700 in all ${themes.length} themes, lists/paragraphs, Peek, focus, assistant, finance frame; font family and source preserved`);await context.close();
}
const login=await browser.newPage();await login.goto(base+'/login');assert.equal(await login.locator('h1 strong').evaluate(n=>getComputedStyle(n).fontWeight),'700');await login.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
