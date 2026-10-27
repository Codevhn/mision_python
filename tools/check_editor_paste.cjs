// Exercises the shipped editor's clipboard pipeline in Chromium, without a
// server or live user data. Clipboard MIME payloads are simulated; this is not
// evidence of testing Notion or a physical mobile device.
// Run after npm run build in knowledge_base/editor-src.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.find(arg=>arg.startsWith('--baseline='))?.slice('--baseline='.length);
const html = `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/static/blocknote/editor.bundle.css">
<div id="entryBody"></div><script src="/static/blocknote/editor.bundle.js"></script></html>`;
const mixed = '# Arquitectura de Python\n\nUn documento con **énfasis** y código, no un único programa.\n\n'
  + '1. Compilar el código fuente\n2. Ejecutar en la máquina virtual\n\n'
  + '```python\nimport dis\n\ndef validate(port):\n    return port > 1024\n\nprint(validate(5001))\n```\n\nFin del documento.';

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  try {
    const profiles = [
      {label:'desktop',viewport:{width:1440,height:900}},
      {label:'Android phone',viewport:{width:412,height:915},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'},
      {label:'Android tablet',viewport:{width:1480,height:924},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'},
    ];
    for (const {label,...profile} of profiles) {
      const context = await browser.newContext(profile);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://atlas.test/**', route => {
        const file = new URL(route.request().url()).pathname;
        if (file === '/') return route.fulfill({contentType:'text/html',body:html});
        const target = path.join(root, 'knowledge_base', file);
        if (!fs.existsSync(target)) return route.fulfill({status:404,body:''});
        const body = baseline ? execFileSync('git',['show',`${baseline}:knowledge_base${file}`],{cwd:root,maxBuffer:25*1024*1024}) : fs.readFileSync(target);
        return route.fulfill({body,contentType:file.endsWith('.js')?'application/javascript':'text/css'});
      });
      await page.goto('http://atlas.test/');
      const reset = async (markdown = '') => {
        await page.evaluate(markdown => {
          window.editor?.destroy();
          window.editor = BlockEditor.create({container:document.getElementById('entryBody')});
          editor.load(markdown);
        }, markdown);
        await page.waitForSelector('.bn-editor .bn-inline-content');
        await page.locator('.bn-editor .bn-inline-content').first().click();
      };
      const paste = async payload => {
        await page.evaluate(payload => {
          const data = new DataTransfer();
          for (const [mime,text] of Object.entries(payload)) data.setData(mime,text);
          const selection = getSelection();
          const anchor = selection.anchorNode;
          const target = anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement;
          if (!target?.closest('.bn-inline-content')) throw new Error('Paste requires an editor selection');
          // Dispatch in the actual content DOM, including React code node views.
          target.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
        }, payload);
      };
      const blocks = () => page.locator('.bn-editor .bn-block-content').evaluateAll(elements => elements.map(e => ({type:e.dataset.contentType,text:e.querySelector('.bn-inline-content')?.textContent,language:e.dataset.language})));
      const markdown = () => page.evaluate(() => editor.getMarkdown());
      const waitText = text => page.waitForFunction(text => document.querySelector('.bn-editor')?.textContent.includes(text),text);
      const assertMixed = async () => {
        const value = await blocks();
        assert.ok(value.some(b=>b.type==='heading' && b.text==='Arquitectura de Python'),JSON.stringify(value));
        assert.equal(value.filter(b=>b.type==='numberedListItem').length,2,JSON.stringify(value));
        const code = value.filter(b=>b.type==='codeBlock');
        assert.equal(code.length,1,JSON.stringify(value));
        assert.equal(code[0].language,'python');
        assert.equal(code[0].text,'import dis\n\ndef validate(port):\n    return port > 1024\n\nprint(validate(5001))');
        assert.ok(await page.locator('.bn-editor strong').filter({hasText:'énfasis'}).count());
        assert.ok(value.some(b=>b.type==='paragraph' && b.text==='Fin del documento.'));
      };

      await reset();
      await paste({'text/plain':mixed});
      await waitText('Fin del documento.');
      await assertMixed();
      const saved = await markdown();
      await reset(saved);
      await assertMixed();
      console.log(`PASS ${label}: mixed Markdown, separate blocks, formatting and save/reload`);

      // Obtain the proprietary clipboard payload from the editor itself, rather
      // than inventing it. A copy/paste within Atlas must retain block structure.
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(50);
      const copied = await page.evaluate(() => {
        const data = new DataTransfer();
        document.querySelector('.bn-editor').dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));
        return Object.fromEntries([...data.types].map(mime=>[mime,data.getData(mime)]));
      });
      assert.ok(copied['blocknote/html'],'Native copy must emit structural metadata');
      await reset();
      await paste(copied);
      await waitText('Fin del documento.');
      await assertMixed();

      await reset();
      await paste({'text/markdown':mixed});
      await waitText('Fin del documento.');
      await assertMixed();

      await reset();
      await paste({'text/plain':'Resumen\nDocumento HTML\nimport os\nprint(os.name)',
        'text/html':'<h2>Resumen HTML</h2><p>Contenido <strong>importante</strong> con <a href="https://example.org/">enlace</a>.</p><ul><li>Uno</li><li>Dos</li></ul><pre><code class="language-python">import os\nprint(&quot;&lt;tag&gt;&amp;&quot;)</code></pre>'});
      await waitText('Resumen HTML');
      const rich = await blocks();
      assert.ok(rich.some(b=>b.type==='heading' && b.text==='Resumen HTML'),JSON.stringify(rich));
      assert.equal(rich.filter(b=>b.type==='bulletListItem').length,2);
      assert.equal(rich.filter(b=>b.type==='codeBlock').length,1);
      assert.equal(rich.find(b=>b.type==='codeBlock').text,'import os\nprint("<tag>&")');
      assert.equal(await page.locator('.bn-editor a[href="https://example.org/"]').count(),1);
      assert.equal(await page.locator('.bn-editor strong').filter({hasText:'importante'}).count(),1);

      // Rich HTML is authoritative even if its text/plain fallback resembles
      // Markdown (e.g. Python comments copied from a formatted web document).
      await reset();
      await paste({'text/plain':'# Comentario literal\n\nTexto con **asteriscos literales**.',
        'text/html':'<pre><code class="language-python"># Comentario literal</code></pre><p>Texto con <strong>formato original</strong>.</p>'});
      await waitText('formato original');
      assert.equal((await blocks()).filter(b=>b.type==='heading').length,0);
      assert.equal((await blocks()).find(b=>b.type==='codeBlock').text,'# Comentario literal');
      assert.equal(await page.locator('.bn-editor strong').filter({hasText:'formato original'}).count(),1);

      await reset();
      await paste({'text/plain':'# Primer tema\n\nTexto explicativo.\n\n## Segundo tema\n\nMás texto.'});
      await waitText('Más texto.');
      assert.equal((await blocks()).filter(b=>b.type==='heading').length,2);
      assert.equal((await blocks()).filter(b=>b.type==='codeBlock').length,0);
      console.log(`PASS ${label}: native copy/paste, Markdown MIME, HTML semantics/priority, no heading false positives`);

      await reset('```python\noriginal\n```');
      await page.keyboard.press('End');
      const literal = '\n# literal\nimport os\nprint("literal")\n**sin formato**';
      await paste({'text/plain':literal,'text/html':'<h1>No debe usarse</h1>','vscode-editor-data':JSON.stringify({mode:'python'})});
      await waitText('sin formato');
      const code = (await blocks()).filter(b=>b.type==='codeBlock');
      assert.equal(code.length,1);
      assert.ok(code[0].text.includes(literal));
      assert.equal(code[0].text.replace(literal,''),'original');
      assert.equal(await page.locator('.bn-editor strong').count(),0);

      await reset();
      await paste({'text/plain':'import os\r\nprint("<tag>&")\r\n    # conserva sangría','vscode-editor-data':JSON.stringify({mode:'python'})});
      await waitText('conserva sangría');
      const vscode = await blocks();
      assert.equal(vscode.find(b=>b.type==='codeBlock')?.language,'python',JSON.stringify(vscode));
      assert.equal(vscode.find(b=>b.type==='codeBlock').text,'import os\nprint("<tag>&")\n    # conserva sangría');

      await reset();
      await paste({'text/plain':'## Metadatos inválidos\n\nEl contenido se conserva.','vscode-editor-data':'{invalid'});
      await waitText('El contenido se conserva.');
      assert.equal((await blocks()).filter(b=>b.type==='heading').length,1);

      await reset();
      await paste({'text/plain':'Una explicación normal.\n\nOtro párrafo con acentos: conexión.'});
      await waitText('conexión.');
      assert.equal((await blocks()).filter(b=>b.type==='codeBlock').length,0);
      assert.equal((await blocks()).filter(b=>b.type==='paragraph' && b.text).length,2);

      await reset('Antes DESTINO después');
      await page.evaluate(() => {
        const node = document.querySelector('.bn-editor .bn-inline-content').firstChild;
        const range = document.createRange();
        range.setStart(node,6);range.setEnd(node,13);
        getSelection().removeAllRanges();getSelection().addRange(range);
      });
      // Let ProseMirror observe the browser selectionchange before dispatch.
      await page.waitForTimeout(50);
      await paste({'text/plain':'nuevo'});
      await waitText('Antes nuevo después');
      assert.equal((await markdown()).trim(),'Antes nuevo después');

      await reset();
      await paste({'text/plain':mixed});
      await waitText('Fin del documento.');
      await page.keyboard.press('Control+z');
      assert.equal((await markdown()).trim(),'','A paste must undo as one native operation');
      await page.keyboard.press('Control+Shift+z');
      await assertMixed();

      await reset('Contenido protegido');
      await page.evaluate(()=>editor.setEditable(false));
      const before = await markdown();
      await paste({'text/plain':mixed});
      assert.equal(await markdown(),before,'Read-only pages must reject paste');
      assert.deepEqual(errors,[],'No browser errors');
      console.log(`PASS ${label}: literal code paste, VS Code metadata, prose, selection replacement, undo/redo and read-only`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
