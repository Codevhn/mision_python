// Integration check on the same disposable server as check_themes.cjs.
// CSS viewports approximate Tab S9 Ultra settings; physical hardware is not used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8121';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=process.env.ATLAS_SCREENSHOTS||'/tmp/atlas-tablet-evidence';fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const evidence=[];
  try{
    for(const config of [
      {name:'landscape',width:1480,height:924,dpr:2,touch:true},
      {name:'portrait',width:924,height:1480,dpr:2,touch:true},
      {name:'landscape-browser-bars',width:1480,height:850,dpr:2,touch:true},
      {name:'wide-touch',width:1848,height:1155,dpr:1.6,touch:true},
      {name:'stylus-fine-pointer',width:1480,height:924,dpr:2,touch:false,stylus:true},
    ]){
      const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr,hasTouch:config.touch,isMobile:false});
      await context.route('**/*',route=>{
        if(new URL(route.request().url()).origin!==base)return route.abort();
        if(new URL(route.request().url()).pathname==='/api/ai/providers')return route.fulfill({json:{providers:[],warnings:[],default:{provider:'deepseek',model:'deepseek-v4-pro'}}});
        return route.continue();
      });
      if(config.stylus)await context.addInitScript(()=>Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get:()=>10,configurable:true}));
      await context.request.post(base+'/login',{form:{password:process.env.ATLAS_TEST_PASSWORD||'atlas-theme-check-password'}});
      const response=await context.request.post(base+'/api/entry',{data:{entry_type:'page',title:'Lectura en tableta '+config.name,already_markdown:true,
        raw_text:'## Leer con comodidad\n\nUna tableta grande necesita una columna centrada y un menú que puedas abrir y cerrar. Este párrafo permite comprobar la lectura a tamaño normal, sin ampliar el navegador.\n\n```python\nprint("Atlas en tableta")\n```'}});
      assert.ok(response.ok());const id=(await response.json()).id;
      const page=await context.newPage();await page.goto(base);
      await page.waitForFunction(()=>typeof setAtlasTheme==='function'&&typeof _loadEntryById==='function');
      await page.evaluate(id=>window._loadEntryById(id),id);
      await page.waitForSelector('#entryBody [data-content-type="paragraph"] > .bn-inline-content');
      if(config.stylus)assert.equal(await page.evaluate(()=>matchMedia('(pointer:fine)').matches),true,'Stylus test must really expose a fine pointer');
      for(const theme of ['aero-blue','aero-amber','opencode-dark','opencode-light','hyprland','notion-native']){
        await page.evaluate(theme=>setAtlasTheme(theme,true),theme);await page.waitForTimeout(350);
        assert.equal(await page.locator('#sidebarToggle').isVisible(),true,`${config.name}/${theme} hamburger`);
        assert.equal(await page.locator('#activityBar').isVisible(),false);
        assert.equal(await page.locator('#sidebar').isVisible(),false);
        await page.click('#sidebarToggle');
        await page.locator('#sidebar').waitFor({state:'visible'});
        await page.locator('#sidebar').evaluate(element=>Promise.all(element.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));
        const drawer=await page.locator('#sidebar').boundingBox();
        assert.ok(drawer.x>=0&&drawer.x+drawer.width<=config.width,'Open drawer must be entirely on screen');
        assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-expanded'),'true');
        assert.equal(await page.locator('.mobile-logout').isVisible(),true);
        if(await page.locator('#msnBackHeader').isVisible())await page.click('#msnBackHeader');
        const flat=theme.startsWith('opencode')||theme==='hyprland'||theme==='notion-native';
        assert.equal(await page.locator('.msn-item[data-space="knowledge"] .atlas-native-nav-icon').isVisible(),flat);
        assert.equal(await page.locator('.msn-item[data-space="knowledge"] .aero-nav-icon').isVisible(),!flat);
        if(theme==='opencode-dark'&&config.name==='landscape')await page.screenshot({path:path.join(output,'tab-s9-ultra-opencode-menu.png')});
        await page.evaluate(()=>window._setMobileDrawerMode('content','knowledge'));
        assert.equal(await page.locator('#msnBackSpaceIcon .atlas-native-nav-icon').isVisible(),flat,'Back header must keep the themed icon');
        await page.click('#sidebarToggle');
        await page.locator('#sidebar').waitFor({state:'hidden'});
        assert.equal(await page.locator('#sidebarOverlay').isVisible(),false);
        const layout=await page.evaluate(()=>{
          const p=document.querySelector('#entryBody [data-content-type="paragraph"] > .bn-inline-content'),r=p.getBoundingClientRect();
          return {font:getComputedStyle(p).fontSize,paragraphWidth:r.width,left:r.left,right:r.right,
            contentLeft:document.querySelector('.content-area').getBoundingClientRect().left,
            viewport:innerWidth,document:document.documentElement.scrollWidth,scale:visualViewport.scale,
            touch:navigator.maxTouchPoints,fine:matchMedia('(pointer:fine)').matches};
        });
        assert.equal(layout.font,'18px');assert.equal(layout.scale,1);
        assert.ok(layout.paragraphWidth<=960,JSON.stringify(layout));
        assert.ok(layout.left>=0&&layout.right<=config.width,JSON.stringify(layout));
        assert.ok(layout.document<=config.width+1&&layout.contentLeft<=16,JSON.stringify(layout));
        evidence.push({configuration:config.name,theme,...layout});
        if(theme==='hyprland')await page.screenshot({path:path.join(output,`tab-s9-ultra-${config.name}.png`)});
        if(theme==='opencode-dark'&&config.name==='landscape')await page.screenshot({path:path.join(output,'tab-s9-ultra-opencode.png')});
      }
      // Changing orientation must keep the drawer policy instead of bringing
      // back the desktop sidebar on a landscape tablet.
      await page.setViewportSize({width:config.height,height:config.width});await page.waitForTimeout(350);
      assert.equal(await page.locator('#sidebarToggle').isVisible(),true);
      assert.equal(await page.locator('#activityBar').isVisible(),false);
      assert.equal(await page.locator('#sidebar').isVisible(),false);
      console.log(`PASS ${config.name}: six themes, native/Aero icons, menu open/close, 18px text, reading width, no zoom, orientation`);
      await context.close();
    }
    fs.writeFileSync(path.join(output,'tablet-layout.json'),JSON.stringify(evidence,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
