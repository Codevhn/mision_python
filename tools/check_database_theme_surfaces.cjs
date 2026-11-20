// Real document + nested Peek databases, using disposable fixture data only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const create=async data=>{const response=await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,...data}});assert.ok(response.ok());return (await response.json()).id;};
  const schema=id=>({database_id:id,columns:[{id:'s',name:'Estado',type:'text'}],views:[{id:'t',name:'Tabla',type:'table'}],activeView:'t'});
  const database='db_'+'7'.repeat(32),nested='db_'+'8'.repeat(32);
  const markdown=id=>'## Tabla integrada en el documento\n\n:::database\n'+JSON.stringify(schema(id))+'\n:::';
  const parent=await create({title:'Tablas y temas',raw_text:markdown(database)});
  const add=async(parent,id,title)=>{const response=await context.request.post(base+`/api/databases/${parent}/${id}/rows`,{data:{title,values:{s:'Pendiente'}}});assert.ok(response.ok());return (await response.json()).row.id;};
  const row=await add(parent,database,'Documento con tabla');
  await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:markdown(nested)}});
  await add(row,nested,'Subtema de prueba');
  const before=await Promise.all([parent,row].map(async id=>(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>typeof setAtlasTheme==='function'&&typeof _openPagePeek==='function');
  await page.evaluate(id=>_loadEntryById(id),parent);
  await page.locator('#entryBody .adb-table-row').waitFor();
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),row);
  await page.locator('#pagePeekEditor .adb-table-row').waitFor();
  const themes=(await page.evaluate(()=>THEME_CATALOG.map(([id])=>id))).filter(id=>!process.env.ATLAS_THEME_FILTER||id===process.env.ATLAS_THEME_FILTER);
  for(const theme of themes){
   await page.evaluate(id=>setAtlasTheme(id,true),theme);await page.mouse.move(0,0);
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));
   for(const surface of ['#entryBody','#pagePeekEditor']){
    const table=page.locator(surface+' .adb-workspace');
    const colors=await table.evaluate(table=>{
     const probe=document.createElement('span');probe.style.cssText='display:none;color:var(--text)!important;border:1px solid var(--border)!important';table.append(probe);
     let canvas='rgba(0, 0, 0, 0)';
     for(let ancestor=table.parentElement;ancestor;ancestor=ancestor.parentElement){
      const background=getComputedStyle(ancestor).backgroundColor;
      if(background!=='rgba(0, 0, 0, 0)'&&background!=='transparent'){canvas=background;break;}
     }
     const expected=getComputedStyle(probe),result={canvas,text:expected.color,border:expected.borderTopColor};
     result.palette=['--bg','--bg-surface','--bg-elevated','--cyber-reading','--aero-content'].filter(token=>getComputedStyle(table).getPropertyValue(token).trim()).map(token=>{probe.style.setProperty('background',`var(${token})`,'important');return getComputedStyle(probe).backgroundColor;});probe.remove();
     const paint=node=>{const css=getComputedStyle(node);return {background:css.backgroundColor,text:css.color,border:css.borderBottomColor};};
     return {...result,table:paint(table),head:paint(table.querySelector('.adb-table-head')),row:paint(table.querySelector('.adb-table-row'))};
    });
    for(const element of ['table','row'])assert.ok(colors[element].background==='rgba(0, 0, 0, 0)'||colors[element].background===colors.canvas,`${theme} ${surface} ${element} must blend into its painted canvas: ${JSON.stringify(colors)}`);
    // Glass canvases need a separate sticky header layer to keep scrolled text
    // from showing through; headers use a reading surface from the active palette.
    assert.ok(colors.palette.includes(colors.head.background),`${theme} ${surface} header uses the active palette: ${JSON.stringify(colors)}`);
    assert.equal(colors.table.text,colors.text,`${theme} ${surface} text`);
    assert.equal(colors.row.border,colors.border,`${theme} ${surface} border`);
   }
   if(['aero-amber-intense','aero-amethyst','paper','hyprland'].includes(theme))await page.screenshot({path:`/tmp/atlas-table-theme-${theme}.png`});
  }
  // Selection and editing controls stay usable after changing palettes.
  const peek=page.locator('#pagePeekEditor .adb-workspace');
  await peek.getByLabel('Seleccionar Subtema de prueba',{exact:true}).check();
  await peek.locator('.adb-table-row.selected').waitFor();
  await peek.getByLabel('Seleccionar Subtema de prueba',{exact:true}).uncheck();
  await peek.getByRole('button',{name:'Buscar en esta vista',exact:true}).click();
  await peek.getByLabel('Buscar registros').fill('no existe');await peek.locator('.adb-table-row').waitFor({state:'detached'});
  await peek.getByLabel('Buscar registros').fill('Subtema');await peek.locator('.adb-table-row').waitFor();
  for(const width of [412,320]){
   await page.setViewportSize({width,height:820});await page.evaluate(()=>setAtlasTheme('aero-amber-intense',true));
   assert.ok(await peek.locator('.adb-table-scroll').evaluate(node=>node.clientWidth>0&&node.scrollWidth>=node.clientWidth));
   await page.screenshot({path:`/tmp/atlas-table-theme-${width}.png`});
  }
  const after=await Promise.all([parent,row].map(async id=>(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown));
  assert.deepEqual(after,before);assert.deepEqual(errors,[]);
  console.log(`PASS ${themes.length} themes: document and nested Peek canvas/text/borders; live theme changes, selection, search, mobile scrolling and unchanged source.`);
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
