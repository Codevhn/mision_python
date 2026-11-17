// Full Atlas + real database/Peek APIs against the disposable fixture only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const config of [{name:'desktop',viewport:{width:1697,height:1000}},{name:'split-screen',viewport:{width:1300,height:944}},{name:'tablet',viewport:{width:1480,height:924},hasTouch:true},{name:'phone',viewport:{width:412,height:915},hasTouch:true,isMobile:true}]){
   const {name,...options}=config,context=await browser.newContext(options);
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
    if(url.pathname==='/api/ai/providers')return route.fulfill({json:{providers:[],warnings:[],default:{provider:'deepseek',model:'fixture'}}});
    return route.continue();
   });
   await context.request.post(base+'/login',{form:{password:process.env.ATLAS_TEST_PASSWORD||'atlas-library-test-password'}});
   const database='db_'+'a'.repeat(32),schema={database_id:database,columns:[{id:'s',name:'Estado',type:'text'}],views:[{id:'v',name:'Tabla',type:'table'}],activeView:'v'};
   const parentResponse=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'QA ancho Peek '+name,already_markdown:true,raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'}});
   assert.ok(parentResponse.ok());const parent=(await parentResponse.json()).id;
   const rowResponse=await context.request.post(base+`/api/databases/${parent}/${database}/rows`,{data:{title:'Título largo del registro para comprobar el ajuste del panel lateral y de sus líneas'}});
   assert.equal(rowResponse.status(),201);const row=(await rowResponse.json()).row.id;
   const secondResponse=await context.request.post(base+`/api/databases/${parent}/${database}/rows`,{data:{title:'Otro registro'}});const second=(await secondResponse.json()).row.id;
   await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:'## Contenido del registro\n\nUn párrafo de lectura que conserva su contenido durante el cambio de ancho.\n\n| Módulo | Objetivo |\n|---|---|\n| Datos | Revisar registros |'}});
   await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function'&&typeof _openPagePeek==='function');
   await page.evaluate(id=>_loadEntryById(id),parent);await page.waitForSelector('#entryBody [data-content-type="database"]');
   const open=async id=>{await page.evaluate(({id,ids})=>_openPagePeek(id,{databasePreview:true,recordIds:ids,mode:'side'}),{id,ids:[row,second]});await page.waitForSelector('#pagePeekOverlay.adb-record-page:not(.hidden)');await page.locator('#pagePeekOverlay .page-peek-modal').evaluate(node=>Promise.all(node.getAnimations().filter(animation=>Number.isFinite(animation.effect.getComputedTiming().iterations)).map(animation=>animation.finished.catch(()=>{}))));await page.waitForTimeout(40);};
   await open(row);
   const panel=page.locator('#pagePeekOverlay .page-peek-modal'),handle=page.getByRole('separator',{name:'Cambiar ancho de Peek'});
   const width=async()=>Math.round((await panel.boundingBox()).width);
   const close=async()=>{await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();await page.locator('#pagePeekOverlay').waitFor({state:'hidden'});};
   if(name==='phone'){
    assert.equal(await handle.isVisible(),false);assert.equal(await width(),412);
    await close();assert.equal(await page.locator('#contentArea').evaluate(node=>getComputedStyle(node).marginRight),'0px');
   }else{
    const original=await width();assert.equal(await handle.isVisible(),true);
    const drag=async dx=>{const r=await handle.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+200);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+200,{steps:12});await page.mouse.up();await page.waitForTimeout(100);};
    await drag(-120);assert.ok(await width()>original+60,'Dragging left widens right-side Peek');
    await drag(240);const narrowed=await width();assert.ok(narrowed<original-60,'Dragging right narrows Peek');
    assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('atlas-peek-resizing')),false);
    assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true,'Resize must not dismiss the record');
    const cancelRect=await handle.boundingBox();
    await page.mouse.move(cancelRect.x+5,cancelRect.y+180);await page.mouse.down();await page.mouse.move(cancelRect.x-60,cancelRect.y+180);
    await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(60);
    assert.equal(await width(),narrowed,'Escape cancels a resize without closing Peek');
    assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true);
    const saved=await page.evaluate(()=>Number(localStorage.getItem('atlas_db_peek_width')));assert.equal(saved,narrowed);
    const gap=await page.locator('#contentArea').evaluate(node=>parseFloat(getComputedStyle(node).marginRight));assert.equal(Math.round(gap),narrowed,'Background reserves exactly the chosen width');
    await handle.focus();await page.keyboard.press('Home');assert.equal(await width(),360);
    await page.waitForTimeout(80);
    assert.ok(await page.locator('#pagePeekTitle').evaluate(node=>node.scrollHeight<=node.clientHeight+2),'Title wraps without clipping');
    await page.keyboard.press('End');const widest=await width();assert.ok(widest>narrowed);
    assert.ok((await page.locator('#contentArea').boundingBox()).width>=319,'Base remains usable');
    await page.keyboard.press('ArrowRight');const chosen=await width();assert.equal(chosen,widest-20);
    await close();await open(second);assert.equal(await width(),chosen,'Width persists across records');
    await close();await page.reload();await page.waitForFunction(()=>typeof _openPagePeek==='function');
    await page.evaluate(id=>_loadEntryById(id),parent);await page.waitForSelector('#entryBody [data-content-type="database"]');
    await open(second);assert.equal(await width(),chosen,'Width persists after browser reload');
    await page.getByRole('button',{name:'Cambiar modo Peek',exact:true}).click();await page.getByRole('button',{name:/Center Peek/}).click();
    assert.equal(await handle.isVisible(),false);assert.equal(await width(),900,'Center mode keeps its own geometry');
    await page.getByRole('button',{name:'Cambiar modo Peek',exact:true}).click();await page.getByRole('button',{name:/Side Peek/}).click();
    await page.waitForTimeout(100);assert.equal(await width(),chosen);
    await page.setViewportSize({width:900,height:944});await page.waitForTimeout(120);assert.ok(await width()<=852);
    await page.setViewportSize(options.viewport);await page.waitForTimeout(120);assert.equal(await width(),chosen,'Restoring viewport restores desired width');
    await handle.dblclick({position:{x:5,y:180}});await page.waitForTimeout(80);assert.equal(await width(),original);
    assert.equal(await page.evaluate(()=>localStorage.getItem('atlas_db_peek_width')),null,'Double click resets the preference');
    if(name==='tablet'){
     const r=await handle.boundingBox(),client=await context.newCDPSession(page),x=r.x+5,y=r.y+200;
     await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
     await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-100,y}]});
     await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);assert.ok(await width()>original+50,'Touch drag supported');
    }
    if(name==='desktop')for(const theme of ['aero','opencode-dark','hyprland','notion-native']){
     await page.evaluate(theme=>setAtlasTheme(theme,true),theme);await page.waitForTimeout(350);
     const beforeThemeDrag=await width();await drag(-60);assert.ok(await width()>beforeThemeDrag+40,theme+' honors custom width');
     const leftWidth=(await page.locator('#contentArea').boundingBox()).width;assert.ok(leftWidth>=319,theme+' keeps source usable');
     await handle.dblclick({position:{x:5,y:180}});await page.waitForTimeout(80);
    }
    await page.getByRole('button',{name:'Abrir como página completa',exact:true}).click();await page.locator('#pagePeekOverlay').waitFor({state:'hidden'});
    assert.equal(await page.locator('#contentArea').evaluate(node=>getComputedStyle(node).marginRight),'0px');
   }
   const content=await context.request.get(base+`/api/entry/${row}`);assert.ok((await content.json()).markdown.includes('Contenido del registro'),'Resizing never modifies record text');
   assert.deepEqual(errors,[]);console.log('PASS '+name+': resize, persistence, limits, center/full modes and responsive geometry');await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
