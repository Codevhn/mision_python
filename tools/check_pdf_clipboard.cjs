// Actual PDF.js text layer -> native Ctrl+C -> native Ctrl+V -> shipped editor.
// Generated local PDF; no user books, server, model, or external services.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://localhost:8133';
const read=file=>fs.readFileSync(path.join(root,file));
const template=read('knowledge_base/templates/index.html').toString();
const shell=template.slice(template.indexOf('<div class="reader-shell'),template.indexOf('<!-- Entry cover'));
const html=`<!doctype html><html data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/static/style.css"><link rel="stylesheet" href="/static/reader.css"><link rel="stylesheet" href="/static/blocknote/editor.bundle.css">
<style>html,body{margin:0;height:100%;overflow:hidden}.fixture{position:fixed;inset:0}#editors{position:fixed;inset:0;background:white;overflow:auto;z-index:50000;padding:20px}#editors.hidden{display:none}</style>
<main class="fixture">${shell}</main><aside id="assistantArea" class="hidden"></aside><div id="editors" class="hidden"><div id="entryBody"></div></div>
<script>window.switchSpace=()=>{document.getElementById('libraryReaderView').classList.remove('hidden');window.readerReady=window._reopenLibraryReader();};</script>
<script src="/static/blocknote/editor.bundle.js"></script><script src="/static/library.js"></script>
<script type="module">import * as pdf from '/static/vendor/pdfjs/pdf.min.mjs';pdf.GlobalWorkerOptions.workerSrc='/static/vendor/pdfjs/pdf.worker.min.mjs';window.pdfjsLib=pdf;</script></html>`;
function makePDF(){
 const lines=[
 ['H',18,30,840,'Reader clipboard sample'],
 ['H',12,30,810,'Este parrafo contiene una explicacion tecnica extensa para estudiar el libro'],
 ['H',12,30,794,'y continua en esta linea para completar la misma idea sin saltos artificiales.'],
 ['B',12,30,765,'Necesitaras:'],
 ['H',12,40,740,'\\225'],['H',12,58,740,'Primer elemento de una lista que sigue en la siguiente linea'],
 ['H',12,58,724,'y forma parte del mismo elemento.'],
 ['H',12,40,700,'\\225'],['H',12,58,700,'Segundo elemento de la lista.'],
 ['B',12,30,668,'Procedimiento:'],
 ['H',12,40,644,'1. Primer paso para comprobar el procedimiento con una explicacion extensa'],
 ['H',12,58,628,'que continua sin crear un paso adicional.'],
 ['H',12,40,604,'2. Segundo paso del procedimiento.'],
 ['H',12,30,570,'Para usar los ejemplos descarga'],['C',12,210,570,'StdOut.java'],['H',12,300,570,'del sitio del libro.'],
 ['C',10,30,534,'public class SecuenciaAleatoria'],['C',10,30,520,'{'],
 ['C',10,42,506,'public static void main(String[] args)'],['C',10,42,492,'{'],
 ['C',10,54,478,'int N = Integer.parseInt(args[0]);'],['C',10,54,464,'StdOut.println(N);'],['C',10,42,450,'}'],['C',10,30,436,'}'],
 ['I',12,30,404,'Cliente de ejemplo de StdOut'],['C',10,30,378,'% java SecuenciaAleatoria 5'],['C',10,30,364,'123.43']
 ];
 const stream=lines.map(([font,size,x,y,text])=>`BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text}) Tj ET`).join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [7 0 R] /Count 1 >>',...['Helvetica','Helvetica-Bold','Courier','Times-Italic'].map(name=>`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`),'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 620 900] /Resources << /Font << /H 3 0 R /B 4 0 R /C 5 0 R /I 6 0 R >> >> /Contents 8 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=pdf.length;
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
 return Buffer.from(pdf+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,412]){
  const context=await browser.newContext({viewport:{width,height:950},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.route(base+'/**',route=>{
   const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/api/library/qa/file/pdf')return route.fulfill({contentType:'application/pdf',body:makePDF()});
   if(url.pathname==='/api/library/qa')return route.fulfill({json:{id:'qa',title:'Clipboard PDF',formats:{pdf:{has_text_layer:true}},progress:{format:'pdf',location:'page:1'}}});
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{notes:[],bookmarks:[]}});
   const file='knowledge_base'+url.pathname;if(!fs.existsSync(path.join(root,file)))return route.fulfill({status:404,body:''});
   return route.fulfill({body:read(file),contentType:/\.m?js$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  await page.goto(base);await page.waitForFunction(()=>window.pdfjsLib&&window.BlockEditor&&window._openLibraryReader);
  await page.evaluate(()=>_openLibraryReader('qa'));await page.evaluate(()=>readerReady);await page.locator('.pdf-text-layer span').last().waitFor({state:'attached'});
  await page.evaluate(()=>{document.addEventListener('copy',event=>{window.copied={html:event.clipboardData.getData('text/html'),text:event.clipboardData.getData('text/plain'),handled:event.defaultPrevented};});});
  const select=async(partial=false)=>page.evaluate(partial=>{
   const spans=[...document.querySelectorAll('.pdf-text-layer span')].filter(span=>span.firstChild?.nodeType===3&&span.textContent.trim());
   const first=partial?spans.find(span=>span.textContent.includes('Este parrafo')):spans[0],last=partial?spans.find(span=>span.textContent.includes('sin saltos artificiales')):spans[spans.length-1];
   const range=document.createRange();range.setStart(first.firstChild,partial?5:0);range.setEnd(last.firstChild,partial?15:last.firstChild.length);getSelection().removeAllRanges();getSelection().addRange(range);
  },partial);
  await select();await page.keyboard.press('Control+c');const copied=await page.evaluate(()=>copied);
  assert.ok(copied.handled,'Atlas must handle actual PDF copy');assert.ok(copied.html.includes('<ul>'));assert.ok(copied.html.includes('<ol'));assert.ok(copied.html.includes('<pre>'));assert.ok(copied.html.includes('<h2>'));assert.ok(!copied.html.includes('calc('));assert.ok(copied.text.includes('• Primer elemento'));
  for(const isPeek of [false,true]){
   await page.evaluate(isPeek=>{document.getElementById('editors').classList.remove('hidden');window.editor?.destroy();window.editor=BlockEditor.create({container:document.getElementById('entryBody'),isPeek});editor.load('');},isPeek);
   await page.locator('#entryBody .bn-inline-content').first().click();await page.keyboard.press('Control+v');await page.locator('#entryBody').getByText('Reader clipboard sample',{exact:true}).waitFor();
   const types=await page.locator('#entryBody .bn-block-content').evaluateAll(nodes=>nodes.map(node=>({type:node.dataset.contentType,text:node.querySelector('.bn-inline-content')?.textContent})));
   assert.equal(types.filter(item=>item.type==='bulletListItem').length,2,JSON.stringify(types));assert.equal(types.filter(item=>item.type==='numberedListItem').length,2);
   const code=types.find(item=>item.type==='codeBlock');assert.ok(code.text.includes('  public static void main(String[] args)\n  {\n    int N = Integer.parseInt(args[0]);'),code.text);
   assert.ok(types.some(item=>item.type==='paragraph'&&item.text?.includes('descarga StdOut.java del sitio del libro.')),JSON.stringify(types));
   assert.equal(await page.locator('#entryBody strong').filter({hasText:'Necesitaras:'}).count(),1);
   const saved=await page.evaluate(()=>editor.getMarkdown());await page.evaluate(saved=>editor.load(saved),saved);assert.ok((await page.locator('#entryBody .bn-block-content[data-content-type="codeBlock"]').first().textContent()).includes('args[0]'));
   await page.evaluate(isPeek=>{editor.destroy();window.editor=BlockEditor.create({container:document.getElementById('entryBody'),isPeek});editor.load('');},isPeek);await page.locator('#entryBody .bn-inline-content').first().click();await page.keyboard.press('Control+v');await page.locator('#entryBody').getByText('Reader clipboard sample',{exact:true}).waitFor();await page.keyboard.press('Control+z');assert.equal((await page.evaluate(()=>editor.getMarkdown())).trim(),'');
   await page.evaluate(()=>document.getElementById('editors').classList.add('hidden'));
  }
  await select(true);const selected=await page.evaluate(()=>getSelection().toString());await page.keyboard.press('Control+c');const partial=await page.evaluate(()=>copied);assert.ok(partial.handled);assert.equal(partial.text,selected.replace(/\s+/g,' ').trim(),'Partial copy must include only selected characters');
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: actual PDF.js native copy/paste, lists, headings, inline fonts, indented code, persistence, undo, partial selection in normal/Peek`);await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
