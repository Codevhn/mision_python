// Browser regression for compact/split-screen navigation. No live data used.
// Requires Playwright and Chromium. --baseline reads the pre-change HEAD.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const read = file => process.argv.includes('--baseline')
  ? execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024})
  : fs.readFileSync(path.join(root,file),'utf8');
const app = read('knowledge_base/static/app.js');
const navigation = [
  app.slice(app.indexOf('function isMobile()'),app.indexOf('// Android Chrome: body')),
  app.slice(app.indexOf('const DRAWER_TREE_SPACES'),app.indexOf('// ---- TREE ----')),
  app.slice(app.indexOf('function setSidebarVisible('),app.indexOf("(function() {\n  const SPACES =")),
  app.slice(app.indexOf('  function _setMobileDrawerMode('),app.indexOf('  function switchSpace(')),
].join('\n');
const template = read('knowledge_base/templates/index.html');
const detection = template.match(/<script>\s*\/\/ Touch-capability detection[\s\S]*?<\/script>/)[0];
const html = template
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('</head>',detection+'</head>')
  .replace(/{%[\s\S]*?%}|{{[\s\S]*?}}/g,'');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='atlas.test') return route.abort();
      if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
      const file='knowledge_base'+url.pathname;
      if(!fs.existsSync(path.join(root,file)))return route.fulfill({status:404,body:''});
      if(file.endsWith('.css'))return route.fulfill({contentType:'text/css',body:read(file)});
      return route.fulfill({path:path.join(root,file)});
    });
    await page.goto('http://atlas.test/');
    await page.evaluate(navigation=>{
      window.$=id=>document.getElementById(id);
      new Function(navigation+';window.toggleSidebar=toggleSidebar;window.closeSidebarMobile=closeSidebarMobile;window.setSidebarVisible=setSidebarVisible;window._setMobileDrawerMode=_setMobileDrawerMode;')();
      $('sidebarToggle').addEventListener('click',toggleSidebar);
      $('sidebarOverlay').addEventListener('click',closeSidebarMobile);
      $('msnBackHeader').addEventListener('click',()=>_setMobileDrawerMode('list'));
      sessionStorage.setItem('activeSpace','knowledge');
      document.querySelectorAll('.sidebar-space').forEach(p=>p.style.display=p.id==='spaceKnowledge'?'':'none');
      $('tree').innerHTML='<button class="tree-entry">CRON — Planificación</button>';
      $('tree').querySelector('button').addEventListener('click',closeSidebarMobile);
      document.documentElement.dataset.style='aero';
      document.documentElement.dataset.variant='blue';
      document.documentElement.dataset.theme='dark';
      setSidebarVisible(true);
    },navigation);
    await page.addScriptTag({content:read('knowledge_base/static/atlas-frames.js')});
    assert.equal(await page.locator('#activityBar').isVisible(),true);
    assert.equal(await page.locator('#sidebar').isVisible(),true);
    for(const width of [944,1024,769,768,412]){
      // First resize from wide desktop with an open, populated tree.
      await page.setViewportSize({width:1440,height:960});
      await page.evaluate(()=>setSidebarVisible(true));
      await page.setViewportSize({width,height:960});
      await page.waitForTimeout(350);
      assert.equal(await page.locator('#activityBar').isVisible(),false,`rail hidden at ${width}`);
      assert.equal(await page.locator('#sidebar').isVisible(),false,`tree hidden at ${width}`);
      assert.equal(await page.locator('#sidebarOverlay').isVisible(),false);
      assert.equal(await page.locator('#sidebarToggle').isVisible(),true);
      assert.equal(await page.locator('.layout').evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft)),0);
      await page.click('#sidebarToggle');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#sidebar').isVisible(),true);
      assert.equal(await page.locator('#sidebarOverlay').isVisible(),true);
      assert.equal(await page.locator('#msnBackHeader').isVisible(),true);
      assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-expanded'),'true');
      await page.click('#msnBackHeader');
      assert.equal(await page.locator('#mobileSpaceNav').isVisible(),true);
      assert.equal(await page.locator('.mobile-logout').isVisible(),true);
      const outside = await page.evaluate(({width})=>document.elementFromPoint(width-10,200)?.outerHTML.slice(0,180),{width});
      await page.mouse.click(width-10,200); // click outside the drawer
      await page.locator('#sidebar').waitFor({state:'hidden',timeout:3000});
      const state=await page.locator('#sidebar').evaluate(e=>({classes:e.className,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity}));
      assert.equal(await page.locator('#sidebar').isVisible(),false,`outside click hit ${outside}, state ${JSON.stringify(state)}`);
      await page.click('#sidebarToggle');
      await page.click('#tree .tree-entry');
      await page.locator('#sidebar').waitFor({state:'hidden',timeout:3000});
      assert.equal(await page.locator('#sidebar').isVisible(),false);
      assert.equal(await page.locator('#sidebarToggle').getAttribute('aria-expanded'),'false');
      console.log(`PASS ${width}px: auto-hide, full content width, menu/tree, back, logout and close`);
    }
    // A tucked desktop tree must reopen after a round trip through compact.
    await page.setViewportSize({width:1440,height:960});
    await page.evaluate(()=>setSidebarVisible(false));
    await page.setViewportSize({width:944,height:960});
    await page.click('#sidebarToggle');
    assert.equal(await page.locator('#sidebar').isVisible(),true);
    await page.setViewportSize({width:1025,height:960});
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#activityBar').isVisible(),true);
    assert.equal(await page.locator('#sidebar').isVisible(),true);
    assert.equal(await page.locator('#sidebarToggle').isVisible(),false);
    assert.equal(await page.locator('#sidebarOverlay').isVisible(),false);
    console.log('PASS desktop restore at 1025px and previously tucked sidebar');
    await page.setViewportSize({width:944,height:960});
    await page.reload();
    assert.equal(await page.locator('#activityBar').isVisible(),false);
    assert.equal(await page.locator('#sidebar').isVisible(),false);
    assert.equal(await page.locator('#sidebarToggle').isVisible(),true);
    console.log('PASS initial compact page load hides both navigation panels');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
