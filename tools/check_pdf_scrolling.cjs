// Real pdf.js rendering + native Chromium wheel/touch scrolling, using a
// generated three-page PDF and simulated API routes. No live books or server.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11);
const read=file=>baseline?execFileSync('git',['show',`${baseline}:${file}`],{cwd:root,maxBuffer:12*1024*1024}):fs.readFileSync(path.join(root,file));
const template=read('knowledge_base/templates/index.html').toString();
const shell=template.slice(template.indexOf('<div class="reader-shell'),template.indexOf('<!-- Entry cover'));
const html=`<!doctype html><html lang="es" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/static/style.css"><link rel="stylesheet" href="/static/reader.css">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.test-content{position:fixed;inset:0;min-width:0;min-height:0}</style>
<main class="test-content">${shell}</main><aside id="assistantArea" class="hidden"></aside>
<script>window.switchSpace=()=>{document.getElementById('libraryReaderView').classList.remove('hidden');window.readerReady=window._reopenLibraryReader();};</script>
<script src="/static/library.js"></script><script type="module">import * as pdf from '/static/vendor/pdfjs/pdf.min.mjs';pdf.GlobalWorkerOptions.workerSrc='/static/vendor/pdfjs/pdf.worker.min.mjs';window.pdfjsLib=pdf;</script></html>`;
function makePDF(){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let n=1;n<=3;n++){
    const stream=`BT /F1 18 Tf 25 960 Td (TOP page ${n}) Tj 0 -460 Td (MIDDLE page ${n}) Tj 0 -460 Td (BOTTOM page ${n}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 1000] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+(n-1)*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  return Buffer.from(pdf+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    for(const profile of [{name:'desktop',viewport:{width:1440,height:900}},{name:'tablet',viewport:{width:1480,height:924},isMobile:true,hasTouch:true},{name:'phone',viewport:{width:412,height:915},isMobile:true,hasTouch:true}]){
      const {name,...options}=profile;
      const context=await browser.newContext(options);const page=await context.newPage();const errors=[];const progress=[];
      page.setDefaultTimeout(6000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('http://atlas.test/**',route=>{
        const url=new URL(route.request().url());
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
        if(url.pathname==='/api/library/qa/file/pdf')return route.fulfill({contentType:'application/pdf',body:makePDF()});
        if(url.pathname==='/api/library/qa')return route.fulfill({json:{id:'qa',title:'PDF scrolling QA',formats:{pdf:{has_text_layer:true}},progress:{format:'pdf',location:'page:1'}}});
        if(url.pathname.endsWith('/progress')){progress.push(JSON.parse(route.request().postData()||'{}'));return route.fulfill({json:{ok:true}});}
        if(url.pathname.startsWith('/api/'))return route.fulfill({json:{notes:[],bookmarks:[]}});
        const file='knowledge_base'+url.pathname;
        if(!fs.existsSync(path.join(root,file)))return route.fulfill({status:404,body:''});
        return route.fulfill({body:read(file),contentType:/\.m?js$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
      });
      await page.goto('http://atlas.test/');await page.waitForFunction(()=>window.pdfjsLib&&window._openLibraryReader);
      await page.evaluate(()=>window._openLibraryReader('qa'));await page.evaluate(()=>window.readerReady);
      const viewport=page.locator('#readerPage');
      const activate=selector=>options.hasTouch?page.locator(selector).tap():page.locator(selector).click();
      const waitPage=n=>page.waitForFunction(n=>document.getElementById('readerLocLabel').textContent===`Página ${n} de 3`,n);
      const setZoom=async target=>{
        const button=target===30?'#readerZoomOutBtn':'#readerZoomInBtn';
        for(let i=0;i<25;i++){
          const value=Number((await page.locator('#readerZoomLabel').textContent()).replace('%',''));
          if(target===30?value<=target:value>=target)break;
          await page.locator(button).click();
        }
        await page.waitForFunction(()=>{
          const scale=parseInt(document.getElementById('readerZoomLabel').textContent)/100;
          const canvas=document.querySelector('.pdf-page-wrap canvas');
          return canvas&&Math.abs(canvas.width-600*scale)<=4;
        });
      };
      const wheel=async(x,y)=>{
        const rect=await viewport.boundingBox();await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.wheel(x,y);
      };
      for(const zoom of ['fit',30,300]){
        if(zoom==='fit'){await page.locator('#readerFitBtn').click();await page.waitForTimeout(200);}
        else await setZoom(zoom);
        await waitPage(1);
        await viewport.evaluate(e=>{e.scrollTop=0;e.scrollLeft=0;});
        const before=await viewport.evaluate(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));
        await wheel(0,400);
        if(before.scrollHeight>before.height+2)await page.waitForFunction(()=>document.getElementById('readerPage').scrollTop>10);
        assert.equal(await page.locator('#readerLocLabel').textContent(),'Página 1 de 3',`${name}/${zoom}: wheel must not change pages`);
        for(let i=0;i<16;i++)await wheel(0,700);
        if(before.scrollHeight>before.height+2)await page.waitForFunction(()=>{const e=document.getElementById('readerPage');return e.scrollTop+e.clientHeight>=e.scrollHeight-2;});
        // Reaching the bottom/top, even with repeated wheel input, stays here.
        await wheel(0,900);await page.waitForTimeout(80);await waitPage(1);
        const bottom=await viewport.evaluate(e=>{
          const bounds=e.getBoundingClientRect(),paper=e.querySelector('.pdf-page-wrap').getBoundingClientRect();
          return {bottom:paper.bottom,viewportBottom:bounds.bottom,left:paper.left,viewportLeft:bounds.left};
        });
        assert.ok(bottom.bottom<=bottom.viewportBottom+1,`${name}/${zoom}: PDF bottom is reachable`);
        assert.ok(bottom.left>=bottom.viewportLeft,`${name}/${zoom}: PDF left edge is reachable`);
        if(before.scrollWidth>before.width+2){
          for(let i=0;i<8;i++)await wheel(800,0);
          await page.waitForFunction(()=>{const e=document.getElementById('readerPage');return e.scrollLeft+e.clientWidth>=e.scrollWidth-2;});
          const end=await viewport.evaluate(e=>e.querySelector('.pdf-page-wrap').getBoundingClientRect().right-e.getBoundingClientRect().right);
          assert.ok(end<=1,`${name}: right edge reachable at high zoom`);
        }
        for(let i=0;i<16;i++)await wheel(0,-700);
        await page.waitForFunction(()=>document.getElementById('readerPage').scrollTop===0);await waitPage(1);
        console.log(`PASS ${name}/${zoom}: native wheel, full page edges, no automatic page changes`);
      }
      if(options.hasTouch){
        const session=await context.newCDPSession(page);const rect=await viewport.boundingBox();
        const x=Math.round(rect.x+rect.width/2),y=Math.round(rect.y+rect.height*.7);
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        for(let i=1;i<=10;i++){
          await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*25}]});
          await page.waitForTimeout(20);
        }
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForFunction(()=>document.getElementById('readerPage').scrollTop>10);await waitPage(1);
        // Native momentum continues after touchend. Let it settle before a
        // separate tap (the first tap during a fling only cancels that fling).
        await viewport.evaluate(element=>new Promise(resolve=>{
          let timer;
          const done=()=>{clearTimeout(timer);element.removeEventListener('scroll',changed);resolve();};
          const changed=()=>{clearTimeout(timer);timer=setTimeout(done,160);};
          element.addEventListener('scroll',changed,{passive:true});changed();
        }));
      }
      await activate('#readerNextBtn');await waitPage(2);
      assert.equal(await viewport.evaluate(e=>e.scrollTop),0,'Next page starts at top');
      await activate('#readerPrevBtn');await waitPage(1);
      assert.equal(await viewport.evaluate(e=>e.scrollTop),0);
      assert.equal(await page.locator('#readerPrevBtn').isDisabled(),true);
      await activate('#readerNextBtn');await waitPage(2);
      await activate('#readerNextBtn');await waitPage(3);
      assert.equal(await page.locator('#readerNextBtn').isDisabled(),true);
      await wheel(0,800);await waitPage(3);
      await page.locator('#readerFontBtn').click();
      assert.equal(await page.locator('#readerWheel').isVisible(),false,'PDF must not offer wheel pagination');
      await page.locator('#readerSettingsClose').click();
      await page.waitForTimeout(850);
      assert.ok(progress.some(item=>item.location==='page:3'),'Progress continues to save');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: explicit arrows, boundaries, top reset, settings and saved progress${options.hasTouch?', native touch scrolling':''}`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
