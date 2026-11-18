const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1697,900,412]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
 const post=async(url,data)=>{const r=await context.request.post(base+url,{data});assert.ok(r.ok(),await r.text());return r.json();};
 const create=async data=>(await post('/api/entry',{entry_type:'page',already_markdown:true,...data})).id;
 const run=Date.now();
 const course=(await post('/api/courses',{label:'Python enlaces '+width+' '+run})).id;
 const other=(await post('/api/courses',{label:'Java enlaces '+width+' '+run})).id;
 const topic='Metodología de aprendizaje técnico',second='Pensamiento lógico',manual='Nombre diferente';
 const content='# Filosofía\n\n'+('Párrafo de introducción.\n\n'.repeat(40))+'## 1.'+topic+'\n\nDesarrollo del primer tema.\n\n'+('Otro párrafo.\n\n'.repeat(25))+'## 2.'+second+'\n\nDesarrollo del segundo tema.';
 const lesson=(await post('/api/courses/entry',{course,module:'Módulo 1',title:'Filosofía',raw_text:content})).id;
 await post('/api/courses/entry',{course:other,module:'Módulo 1',title:'Otro curso',raw_text:'## 1.'+topic});
 const db='db_'+'e'.repeat(32),schema={database_id:db,columns:[],views:[{id:'v',name:'Tabla',type:'table'}],activeView:'v'};
 const root=await create({title:'ROADMAPS enlaces',raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'});
 const row=(await post(`/api/databases/${root}/${db}/rows`,{title:'Maestría Python'})).row.id;
 const source=await create({title:'3.Temario (lecciones)',parent_id:row,raw_text:`## M01\n\n| # | Lección | h |\n|---|---|---|\n|1|**${topic}**|1|\n|2|${second}|1|\n|3|${manual}|1|\n| |Subtotal M01|3|`});
 await context.request.patch(base+`/api/entry/${row}/content`,{data:{already_markdown:true,raw_text:`[[3.Temario (lecciones)|${source}]]`}});
 await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');await page.evaluate(id=>_loadEntryById(id),root);
 await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),row);
 await page.locator('#pagePeekEditor .bn-pagelink-chip').click();await page.waitForFunction(id=>_peekEntryId===id,source);
 await page.locator('#pagePeekLinkCourse').click();const dialog=page.getByRole('dialog',{name:'Vincular temario con curso'});
 await dialog.getByLabel('Curso del temario').selectOption(course);await dialog.getByRole('button',{name:'Analizar subtemas'}).click();
 const first=dialog.getByLabel('Destino de '+topic,{exact:true});await page.waitForFunction(()=>document.querySelectorAll('.course-topic-match').length===3);
 assert.ok(await first.inputValue());assert.ok(await dialog.getByLabel('Destino de '+second,{exact:true}).inputValue());assert.equal(await dialog.getByLabel('Destino de '+manual,{exact:true}).inputValue(),'');
 await dialog.getByLabel('Buscar destino de '+manual,{exact:true}).fill('2.'+second);
 const manualSelect=dialog.getByLabel('Destino de '+manual,{exact:true});await manualSelect.selectOption({index:1});
 if(width===1697){
  await page.evaluate(()=>AtlasPeekCourseContext.editor().appendMarkdown('\n\nNota añadida durante la revisión.'));
  await dialog.getByRole('button',{name:'Aplicar 3 vínculos'}).click();
  await dialog.getByText('El temario cambió. Analízalo de nuevo antes de aplicar los vínculos.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Analizar subtemas'}).click();await dialog.getByText('3 subtemas. 2 coincidencias únicas. Los demás requieren elegir un destino.',{exact:true}).waitFor();
  await dialog.getByLabel('Buscar destino de '+manual,{exact:true}).fill('2.'+second);await dialog.getByLabel('Destino de '+manual,{exact:true}).selectOption({index:1});
 }
 await dialog.getByRole('button',{name:'Aplicar 3 vínculos'}).click();await dialog.waitFor({state:'detached'});
 const saved=(await (await context.request.get(base+`/api/entry/${source}`)).json()).markdown;
 assert.ok(saved.includes('atlas-topic=1'));assert.ok(saved.includes('**'+topic+'**'));assert.ok(saved.includes('Subtotal M01'));
 for(const text of [second,topic]){
  await page.locator('#pagePeekEditor a').filter({hasText:text}).click();await page.waitForFunction(id=>currentEntryId===id,lesson);
  const destination=page.locator('#entryBody [data-content-type="heading"]').filter({hasText:text});await destination.waitFor();
  await page.waitForFunction(text=>[...document.querySelectorAll('#entryBody [data-content-type="heading"]')].some(n=>n.textContent.includes(text)&&n.getBoundingClientRect().top>=0&&n.getBoundingClientRect().top<950),text);
  await page.locator('#courseTopicReturn').click();await page.waitForFunction(id=>_peekEntryId===id,source);await page.locator('#pagePeekEditor a').filter({hasText:topic}).waitFor();
  assert.equal(context.pages().length,1,'Native links must not open an extra tab');assert.equal(await page.evaluate(()=>currentEntryId),root);assert.equal(await page.getByText(/Block with ID .* not found/).count(),0);
 }
 // A changed heading must not silently open the wrong section.
 await context.request.patch(base+`/api/entry/${lesson}/content`,{data:{already_markdown:true,raw_text:'## Apartado renombrado'}});
 await page.locator('#pagePeekEditor a').filter({hasText:topic}).click();await page.getByText('El apartado ha cambiado. Vuelve a vincularlo desde el temario.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>currentEntryId),root);assert.equal(await page.evaluate(()=>_peekEntryId),source);
 assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/atlas-course-topic-${width}.png`});console.log('PASS '+width+'px: native links, unique matching, manual mapping, exact section, repeated return, stale destination protection');await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
