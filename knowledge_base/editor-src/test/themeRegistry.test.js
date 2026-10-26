// Exercise the actual browser registry + theme application functions without
// mounting a second editor. Visual fidelity and portal rendering still require
// browser validation; these checks protect persistence and preference scope.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const staticRoot=new URL('../../static/',import.meta.url);
const courseSource=fs.readFileSync(new URL('course-themes.js',staticRoot),'utf8');
const registrySource=fs.readFileSync(new URL('theme-registry.js',staticRoot),'utf8');
const appSource=fs.readFileSync(new URL('app.js',staticRoot),'utf8');
const applySource=appSource.slice(appSource.indexOf('function setAtlasTheme('),appSource.indexOf('function applyTheme()'));
assert.ok(applySource.includes('document.documentElement.dataset.themeId = id'));

const storage=new Map();
const data={pageId:'retained-page',viewId:'retained-view',recordFont:'serif',frame:'sentinel'};
const context=vm.createContext({
  document:{documentElement:{dataset:data},querySelectorAll:()=>[]},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
  window:{AtlasHorizon:{setEnabled:()=>{}}},
  queueMicrotask:()=>{},
});
vm.runInContext(courseSource+'\n'+registrySource+'\n'+applySource,context);
const apply=(id,persist=true)=>vm.runInContext(`setAtlasTheme(${JSON.stringify(id)},${persist})`,context);
const theme=id=>vm.runInContext(`({...ATLAS_THEMES[${JSON.stringify(id)}]})`,context);
const catalog=vm.runInContext('THEME_CATALOG.map(item=>item[0])',context);
assert.equal(new Set(catalog).size,catalog.length,'every theme has a unique selector entry');
for(const id of ['aero','aero-night','aero-amber','horizon','opencode-dark','soft-ivory','language-python-dark']) {
  assert.ok(catalog.includes(id),`existing theme ${id} retained`);
}
assert.equal(theme('notion-native').style,'notion');
assert.equal(theme('notion-native').scheme,'dark');
assert.equal(theme('notion-native-light').scheme,'light');
apply('aero-amber');
const priorTheme={...data};
apply('notion-native');
assert.equal(data.themeId,'notion-native');
assert.equal(data.theme,'dark');
assert.equal(data.style,'notion');
assert.equal(data.palette,'');
assert.equal(data.intensity,'normal');
assert.equal(storage.get('kb_theme'),'notion-native');
assert.equal(data.frame,'sentinel','frame preference preserved while CSS suppresses ornament');
assert.equal(data.recordFont,'serif','page typography preference preserved');
assert.equal(data.pageId,'retained-page');
assert.equal(data.viewId,'retained-view');
apply('notion-native-light');
assert.equal(data.theme,'light');
assert.equal(data.style,'notion');
assert.equal(storage.get('kb_theme'),'notion-native-light');
// Same persisted identifier is accepted on subsequent initialization.
apply(storage.get('kb_theme'),false);
assert.equal(data.themeId,'notion-native-light');
apply('aero-amber');
assert.deepEqual(data,priorTheme,'previous presentation attributes restored exactly');

// Course navigation ignores former per-course choices without deleting them.
storage.set('kb_theme','notion-native');
apply('notion-native',false);
vm.runInContext(`_enterCourseTheme('curso-python','Python')`,context);
assert.equal(data.themeId,'notion-native');
storage.set('kb_course_theme:curso-python',JSON.stringify({mode:'custom',theme:'editor-nord'}));
vm.runInContext(`_enterCourseTheme('curso-python','Python')`,context);
assert.equal(data.themeId,'notion-native');
apply('editor-nord');
assert.equal(storage.get('kb_theme'),'editor-nord','theme selection inside a course is global');
vm.runInContext('_leaveCourseTheme()',context);
assert.equal(data.themeId,'editor-nord');
assert.equal(storage.get('kb_course_theme:curso-python'),JSON.stringify({mode:'custom',theme:'editor-nord'}));
apply('aero-night');
vm.runInContext(`_enterCourseTheme('curso-javascript','JavaScript')`,context);
assert.equal(data.themeId,'aero-night');
vm.runInContext(`_courseThemeSpace('home')`,context);
assert.equal(data.themeId,'aero-night');
console.log('Theme registry: persistence, reversibility and course navigation scope passed');
