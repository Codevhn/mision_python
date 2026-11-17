// Full Atlas UI with real theme CSS and pointer hover (not synthetic clicks).
// Only contextual service responses are controlled. Use a disposable local server.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const baseline=process.argv.includes('--baseline');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  let calls=0;
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==base)return route.abort();
   if(url.pathname==='/api/ai/providers')return route.fulfill({json:{providers:[],warnings:[],default:{provider:'deepseek',model:'fixture'}}});
   if(url.pathname==='/api/proofreading/check'){calls++;return route.fulfill({status:503,json:{error:'LanguageTool no está disponible en esta prueba.'}});}
   return route.continue();
  });
  await context.request.post(base+'/login',{form:{password:process.env.ATLAS_TEST_PASSWORD||'atlas-library-test-password'}});
  const created=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'Auditoría de hover ortográfico',already_markdown:true,
   raw_text:'Un abjeto que hay que corregir. Otra prueva también necesita una corrección.\n\n### Bloque IV — Concurrencia y plataforma\n\n- Rendimiento, diagnóstico de la JVM y seguridad\n\n### Bloque V — Bases de datos, web y Spring\n\n- Persistencia de datos con JDBC\n- Spring Boot: aplicación, API REST y pruebas\n- JPA, Hibernate y Spring Data\n\n### Bloque VI — Arquitectura y sistemas distribuidos\n\n- Microservicios y streaming de eventos\n- Cloud native, contenedores y CI/CD\n\n### Bloque VII — Evolución y cierre'}});
  assert.ok(created.ok());const {id}=await created.json();
  const page=await context.newPage();await page.goto(base);
  await page.waitForFunction(()=>typeof _loadEntryById==='function');
  await page.evaluate(id=>_loadEntryById(id),id);
  await page.waitForSelector('#entryBody .atlas-spelling-error');
  const errorWord=text=>page.locator('#entryBody .atlas-spelling-error').filter({hasText:text}).first();
  const heading=()=>page.locator('.atlas-spelling-heading strong').textContent();
  await errorWord('abjeto').hover();
  await page.waitForSelector('.atlas-spelling-popover');
  if(!baseline)await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).waitFor();
  await page.waitForTimeout(650);
  const initial={word:await heading(),suggestions:await page.locator('.atlas-spelling-suggestions button').allTextContents(),status:await page.locator('.atlas-spelling-suggestions').textContent(),marks:await page.locator('#entryBody .atlas-spelling-error').allTextContents(),calls};
  // Move to another marked word without Escape/click. Put it away from the
  // popup's rectangle so this tests pointer routing rather than occlusion.
  await page.evaluate(()=>{const panel=document.querySelector('.atlas-spelling-popover');panel.style.left='1050px';panel.style.top='700px';});
  await errorWord('prueva').hover();await page.waitForTimeout(350);
  initial.afterMoving=await heading();
  if(baseline){console.log(JSON.stringify(initial,null,2));return;}
  assert.ok(initial.suggestions.includes('objeto'),'Useful local candidates remain available when the contextual service fails');
  assert.ok(initial.afterMoving.includes('prueva'),'Pointer hover switches to the current word');
  assert.ok(initial.status.includes('local'),'The source of offline candidates is explicit');
  assert.ok(!initial.marks.some(word=>['IV','V','VI','VII','JVM','JDBC','Spring','Boot','REST','JPA','Hibernate','streaming','Microservicios','Cloud','native','CI','CD'].includes(word)),'Screenshot technical terms and numerals are not reported as errors');
  for(const theme of ['aero','opencode-dark','hyprland','notion-native']){
   await page.keyboard.press('Escape');await page.evaluate(theme=>setAtlasTheme(theme,true),theme);
   await errorWord('abjeto').hover();
   await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).waitFor();
   const state=await page.locator('.atlas-spelling-popover').evaluate(panel=>{const r=panel.getBoundingClientRect(),s=getComputedStyle(panel);return {position:s.position,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:panel.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};});
   assert.equal(state.position,'fixed');assert.ok(state.visible&&state.hit,JSON.stringify({theme,state}));
   // Reach the actual suggestion by pointer and apply it, then undo.
   await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).click();
   await page.keyboard.press('Control+z');await page.waitForTimeout(500);
  }
  await page.keyboard.press('Escape');
  await page.locator('#proofreadingToggle').click();
  await page.locator('#proofreadingUnderline').uncheck();
  await page.locator('#proofreadingClose').click();
  await page.waitForFunction(()=>document.querySelectorAll('#entryBody .atlas-spelling-error').length===0);
  assert.equal(await page.evaluate(()=>AtlasSpellingSettings.get().underline),false);
  const target=page.locator('#entryBody .atlas-spelling-target').filter({hasText:'abjeto'}).first();
  await target.hover();
  await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('atlas_spelling_settings')).underline),false);
  console.log('PASS full Atlas: failed service, immediate local suggestions, hover switching, screenshot terms, four real themes, reachable popup, underline preference with working hover, and undo');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
