// Database → record → child → grandchild → breadcrumb, against disposable Atlas.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of (process.env.ATLAS_PHONE_ONLY?[{width:412,height:915}]:[{width:1697,height:1000},{width:1480,height:924},{width:412,height:915}])){
   const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(10000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
   const create=async data=>{const r=await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,raw_text:'',...data}});assert.ok(r.ok());return(await r.json()).id;};
   const database='db_'+'c'.repeat(32),schema={database_id:database,columns:[],views:[{id:'v',name:'Tabla',type:'table'}],activeView:'v'};
   const parent=await create({title:'ROADMAPS QA',raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'});
   const r=await context.request.post(base+`/api/databases/${parent}/${database}/rows`,{data:{title:'Python Profesional 2028'}});assert.equal(r.status(),201);const row=(await r.json()).row.id;
   const sibling=(await (await context.request.post(base+`/api/databases/${parent}/${database}/rows`,{data:{title:'Otro roadmap'}})).json()).row.id;
   const child=await create({title:'ROADMAP GENERAL',parent_id:row});
   const grandchild=await create({title:'Detalles definitivos',parent_id:child,raw_text:'Contenido de nieta'});
   await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:`[[Nombre temporal|${child}]]\n\n`+('Párrafo de lectura.\n\n'.repeat(35))}});
   await context.request.patch(base+`/api/entry/${child}/content`,{data:{already_markdown:true,raw_text:`[[Temporal de nieta|${grandchild}]]\n\nContenido del roadmap.`}});
   await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');
   await page.evaluate(id=>_loadEntryById(id),parent);await page.waitForSelector('#entryBody [data-content-type="database"]');
   const source=await page.locator('#entryBody').innerText();
   const open=async mode=>{await page.evaluate(({row,sibling,mode})=>{window.__peekClosed=0;return _openPagePeek(row,{databasePreview:true,recordIds:[row,sibling],mode,onClose:()=>{window.__peekClosed++;}});},{row,sibling,mode});await page.locator('#pagePeekOverlay .page-peek-modal').evaluate(n=>Promise.all(n.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{}))));};
   const wait=async id=>{await page.waitForFunction(id=>_peekEntryId===id,id);await page.waitForSelector('#pagePeekEditor .bn-editor');await page.evaluate(()=>_peekEditor.whenReady());await page.waitForSelector('#pagePeekEditor:not([inert])');await page.waitForTimeout(100);await page.locator('#pagePeekOverlay .page-peek-modal').evaluate(n=>Promise.all(n.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{}))));};
   const follow=async(title,id)=>{await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:title}).click();await wait(id);};
   for(const mode of ['side','center']){
    await open(mode);
    const width=(await page.locator('#pagePeekOverlay .page-peek-modal').boundingBox()).width;
    await page.locator('.page-peek-body').evaluate(node=>node.scrollTop=180);
    await page.locator('.page-peek-body').evaluate((node,row)=>{node.onclick=event=>{if(_peekEntryId===row&&event.target.closest('.bn-pagelink-chip'))window.__departureScroll=node.scrollTop;};},row);
    await follow('ROADMAP GENERAL',child);
    assert.equal(await page.evaluate(()=>currentEntryId),parent);
    assert.equal(await page.locator('#pagePeekOverlay').getAttribute('data-peek-mode'),mode);
    assert.equal(await page.evaluate(()=>window.__peekClosed),0,'Source callback runs on final close, not internal navigation');
    assert.ok(Math.abs((await page.locator('#pagePeekOverlay .page-peek-modal').boundingBox()).width-width)<2);
    const renamed='ROADMAP GENERAL actualizado';
    await page.locator('#pagePeekTitle').fill(renamed);
    // Return directly with an unsaved rename: parent metadata must be read
    // after the title is persisted, not before.
    await page.locator('#pagePeekBreadcrumbs button').filter({hasText:'Python Profesional 2028'}).click();await wait(row);
    await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:renamed}).waitFor();
    await follow(renamed,child);
    await follow('Detalles definitivos',grandchild);
    if(mode==='side')await page.screenshot({path:`/tmp/atlas-peek-navigation-${viewport.width}.png`});
    await page.locator('#pagePeekBreadcrumbs button').filter({hasText:renamed}).click();await wait(child);
    assert.equal(await page.locator('#pagePeekTitle').inputValue(),renamed,'Breadcrumb reloads current title');
    await page.locator('#pagePeekBreadcrumbs button').filter({hasText:'Python Profesional 2028'}).click();await wait(row);
    await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:renamed}).waitFor();
    const restored=await page.locator('.page-peek-body').evaluate(n=>n.scrollTop),expected=await page.evaluate(()=>window.__departureScroll);
    assert.equal(restored,expected,'Parent scroll restored');
    assert.equal(await page.locator('#entryBody').innerText(),source,'Main database stays unchanged');
    // A failed load and a failed save must leave the current editor/path open.
    await page.evaluate(()=>_navigatePeek('missing-peek-page'));
    assert.equal(await page.evaluate(()=>_peekEntryId),row);
    await page.locator('#pagePeekTitle').fill('Título pendiente');
    await page.route(`**/api/entry/${row}/content`,route=>route.fulfill({status:503,json:{error:'Fallo simulado'}}));
    await page.evaluate(id=>_navigatePeek(id),child);
    assert.equal(await page.evaluate(()=>_peekEntryId),row,'Failed save blocks navigation');
    assert.equal(await page.locator('#pagePeekTitle').inputValue(),'Título pendiente');
    await page.unroute(`**/api/entry/${row}/content`);
    await page.locator('#pagePeekTitle').fill('Python Profesional 2028');
    await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});
    assert.equal(await page.evaluate(()=>window.__peekClosed),1);
    // Reset only the fixture title for the next mode.
    await context.request.patch(base+`/api/entry/${child}/content`,{data:{title:'ROADMAP GENERAL'}});
   }
   // Returning to the database root restores the original sibling controls.
   await open('side');await follow('ROADMAP GENERAL',child);
   await page.locator('#pagePeekBreadcrumbs button').filter({hasText:'Python Profesional 2028'}).click();await wait(row);
   await page.getByRole('button',{name:'Registro siguiente',exact:true}).click();await wait(sibling);
   assert.equal(await page.locator('#pagePeekBreadcrumbs').isVisible(),false,'Sibling starts its own record route');
   await page.getByRole('button',{name:'Registro anterior',exact:true}).click();await wait(row);
   await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
   if(viewport.width===1697){
    // Delayed destination response: neither late typing nor closing may be lost.
    const childData=await (await context.request.get(base+`/api/entry/${child}`)).json();
    for(const closeWhileLoading of [false,true]){
     await open('side');let release,started;
     const requested=new Promise(resolve=>started=resolve),delayed=new Promise(resolve=>release=resolve);
     await page.route(`**/api/entry/${child}`,async route=>{started();await delayed;await route.fulfill({json:childData});});
     await page.evaluate(id=>{window.__pendingPeekNavigation=_navigatePeek(id);},child);
     let timer;await Promise.race([requested,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Destination request did not start")),5000);})]);clearTimeout(timer);
     if(closeWhileLoading)await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
     else await page.locator('#pagePeekTitle').fill('Edición durante la carga');
     release();assert.equal(await page.evaluate(()=>window.__pendingPeekNavigation),false);
     await page.unroute(`**/api/entry/${child}`);
     if(closeWhileLoading)assert.equal(await page.locator('#pagePeekOverlay').isVisible(),false,'Late response cannot reopen a closed Peek');
     else{
      assert.equal(await page.evaluate(()=>_peekEntryId),row);
      assert.equal(await page.locator('#pagePeekTitle').inputValue(),'Edición durante la carga','Late edit remains in source editor');
      await page.locator('#pagePeekTitle').fill('Python Profesional 2028');
      await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
      await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});
     }
    }
   }
   await open('side');await follow('ROADMAP GENERAL',child);
   await page.getByRole('button',{name:'Abrir como página completa',exact:true}).click();
   await page.waitForFunction(id=>currentEntryId===id,child);
   assert.equal(await page.locator('#pagePeekOverlay').isVisible(),false,'Explicit full-page action still works');
   assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: nested Peek navigation, canonical titles, breadcrumb, mode/width/scroll, source isolation, save/load errors and explicit full page`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
