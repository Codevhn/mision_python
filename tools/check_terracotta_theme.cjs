// Theme + heading verification against a local disposable Atlas instance.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const body='## Origen y evolución del lenguaje\n\nUn espacio tranquilo para leer y aprender.\n\n### Características principales\n\nTexto de lectura que conserva su propia jerarquía.\n\n```python\n# Comentario legible\ndef saludo(nombre):\n    return "Hola " + nombre\nprint(saludo("Atlas"))\n```\n\n## Otro apartado';
const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (x[0]+.05)/(x[1]+.05);};
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,412]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const created=await context.request.post(base+'/api/entry',{data:{title:'Lectura Terracota '+width,entry_type:'page',already_markdown:true,raw_text:body}});assert.ok(created.ok());const id=(await created.json()).id;
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof setAtlasTheme==='function');await page.evaluate(id=>_loadEntryById(id),id);
  const before=(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown;
  for(const [theme,scheme] of [['terracotta-dark','dark'],['terracotta-light','light']]){
   await page.evaluate(()=>switchSpace('home'));await page.evaluate(()=>toggleTheme());await page.locator(`[data-theme-choice="${theme}"]`).click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),scheme);assert.equal(await page.evaluate(()=>localStorage.getItem('kb_theme')),theme);
   const paint=await page.locator('body').evaluate(node=>{const css=getComputedStyle(node);return {image:css.backgroundImage,size:css.backgroundSize};});
   assert.ok(paint.image.includes('radial-gradient')&&paint.image.includes('linear-gradient'));assert.ok(paint.size.includes('40px 40px'));
   const card=page.locator('#welcome .home-card').first();await card.waitFor();const cardPaint=await card.evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node.querySelector('.home-card-title')).color}));
   assert.equal(cardPaint.background,'rgb(255, 250, 243)');assert.ok(contrast(cardPaint.color,cardPaint.background)>10);
   await page.screenshot({path:`/tmp/atlas-terracotta-home-${scheme}-${width}.png`});
   await page.evaluate(id=>_loadEntryById(id),id);
   for(const mode of ['page','peek']){
    if(mode==='peek')await page.evaluate(id=>_openPagePeek(id,{databasePreview:true,mode:'side'}),id);
    const surface=mode==='peek'?'#pagePeekEditor':'#entryBody';await page.locator(surface+' .shiki').first().waitFor();
    const code=await page.locator(surface+' .code-block-pre').evaluate(node=>({bg:getComputedStyle(node).backgroundColor,colors:[...new Set([...node.querySelectorAll('.shiki')].map(span=>getComputedStyle(span).color))]}));
    assert.equal(code.bg,scheme==='light'?'rgb(246, 248, 250)':'rgb(30, 35, 43)');assert.ok(code.colors.length>=3);
    if(scheme==='light')for(const color of code.colors)assert.ok(contrast(color,code.bg)>=4.5,`${color} light code contrast`);
    assert.equal(await page.locator(surface+' .code-block-pre .shiki').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)')),true,'Tokens do not paint white boxes over the code canvas');
    for(const [tag,widthPx] of [['h2','3px'],['h3','5px']]){
     const heading=page.locator(surface+' '+tag).first();const shape=await heading.evaluate(node=>{const css=getComputedStyle(node,'::before');return {width:css.width,content:css.content,background:css.backgroundColor,padding:getComputedStyle(node).paddingInlineStart,text:node.innerText};});
     assert.equal(shape.width,widthPx);assert.equal(shape.padding,'16px','Heading text must not overlap its marker');assert.equal(shape.content,'""');assert.notEqual(shape.background,'rgba(0, 0, 0, 0)');assert.ok(shape.text.includes(tag==='h2'?'Origen':'Características'));
    }
    await page.screenshot({path:`/tmp/atlas-terracotta-${mode}-${scheme}-${width}.png`});
   }
   await page.evaluate(()=>_closePagePeek());
  }
  // Restoring other families removes the decorative desktop without editing content.
  await page.evaluate(()=>setAtlasTheme('paper',true));assert.equal(await page.locator('html').getAttribute('data-palette'),'paper');
  assert.ok(!(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundImage)).includes('radial-gradient'));
  const after=(await (await context.request.get(base+`/api/entry/${id}`)).json()).markdown;assert.equal(after,before);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: actual theme selector, warm grid desktop/cream cards, both schemes, page/Peek syntax and contrast, subtle H2/H3, preserved source and restoration.`);await context.close();
 }
 const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('kb_theme','terracotta-light'));const login=await context.newPage();await login.goto(base+'/login');assert.equal(await login.locator('html').getAttribute('data-theme-id'),'terracotta-light');assert.ok((await login.locator('body').evaluate(node=>getComputedStyle(node).backgroundImage)).includes('radial-gradient'));await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
