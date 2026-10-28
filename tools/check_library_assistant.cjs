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
      const page=await context.newPage();const errors=[],questions=[];page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.method()==='POST' && /\/api\/assistant\/conversations\/[^/]+\/messages$/.test(new URL(request.url()).pathname))questions.push(request.postDataJSON());});
      await page.goto(base);
      await page.waitForFunction(()=>typeof window._openLibraryReader==='function');
      await page.evaluate(()=>window._openLibraryReader('book-a'));
      await page.waitForSelector('.pdf-page-wrap canvas');
      assert.equal((await page.evaluate(()=>window._getAssistantVisibleContext())).type,'book');
      await page.locator('#readerAssistantBtn').click();
      await page.locator('#assistantNew').click();
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

      const selectTerm=async()=>{
        if(await page.locator('#assistantArea').isVisible())await page.locator('#assistantClose').click();
        await page.locator('.pdf-text-layer span').filter({hasText:'Hécate'}).first().evaluate(element=>{
          const node=element.firstChild,start=node.textContent.indexOf('Hécate');
          const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+'Hécate'.length);
          getSelection().removeAllRanges();getSelection().addRange(range);
          element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        });
        await page.locator('.sel-toolbar [data-act="explain"]').waitFor();
      };
      const before=questions.length;
      await selectTerm();
      assert.equal(questions.length,before,'Selecting text must not generate a model response');
      await page.locator('.sel-toolbar [data-act="explain"]').click();
      await page.waitForFunction(()=>document.querySelector('.assistant-message-assistant:last-child')?.textContent.includes('Hécate es el término seleccionado'));
      await page.locator('#assistantSend:not([disabled])').waitFor();
      assert.equal(questions.length,before+1,'Explain is one request, without a second prompt/confirmation');
      assert.equal(questions.at(-1).selection_context.text,'Hécate');
      assert.equal(questions.at(-1).selection_action,'explain');
      assert.equal(questions.at(-1).current_context.id,'book-a');
      assert.equal(questions.at(-1).current_context.page,2);
      assert.ok(questions.at(-1).prompt.includes('libro abierto'));
      assert.equal(await page.locator('.sel-toolbar-floating').count(),0,'Do not reopen the toolbar after its own action');
      assert.equal(await page.locator('#assistantInput').evaluate(e=>document.activeElement===e),false,'Quick explanation must not summon the keyboard');
      const draft='Mi pregunta pendiente, que no debe enviarse automáticamente.';
      await page.locator('#assistantInput').fill(draft);
      await selectTerm();await page.locator('.sel-toolbar [data-act="explain"]').click();
      await page.waitForFunction(count=>document.querySelectorAll('.assistant-message-assistant').length>=count,3);
      await page.locator('#assistantSend:not([disabled])').waitFor();
      assert.equal(questions.length,before+2);
      assert.equal(await page.locator('#assistantInput').inputValue(),draft,'Preserve a custom draft');
      assert.ok(!questions.at(-1).prompt.includes(draft),'Do not send the draft as the explanation request');
      await selectTerm();await page.locator('.sel-toolbar [data-act="ask"]').click();
      await page.locator('#assistantSelection').waitFor();
      assert.equal(await page.locator('#assistantSelection summary').textContent(),'Selección · Hécate');
      assert.equal(await page.locator('#assistantSelection blockquote').textContent(),'Hécate');
      assert.equal(questions.length,before+2,'Custom question only prepares selection');
      await page.locator('#assistantInput').fill('');
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
      console.log(`PASS ${profile.viewport.width}px: PDF/EPUB references; one-click term explanation; no request on selection; draft/custom question and keyboard behavior`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
