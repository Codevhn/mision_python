// Real browser checks for the shared provider controls. No API calls or keys.
// Run: node tools/check_provider_preferences.cjs (requires Playwright/Chromium).
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('knowledge_base/static/app.js');
const source=app.slice(app.indexOf('const _AI_DISABLED_PROVIDERS_KEY'),app.indexOf('\nasync function _renderPracticeModeBody'));
const html=`<!doctype html><html data-theme="light" data-style="aero" lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/static/style.css"><link rel="stylesheet" href="/static/themes.css">
<div id="assistantModel" style="position:fixed;bottom:20px;left:20px;width:250px"></div><div id="otherModel" style="position:fixed;top:20px;left:20px;width:250px"></div></html>`;
const data={warnings:[{provider:'omniroute',message:'Aviso de OmniRoute'}],default:{provider:'omniroute',model:'OpenRouter'},providers:[
  {id:'omniroute',label:'OmniRoute',models:[{id:'OpenRouter',label:'OpenRouter',hint:'Modelo o combo vía OmniRoute'}]},
  {id:'openrouter',label:'OpenRouter',models:[
    ...Array.from({length:90},(_,i)=>({id:`vendor/paid-${i}`,label:`Modelo ${String(i).padStart(2,'0')}`,hint:'De pago vía OpenRouter'})),
    {id:'vendor/example:free',label:'Z modelo gratuito',hint:'Gratis vía OpenRouter'},
  ]},
  {id:'deepseek',label:'DeepSeek',models:[{id:'deepseek-v4-pro',label:'DeepSeek V4 Pro'}]},
]};
async function mount(page) {
  await page.evaluate(({source,data})=>{
    window.escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
    window._getAvailableProviders=async()=>data;
    window.changes=[];
    new Function(source+';window.mountSelector=_mountModelSelector;window.rawChoice=_getRawSavedModelChoice;')();
    return Promise.all(['assistant','other'].map(context=>mountSelector(document.getElementById(context+'Model'),{
      context,value:{provider:'omniroute',model:'OpenRouter'},
      onChange:choice=>{window.changes.push({context,choice});window[context+'Choice']=choice;}
    })));
  },{source,data});
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    for(const [width,height,touch]of [[1440,900,false],[412,915,true],[800,1280,true]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
      const page=await context.newPage();
      await page.route('http://atlas.test/**',route=>{
        const file=new URL(route.request().url()).pathname;
        return file==='/'?route.fulfill({contentType:'text/html; charset=utf-8',body:html}):route.fulfill({path:path.join(root,'knowledge_base',file)});
      });
      await page.goto('http://atlas.test/');await mount(page);
      await page.locator('#assistantModel button').click();
      const panel=page.locator('.ai-model-panel:not(.hidden)');
      await panel.locator('summary').click();
      assert.equal(await panel.getByText('OpenRouter directo',{exact:true}).isVisible(),true);
      assert.equal(await panel.getByText('OmniRoute · combos',{exact:true}).isVisible(),true);
      if(process.env.ATLAS_SCREENSHOTS){
        fs.mkdirSync(process.env.ATLAS_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOTS,`providers-${width}.png`)});
      }
      await panel.getByRole('button',{name:'Usar solo OpenRouter directo',exact:true}).click();
      assert.equal(await panel.locator('details').getAttribute('open'),null);
      assert.deepEqual(await page.evaluate(()=>[assistantChoice.provider,otherChoice.provider]),['openrouter','openrouter']);
      const disabled=await page.evaluate(()=>JSON.parse(localStorage.getItem('kb_ai_disabled_providers:v1')));
      assert.deepEqual(disabled.sort(),['deepseek','omniroute']);
      assert.equal(await page.locator('[data-provider-warning="omniroute"]').count(),0);
      assert.ok((await panel.locator('[role=option] .ai-model-badge').allTextContents()).every(text=>text==='OpenRouter'));
      assert.ok((await panel.locator('.ai-model-count').textContent()).includes('80 de 91'));
      await panel.getByRole('searchbox').fill('gratis');
      assert.equal(await panel.getByRole('option').count(),1);
      await panel.getByRole('option').click();
      assert.equal(await page.evaluate(()=>assistantChoice.model),'vendor/example:free');
      await page.reload();await mount(page);
      assert.equal(await page.evaluate(()=>assistantChoice.provider),'openrouter','Disabled conversation provider must not override the preference');
      await page.locator('#assistantModel button').click();
      await panel.locator('summary').focus();await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      assert.equal(await panel.isVisible(),true,'Keyboard access to controls must keep menu open');
      const direct=panel.locator('label').filter({hasText:'OpenRouter directo'}).locator('input');
      assert.equal(await direct.isDisabled(),true,'Keep one active provider');
      const omni=panel.locator('label').filter({hasText:'OmniRoute · combos'}).locator('input');
      await omni.check();
      assert.equal(await direct.isDisabled(),false);
      await panel.locator('summary').click();
      await panel.getByRole('searchbox').fill('combo');
      assert.equal(await panel.getByRole('option').count(),1);
      assert.equal(await panel.locator('.ai-model-badge').textContent(),'OmniRoute');
      await page.keyboard.press('Escape');
      assert.equal(await panel.count(),0);
      // An unmounted context cannot return a hidden provider's stale choice.
      await page.evaluate(()=>localStorage.setItem('kb_ai_model:unmounted',JSON.stringify({provider:'deepseek',model:'deepseek-v4-pro'})));
      assert.equal(await page.evaluate(()=>rawChoice('unmounted')),null);
      // Another tab changing the preference updates both mounted selectors.
      await page.evaluate(()=>{
        const key='kb_ai_disabled_providers:v1',value=JSON.stringify(['omniroute','openrouter']);
        localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}));
      });
      assert.deepEqual(await page.evaluate(()=>[assistantChoice.provider,otherChoice.provider]),['deepseek','deepseek']);
      console.log(`PASS ${width}px: direct vs combo, only-provider, sync, persistence, stale choice, free search and keyboard`);
      await context.close();
    }
    const page=await browser.newPage();
    await page.route('http://atlas.test/**',r=>new URL(r.request().url()).pathname==='/'?r.fulfill({contentType:'text/html; charset=utf-8',body:html}):r.fulfill({path:path.join(root,'knowledge_base',new URL(r.request().url()).pathname)}));
    await page.goto('http://atlas.test/');
    await page.evaluate(()=>{
      localStorage.setItem('kb_ai_disabled_providers:v1','["omniroute","openrouter","deepseek"]');
    });
    await mount(page);
    assert.equal(await page.evaluate(()=>assistantChoice),null);
    await page.locator('#assistantModel button').click();
    const panel=page.locator('.ai-model-panel:not(.hidden)');
    await panel.locator('summary').click();
    await panel.getByRole('button',{name:'Usar solo OpenRouter directo',exact:true}).click();
    assert.equal(await page.evaluate(()=>assistantChoice.provider),'openrouter');
    console.log('PASS recovery when all currently available providers were hidden');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
