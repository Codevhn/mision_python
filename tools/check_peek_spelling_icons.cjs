// Full disposable Atlas; actual Iconify runtime/data supplied from public npm packages.
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const runtime=fs.readFileSync(process.env.ICONIFY_RUNTIME||'/tmp/atlas-iconify-runtime.js','utf8');
const icons=JSON.parse(fs.readFileSync(process.env.ICONIFY_ICONS||'/tmp/atlas-python-icon.json','utf8'));
const collection={prefix:icons.prefix,width:icons.width,height:icons.height,icons:{python:icons.icons.python}};
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1697,height:1000},{width:1480,height:924},{width:412,height:915}]){
   const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(8000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));let failService=false,calls=0,failures=0;
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='code.iconify.design')return route.fulfill({body:runtime,contentType:'application/javascript'});
    if(['api.iconify.design','api.simplesvg.com','api.unisvg.com'].includes(u.hostname))return route.fulfill({json:collection});
    if(u.origin!==base)return route.abort();
    if(u.pathname==='/api/proofreading/check'){
     calls++;if(failService){failures++;return route.fulfill({status:503,json:{error:'Servicio contextual no disponible (prueba)'}});}
     const {text}=route.request().postDataJSON(),matches=[];
     for(const [word,replacement] of [['abjeto','objeto'],['prueva','prueba']]){
      const offset=text.indexOf(word);if(offset>=0)matches.push({offset,length:word.length,message:'Prueba contextual',replacements:[replacement]});
     }
     return route.fulfill({json:{matches}});
    }
    return route.continue();
   });
   await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
   const create=async data=>(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,...data}})).json()).id;
   const parent=await create({title:'Fuente de prueba',raw_text:'Contenido de fondo intacto.'});
   const row=await create({title:'Peek de ortografía',parent_id:parent,icon:'material-icon-theme:python',raw_text:'Un abjeto de prueva.\n\n| Campo | Valor |\n|---|---|\n| Descripción | Una prueva en tabla. |'});
   const child=await create({title:'Hija con emoji',parent_id:row,icon:'📚',raw_text:'Lectura correcta.'});
   await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function'&&!!customElements.get('iconify-icon'));
   await page.evaluate(data=>customElements.get('iconify-icon').addCollection(data),collection);
   await page.evaluate(id=>_loadEntryById(id),parent);
   await page.evaluate(()=>AtlasSpellingSettings.set({language:'auto',method:'languagetool',underline:true}));
   await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),row);
   if(!process.argv.includes('--spelling-only')){
    await page.waitForFunction(()=>!!document.querySelector('#pagePeekIcon iconify-icon[icon="material-icon-theme:python"]')?.shadowRoot?.querySelector('svg path'));
    assert.equal(await page.locator('#pagePeekIcon').textContent(),'','Icon identifier is not printed as text');
    assert.ok(await page.locator('#pagePeekIcon iconify-icon').evaluate(icon=>{const r=icon.shadowRoot.querySelector('svg').getBoundingClientRect();return r.width>0&&r.height>0;}),'Python glyph has visible dimensions');
   }
   const word=text=>page.locator('#pagePeekEditor .atlas-spelling-target').filter({hasText:text});
   await word('abjeto').waitFor();await word('abjeto').hover();
   const popup=page.locator('.atlas-spelling-popover');await popup.waitFor();
   const suggestion=popup.getByRole('button',{name:'objeto',exact:true});await suggestion.waitFor();
   assert.equal(await popup.getAttribute('data-peek-owner'),row,'Popup must belong to current Peek');
   const hit=await suggestion.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
   assert.equal(hit,true,'Suggestion is above the Peek and receives pointer input');
   if(viewport.width===1697)await page.screenshot({path:'/tmp/atlas-peek-icons-spelling.png'});
   await page.waitForTimeout(500);assert.ok(calls>0,'Contextual check was exercised');
   await suggestion.click();assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true,'Selecting a suggestion keeps Peek open');
   await page.waitForFunction(()=>_peekEditor.getMarkdown().includes('Un objeto'));
   await page.keyboard.press('Control+z');await word('abjeto').waitFor();
   // With contextual service unavailable, offline suggestions still apply.
   failService=true;await word('abjeto').hover();await page.waitForTimeout(550);
   await popup.getByRole('button',{name:'objeto',exact:true}).click();
   await page.waitForFunction(()=>_peekEditor.getMarkdown().includes('Un objeto'));
   await word('prueva').last().click();
   await page.waitForFunction(()=>document.querySelector('.atlas-spelling-context-status')?.textContent.includes('Servicio contextual no disponible'));
   assert.ok(failures>0,'A fresh table paragraph exercised the failed contextual service');
   await popup.getByRole('button',{name:'prueba',exact:true}).click();
   assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true);
   // The native paragraph review dialog must also be owned before it is shown.
   await page.evaluate(()=>AtlasSpellingSettings.set({method:'local'}));
   await word('prueva').first().hover();await popup.getByRole('button',{name:'Corregir párrafo…',exact:true}).click();
   const review=page.getByRole('dialog',{name:'Corregir párrafo',exact:true});await review.waitFor();
   assert.equal(await review.getAttribute('data-peek-owner'),row);
   await review.getByLabel('Corrección de prueva',{exact:true}).selectOption('prueba');
   await review.getByRole('button',{name:'Aplicar correcciones',exact:true}).click();
   assert.equal(await page.locator('#pagePeekOverlay').isVisible(),true);
   await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();await page.waitForSelector('#pagePeekOverlay.hidden',{state:'attached'});
   const saved=await (await context.request.get(base+`/api/entry/${row}`)).json();
   assert.ok(saved.markdown.includes('Un objeto de prueba.'));assert.ok(saved.markdown.includes('Una prueba en tabla.'));
   assert.equal((await (await context.request.get(base+`/api/entry/${parent}`)).json()).markdown.trim(),'Contenido de fondo intacto.');
   await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'center'}),child);
   assert.equal(await page.locator('#pagePeekIcon').textContent(),'📚','Emoji remains an emoji');
   await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
   assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}px: real Python SVG, emoji, contextual/offline suggestions, click/undo, table/paragraph edits, persistence and source isolation`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
