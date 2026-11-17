// Disposable Flask fixture: database record Peek and its real BlockNote insert menu.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1697,height:1000}}),page=await context.newPage();page.setDefaultTimeout(8000);
  page.on('pageerror',error=>console.error('PAGE ERROR:',error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const database='db_'+'b'.repeat(32),schema={database_id:database,columns:[],views:[{id:'v',name:'Tabla',type:'table'}],activeView:'v'};
  const parent=(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'QA integración Peek',already_markdown:true,raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'}})).json()).id;
  const row=(await (await context.request.post(base+`/api/databases/${parent}/${database}/rows`,{data:{title:'Registro auditoría'}})).json()).row.id;
  await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:'## Prueba Peek\n\n'}});
  await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');
  await page.evaluate(id=>_loadEntryById(id),parent);await page.waitForSelector('#entryBody [data-content-type="database"]');
  await page.evaluate(()=>localStorage.setItem('atlas_db_peek_width','1100'));
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),row);
  await page.waitForSelector('#pagePeekEditor .bn-inline-content');
  // Exercise the actual (+) button reported by the user.
  await page.locator('#pagePeekEditor .bn-inline-content').last().hover();
  await page.getByRole('button',{name:'Agregar bloque',exact:true}).click();
  await page.getByRole('option',{name:'Página',exact:true}).click();
  await page.waitForSelector('#pageNameOverlay:not(.hidden)');
  const diagnostic=await page.locator('#pageNameConfirm').evaluate(input=>{const r=input.getBoundingClientRect();return {owner:input.closest('[data-peek-owner]')?.dataset.peekOwner,front:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id,expected:input.id};});
  console.log('Name dialog:',JSON.stringify(diagnostic));
  assert.equal(diagnostic.owner,row,'Name dialog belongs to the Peek record');
  assert.equal(diagnostic.front,diagnostic.expected,'Name input must be above the Peek and clickable');
  await page.locator('#pageNameInput').fill('Subpágina desde Peek');await page.locator('#pageNameConfirm').click();
  await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Subpágina desde Peek'}).waitFor();
  await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  const saved=await (await context.request.get(base+`/api/entry/${row}`)).json();
  assert.ok(saved.markdown.includes('Subpágina desde Peek|'),'Real link persisted in correct record');
  assert.ok(!saved.markdown.includes('Nueva página'),'No placeholder left behind');
  const children=await (await context.request.get(base+`/api/entry/${row}/children`)).json();
  assert.ok(children.some(child=>child.title==='Subpágina desde Peek'));
  assert.equal((await (await context.request.get(base+`/api/entry/${parent}`)).json()).markdown.includes('Subpágina desde Peek'),false,'Background page stays unchanged');
  const open=async(mode='side')=>{
   await page.evaluate(({row,mode})=>_openPagePeek(row,{databasePreview:true,mode}),{row,mode});
   await page.waitForSelector('#pagePeekEditor .bn-inline-content');
  };
  await open();
  await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Subpágina desde Peek'}).click();
  await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});
  assert.equal(await page.evaluate(()=>currentEntryId),children.find(child=>child.title==='Subpágina desde Peek').id,'Created link navigates to actual child');
  // Rename and paste content inside the child Peek; revisit its parent Peek.
  const renamedChild=children.find(child=>child.title==='Subpágina desde Peek').id;
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),renamedChild);
  await page.waitForSelector('#pagePeekEditor .bn-inline-content');
  await page.locator('#pagePeekEditor .bn-inline-content').last().click();
  await page.keyboard.insertText('Contenido pegado dentro de la subpágina.');
  await page.locator('#pagePeekTitle').fill('Título definitivo dentro del Peek');
  await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  const renamed=await (await context.request.get(base+`/api/entry/${renamedChild}`)).json();
  assert.equal(renamed.meta.title,'Título definitivo dentro del Peek');
  assert.ok(renamed.markdown.includes('Contenido pegado dentro de la subpágina.'));
  await open();
  await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Título definitivo dentro del Peek'}).waitFor();
  assert.equal(await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Subpágina desde Peek'}).count(),0,'Peek resolves current child title instead of its initial snapshot');
  assert.ok((await (await context.request.get(base+`/api/entry/${row}`)).json()).markdown.includes('Subpágina desde Peek|'),'Title resolution does not rewrite parent Markdown');
  await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  // A nested placeholder must also update/remove through the same instance API.
  await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:'- Contenedor\n  - Interior'}});
  await open('center');
  const insertNested=async()=>{
   await page.locator('#pagePeekEditor .bn-inline-content').last().click();
   await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('/pagina');
   await page.getByRole('option',{name:'Página',exact:true}).click();
   await page.waitForSelector('#pageNameOverlay:not(.hidden)');
  };
  await insertNested();await page.locator('#pageNameInput').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true,'Escape cancels naming without closing the Peek');
  assert.equal(await page.locator('#pagePeekEditor .bn-pagelink-chip').count(),0,'Cancel removes nested placeholder');
  await insertNested();await page.locator('#pageNameInput').fill('Hija anidada');
  // Creation failure retains the entered name and allows cancel/retry.
  await page.route('**/api/entry',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'Fallo simulado'}}):route.continue());
  await page.locator('#pageNameConfirm').click();await page.waitForTimeout(250);
  assert.equal(await page.locator('#pageNameOverlay').isVisible(),true);
  assert.equal(await page.locator('#pageNameInput').inputValue(),'Hija anidada');
  await page.unroute('**/api/entry');
  await page.locator('#pageNameConfirm').click();
  await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Hija anidada'}).waitFor();
  await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  const nested=await (await context.request.get(base+`/api/entry/${row}`)).json();
  assert.ok(nested.markdown.includes('Hija anidada|'));assert.ok(!nested.markdown.includes('Nueva página'));
  await open();
  assert.equal(await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Hija anidada'}).count(),1,'Nested link survives reopening');
  await page.evaluate(()=>_peekEditor.addPageBlock('Nueva página',''));
  await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Nueva página'}).click();
  await page.locator('#pageNameInput').fill('Enlace recuperado');await page.locator('#pageNameConfirm').click();
  await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Enlace recuperado'}).waitFor();
  assert.equal(await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Nueva página'}).count(),0,'Legacy placeholder can be recovered');
  // A child of a toggle is a real nested BlockNote block, not a top-level link.
  await page.evaluate(()=>_peekEditor.load(':::toggle Contenedor\n[[Nueva página]]\n:::'));
  const nestedChip=page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:'Nueva página'});
  await nestedChip.waitFor({state:'attached'});
  assert.ok(await nestedChip.evaluate(node=>{let count=0;for(let p=node.parentElement;p;p=p.parentElement)if(p.classList.contains('bn-block-outer'))count++;return count>1;}),'Fixture link is genuinely nested');
  // The toggle may be collapsed; dispatch to its real React chip handler.
  await nestedChip.evaluate(node=>node.click());
  await page.locator('#pageNameInput').fill('Hija dentro de desplegable');await page.locator('#pageNameConfirm').click();
  await page.waitForFunction(()=>_peekEditor.getMarkdown().includes('Hija dentro de desplegable|'));
  await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  assert.ok((await (await context.request.get(base+`/api/entry/${row}`)).json()).markdown.includes('Hija dentro de desplegable|'));
  await open();
  for(const theme of ['aero-amber','aero','opencode-dark','hyprland','notion-native']){
   await page.evaluate(theme=>setAtlasTheme(theme,true),theme);await page.waitForTimeout(200);
   const colors=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement),peek=getComputedStyle(document.getElementById('pagePeekOverlay'));
    return ['--text','--bg-surface','--accent','--font-ui'].map(key=>[key,root.getPropertyValue(key==='--bg-surface'&&document.documentElement.dataset.themeId==='hyprland'?'--cyber-reading':key).trim(),peek.getPropertyValue(key).trim()]);
   });
   for(const [key,root,peek] of colors)assert.equal(peek,root,theme+' inherits '+key);
  }
  await page.evaluate(()=>setAtlasTheme('aero-amber',true));
  await page.screenshot({path:'/tmp/atlas-peek-audit-amber.png'});
  // Protect the existing full-page flow, which shares the naming dialog/API.
  await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  const fullParent=children.find(child=>child.title==='Subpágina desde Peek').id;
  await page.evaluate(id=>_loadEntryById(id),fullParent);
  await page.locator('#entryBody .bn-inline-content').last().hover();
  await page.getByRole('button',{name:'Agregar bloque',exact:true}).click();
  await page.getByRole('option',{name:'Página',exact:true}).click();
  await page.locator('#pageNameInput').fill('Hija desde página completa');await page.locator('#pageNameConfirm').click();
  const fullLink=page.locator('#entryBody .bn-pagelink-chip').filter({hasText:'Hija desde página completa'});
  await fullLink.waitFor();await fullLink.click();
  await page.waitForFunction(id=>currentEntryId!==id,fullParent);
  assert.ok((await (await context.request.get(base+`/api/entry/${fullParent}`)).json()).markdown.includes('Hija desde página completa|'),'Full-page creation still persists');
  console.log('PASS: Peek creation, renamed child title, saved content, unchanged parent, nested links, cancellation/retry, five themes and existing full-page flow');
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
