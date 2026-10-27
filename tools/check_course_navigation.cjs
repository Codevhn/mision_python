// Integration regression: use only a disposable local Atlas server.
// Exercises real navigation/API/CSS; no personal course data is used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8131';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const password=process.env.ATLAS_TEST_PASSWORD||'atlas-courses-test-password';
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11);
const output=process.env.ATLAS_SCREENSHOTS||'/tmp/atlas-course-navigation';
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const report=[];
  try{
    const setup=await browser.newContext();
    assert.ok((await setup.request.post(base+'/login',{form:{password}})).ok());
    const suffix=Date.now();
    const fixtures=[];
    for(const label of ['Python Profesional','CSS Profesional']){
      const result=await setup.request.post(base+'/api/courses',{data:{label:`${label} QA ${suffix}`}});
      assert.equal(result.status(),201);
      const course=await result.json();course.lessons=[];
      for(let n=1;n<=3;n++){
        const lesson=await setup.request.post(base+'/api/courses/entry',{data:{course:course.id,module:`Módulo ${n}`,title:`${label} lección ${n} QA ${suffix}`,raw_text:`## Tema ${n}\n\nContenido temporal.`}});
        assert.ok(lesson.ok(),await lesson.text());course.lessons.push((await lesson.json()).id);
      }
      fixtures.push(course);
    }
    const [python,css]=fixtures;
    await setup.close();
    for(const profile of [
      {name:'desktop',viewport:{width:1916,height:960}},
      {name:'tablet',viewport:{width:1480,height:924},hasTouch:true},
      {name:'phone',viewport:{width:412,height:915},hasTouch:true,isMobile:true},
    ]){
      const {name,...options}=profile;
      const context=await browser.newContext(options);
      await context.request.post(base+'/login',{form:{password}});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(baseline && url.pathname==='/static/app.js')return route.fulfill({contentType:'application/javascript',body:execFileSync('git',['show',`${baseline}:knowledge_base/static/app.js`],{cwd:root,maxBuffer:10*1024*1024})});
        if(url.pathname==='/api/ai/providers')return route.fulfill({json:{providers:[],warnings:[],default:{}}});
        return route.continue();
      });
      const page=await context.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const tree=`.course-inline-tree[data-for-course="${python.id}"]`;
      const courseName=id=>page.locator(`.course-list-item[data-course-id="${id}"] .course-list-name`);
      const openDrawer=async()=>{
        if(await page.locator('#sidebarToggle').isVisible() && !(await page.locator('#sidebar').evaluate(e=>e.classList.contains('mobile-open'))))await page.locator('#sidebarToggle').click();
        await page.locator('#spaceCourses').waitFor({state:'visible'});
      };
      const overview=slug=>page.waitForFunction(slug=>{
        const cv=document.getElementById('courseView');
        return cv.dataset.courseId===slug && cv.dataset.courseReady==='true';
      },slug);
      const ready=()=>page.waitForSelector('.course-list-item',{state:'attached'});
      for(const theme of ['hyprland','aero-amber','opencode-dark']){
        await page.goto(base);await ready();
        await page.evaluate(({theme,id})=>{setAtlasTheme(theme,true);return window._loadEntryById(id);},{theme,id:python.lessons[0]});
        // Home is reconstructed from persisted study activity on a fresh load.
        await page.reload();await ready();
        await page.locator(`.home-study-featured[data-id="${python.lessons[0]}"]`).click();
        await page.waitForFunction(id=>window._currentEntryId===id,python.lessons[0]);
        await page.waitForFunction(slug=>document.querySelector(`.course-inline-tree[data-for-course="${slug}"]`)?.children.length===3,python.id,{timeout:4000});
        assert.equal(await page.locator(tree).evaluate(e=>e.classList.contains('tree-collapsed')),false);
        assert.equal(await page.locator(`.course-list-item[data-course-id="${python.id}"]`).evaluate(e=>e.classList.contains('active')),true);
        // Return to Courses: initialize the overview instead of showing its
        // untouched static shell (empty title, no content) as a loaded course.
        await page.evaluate(()=>switchSpace('courses'));
        await page.waitForFunction(label=>document.getElementById('cvTitle').textContent===label,python.label);
        await overview(python.id);
        await page.waitForSelector('#cvBody .cv-roadmap-section');
        await openDrawer();
        assert.equal(await page.locator(tree+' > .tree-topic').count(),3);
        assert.equal(await page.locator(tree+' .tree-topic-header').first().isVisible(),true);
        assert.equal(await page.locator(`.course-inline-tree[data-for-course="${css.id}"] .tree-topic`).count(),0,'CSS has not been opened');
        await page.locator(tree+' .tree-topic-header').first().click();
        assert.equal(await page.locator(tree+' .tree-entry').first().isVisible(),true);
        // Collapse/reopen the same course; preserve module/lesson expansion.
        await courseName(python.id).click();
        assert.equal(await page.locator(tree).isVisible(),false);
        await courseName(python.id).click();
        assert.equal(await page.locator(tree+' .tree-entry').first().isVisible(),true);
        await courseName(css.id).click();
        await page.waitForFunction(label=>document.getElementById('cvTitle').textContent===label,css.label);
        await overview(css.id);
        await openDrawer();
        assert.equal(await page.locator(tree+' .tree-entry').first().isVisible(),true,'Opening CSS must retain Python expansion');
        await courseName(python.id).click();
        await page.waitForFunction(label=>document.getElementById('cvTitle').textContent===label,python.label);
        await overview(python.id);
        await openDrawer();
        assert.equal(await page.locator(tree+' .tree-entry').first().isVisible(),true);
        if(theme==='hyprland')await page.screenshot({path:path.join(output,`${name}-restored.png`)});
        report.push({profile:name,theme,modules:3,result:'passed'});
        console.log(`PASS ${name}/${theme}: Home restore, overview, modules/lessons, collapse/reopen and independent courses`);
      }

      // Delay an overview until after a lesson has loaded. Its response must
      // not hide the lesson or overwrite the current course view.
      let release,seen;
      const pending=new Promise(resolve=>{seen=resolve;});
      const gate=new Promise(resolve=>{release=resolve;});
      await page.route('**/api/courses',async route=>{seen();await gate;await route.continue();},{times:1});
      await page.evaluate(slug=>{window.pendingCourse=openCourseDetail(slug);},css.id);
      await pending;
      await page.evaluate(id=>openCourseLesson(id),python.lessons[0]);
      await page.waitForFunction(id=>window._currentEntryId===id,python.lessons[0]);
      release();await page.evaluate(()=>window.pendingCourse);
      assert.equal(await page.locator('#courseView').isVisible(),false,'Delayed overview must not cover the lesson');
      assert.equal(await page.locator('#entryView').isVisible(),true);
      assert.equal(await page.evaluate(()=>_activeCourseSlug),python.id);

      // A canceled stats load must not mark an incomplete overview as ready.
      let releaseStats,seenStats;
      const statsPending=new Promise(resolve=>{seenStats=resolve;});
      const statsGate=new Promise(resolve=>{releaseStats=resolve;});
      await page.route(`**/api/courses/${css.id}/stats`,async route=>{seenStats();await statsGate;await route.continue();},{times:1});
      await page.evaluate(slug=>{window.pendingCourse=openCourseDetail(slug);},css.id);
      await statsPending;
      await page.evaluate(()=>switchSpace('home'));
      releaseStats();await page.evaluate(()=>window.pendingCourse);
      assert.equal(await page.locator('#courseView').isVisible(),false);
      await page.evaluate(()=>switchSpace('courses'));
      await page.waitForFunction(slug=>{
        const cv=document.getElementById('courseView');
        return cv.dataset.courseReady==='true' && cv.dataset.courseId===slug;
      },css.id);
      assert.equal(await page.locator('#cvTitle').textContent(),css.label);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: delayed overview cannot replace a lesson; canceled stats reload correctly`);
      await context.close();
    }
    fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify({cases:report,delayedOverview:'passed',browser:'Chromium, touch viewports emulated'},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
