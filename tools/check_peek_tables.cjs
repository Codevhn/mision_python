// Full Atlas fixture only; verifies the same record in Side, Center and full page.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1697,height:1000},{width:1480,height:924},{width:412,height:915}]){
   const context=await browser.newContext({viewport}),page=await context.newPage();
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
   const markdown='| Módulo | Objetivo |\n|---|---|\n| M01 | Entorno y mentalidad técnica |\n| M02 | Sintaxis básica |';
   const response=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'QA tablas Peek',already_markdown:true,raw_text:markdown}});
   assert.ok(response.ok());const id=(await response.json()).id;
   await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');
   const styles=async selector=>page.locator(selector+' .tableWrapper').first().evaluate(wrapper=>{
    const properties=['borderTopWidth','borderTopColor','borderTopStyle','borderRightWidth','borderRightColor','borderBottomWidth','borderBottomColor','borderLeftWidth','borderLeftColor','backgroundColor','paddingTop','paddingRight','fontSize','fontWeight','color'];
    return [...wrapper.querySelectorAll('th,td')].map(cell=>Object.fromEntries(properties.map(property=>[property,getComputedStyle(cell)[property]])));
   });
   for(const theme of ['aero','opencode-dark','hyprland','notion-native','light']){
    await page.evaluate(theme=>setAtlasTheme(theme,true),theme);
    await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);
    await page.waitForSelector('#pagePeekEditor .tableWrapper td');await page.waitForTimeout(400);
    const side=await styles('#pagePeekEditor');assert.equal(side.length,6);
    await page.getByRole('button',{name:'Cambiar modo Peek',exact:true}).click();
    await page.getByRole('button',{name:/Center Peek/}).click();
    assert.deepEqual(await styles('#pagePeekEditor'),side,theme+': Center matches Side');
    await page.getByRole('button',{name:'Abrir como página completa',exact:true}).click();
    await page.waitForSelector('#entryBody .tableWrapper td');await page.waitForTimeout(400);
    assert.deepEqual(await styles('#entryBody'),side,theme+': full page matches Peek');
    assert.equal((await context.request.get(base+`/api/entry/${id}`).then(r=>r.json())).markdown.trim(),markdown);
   }
   console.log(`PASS ${viewport.width}px: identical cell borders, colors, backgrounds and spacing in five themes and three modes`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
