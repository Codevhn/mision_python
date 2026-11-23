const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1440,412].filter(value=>!process.env.ATLAS_TEST_WIDTH||value===Number(process.env.ATLAS_TEST_WIDTH))){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
 const create=async title=>(await(await context.request.post(base+'/api/entry',{data:{entry_type:'knowledge',title,category:'Programación',topic:'Herramientas',raw_text:'## Base original\n\nCONTENIDO-ORIGINAL-CONSERVADO',already_markdown:true}})).json()).id;
 const id=await create('uv: una entrada de prueba '+width+' '+Date.now()),other=await create('Otra entrada '+width+' '+Date.now());
 const get=async key=>(await(await context.request.get(base+'/api/entry/'+key+'?_qa='+Date.now())).json());
 const savedWhen=async(key,text)=>{const until=Date.now()+20000;while(Date.now()<until){const value=await get(key);if(value.markdown.includes(text))return value;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('El apartado no se guardó: '+text);};
 const before=await get(id),otherBefore=await get(other),count=(await(await context.request.get(base+'/api/entries')).json()).length;
 const page=await context.newPage(),errors=[],writes=[];page.on('request',r=>{if(r.url().endsWith('/content'))writes.push(r.postData());});page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 async function openEntry(){await page.evaluate(async id=>{switchSpace('knowledge');await loadTree();await _loadEntryById(id);},id);}
 await page.goto(base);await page.waitForFunction(()=>typeof _loadEntryById==='function');await openEntry();
 // Use the actual sidebar menu and existing prompt dialog.
 if(width<700){await page.locator("#sidebarToggle").click();await page.locator("#sidebar.mobile-open").waitFor();}
 await page.evaluate(id=>{const node=document.querySelector('#tree .tree-entry[data-id="'+id+'"]');for(let parent=node.parentElement;parent&&parent.id!=='tree';parent=parent.parentElement){if(parent.matches('.tree-category,.tree-topic'))parent.classList.add('open');}},id);
 await page.locator(`#tree .tree-entry[data-id="${id}"] .tree-page-menu-btn`).click();await page.getByRole('button',{name:'Renombrar',exact:true}).click();
 await page.locator('#promptInput').fill('uv breve');await page.locator('#promptOk').click();
 await page.waitForFunction(id=>document.querySelector('#tree .tree-entry[data-id="'+id+'"] .tree-entry-title')?.textContent==='uv breve',id);
 assert.equal(await page.locator('#inlineTitle').innerText(),before.meta.title);assert.equal((await get(id)).markdown,before.markdown);
 if(width<700)await page.evaluate(()=>closeSidebarMobile());
 await page.reload();await page.waitForFunction(()=>typeof _loadEntryById==='function');await openEntry();
 assert.equal(await page.locator(`#tree [data-id="${id}"] .tree-entry-title`).innerText(),'uv breve');
 assert.equal(await page.locator('#inlineTitle').innerText(),before.meta.title);
 await page.evaluate(()=>AssistantApp.open({focusInput:false}));await page.locator('#assistantInput').fill('Explícame uv para profundizar en esta entrada');await page.locator('#assistantSend').click();
 const suggestions=page.locator('.assistant-followups');await suggestions.waitFor();
 await suggestions.getByRole('button',{name:'Crear un proyecto con uv',exact:true}).click();
 const saved=await savedWhen(id,'## Crear un proyecto con uv');assert.ok(saved.markdown.includes('CONTENIDO-ORIGINAL-CONSERVADO'));assert.ok(saved.markdown.includes('## Crear un proyecto con uv'),JSON.stringify({saved:saved.markdown,live:await page.evaluate(()=>_inlineEditor.getMarkdown()),status:await page.locator('#assistantStatus').innerText(),writes}));assert.ok(!saved.markdown.includes('Seguir profundizando'));
 assert.equal(saved.meta.title,before.meta.title);assert.equal(saved.meta.sidebar_label,'uv breve');
 assert.equal((await(await context.request.get(base+'/api/entries')).json()).length,count);
 // Change the open page while another suggestion is generating. Its answer
 // stays in chat, then can be added explicitly after returning to the source.
 let release;const gate=new Promise(resolve=>release=resolve);let started;const requestStarted=new Promise(resolve=>started=resolve);
 await page.route('**/api/assistant/conversations/*/messages',async route=>{started();const response=await route.fetch();await gate;await route.fulfill({response});});
 await suggestions.getByRole('button',{name:'Entender el archivo de bloqueo',exact:true}).click();await requestStarted;
 await page.evaluate(id=>_loadEntryById(id),other);release();
 await page.locator('#assistantStatus').filter({hasText:/Abre la entrada original/}).waitFor();assert.equal((await get(other)).markdown,otherBefore.markdown);
 await page.evaluate(id=>_loadEntryById(id),id);
 await page.getByRole('button',{name:'Añadir a esta entrada',exact:true}).last().click();
 const final=await savedWhen(id,'## Entender el archivo de bloqueo');assert.equal(final.markdown.split('## Crear un proyecto con uv').length-1,1);
 assert.equal(final.markdown.split('## Entender el archivo de bloqueo').length-1,1);assert.ok(final.markdown.includes('CONTENIDO-ORIGINAL-CONSERVADO'));
 assert.deepEqual(errors,[]);console.log(`PASS ${width}px: sidebar-only rename/reload, contextual suggestions, append/save in original entry, no extra entries, source-change guard and manual recovery`);await context.close();
}}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
