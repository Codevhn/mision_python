// Verify visual link selection and the actual edit target after returning to Peek.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1697,height:1000},{width:1480,height:924},{width:412,height:915}]){
   const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(10000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
   const create=async data=>(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,raw_text:'',...data}})).json()).id;
   const database='db_'+'d'.repeat(32),schema={database_id:database,columns:[],views:[{id:'v',name:'Tabla',type:'table'}],activeView:'v'};
   const parent=await create({title:'ROADMAPS selección',raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'});
   const row=(await (await context.request.post(base+`/api/databases/${parent}/${database}/rows`,{data:{title:'Python Profesional 2028'}})).json()).row.id;
   const titles=['1.ESTRUCTURA DEL ROADMAP','2.CRONOGRAMA','3.Temario (lecciones)','4.Recursos (Libros/videos)'],children=[];
   for(const title of titles)children.push(await create({title,parent_id:row,raw_text:'Contenido de '+title}));
   const markdown=titles.map((title,i)=>`[[${title}|${children[i]}]]`).join('\n\n---\n\n')+'\n\nUn párrafo al final.';
   await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:markdown}});
   await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');
   await page.evaluate(id=>_loadEntryById(id),parent);
   const wait=async id=>{await page.waitForFunction(id=>_peekEntryId===id,id);await page.waitForSelector('#pagePeekEditor:not([inert]) .bn-editor');};
   const selected=()=>page.locator('#pagePeekEditor .ProseMirror-selectednode');
   const assertNoFrame=async()=>{
    const styles=await selected().evaluateAll(nodes=>nodes.flatMap(node=>[...node.children].map(child=>{const s=getComputedStyle(child);return {outline:s.outlineStyle,shadow:s.boxShadow};})));
    assert.ok(styles.length,'A native node selection exists');
    assert.ok(styles.every(s=>s.outline==='none'&&s.shadow==='none'),JSON.stringify(styles));
   };
   for(const mode of ['side','center']){
    await page.evaluate(({row,mode})=>_openPagePeek(row,{databasePreview:true,mode}),{row,mode});await wait(row);
    for(const index of [3,1]){
     await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:titles[index]}).click();await wait(children[index]);
     await page.getByRole('navigation',{name:'Ruta del Peek'}).getByRole('button',{name:'Python Profesional 2028',exact:true}).click();await wait(row);
     assert.ok((await selected().allTextContents()).some(text=>text.includes(titles[index])),'Return selects the link we came from');
     for(const theme of ['aero','opencode-dark','hyprland','notion-native']){await page.evaluate(theme=>setAtlasTheme(theme,true),theme);await assertNoFrame();}
     // This verifies the editor's real selection, beyond an apparent CSS highlight.
     await page.evaluate(()=>_peekEditor.focusFirst());await page.keyboard.press('Delete');
     await page.waitForFunction(title=>![...document.querySelectorAll('#pagePeekEditor .bn-pagelink-chip')].some(n=>n.textContent.includes(title)),titles[index]);
     for(let i=0;i<titles.length;i++)if(i!==index)assert.equal(await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:titles[i]}).count(),1);
     await page.keyboard.press('Control+z');await page.locator('#pagePeekEditor .bn-pagelink-chip').filter({hasText:titles[index]}).waitFor();
    }
    await page.screenshot({path:`/tmp/atlas-peek-link-selection-${viewport.width}-${mode}.png`});
    await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});
    assert.equal((await (await context.request.get(base+`/api/entry/${row}`)).json()).markdown.trim(),markdown.trim(),'Navigate/select/undo preserves document');
    assert.equal(await page.evaluate(()=>currentEntryId),parent);
   }
   assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: fourth/second link selection restored, no blue atom frame in four themes, native edit target/undo, Side/Center and unchanged content`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
