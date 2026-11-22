const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8132';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [1440,900,412].filter(width=>!process.env.ATLAS_TEST_WIDTH||width===Number(process.env.ATLAS_TEST_WIDTH))){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.request.post(base+'/login',{form:{password:'atlas-library-test-password'}});
  const course=await (await context.request.post(base+'/api/courses',{data:{label:'Curso navegación '+width+' '+Date.now()}})).json();
  const lessons=[];for(const title of ['1. Primera','2. Actual','3. Siguiente']){
   const response=await context.request.post(base+'/api/courses/entry',{data:{course:course.id,module:'Módulo 1',title,raw_text:('Texto de lectura para comprobar el espacio de navegación.\n\n').repeat(80)}});assert.ok(response.ok(),await response.text());lessons.push((await response.json()).id);
  }
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>typeof openCourseLesson==='function');
  await page.evaluate(async({course,id})=>{sessionStorage.setItem('activeSpace','courses');_activeCourseSlug=course;_coursesTreeData=await(await fetch('/api/courses/tree')).json();await openCourseLesson(id);},{course:course.id,id:lessons[1]});
  const nav=page.getByRole('navigation',{name:'Navegación de lecciones'});await nav.waitFor();
  for(const theme of ['paper','aero-amethyst']){
   await page.evaluate(id=>setAtlasTheme(id,true),theme);await page.waitForFunction(()=>document.documentElement.classList.contains('atlas-course-navigation'));
   const start=await nav.boundingBox();assert.ok(start.y+start.height<=901&&start.y>700);
   await page.locator('#contentArea').evaluate(node=>node.scrollTop=node.scrollHeight);
   const end=await nav.boundingBox();assert.equal(end.y,start.y,'Navigation stays docked while scrolling');
   await page.waitForFunction(()=>document.getElementById('assistantLauncher').getBoundingClientRect().bottom<=document.getElementById('courseNavBar').getBoundingClientRect().top).catch(async error=>{await page.screenshot({path:'/tmp/atlas-course-nav-failure.png'});console.log(await page.evaluate(()=>({launcher:getComputedStyle(document.getElementById('assistantLauncher')).bottom,lr:document.getElementById('assistantLauncher').getBoundingClientRect().toJSON(),nav:document.getElementById('courseNavBar').getBoundingClientRect().toJSON(),root:document.documentElement.style.getPropertyValue('--atlas-course-nav-height'),classes:document.documentElement.className})));throw error;});
   await page.screenshot({path:`/tmp/atlas-course-nav-${theme}-${width}.png`});
  }
  await page.evaluate(()=>AssistantApp.open());await page.locator('#assistantArea:not(.hidden)').waitFor();
  const verifyPanels=async()=>{await page.waitForTimeout(150);if(await nav.isVisible()){
   const n=await nav.boundingBox(),a=await page.locator('#assistantArea').boundingBox();assert.ok(n.x+n.width<=a.x+1||n.y+n.height<=a.y+1,'Course dock stays outside the assistant column/row');
   assert.equal(await nav.locator('button').first().evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.course-nav-btn')===node;}),true);
  }};
  await verifyPanels();if(await page.locator('#assistantExpand').isVisible()){await page.locator('#assistantExpand').click();await verifyPanels();}await page.locator('#assistantMinimize').click();await nav.waitFor();
  await nav.locator('.course-nav-next').click();await page.waitForFunction(id=>_getAssistantVisibleContext()?.id===id,lessons[2]);await page.locator('#courseNavBar .course-nav-prev').waitFor();assert.equal(await page.locator('#courseNavBar .course-nav-next').count(),0);
  await page.locator('#courseNavBar .course-nav-prev').click();await page.waitForFunction(id=>_getAssistantVisibleContext()?.id===id,lessons[1]);
  await page.locator('#courseNavBar .course-nav-prev').click();await page.waitForFunction(id=>_getAssistantVisibleContext()?.id===id,lessons[0]);assert.equal(await page.locator('#courseNavBar .course-nav-prev').count(),0);
  await page.evaluate(()=>document.getElementById('entryView').classList.add('hidden'));await page.locator('#courseNavBar').waitFor({state:'hidden'});assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: course dock at top/bottom, theme colors, launcher clearance, normal/expanded assistant, real previous/next navigation, endpoints and hide outside lessons.`);await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
