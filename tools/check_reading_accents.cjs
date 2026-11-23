// Compare the new accents against the actual pre-accent CSS in every theme.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='## Metodología de aprendizaje\n\nTexto habitual para leer con calma.\n\n### Pensamiento lógico\n\n#### Comprobar el resultado\n\n1. **Comprender el problema.** Escribe qué entra y qué sale.\n2. **Predecir antes de ejecutar.** Anticipa el resultado.\n\n- **Descomponer.** Divide el problema en pasos.\n  - **Revisar un paso.** Conserva el contexto.\n\n- [ ] **Comprobar.** Contrasta el resultado.\n\n<!-- color:red -->\n### Un color elegido por el usuario\n\n```python\ndef saludo():\n    return "Hola"\n```';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1440,412]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
 const id=(await(await context.request.post(base+'/api/entry',{data:{entry_type:'knowledge',title:'Jerarquía uv '+width+' '+Date.now(),category:'Pruebas',topic:'Lectura',raw_text:body,already_markdown:true}})).json()).id;
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);await page.goto(base);await page.waitForFunction(()=>typeof setAtlasTheme==='function');await page.evaluate(id=>_loadEntryById(id),id);await page.locator('#entryBody strong').first().waitFor();await page.locator('#entryBody .shiki').first().waitFor();
 const settle=()=>page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(r));await Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})));});
 const sheet=enabled=>page.evaluate(enabled=>{[...document.styleSheets].find(s=>s.href?.includes('/emphasis.css')).disabled=!enabled;},enabled);
 async function snapshot(surface){return page.locator(surface).evaluate(root=>{
  const rgb=color=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
  const get=(node,pseudo)=>getComputedStyle(node,pseudo),color=(node,pseudo)=>rgb(get(node,pseudo).color);
  const bold=root.querySelector('strong'),plain=root.querySelector('[data-content-type=paragraph] .bn-inline-content'),red=root.querySelector('[data-text-color=red] h3');
  const checkbox=root.querySelector('[data-content-type=checkListItem] input');
  const probe=document.createElement('span');probe.style.color='var(--bg-elevated)';document.body.append(probe);const backdrop=color(probe);probe.remove();
  return {heads:['h2','h3','h4'].map(tag=>color(root.querySelector(tag))),bold:color(bold),plain:color(plain),red:color(red),markers:[...root.querySelectorAll('[data-content-type=bulletListItem],[data-content-type=numberedListItem]')].map(node=>color(node,'::before')),checkbox:rgb(get(checkbox).accentColor),code:[...new Set([...root.querySelectorAll('.shiki')].map(node=>get(node).color))],backdrop};
 });}
 const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const themes=await page.evaluate(()=>THEME_CATALOG.map(([id])=>({id,...ATLAS_THEMES[id]})));
 const eligible=t=>t.scheme==='dark'&&(t.palette?.startsWith('atmosphere-')||t.palette==='terracotta'||t.style==='opencode'||t.id.startsWith('language-')||t.id==='aero-silver');
 let changed=0,retained=0;
 for(const theme of themes){
  await page.evaluate(id=>setAtlasTheme(id,true),theme.id);await sheet(false);await settle();const before=await snapshot('#entryBody');await sheet(true);await settle();const after=await snapshot('#entryBody');
  if(eligible(theme)){
   if(['atmosphere-gray','atmosphere-charcoal','atmosphere-black','aero-silver','language-cpp-dark'].includes(theme.id))assert.ok(after.bold[2]-after.bold[0]>=40,theme.id+' visible ice-blue emphasis');
   changed++;assert.notDeepEqual(after.heads,before.heads,theme.id+' headings gain color');assert.notDeepEqual(after.bold,before.bold,theme.id+' bold gains color');assert.notDeepEqual(after.markers,before.markers,theme.id+' markers gain color');assert.notDeepEqual(after.checkbox,before.checkbox,theme.id+' checkbox gains color');
   assert.deepEqual(after.plain,before.plain,theme.id+' prose unchanged');assert.deepEqual(after.red,before.red,theme.id+' custom color preserved');assert.deepEqual(after.code,before.code,theme.id+' syntax preserved');
   for(const color of [...after.heads,after.bold,...after.markers])assert.ok(contrast(color,after.backdrop)>=4.5,theme.id+' readable accent '+JSON.stringify(color));
  }else{retained++;assert.deepEqual(after,before,theme.id+' excluded colors preserved');}
 }
 for(const theme of ['atmosphere-charcoal','atmosphere-rust','atmosphere-forest','editor-dracula','language-python-dark','notion-native','paper']){
  await page.evaluate(id=>setAtlasTheme(id,true),theme);await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);await page.locator('#pagePeekEditor .shiki').first().waitFor();
  await sheet(false);const before=await snapshot('#pagePeekEditor');await sheet(true);const after=await snapshot('#pagePeekEditor');
  if(['notion-native','paper'].includes(theme))assert.deepEqual(after,before,theme+' Peek unchanged');else{assert.notDeepEqual(after.heads,before.heads);assert.notDeepEqual(after.bold,before.bold);assert.deepEqual(after.red,before.red);assert.deepEqual(after.code,before.code);}
  await page.evaluate(()=>_closePagePeek());
 }
 await page.evaluate(()=>{setAtlasTheme('atmosphere-charcoal',true);return AssistantApp.open({focusInput:false});});await page.locator('#assistantInput').fill('Explica uv');await page.locator('#assistantSend').click();await page.locator('.assistant-message-content strong').first().waitFor();
 const bold=page.locator('.assistant-message-content strong').first();await sheet(false);const old=await bold.evaluate(n=>getComputedStyle(n).color);await sheet(true);assert.notEqual(await bold.evaluate(n=>getComputedStyle(n).color),old);
 await page.evaluate(()=>AssistantApp.close());for(const theme of ['atmosphere-charcoal','atmosphere-rust','editor-dracula']){await page.evaluate(id=>setAtlasTheme(id,true),theme);await settle();await page.screenshot({path:`/tmp/atlas-reading-accents-${theme}-${width}.png`});}
 assert.equal((await(await context.request.get(base+'/api/entry/'+id)).json()).markdown,body);assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px: ${changed} adapted themes, ${retained} unchanged; H2/H3/H4, emphasis, all list markers, contrast, custom colors, code, Peek and assistant`);await context.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
