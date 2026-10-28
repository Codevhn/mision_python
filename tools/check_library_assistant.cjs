// Run against tools/run_library_assistant_fixture.py only. Real PDF renderer,
// real assistant endpoints and retrieval; the fixture substitutes the model.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8132';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    for(const profile of [{viewport:{width:1440,height:900}},{viewport:{width:1480,height:924},hasTouch:true},{viewport:{width:412,height:915},isMobile:true,hasTouch:true}]){
      const context=await browser.newContext(profile);
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(url.pathname==='/api/ai/providers')return route.fulfill({json:{default:{provider:'deepseek',model:'deepseek-v4-pro'},providers:[{id:'deepseek',name:'DeepSeek QA',models:[{id:'deepseek-v4-pro',label:'Modelo de prueba'}]}],warnings:[]}});
        return route.continue();
      });
      assert.ok((await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}})).ok());
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);
      await page.waitForFunction(()=>typeof window._openLibraryReader==='function');
      await page.evaluate(()=>window._openLibraryReader('book-a'));
      await page.waitForSelector('.pdf-page-wrap canvas');
      assert.equal((await page.evaluate(()=>window._getAssistantVisibleContext())).type,'book');
      await page.locator('#readerAssistantBtn').click();
      await page.locator('.assistant-suggestions button').filter({hasText:'Dime los temas'}).waitFor();
      await page.locator('#assistantInput').fill('Lista los temas de este libro que incluyan la palabra "ritual"');
      await page.locator('#assistantInput').press('Enter');
      await page.locator('.assistant-message-assistant .assistant-sources').last().waitFor({timeout:20000});
      const source=page.locator('.assistant-message-assistant .assistant-sources').last();
      await source.locator('summary').click();
      await source.getByRole('button',{name:'Libro de rituales QA · Página 2',exact:true}).click();
      await page.waitForFunction(()=>document.getElementById('readerLocLabel').textContent==='Página 2 de 3');
      assert.equal((await page.evaluate(()=>window._getAssistantVisibleContext())).page,2);
      // Restore an old citation after opening a different book.
      await page.evaluate(()=>window._openLibraryReader('book-b'));
      await page.waitForFunction(()=>document.getElementById('readerTitle').textContent==='Libro de cocina QA');
      assert.equal((await page.evaluate(()=>window._getAssistantVisibleContext())).id,'book-b');
      await source.getByRole('button',{name:'Libro de rituales QA · Página 2',exact:true}).click();
      await page.waitForFunction(()=>document.getElementById('readerTitle').textContent==='Libro de rituales QA' && document.getElementById('readerLocLabel').textContent==='Página 2 de 3');
      await page.evaluate(()=>window._openLibraryReader('book-epub'));
      await page.waitForFunction(()=>window._getLibraryAssistantContext?.()?.format==='epub');
      // Start a separate conversation for this EPUB and use its real chapter href.
      await page.locator('#assistantNew').click();
      await page.locator('#assistantInput').fill('Busca "ritual" en este libro');
      await page.locator('#assistantInput').press('Enter');
      const epubSource=page.locator('.assistant-message-assistant .assistant-sources').last();
      await epubSource.waitFor({timeout:20000});
      await epubSource.locator('summary').click();
      await epubSource.getByRole('button',{name:'EPUB de rituales QA · Sección 2',exact:true}).click();
      await page.waitForFunction(()=>window._getLibraryAssistantContext?.()?.href==='two.xhtml');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${profile.viewport.width}px: PDF/EPUB context, prompts, retrieval/SSE, current location and cross-book citations`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
