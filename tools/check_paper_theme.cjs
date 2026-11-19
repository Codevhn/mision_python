// Actual theme selector, persisted palette and shared editor/Peek surfaces.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='## Un espacio para leer\n\nLa atención se construye con pequeños gestos: abrir un libro, detenerse en una frase y dejar que una idea encuentre su lugar. Una página tranquila nos invita a continuar, sin competir con lo que estamos leyendo.\n\n### La práctica de observar\n\nEl papel guarda silencio. La tinta da forma a lo importante. Entre ambos aparece un espacio para pensar, escribir y volver a mirar con más calma.\n\n- Leer con atención, sin prisa.\n- Anotar una idea con nuestras propias palabras.\n\n| Lectura | Tiempo |\n| --- | --- |\n| Un capítulo | 20 minutos |\n| Reflexión | 5 minutos |\n\nUn ejemplo breve: `const idea = "observar";`.\n\n```js\nconst cuaderno = [];\ncuaderno.push("Una nueva idea");\n```';
const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
const luminance=value=>rgb(value).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);};
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,900,412]){
  const context=await browser.newContext({viewport:{width,height:1050}}),page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const create=async data=>(await (await context.request.post(base+'/api/entry',{data:{entry_type:'page',already_markdown:true,...data}})).json()).id;
  const id=await create({title:'El arte de prestar atención',raw_text:body});
  const db='db_'+'4'.repeat(32),schema={database_id:db,columns:[{id:'s',name:'Estado',type:'text'}],views:[{id:'t',name:'Tabla',type:'table'}],activeView:'t'};
  const parent=await create({title:'Cuaderno',raw_text:':::database\n'+JSON.stringify(schema)+'\n:::'});
  const row=(await (await context.request.post(base+`/api/databases/${parent}/${db}/rows`,{data:{title:'El arte de prestar atención'}})).json()).row.id;
  await context.request.patch(base+`/api/entry/${row}/content`,{data:{raw_text:body,already_markdown:true}});
  await page.goto(base);await page.waitForFunction(()=>typeof setAtlasTheme==='function');await page.evaluate(id=>_loadEntryById(id),id);
  const settle=()=>page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));
  const paint=selector=>page.locator(selector).first().evaluate(n=>{const s=getComputedStyle(n);return {color:s.color,bg:s.backgroundColor,image:s.backgroundImage,font:s.fontFamily,shadow:s.boxShadow,size:s.fontSize};});
  await page.evaluate(()=>{setAtlasTheme('aero-amber',true);});await settle();const previous=await paint('.topbar');
  await page.evaluate(()=>toggleTheme());await page.locator('#themePicker [data-theme-choice="paper"]').click();
  await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.documentElement.dataset.palette==='paper');await settle();
  const reading=await paint('#entryBody [data-content-type="paragraph"] > .bn-inline-content'),canvas=await paint('#entryView');
  assert.ok(reading.font.includes('Lora'));assert.equal(canvas.bg,'rgb(246, 244, 236)');assert.equal(canvas.image,'none');assert.equal(reading.color,'rgb(29, 30, 27)');assert.ok(contrast(reading.color,canvas.bg)>12);assert.equal(await page.evaluate(()=>localStorage.getItem('kb_theme')),'paper');
  const navigation=await paint('#activityBar .ab-item');assert.ok(contrast(navigation.color,canvas.bg)>=4.5,JSON.stringify(navigation));
  const table=await paint('#entryBody td');const code=await paint('#entryBody code');assert.ok(!code.font.includes('Lora'),'Code remains monospaced');assert.equal((await paint('#entryBody .code-block-pre')).bg,'rgb(238, 236, 227)');assert.equal((await paint('#entryBody .code-block-pre .bn-inline-content')).color,reading.color);
  await page.screenshot({path:`/tmp/atlas-paper-reading-${width}.png`});
  await page.reload();await page.waitForFunction(()=>typeof _loadEntryById==='function');assert.equal(await page.locator('html').getAttribute('data-theme-id'),'paper');await page.evaluate(id=>_loadEntryById(id),parent);
  await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),row);await page.waitForSelector('#pagePeekEditor:not([inert]) .bn-editor');
  const peek=await paint('#pagePeekOverlay .page-peek-body'),peekText=await paint('#pagePeekEditor [data-content-type="paragraph"] > .bn-inline-content');
  assert.equal(peek.bg,canvas.bg);assert.equal(peekText.font,reading.font);assert.equal(peekText.color,reading.color);assert.equal(peekText.size,reading.size);assert.equal((await paint('#pagePeekEditor td')).bg,table.bg);assert.equal((await paint('#pagePeekEditor .code-block-pre')).bg,'rgb(238, 236, 227)');
  await page.evaluate(()=>document.getElementById('pagePeekOverlay').dataset.recordFont='mono');assert.ok((await paint('#pagePeekEditor [data-content-type=paragraph] > .bn-inline-content')).font.includes('Consolas'));await page.evaluate(()=>document.getElementById('pagePeekOverlay').classList.add('adb-record-small'));assert.equal((await paint('#pagePeekEditor [data-content-type=paragraph] > .bn-inline-content')).size,'14px');await page.evaluate(()=>{document.getElementById('pagePeekOverlay').classList.remove('adb-record-small');document.getElementById('pagePeekOverlay').dataset.recordFont='default';});
  await page.getByRole('button',{name:'Acciones del registro',exact:true}).click();const menu=await paint('.adb-peek-actions-menu');assert.ok(contrast(menu.color,menu.bg)>7);await page.keyboard.press('Escape');
  await page.screenshot({path:`/tmp/atlas-paper-peek-${width}.png`});
  await page.evaluate(()=>setAtlasTheme('aero-amber',true));await settle();assert.deepEqual(await paint('.topbar'),previous,'Previous theme restores exactly');
  await page.evaluate(()=>setAtlasTheme('paper',true));await page.getByRole('button',{name:'Cerrar Peek',exact:true}).click();
  // Cross-document finance uses the same inherited root palette.
  if(width===1440){
   await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='paperFinance';frame.src='/static/finance/index.html';document.body.append(frame);});
   const finance=page.frameLocator('#paperFinance');await finance.locator('html[data-palette="paper"]').waitFor();assert.equal(await finance.locator('html').evaluate(n=>getComputedStyle(n).getPropertyValue('--native-canvas').trim()),'#f6f4ec');
  }
  assert.equal((await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown,body);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: selector, persistence, warm matte canvas, deep ink, contrast, reading/code fonts, Peek/table/menu parity and theme restoration`);
  await context.close();
 }
 // Sign-in shares the registry and saved preference, without changing auth.
 const context=await browser.newContext({viewport:{width:412,height:915}});await context.addInitScript(()=>localStorage.setItem('kb_theme','paper'));
 const page=await context.newPage();await page.goto(base+'/login');assert.equal(await page.locator('html').getAttribute('data-palette'),'paper');await page.screenshot({path:'/tmp/atlas-paper-login.png'});await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
