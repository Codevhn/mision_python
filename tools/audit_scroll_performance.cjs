// Performance audit on a disposable, full Atlas instance. No production data.
// Build optional profiling assets with tools/build_scroll_audit.mjs first.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const instrumented=!process.argv.includes('--production');
const quick=process.argv.includes('--quick');
const sizes=(process.env.ATLAS_AUDIT_SIZES||'80,800').split(',').map(Number);
const themes=(process.env.ATLAS_AUDIT_THEMES||(quick?'opencode-dark':'opencode-dark,hyprland')).split(',');
const modes=(process.env.ATLAS_AUDIT_MODES||'off,closed,popup,no-underlines').split(',');
const repeats=Number(process.env.ATLAS_AUDIT_REPEATS||2);
const output=process.env.ATLAS_AUDIT_OUTPUT||'/tmp/atlas-scroll-audit.json';
const percentile=(values,fraction)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*fraction))]||0;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{
  const data={calls:{},frames:[],longTasks:[],measuring:false,saves:0};
  data.measure=(name,callback)=>{const start=performance.now();try{return callback();}finally{const duration=performance.now()-start;const record=data.calls[name]||(data.calls[name]={count:0,totalMs:0,maxMs:0});record.count++;record.totalMs+=duration;record.maxMs=Math.max(record.maxMs,duration);}};
  window.__atlasPerf=data;
  new PerformanceObserver(list=>{if(data.measuring)for(const item of list.getEntries())data.longTasks.push({start:item.startTime,duration:item.duration});}).observe({type:'longtask',buffered:false});
 });
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if((instrumented||process.env.ATLAS_AUDIT_BUNDLE)&&url.pathname==='/static/blocknote/editor.bundle.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(instrumented?path.join(process.env.ATLAS_AUDIT_ASSETS||'/tmp/atlas-scroll-audit-assets','editor.bundle.js'):process.env.ATLAS_AUDIT_BUNDLE)});
  if(url.pathname==='/api/ai/providers')return route.fulfill({json:{providers:[],warnings:[],default:{provider:'deepseek',model:'fixture'}}});
  if(url.pathname==='/api/proofreading/check')return route.fulfill({json:{matches:[],mode:'languagetool',language:'es'}});
  return route.continue();
 });
 await context.request.post(base+'/login',{form:{password:process.env.ATLAS_TEST_PASSWORD||'atlas-library-test-password'}});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function');
 await page.evaluate(()=>{
  const create=BlockEditor.create;BlockEditor.create=options=>{window.__lastEditorOptions=options;return create(options);};
  AtlasSpellingSettings.set({language:'es',method:'local',underline:true});
 });
 const created=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'Medición temporal de desplazamiento',already_markdown:true,raw_text:'Documento de control.'}});
 assert.ok(created.ok());const {id}=await created.json();await page.evaluate(id=>_loadEntryById(id),id);await page.waitForSelector('#entryBody .bn-editor');
 const client=await context.newCDPSession(page);await client.send('Performance.enable');
 const metrics=async()=>Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 for(const paragraphs of sizes){
  const markdown=Array.from({length:paragraphs},(_,i)=>`${i%12===0?'### Planificación del curso y contenido técnico\n\n':''}El abjeto de esta lección sirve para estudiar programación y revisar un bufffer de trabajo. Los ejercicios permiten comprobar conceptos y preparar una prueba con ejemplos claros. La lectura mantiene una estructura de párrafos, listas y encabezados para organizar el material del curso. Kafka conecta servicios y el core del sistema procesa eventos. Se incluyen notas de planificación, prácticas de programación y observaciones para estudiar con atención. Tema ${i+1}.`).join('\n\n');
  for(const theme of themes)for(let iteration=0;iteration<repeats;iteration++){
   const ordered=iteration%2?[...modes].reverse():modes;
   for(const mode of ordered){
    await page.evaluate(({markdown,theme,mode})=>{
     _inlineEditor?.destroy();
     AtlasSpellingSettings.set({language:'es',method:mode==='context-close'?'languagetool':'local',underline:mode!=='no-underlines'});
     setAtlasTheme(theme,true);
     document.getElementById('audit-no-blur')?.remove();
     if(mode==='popup-no-blur'){const style=document.createElement('style');style.id='audit-no-blur';style.textContent='*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';document.head.append(style);}
     __atlasPerf.calls={};__atlasPerf.saves=0;
     _inlineEditor=BlockEditor.create({container:document.getElementById('entryBody'),onChange:()=>{__atlasPerf.saves++;}});
     _inlineEditor.load(markdown);
    },{markdown,theme,mode});
    await page.waitForFunction(()=>document.querySelectorAll('#entryBody .bn-block-content').length>10);
    await page.waitForSelector('#entryBody .atlas-spelling-target');
    await page.waitForTimeout(600);
    const startup=await page.evaluate(()=>({calls:__atlasPerf.calls,blocks:document.querySelectorAll('#entryBody .bn-block-content').length,marks:document.querySelectorAll('#entryBody .atlas-spelling-error').length,targets:document.querySelectorAll('#entryBody .atlas-spelling-target').length,domNodes:document.querySelectorAll('*').length}));
    await page.evaluate(mode=>{
     const tip=document.querySelector('#entryBody .bn-editor').editor;
     if(mode==='off'){tip.unregisterPlugin('atlasSpelling');if(tip.state.plugins.some(plugin=>plugin.key.startsWith('atlasSpelling')))throw Error('Spelling plugin still installed');}
     document.querySelector('#contentArea').scrollTop=0;
    },mode);
    await page.mouse.move(12,980);await page.waitForTimeout(250);
    if(['popup','popup-no-blur','context-close','escape-local'].includes(mode)){
     await page.locator('#entryBody .atlas-spelling-target').filter({hasText:'abjeto'}).first().hover();
     await page.locator('.atlas-spelling-popover').waitFor();
     if(mode==='context-close')await page.locator('.atlas-spelling-section-label').filter({hasText:'LanguageTool'}).waitFor();
    }
    await client.send('HeapProfiler.collectGarbage');
    const before=await metrics();
    const start=await page.evaluate(()=>{
     const data=__atlasPerf;data.calls={};data.frames=[];data.longTasks=[];data.saves=0;data.measuring=true;
     let previous=performance.now();const sample=time=>{if(!data.measuring)return;data.frames.push(time-previous);previous=time;requestAnimationFrame(sample);};requestAnimationFrame(sample);
     const scroll=document.querySelector('#contentArea'),r=scroll.getBoundingClientRect();return {top:scroll.scrollTop,x:r.left+12,y:Math.max(r.top+100,Math.min(innerHeight-100,r.top+r.height*.5))};
    });
    if(mode==='context-close'||mode==='escape-local')await page.keyboard.press('Escape');
    await client.send('Input.synthesizeScrollGesture',{x:start.x,y:start.y,yDistance:-2800,speed:1400,gestureSourceType:'mouse'});
    await page.waitForTimeout(150);
    const observed=await page.evaluate(()=>{__atlasPerf.measuring=false;return {calls:__atlasPerf.calls,frames:__atlasPerf.frames,longTasks:__atlasPerf.longTasks,saves:__atlasPerf.saves,scrollTop:document.querySelector('#contentArea').scrollTop,popupOpen:!!document.querySelector('.atlas-spelling-popover')};});
    const after=await metrics();
    assert.ok(observed.scrollTop-start.top>500,'The actual content must scroll');
    const row={paragraphs,chars:markdown.length,theme,iteration,mode,instrumented,...startup,
      scroll:{distance:observed.scrollTop-start.top,frames:observed.frames.length,p50Ms:percentile(observed.frames,.5),p95Ms:percentile(observed.frames,.95),maxMs:Math.max(...observed.frames),framesOver33Ms:observed.frames.filter(ms=>ms>33).length,longTasks:observed.longTasks,callbacks:observed.calls,saveCallbacks:observed.saves,popupOpenAtEnd:observed.popupOpen,
      scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,heapMb:after.JSHeapUsedSize/1048576}};
    results.push(row);fs.writeFileSync(output,JSON.stringify({browser:browser.version(),viewport:{width:1440,height:1000},errors,results},null,2)+'\n');
    console.log(JSON.stringify({paragraphs,theme,iteration,mode,p95Ms:row.scroll.p95Ms,longTasks:row.scroll.longTasks.length,scriptMs:row.scroll.scriptMs,layoutMs:row.scroll.layoutMs,callbacks:row.scroll.callbacks}));
   }
  }
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
