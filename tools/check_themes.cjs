// Integration check against an ISOLATED Atlas server with disposable data.
// ATLAS_TEST_URL and ATLAS_TEST_PASSWORD must point to that local test instance.
// No generation requests are sent. Requires Playwright and Chromium.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const symbols=fs.readFileSync(path.join(root,'knowledge_base/static/native-icons.svg'),'utf8');
const systemIcons=fs.readFileSync(path.join(root,'knowledge_base/static/system-icons.js'),'utf8');
const nativeIds=new Set([...symbols.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
for(const match of systemIcons.matchAll(/"[^"\n]+": "([a-z]+)"/g))assert.ok(nativeIds.has(match[1]),`Missing native symbol ${match[1]}`);
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8121';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local disposable server');
const password=process.env.ATLAS_TEST_PASSWORD||'atlas-theme-check-password';
const output=process.env.ATLAS_SCREENSHOTS||'/tmp/atlas-theme-evidence';
fs.mkdirSync(output,{recursive:true});
async function apply(page,id){
  await page.evaluate(id=>setAtlasTheme(id,true),id);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // Inherited icon colors transition with their navigation item. Compare
  // settled paint, not two different frames of that existing transition.
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));
}
async function snapshot(page){return page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement);
  const paint=selector=>{
    const element=document.querySelector(selector);if(!element)return null;
    const css=getComputedStyle(element);
    return Object.fromEntries(['color','backgroundColor','backgroundImage','borderColor','borderRadius','fontFamily','fontSize','display'].map(key=>[key,css[key]]));
  };
  return {accent:root.getPropertyValue('--accent').trim(),style:document.documentElement.dataset.style,
    canvas:root.getPropertyValue('--cyber-canvas').trim(),body:paint('body'),bar:paint('.topbar'),
    sidebar:paint('#sidebar'),frame:paint('#activityBar > .atlas-frame-decoration'),
    paragraph:paint('#entryBody [data-content-type="paragraph"] > .bn-inline-content'),code:paint('.code-block-pre'),
    picker:paint('#themePicker'),aeroIcon:paint('#activityBar .aero-nav-icon'),nativeIcon:paint('#activityBar .atlas-native-nav-icon'),
    aeroSystemIcon:paint('#themeIconProbe .aero-system-icon'),nativeSystemIcon:paint('#themeIconProbe .native-system-icon')};
});}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const errors=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>{
      if(new URL(route.request().url()).origin!==base)return route.abort();
      if(new URL(route.request().url()).pathname==='/api/ai/providers')return route.fulfill({json:{providers:[],warnings:[],default:{provider:'deepseek',model:'deepseek-v4-pro'}}});
      return route.continue();
    });
    const login=await context.request.post(base+'/login',{form:{password}});assert.ok(login.ok());
    const create=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'Validación de temas',already_markdown:true,
      raw_text:'## Un espacio para leer\n\nLos párrafos tienen ahora un tamaño más cómodo. Esta página permite comprobar el contraste, el espaciado y la identidad de cada tema sin modificar notas personales.\n\n### Una identidad propia\n\nAero recupera su cristal y sus colores. Hyprland usa un escritorio oscuro con ventanas flotantes, bordes discretos y acentos cian y lavanda.\n\n```python\nprint("Atlas")\n```\n'}});
    assert.ok(create.ok(),await create.text());const id=(await create.json()).id;
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.waitForFunction(()=>typeof setAtlasTheme==='function'&&typeof _loadEntryById==='function');
    await page.evaluate(id=>window._loadEntryById(id),id);
    await page.waitForSelector('#entryBody [data-content-type="paragraph"] > .bn-inline-content');
    await page.evaluate(()=>{
      const probe=document.createElement('span');probe.id='themeIconProbe';probe.hidden=true;document.body.append(probe);
      setAtlasSystemLabel(probe,'📚 Biblioteca <texto sin interpretar>');
      const single=document.createElementNS('http://www.w3.org/2000/svg','svg');single.id='singleSystemIcon';single.classList.add('atlas-system-icon');
      const use=document.createElementNS(single.namespaceURI,'use');use.setAttribute('href','/static/aero-icons.svg#calendar');single.append(use);probe.append(single);
      if(probe.textContent.trim()!=='Biblioteca <texto sin interpretar>')throw new Error('Icon helper modified text');
    });
    await page.evaluate(()=>window.setAtlasFrame('sentinel',true));
    const themes=await page.evaluate(()=>THEME_CATALOG.map(([id])=>id));
    assert.equal(themes.filter(id=>id==='hyprland').length,1);
    const evidence={themes:{},sizes:[],errors};
    for(const theme of themes.filter(id=>id!=='hyprland')){
      await apply(page,theme);
      // A non-selected theme's stylesheet must have no effect, even at high
      // specificity and with the course palettes and editor bundle loaded.
      await page.evaluate(()=>document.querySelector('link[href*="hyprland.css"]').sheet.disabled=true);
      const without=await snapshot(page);
      await page.evaluate(()=>document.querySelector('link[href*="hyprland.css"]').sheet.disabled=false);
      const withSheet=await snapshot(page);
      assert.deepEqual(withSheet,without,`Hyprland leaked into ${theme}`);
      assert.equal(withSheet.canvas,'',`Hyprland tokens leaked into ${theme}`);
      assert.equal(withSheet.paragraph.fontSize,'18px',`${theme} reading text`);
      assert.equal(withSheet.code.fontSize,'13.5px',`${theme} code size must stay independent`);
      const flat=withSheet.style!=='aero';
      assert.equal(withSheet.nativeIcon.display!=='none',flat,`${theme} native navigation icons`);
      assert.equal(withSheet.aeroIcon.display==='none',flat,`${theme} Aero navigation icons`);
      assert.equal(withSheet.nativeSystemIcon.display!=='none',flat,`${theme} native system icons`);
      assert.equal(withSheet.aeroSystemIcon.display==='none',flat,`${theme} Aero system icons`);
      assert.equal(await page.locator('#singleSystemIcon use').getAttribute('href'),`/static/${flat?'native':'aero'}-icons.svg#calendar`,`${theme} legacy system widget icon`);
      evidence.themes[theme]=withSheet;
    }
    await apply(page,'aero-amber');
    const amber=await snapshot(page);
    assert.equal(amber.frame.display,'block','Saved Centinela frame restored on Aero');
    assert.notEqual(amber.bar.backgroundImage,'none','Aero toolbar glass must be restored');
    await page.screenshot({path:path.join(output,'aero-amber-restored.png')});
    await apply(page,'aero');await page.screenshot({path:path.join(output,'aero-light-restored.png')});
    await apply(page,'hyprland');
    const hyprland=await snapshot(page);evidence.themes.hyprland=hyprland;
    assert.equal(hyprland.style,'hyprland');assert.equal(hyprland.canvas,'#11111b');
    assert.equal(hyprland.frame.display,'none');assert.notEqual(hyprland.accent,amber.accent);
    assert.equal(hyprland.code.backgroundImage,'none');
    await page.evaluate(()=>_enterCourseTheme('python-test','Python Profesional'));
    assert.equal(await page.locator('html').getAttribute('data-theme-id'),'hyprland');
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.themeId==='hyprland');
    await page.evaluate(id=>window._loadEntryById(id),id);await page.waitForSelector('.code-block-pre');
    await page.screenshot({path:path.join(output,'hyprland-editor.png')});
    await page.evaluate(()=>toggleTheme());
    assert.equal(await page.locator('#themePicker [data-theme-choice="hyprland"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.atlas-frame-choices').isVisible(),false);
    assert.equal(await page.locator('.hyprland-frame-note').isVisible(),true);
    await page.screenshot({path:path.join(output,'hyprland-selector.png')});
    await page.locator('#themePicker [data-theme-choice="aero-amber"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme-id'),'aero-amber');
    assert.equal((await snapshot(page)).frame.display,'block');
    await page.evaluate(()=>window.switchSpace('finance'));
    const finance=page.frameLocator('#financeFrame');
    await finance.locator('html[data-theme-id="aero-amber"]').waitFor();
    await apply(page,'hyprland');await finance.locator('html[data-theme-id="hyprland"]').waitFor();
    assert.equal(await finance.locator('html').getAttribute('data-style'),'hyprland');
    await apply(page,'aero-blue');await finance.locator('html[data-theme-id="aero-blue"]').waitFor();
    assert.equal(await finance.locator('html').getAttribute('data-style'),'aero');
    await page.evaluate(()=>window.switchSpace('pages'));
    await page.evaluate(id=>window._loadEntryById(id),id);
    for(const [width,height]of [[412,915],[800,1280],[1280,800]]){
      await page.setViewportSize({width,height});await apply(page,'hyprland');
      await page.evaluate(()=>closeSidebarMobile());
      await page.waitForTimeout(350); // Existing layout transitions must settle after resizing.
      await page.waitForSelector('.code-block-pre');
      const state=await page.evaluate(()=>{
        const r=document.querySelector('.topbar').getBoundingClientRect();
        return {font:getComputedStyle(document.querySelector('#entryBody [data-content-type="paragraph"] > .bn-inline-content')).fontSize,
          contentLeft:document.querySelector('.content-area').getBoundingClientRect().left,
          viewport:innerWidth,document:document.documentElement.scrollWidth,barLeft:r.left,barRight:r.right};
      });
      assert.equal(state.font,width<=768?'17px':'18px');
      assert.ok(state.document<=width+1,JSON.stringify(state));
      assert.ok(state.barLeft>=0&&state.barRight<=width,JSON.stringify(state));
      if(width<=1024)assert.ok(state.contentLeft<=12,JSON.stringify(state));
      evidence.sizes.push({width,height,...state});
      await page.screenshot({path:path.join(output,`hyprland-${width}.png`)});
    }
    const signIn=await browser.newContext({viewport:{width:412,height:915}});
    await signIn.addInitScript(()=>{localStorage.setItem('kb_theme','hyprland');localStorage.setItem('kb_frame','sentinel');});
    const loginPage=await signIn.newPage();await loginPage.goto(base+'/login');
    assert.equal(await loginPage.locator('html').getAttribute('data-theme-id'),'hyprland');
    await loginPage.screenshot({path:path.join(output,'hyprland-login.png')});
    await loginPage.click('#loginThemeToggle');
    await loginPage.locator('[data-theme-choice="aero-amber"]').click();
    assert.equal(await loginPage.locator('html').getAttribute('data-theme-id'),'aero-amber');
    assert.equal(await loginPage.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--cyber-canvas').trim()),'');
    await loginPage.screenshot({path:path.join(output,'aero-login-restored.png')});
    assert.deepEqual(errors,[],'No application errors during theme switching');
    fs.writeFileSync(path.join(output,'themes.json'),JSON.stringify(evidence,null,2));
    console.log(`PASS ${themes.length} themes: isolation, Aero restoration, selection, persistence, finance, login and reading sizes`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
