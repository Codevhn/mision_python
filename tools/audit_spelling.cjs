// Read-only audit of the shipped editor in disposable browser contexts.
// Records observed behavior; does not require defects to remain in place.
// Clipboard, personal documents, remote proofreading and LLMs are not used.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const report=[];
 try {
  for (const profile of [
   {name:'desktop',viewport:{width:1440,height:900}},
   {name:'phone',viewport:{width:412,height:915},hasTouch:true,isMobile:true},
   {name:'tablet',viewport:{width:1480,height:924},hasTouch:true,isMobile:true},
  ]) {
   const {name,...options}=profile;
   const context=await browser.newContext(options);
   const page=await context.newPage();
   const remote=[];const errors=[];
   page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message)});
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://atlas.test'){remote.push(url.origin);return route.abort();}
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/blocknote/editor.bundle.css"></head><body><div id="entryBody"></div><script src="/static/blocknote/editor.bundle.js"></script></body></html>'});
    const file=path.join(root,'knowledge_base',url.pathname);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/plain'});
   });
   await page.goto('http://atlas.test/');
   await page.waitForFunction(()=>typeof BlockEditor!=='undefined');
   const reset=async text=>{
    await page.evaluate(text=>{window.editor?.destroy();window.AtlasSpellingSettings?.set({language:'es',method:'local'});window.editor=BlockEditor.create({container:document.getElementById('entryBody')});editor.load(text);},text);
    await page.waitForSelector('.atlas-spelling-error');
   };
   const row={profile:name};
   await reset('Hécate abjeto reciept librery alomejor aver.');
   row.marked=await page.locator('.atlas-spelling-error').allTextContents();
   await page.locator('.atlas-spelling-error').filter({hasText:'Hécate'}).click();
   await page.waitForSelector('.atlas-spelling-popover');
   row.wordSuggestions=await page.locator('.atlas-spelling-suggestions button').allTextContents();
   await page.locator('.atlas-spelling-actions button').filter({hasText:'Corregir párrafo'}).click();
   row.paragraphDefaults=await page.locator('.atlas-spelling-review select').evaluateAll(nodes=>nodes.map(node=>({word:node.getAttribute('aria-label'),selected:node.value})));
   row.defaultApplyDisabled=await page.locator('.atlas-spelling-review button[type="submit"]').isDisabled();
   if(!row.defaultApplyDisabled)await page.locator('.atlas-spelling-review button[type="submit"]').click();
   else await page.locator('.atlas-spelling-review .atlas-spelling-cancel').click();
   row.paragraphAfterAcceptingDefaults=await page.evaluate(()=>editor.getMarkdown());

   await reset('abjeto');
   await page.evaluate(()=>editor.setEditable(false));
   row.readonlyBefore=await page.evaluate(()=>editor.getMarkdown());
   await page.locator('.atlas-spelling-error').click();
   row.readonlyProposalDisabled=await page.locator('.atlas-spelling-suggestions button').first().isDisabled();
   if(!row.readonlyProposalDisabled)await page.locator('.atlas-spelling-suggestions button').first().click();
   row.readonlyAfter=await page.evaluate(()=>editor.getMarkdown());
   row.readonlyMutated=row.readonlyBefore!==row.readonlyAfter;

   await reset('abjeto');
   await page.locator('.atlas-spelling-error').click();
   await page.locator('.atlas-spelling-actions button').filter({hasText:'Corregir párrafo'}).click();
   await page.evaluate(()=>editor.load('Documento actualizado.'));
   await page.locator('.atlas-spelling-review form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   row.staleReviewMessage=await page.locator('.atlas-spelling-review [role="status"]').textContent();
   row.staleDocument=await page.evaluate(()=>editor.getMarkdown());
   assert.ok(row.staleDocument.includes('Documento actualizado.'));
   await page.locator('.atlas-spelling-review .atlas-spelling-cancel').click();

   await reset('abjeto\n\n```text\nabjeto\n```\n\n[abjeto](https://example.org)');
   row.codeMarks=await page.locator('[data-content-type="codeBlock"] .atlas-spelling-error').count();
   row.linkMarks=await page.locator('a .atlas-spelling-error').count();
   assert.equal(row.codeMarks,0);assert.equal(row.linkMarks,0);
   row.remoteOrigins=remote;row.browserErrors=errors;
   assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
   report.push(row);await context.close();
  }
  const output=process.env.ATLAS_SPELLING_AUDIT_OUTPUT||'/tmp/atlas-spelling-browser-audit.json';
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
