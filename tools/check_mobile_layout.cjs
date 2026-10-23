// Run with Node and Playwright installed; no server, credentials or live data.
// Uses the shipped editor, application CSS and production model-picker code.
// Keyboard/viewport changes are simulated: this is not a physical-device test.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const read = file => baseline ? execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}) : fs.readFileSync(path.join(root, file), 'utf8');
const app = read('knowledge_base/static/app.js');
const assistant = read('knowledge_base/static/assistant.js');
const picker = app.slice(app.indexOf('function _mountSearchableModelSelect('), app.indexOf('\nfunction _mountModelSelector('));
const viewportCode = assistant.slice(assistant.indexOf('  const updateViewport ='), assistant.indexOf('  async function offerKnowledgeDevelopment'));
const chat = assistant.match(/area.innerHTML = `(<div class="assistant-chat">[^`]+)`;/)[1];
const styles = ['style.css', 'assistant.css', 'themes.css', 'course-themes.css', 'horizon.css', 'blocknote/editor.bundle.css'];
const html = `<!doctype html><html data-theme="light" lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${styles.map(file => `<link rel="stylesheet" href="/static/${file}">`).join('')}
<main style="position:absolute;inset:0;overflow:auto"><div class="entry-view"><div id="entryBody" class="entry-body"></div></div></main>
<aside class="assistant-area hidden" id="assistantArea">${chat}</aside>
<script src="/static/blocknote/editor.bundle.js"></script></html>`;

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  try {
    for (const [width,height,touch] of [[412,915,true],[800,1280,true],[1280,800,true],[1440,900,false]]) {
      const context = await browser.newContext({viewport:{width,height}, isMobile:touch, hasTouch:touch});
      const page = await context.newPage();
      page.on('pageerror', error => console.error('Browser:', error.message));
      await page.route('http://atlas.test/**', route => {
        const file = new URL(route.request().url()).pathname;
        if (file === '/') return route.fulfill({contentType:'text/html',body:html});
        const target = path.join(root, 'knowledge_base', file);
        if (!fs.existsSync(target)) return route.fulfill({status:404,body:''});
        if (file.endsWith('.css')) return route.fulfill({body:read('knowledge_base'+file),contentType:'text/css'});
        return route.fulfill({path:target,contentType:file.endsWith('.js')?'application/javascript':'application/octet-stream'});
      });
      await page.goto('http://atlas.test/');
      await page.evaluate(() => {
        window.editor = BlockEditor.create({container:document.getElementById('entryBody')});
        editor.load('## Movimiento básico\n\n```text\nh j k l                 ← ↓ ↑ →\nw / b                   siguiente/anterior palabra\n' + 'Una línea muy larga '.repeat(30) + '\n```\n');
      });
      await page.waitForSelector('.code-block-pre');
      const code = await page.evaluate(() => {
        const pre = document.querySelector('.code-block-pre');
        const frame = document.querySelector('.code-block-native');
        const body = document.getElementById('entryBody');
        const r = frame.getBoundingClientRect(), b = body.getBoundingClientRect();
        pre.scrollLeft = 100;
        return {left:r.left,right:r.right,center:(r.left+r.right)/2,bodyCenter:(b.left+b.right)/2,
          background:getComputedStyle(pre).backgroundColor,innerBackground:getComputedStyle(pre.querySelector('code')).backgroundColor,
          scroll:pre.scrollLeft,whiteSpace:getComputedStyle(pre.querySelector('.bn-inline-content')).whiteSpace};
      });
      assert.ok(code.left >= 0 && code.right <= width, JSON.stringify(code));
      assert.ok(Math.abs(code.center-code.bodyCenter) < 2, JSON.stringify(code));
      assert.equal(code.background, 'rgb(30, 35, 43)');
      assert.equal(code.innerBackground, code.background);
      assert.equal(code.whiteSpace,'pre');
      assert.ok(code.scroll > 0, 'Long code must scroll inside its frame');
      await page.evaluate(()=>{document.querySelector('.code-block-pre').scrollLeft=0;});
      for (const theme of ['dark','light']) {
        await page.evaluate(theme=>{
          document.documentElement.dataset.theme=theme;
          document.documentElement.dataset.style='aero';
        },theme);
        assert.equal(await page.locator('.code-block-pre code').evaluate(e=>getComputedStyle(e).backgroundColor),code.background);
      }
      if (process.env.ATLAS_SCREENSHOTS) {
        fs.mkdirSync(process.env.ATLAS_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOTS,`code-${width}.png`)});
      }
      await page.evaluate(({picker,viewportCode}) => {
        const area = document.getElementById('assistantArea'); area.classList.remove('hidden');
        const vv = new EventTarget();
        Object.assign(vv,{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0});
        Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
        window.escapeHtml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
        new Function('area',viewportCode)(area);
        new Function(picker+';window.mountPicker=_mountSearchableModelSelect;')();
        mountPicker(document.getElementById('assistantModel'),{
          options:Array.from({length:20},(_,i)=>({value:String(i),name:'Modelo '+i,provider:'Local',hint:'Modelo de prueba'})),
          value:'0',onChange:value => {window.chosen=value;}
        });
      },{picker,viewportCode});
      await page.click('.ai-model-trigger');
      if (touch) assert.notEqual(await page.locator('.ai-model-search input').evaluate(e=>document.activeElement===e),true,'Touch opening must not invoke keyboard');
      else assert.equal(await page.locator('.ai-model-search input').evaluate(e=>document.activeElement===e),true);
      await page.locator('.ai-model-search input').focus();
      for (const offset of [0,45]) {
        await page.evaluate(({height,offset})=>{
          Object.assign(visualViewport,{height:Math.round(height*.55),offsetTop:offset});
          visualViewport.dispatchEvent(new Event('resize'));
          visualViewport.dispatchEvent(new Event('scroll'));
        },{height,offset});
        await page.waitForTimeout(220); // Let the Aero reveal animation settle.
        const bounds=await page.evaluate(()=>{
          const r=document.querySelector('.ai-model-panel').getBoundingClientRect();
          const list=document.querySelector('.ai-model-results');
          const panel=document.getElementById('assistantArea').getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,listHeight:list.clientHeight,panelBottom:panel.bottom};
        });
        assert.ok(bounds.top >= offset && bounds.bottom <= offset+Math.round(height*.55),JSON.stringify(bounds));
        assert.ok(bounds.left >= 0 && bounds.right <= width,JSON.stringify(bounds));
        assert.ok(bounds.listHeight >= 58, 'At least one full option remains visible: '+JSON.stringify(bounds));
        assert.ok(bounds.panelBottom <= offset+Math.round(height*.55)+2,JSON.stringify(bounds));
      }
      if (process.env.ATLAS_SCREENSHOTS) await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOTS,`picker-${width}.png`)});
      await page.locator('.ai-model-search input').fill('Modelo 19');
      await page.getByRole('option').click();
      assert.equal(await page.evaluate(()=>window.chosen),'19');
      assert.equal(await page.locator('.ai-model-panel').isVisible(),false);
      // Expanded tablet/desktop panels must follow the keyboard too.
      await page.evaluate(()=>document.getElementById('assistantArea').classList.add('assistant-expanded'));
      assert.ok(await page.locator('#assistantArea').evaluate(e=>e.getBoundingClientRect().bottom<=visualViewport.offsetTop+visualViewport.height+2));
      await page.click('.ai-model-trigger');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.ai-model-panel').isVisible(),false);
      console.log(`PASS ${width}x${height}: code centered/scrollable, touch focus, keyboard viewport, search and selection`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
