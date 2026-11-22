// Disposable fixture only; checks menu routing and real exported Markdown.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base='http://127.0.0.1:8132';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {for(const width of [1440,412]){
  const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const course=(await (await context.request.post(base+'/api/courses',{data:{label:`Exportación QA ${width}`}})).json()).id;
  const created=await context.request.post(base+'/api/courses/entry',{data:{course,module:'Módulo 1',title:'1.1 Lección desarrollada',raw_text:'## Tema `uv`\n\nDESARROLLO_NO_EXPORTAR.\n\n### Ejemplo interno\n\n```python\n## NO_ES_TEMA\n```\n\n## Segundo tema'}});
  assert.ok(created.ok());const id=(await created.json()).id;
  const original=(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown;
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>typeof openCourseDetail==='function');await page.evaluate(id=>openCourseDetail(id),course);
  await page.locator('#cvRoadmapMenuBtn').click();
  const menu=page.locator('.course-actions-menu');await menu.waitFor();
  const bounds=await menu.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
  await page.evaluate(()=>{window.__exportUrls=[];window.open=url=>window.__exportUrls.push(url);});
  await menu.getByRole('button',{name:'Exportar roadmap (.md)',exact:false}).click();
  const [outlineUrl]=await page.evaluate(()=>window.__exportUrls);
  assert.equal(outlineUrl,`/api/courses/${course}/export/md`);
  const outline=await (await context.request.get(base+outlineUrl)).text();
  assert.ok(outline.includes('- Tema `uv`')&&outline.includes('- Segundo tema'));
  assert.ok(!outline.includes('DESARROLLO_NO_EXPORTAR')&&!outline.includes('Ejemplo interno')&&!outline.includes('NO_ES_TEMA'));
  await page.locator('#cvRoadmapMenuBtn').click();
  await menu.getByRole('button',{name:'Exportar curso completo (.md)',exact:false}).click();
  const fullUrl=(await page.evaluate(()=>window.__exportUrls))[1];assert.ok(fullUrl.endsWith('?include_content=1'));
  const full=await (await context.request.get(base+fullUrl)).text();assert.ok(full.includes('DESARROLLO_NO_EXPORTAR'));
  assert.equal((await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown,original);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: roadmap-only export, explicit full backup, menu bounds and source preserved.`);await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
