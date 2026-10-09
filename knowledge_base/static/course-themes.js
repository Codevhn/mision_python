/* Language themes and browser-local course preferences. */
const ATLAS_LANGUAGE_THEMES = [
  ['cybersecurity','Hacking Ético · Obsidiana y Verde','Cristal oscuro y reflejos verde terminal',145,26,'#83efad','#16643a',/\b(hacking|ciberseguridad|cybersecurity|pentesting|ethical\s+hacking)\b/i],
  ['skills','Desarrollo de Skills · Amatista','Cristal violeta y reflejos lavanda',269,32,'#d9b2ff','#7334a2',/\b(?:desarrollo|development|creacion|creation)\s+(?:(?:de|of)\s+)?skills?\b/i],
  ['python','Python · Zafiro y Oro','Cristal azul profundo y reflejos dorados',210,48,'#ffd56b','#815800',/\bpython\b/i],
  ['sql','SQL · Acero y Ámbar','Acero azulado y luz ámbar',208,21,'#ffc778','#805009',/\b(sql|mysql|postgres(?:ql)?|sqlite|oracle)\b/i],
  ['javascript','JavaScript · Oro Eléctrico','Cristal ahumado y oro eléctrico',48,16,'#ffe66d','#705500',/\b(java\s?script|javascript|js|node(?:js|\.js)?)\b/i],
  ['typescript','TypeScript · Azul Polar','Cobalto, plata y reflejos de hielo',214,58,'#8bc9ff','#15549a',/\b(type\s?script|typescript|ts|angular)\b/i],
  ['java','Java · Cobre y Vapor','Acero cálido, cobre y reflejos de café',18,32,'#ffb391','#8b3923',/\bjava\b/i],
  ['html','HTML · Cristal de Fuego','Cristal naranja con destellos cálidos',24,60,'#ffbd88','#9a410f',/\bhtml(?:5)?\b/i],
  ['css','CSS · Océano','Azul marino y reflejos turquesa',198,60,'#76e5ed','#096a7b',/\bcss(?:3)?|tailwind|sass\b/i],
  ['cpp','C / C++ · Titanio','Acero, plata y azul frío',215,17,'#c0d6ef','#36577a',/(?:\bc\+\+|\bcpp\b|\bc\b(?!\s*#))/i],
  ['csharp','C# · Amatista','Cristal violeta y plata lavanda',272,42,'#dbb4ff','#74329f',/(?:c\s*#|\bcsharp\b|\.net)/i],
  ['rust','Rust · Bronce Industrial','Grafito, bronce y naranja óxido',25,28,'#eeb08a','#875027',/\brust\b/i],
  ['go','Go · Aguamarina','Cristal turquesa y azul petróleo',184,46,'#77e3de','#116b70',/\b(go|golang)\b/i],
  ['git','Git · Obsidiana y Coral','Cristal carbón con reflejos coral',8,22,'#ffae9f','#963e31',/\b(git|github|gitlab)\b/i],
];
function registerAtlasLanguageThemes(registry,catalog,groups) {
  groups.languages='Lenguajes y temáticas · Windows 7';
  for(const [language,title,description,hue,saturation,darkAccent,lightAccent] of ATLAS_LANGUAGE_THEMES) {
    for(const scheme of ['dark','light']) {
      const id=`language-${language}-${scheme}`;
      registry[id]={scheme,style:'aero',variant:scheme==='dark'?'night':'light',language,
        preview:`linear-gradient(128deg,hsl(${hue} ${saturation}% ${scheme==='dark'?'20':'78'}%) 35%,${scheme==='dark'?'#ffffff66':'#ffffffee'} 36%,${scheme==='dark'?darkAccent:lightAccent} 55%,hsl(${hue} ${saturation}% ${scheme==='dark'?'12':'85'}%) 56%)`};
      catalog.push([id,title+(scheme==='dark'?' · Oscuro':' · Claro'),description,'languages',id]);
    }
  }
}
let _courseThemeContext=null;
let _courseThemeNavigation=null;
function _readCourseTheme(slug) {
  try {const value=JSON.parse(localStorage.getItem('kb_course_theme:'+slug)||'null');
    if(value?.mode==='general')return value;
    if(value?.mode==='custom'&&ATLAS_THEMES[value.theme])return value;
  }catch{}
  return {mode:'auto'};
}
function _saveCourseTheme(slug,value) {try{localStorage.setItem('kb_course_theme:'+slug,JSON.stringify(value));}catch{}}
function _generalAtlasTheme() {try{return localStorage.getItem('kb_theme')||'aero-night';}catch{return 'aero-night';}}
function _languageForCourse(slug,label) {
  const text=([label,slug].filter(Boolean).join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]/g,' ');
  // More specific names precede C and Java, and SQL wins over a language mentioned in passing.
  for(const id of ['cybersecurity','skills','sql','typescript','javascript','python','csharp','cpp','java','css','html','rust','go','git']) {
    const spec=ATLAS_LANGUAGE_THEMES.find(item=>item[0]===id);if(spec[7].test(text))return id;
  }
  return null;
}
function _enterCourseTheme(slug,label) {
  _courseThemeContext={slug,label:label||slug};
  _courseThemeNavigation='courses';
  const preference=_readCourseTheme(slug),general=_generalAtlasTheme();
  const language=_languageForCourse(slug,label);
  const scheme=ATLAS_THEMES[general]?.scheme||'dark';
  const theme=preference.mode==='custom'?preference.theme:preference.mode==='auto'&&language?`language-${language}-${scheme}`:general;
  setAtlasTheme(theme);
}
function _leaveCourseTheme() {
  if(!_courseThemeContext)return;
  _courseThemeContext=null;setAtlasTheme(_generalAtlasTheme());
}
function _courseThemeSpace(space) {
  _courseThemeNavigation=space;
  if(space!=='courses'){_leaveCourseTheme();return;}
  if(_activeCourseSlug)_enterCourseTheme(_activeCourseSlug,_coursesTreeData[_activeCourseSlug]?.label);
}
function _persistAtlasThemeChoice(id) {
  if(_courseThemeContext&&_readCourseTheme(_courseThemeContext.slug).mode!=='general') {
    _saveCourseTheme(_courseThemeContext.slug,{mode:'custom',theme:id});
  }else{try{localStorage.setItem('kb_theme',id);}catch{}}
}
function _renderCourseThemeControls() {
  const host=document.getElementById('courseThemeControls');if(!host)return;
  host.replaceChildren();if(!_courseThemeContext){host.hidden=true;return;}host.hidden=false;
  const context={..._courseThemeContext},preference=_readCourseTheme(context.slug);
  const title=document.createElement('strong');title.textContent='Tema del curso · '+context.label;
  const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=preference.mode!=='general';
  label.append(toggle,document.createTextNode('Aplicar un tema propio al abrir este curso'));
  const hint=document.createElement('small');hint.textContent=toggle.checked?'El tema que elijas abajo quedará asignado a este curso en este navegador.':'Usarás tu tema general de Atlas.';
  const reset=document.createElement('button');reset.type='button';reset.className='btn-ghost';reset.textContent='Usar tema automático del curso';
  toggle.addEventListener('change',()=>{_saveCourseTheme(context.slug,{mode:toggle.checked?'auto':'general'});_enterCourseTheme(context.slug,context.label);_renderCourseThemeControls();});
  reset.addEventListener('click',()=>{_saveCourseTheme(context.slug,{mode:'auto'});_enterCourseTheme(context.slug,context.label);_renderCourseThemeControls();});
  host.append(title,label,hint,reset);
}
