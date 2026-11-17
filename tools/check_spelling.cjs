// Regression checks using the shipped editor and Abc panel. Only LanguageTool's
// response is simulated; dictionaries, UI, ranges, editing and history are real.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dialog=fs.readFileSync(path.join(root,'knowledge_base/templates/index.html'),'utf8').match(/<dialog id="proofreadingDialog"[\s\S]*?<\/dialog>/)[0];
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/blocknote/editor.bundle.css"><link rel="stylesheet" href="/static/proofreading.css"><link rel="stylesheet" href="/static/themes.css"><button id="proofreadingToggle">Abc</button><div id="entryBody"></div>${dialog}<script>window._mountModelSelector=()=>{};window.showToast=(message)=>window.lastToast=message;</script><script src="/static/blocknote/editor.bundle.js"></script><script src="/static/proofreading.js"></script></html>`;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const config of [{label:'desktop',viewport:{width:1440,height:900}},{label:'phone',viewport:{width:412,height:915},hasTouch:true,isMobile:true},{label:'tablet',viewport:{width:1480,height:924},hasTouch:true,isMobile:true}]){
   const {label,...options}=config,context=await browser.newContext(options),page=await context.newPage();
   const requests=[],errors=[];let delayed=null,rateLimit=false;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('http://atlas.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/proofreading/check'){
     const body=route.request().postDataJSON();requests.push(body);
     if(body.text.includes('Tardio'))await new Promise(resolve=>delayed=resolve);
     if(rateLimit)return route.fulfill({status:429,json:{error:'LanguageTool alcanzó su límite.'}});
     const matches=[];
     for(const [wrong,right] of [['abjeto','objeto'],['librery','library'],['reciept','receipt'],['aver','a ver']]){
      const offset=body.text.indexOf(wrong);if(offset>=0)matches.push({offset,length:wrong.length,message:'Propuesta contextual',replacements:[right]});
     }
     return route.fulfill({json:{matches,mode:'languagetool',language:body.language}});
    }
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
    const file=path.join(root,'knowledge_base',url.pathname);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/plain'});
   });
   await page.goto('http://atlas.test/');
   const reset=async(text,settings={language:'es',method:'languagetool'})=>{
    await page.evaluate(({text,settings})=>{window.editor?.destroy();AtlasSpellingSettings.set(settings);window.editor=BlockEditor.create({container:document.getElementById('entryBody')});editor.load(text);},{text,settings});
    await page.waitForSelector('.bn-inline-content');
   };
   const word=text=>page.locator('.atlas-spelling-error').filter({hasText:text}).first();
   const openWord=async text=>{await word(text).click();await page.waitForSelector('.atlas-spelling-popover');};
   const close=async()=>page.keyboard.press('Escape');
   const md=()=>page.evaluate(()=>editor.getMarkdown());
   const settle=()=>page.waitForTimeout(550);

   await reset('Hécate abjeto.');
   await openWord('Hécate');
   await page.locator('.atlas-spelling-section-label').filter({hasText:'LanguageTool'}).waitFor();
   assert.equal(await page.locator('.atlas-spelling-suggestions button').count(),0,'Contextual service does not propose Sécate');
   assert.equal(requests.length,1);assert.equal(requests[0].text,'Hécate abjeto.');
   await close();
   await page.waitForFunction(()=>![...document.querySelectorAll('.atlas-spelling-error')].some(node=>node.textContent==='Hécate'));
   await openWord('abjeto');
   await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).waitFor();
   assert.equal(requests.length,1,'Second word in the same paragraph uses cache');
   await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).click();
   assert.equal(await md(),'Hécate objeto.');
   await page.keyboard.press('Control+z');assert.equal(await md(),'Hécate abjeto.');

   await reset('😀 **abjeto** junto a [abjeto](https://example.org).\n\n```text\nabjeto\n```');
   await openWord('abjeto');
   await page.locator('.atlas-spelling-suggestions button').filter({hasText:'objeto'}).click();
   assert.ok((await md()).includes('**objeto**'),'Formatting and UTF-16 positions retained');
   assert.ok((await md()).includes('[abjeto]'),'Link remains unchanged');
   assert.ok((await md()).includes('```text\nabjeto'),'Code remains unchanged');

   await reset('abjeto',{language:'es',method:'local'});await openWord('abjeto');
   assert.ok(!(await page.locator('.atlas-spelling-suggestions button').allTextContents()).includes('abject'));
   await page.locator('.atlas-spelling-actions button').filter({hasText:'Corregir párrafo'}).click();
   assert.equal(await page.locator('.atlas-spelling-review select').inputValue(),'abjeto');
   assert.equal(await page.locator('.atlas-spelling-review [type="submit"]').isDisabled(),true,'No implicit corrections');
   await page.locator('.atlas-spelling-review select').selectOption('objeto');
   assert.equal(await page.locator('.atlas-spelling-review [type="submit"]').isEnabled(),true);
   await page.locator('.atlas-spelling-review [type="submit"]').click();assert.equal(await md(),'objeto');
   await page.keyboard.press('Control+z');assert.equal(await md(),'abjeto');

   await reset('abjeto',{language:'es',method:'local'});await page.evaluate(()=>editor.setEditable(false));await openWord('abjeto');
   assert.equal(await page.locator('.atlas-spelling-suggestions button').first().isDisabled(),true);
   assert.equal(await md(),'abjeto');
   await close();await page.evaluate(()=>editor.setEditable(true));await openWord('abjeto');
   await page.locator('.atlas-spelling-actions button').filter({hasText:'Corregir párrafo'}).click();
   await page.locator('.atlas-spelling-review select').selectOption('objeto');
   await page.evaluate(()=>editor.setEditable(false));
   assert.equal(await page.locator('.atlas-spelling-review [type="submit"]').isDisabled(),true,'Lock while review open');
   await page.locator('.atlas-spelling-review form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(await md(),'abjeto');
   assert.ok((await page.locator('.atlas-spelling-review [role="status"]').textContent()).includes('solo lectura'));
   await page.locator('.atlas-spelling-cancel').click();

   await reset('abjeto',{language:'es',method:'local'});await openWord('abjeto');
   await page.locator('.atlas-spelling-actions button').filter({hasText:'Corregir párrafo'}).click();
   await page.locator('.atlas-spelling-review select').selectOption('objeto');
   await page.evaluate(()=>editor.load('Documento actualizado.'));
   assert.equal(await page.locator('.atlas-spelling-review [type="submit"]').isDisabled(),true);
   await page.locator('.atlas-spelling-review form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(await md(),'Documento actualizado.');await page.locator('.atlas-spelling-cancel').click();

   await reset('Un a\u0301rbol es un árbol.',{language:'es',method:'local'});await settle();
   assert.equal(await page.locator('.atlas-spelling-error').filter({hasText:'rbol'}).count(),0);
   await reset('A librery with a reciept.',{language:'en-US',method:'local'});await openWord('librery');
   assert.deepEqual(await page.locator('.atlas-spelling-suggestions button').allTextContents(),['library']);await close();

   await reset('Tardio abjeto.');await openWord('abjeto');
   while(!delayed)await page.waitForTimeout(30);
   await page.evaluate(()=>editor.load('Una página diferente.'));delayed();delayed=null;await settle();
   assert.equal(await page.locator('.atlas-spelling-popover').count(),0,'Stale reply cannot reopen popup');
   assert.equal(await md(),'Una página diferente.');

   await reset('aver lo que pasa.');await openWord('aver');
   const panelRect=await page.locator('.atlas-spelling-popover').boundingBox();
   assert.ok(panelRect.x>=0&&panelRect.y>=0&&panelRect.x+panelRect.width<=options.viewport.width+1&&panelRect.y+panelRect.height<=options.viewport.height+1,'Popup inside viewport');
   await page.locator('.atlas-spelling-actions button').filter({hasText:'Corregir párrafo'}).click();
   await page.locator('.atlas-spelling-review select').waitFor();
   assert.equal(await page.locator('.atlas-spelling-review select').inputValue(),'aver');
   await page.locator('.atlas-spelling-review select').selectOption('a ver');
   await page.locator('.atlas-spelling-review [type="submit"]').click();assert.equal(await md(),'a ver lo que pasa.');

   // The full Abc panel shares language/settings and the contextual transport.
   await page.evaluate(()=>{editor.load('A librery.');AtlasSpellingSettings.set({language:'en-US'});});
   await page.waitForTimeout(500);
   await page.evaluate(()=>{const node=document.querySelector('.bn-inline-content');const range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);});
   await page.waitForTimeout(60);
   await page.locator('#proofreadingToggle').click();
   assert.equal(await page.locator('#proofreadingLanguage').inputValue(),'en-US');
   assert.equal(await page.locator('#proofreadingSource').inputValue(),'A librery.');
   await page.locator('#proofreadingCheck').click();
   await page.locator('#proofreadingIssues button').filter({hasText:'library'}).click();
   await page.locator('#proofreadingApply').click();assert.equal(await md(),'A library.');
   await page.keyboard.press('Control+z');assert.equal(await md(),'A librery.');

   rateLimit=true;await reset('Otro abjeto para límite.');await openWord('abjeto');
   await page.waitForFunction(()=>document.querySelector('.atlas-spelling-context-status')?.textContent.includes('límite'));
   assert.ok((await page.locator('.atlas-spelling-suggestions button').allTextContents()).includes('objeto'),'Explicit local candidates stay usable after a quota error');
   assert.ok((await page.locator('.atlas-spelling-section-label').textContent()).includes('local'));
   assert.deepEqual(errors,[]);
   console.log(`PASS ${label}: contextual popup/cache, language/NFD, preserve defaults, read-only/stale guards, formatted edits/undo, Abc panel, viewport and quota errors`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
