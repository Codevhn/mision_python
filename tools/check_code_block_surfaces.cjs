// Regression check against the disposable Atlas fixture, never personal data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const firstCode='import this\nprint("Atlas")';
const body='Lectura antes del código.\n\n```python\n'+firstCode+'\n```\n\nEl resultado es:\n\n```bash\necho "Resultado"\n```\n\nLectura después del código.';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,412]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedCode=text;}}}));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.route('**/api/execute',route=>route.fulfill({json:{output:'Atlas\n',stderr:'',returncode:0}}));
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const response=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'Bloques de código cercanos',already_markdown:true,raw_text:body}});assert.ok(response.ok());const id=(await response.json()).id;
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>typeof _openPagePeek==='function');await page.evaluate(id=>_loadEntryById(id),id);
  for(const mode of ['page','peek']){
   if(mode==='peek')await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);
   const surface=mode==='peek'?'#pagePeekEditor':'#entryBody';
   const blocks=page.locator(surface+' .code-block-native');await blocks.nth(1).waitFor();const first=blocks.nth(0),second=blocks.nth(1);
   let reference;
   for(const theme of ['notion-native','paper','aero-amethyst']){
    await page.evaluate(id=>setAtlasTheme(id,true),theme);
    await page.waitForFunction(selector=>document.querySelector(selector+' .code-block-pre span[style*="color"]'),surface);
    const syntax=await first.locator('.code-block-pre').evaluate(node=>({background:getComputedStyle(node).backgroundColor,colors:[...new Set([...node.querySelectorAll('span[style*="color"]')].map(span=>getComputedStyle(span).color))].sort()}));
    assert.equal(syntax.background,'rgb(30, 35, 43)');assert.ok(syntax.colors.length>=3,JSON.stringify(syntax));
    if(reference)assert.deepEqual(syntax,reference,'Themes preserve the same syntax palette');else reference=syntax;
    await first.locator('.code-block-lang-btn').click();await first.getByRole('listbox').waitFor();
    const lower=await second.locator('.code-block-header').boundingBox(),menu=await first.getByRole('listbox').boundingBox();
    const y=Math.max(lower.y,menu.y)+Math.min(lower.height,menu.height)/2,x=menu.x+30;
    assert.ok(y<menu.y+menu.height,'The open list overlaps the following header');
    const hit=await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.code-block-lang-menu'),{x,y});
    assert.equal(hit,true,`${width}px ${mode} ${theme}: language options must paint above the next header`);
    await page.screenshot({path:`/tmp/atlas-code-menu-${mode}-${theme}-${width}.png`});
    // Select the option whose location the second header used to cover.
    await first.getByRole('option',{name:/JavaScript/}).click();
    assert.equal(await first.locator('.code-block-lang-name').innerText(),'JavaScript');
    assert.equal(await first.locator('.code-block-pre').innerText(),firstCode);
    await first.locator('.code-block-lang-btn').click();await first.locator('.code-block-lang-search').fill('python');await first.getByRole('option',{name:/Python/}).click();
    await first.getByRole('button',{name:'Copiar código'}).click();assert.equal(await page.evaluate(()=>window.copiedCode),firstCode);
   }
   // Clicking prose dismisses the selector before opening a second block.
   await first.locator('.code-block-lang-btn').click();await page.locator(surface+' [data-content-type=paragraph]').first().click();await second.locator('.code-block-lang-btn').click();assert.equal(await first.getByRole('listbox').count(),0);
   await second.locator('.code-block-lang-search').fill('no-existe');await second.getByText('Sin resultados',{exact:true}).waitFor();await second.locator('.code-block-lang-btn').click();
   await first.getByRole('button',{name:'Ejecutar'}).click();await first.locator('.code-block-term-out').filter({hasText:'Atlas'}).waitFor();await first.getByRole('button',{name:'Limpiar output'}).click();
  }
  await page.evaluate(()=>_closePagePeek());await page.evaluate(()=>AtlasDatabase.flush());
  const saved=await (await context.request.get(base+`/api/entry/${id}`)).json();assert.ok(saved.markdown.includes(firstCode)&&saved.markdown.includes('echo "Resultado"'));assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: page/Peek adjacent header hit testing, real language selection/search, syntax colors across Papel/dark/Aero, copy, execution UI and preserved code.`);
  await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
