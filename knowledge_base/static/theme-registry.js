/* Shared theme catalog for the workspace and sign-in screen. */
const ATLAS_THEMES = {
  aero: { scheme: 'light', style: 'aero', variant: 'light' },
  'aero-blue': { scheme: 'light', style: 'aero', variant: 'blue' },
  'aero-night': { scheme: 'dark', style: 'aero', variant: 'night' },
  'aero-ruby': { scheme: 'dark', style: 'aero', variant: 'night', palette: 'ruby' },
  'aero-electric': { scheme: 'dark', style: 'aero', variant: 'night', palette: 'electric' },
  'aero-amber': { scheme: 'dark', style: 'aero', variant: 'night', palette: 'amber' },
  'aero-emerald': { scheme: 'dark', style: 'aero', variant: 'night', palette: 'emerald' },
  'aero-neon': { scheme: 'dark', style: 'aero', variant: 'night', palette: 'neon' },
};
const THEME_GROUPS = {classic:'Aero clásico',neon:'Aero neón',vivid:'Aero intenso',opencode:'OpenCode',glass:'Aero Glass',cyber:'Neón creativo',editor:'Estilos de editor',soft:'Claros suaves'};
const THEME_CATALOG = [
  ['aero','Aero Claro','Cristal celeste y superficies luminosas','classic','aero'],
  ['aero-blue','Aero Azul Windows 7','Cristal azul profundo · Contenido claro','classic','blue'],
  ['aero-night','Aero Nocturno','Cristal azul oscuro · Contenido oscuro','classic','night'],
  ['aero-ruby','Rojo Rubí Neón','Cristal carmesí y destellos rosados','neon','ruby'],
  ['aero-electric','Azul Eléctrico Neón','Reflejos de zafiro y luz cian','neon','electric'],
  ['aero-amber','Naranja Ámbar Neón','Cristal naranja y destellos de fuego','neon','amber'],
  ['aero-emerald','Verde Esmeralda Neón','Reflejos verdes y luz de jade','neon','emerald'],
  ['aero-neon','Negro Neón','Cristal negro y destellos violetas','neon','neon'],
];
for(const [id,label,,group,swatch] of [...THEME_CATALOG]){
  const vividId=id+'-intense';ATLAS_THEMES[vividId]={...ATLAS_THEMES[id],intensity:'vivid'};
  THEME_CATALOG.push([vividId,label.replace(' Neón','')+' Intenso','Más color, reflejos y brillo · Lectura cómoda','vivid',swatch]);
}
ATLAS_THEMES['opencode-dark']={scheme:'dark',style:'opencode',variant:'night'};
ATLAS_THEMES['opencode-light']={scheme:'light',style:'opencode',variant:'light'};
THEME_CATALOG.push(['opencode-dark','OpenCode Oscuro','Grafito, tipografía monoespaciada y controles planos','opencode','opencode-dark'],['opencode-light','OpenCode Claro','Papel, tinta y acentos sobrios','opencode','opencode-light']);
// Additional families share the same palette registry and persisted preference.
for(const [id,label,description,group,scheme,style,palette] of [
  ["aero-turquoise", "Turquesa Glass", "Cristal oceánico y reflejos aguamarina", "glass", "dark", "aero", "turquoise"],
  ["aero-amethyst", "Amatista Glass", "Cristal violeta con reflejos lavanda", "glass", "dark", "aero", "amethyst"],
  ["aero-fuchsia", "Fucsia Glass", "Cristal rosa vibrante y luz magenta", "glass", "dark", "aero", "fuchsia"],
  ["aero-gold", "Dorado Glass", "Cristal dorado y reflejos de champán", "glass", "dark", "aero", "gold"],
  ["aero-silver", "Plata Glass", "Grafito y reflejos de cristal plateado", "glass", "dark", "aero", "silver"],
  ["neon-cyberpunk", "Cyberpunk", "Negro, amarillo eléctrico y magenta", "cyber", "dark", "aero", "cyberpunk"],
  ["neon-matrix", "Matrix", "Negro profundo y verde terminal", "cyber", "dark", "aero", "matrix"],
  ["neon-synthwave", "Synthwave", "Cristal violeta, rosa y destellos cian", "cyber", "dark", "aero", "synthwave"],
  ["neon-lava", "Lava", "Negro volcánico y naranja encendido", "cyber", "dark", "aero", "lava"],
  ["editor-dracula", "Dracula", "Violeta oscuro, lavanda y rosa", "editor", "dark", "opencode", "dracula"],
  ["editor-nord", "Nord", "Azul polar y acentos de hielo", "editor", "dark", "opencode", "nord"],
  ["editor-tokyo", "Tokyo Night", "Azul de medianoche y luz lavanda", "editor", "dark", "opencode", "tokyo"],
  ["editor-gruvbox", "Gruvbox", "Grafito cálido, crema y ámbar", "editor", "dark", "opencode", "gruvbox"],
  ["editor-catppuccin", "Catppuccin", "Mocha oscuro y acentos pastel", "editor", "dark", "opencode", "catppuccin"],
  ["soft-porcelain", "Porcelana", "Blanco frío, tinta azul y superficies suaves", "soft", "light", "opencode", "porcelain"],
  ["soft-ivory", "Marfil", "Papel cálido, tinta oscura y ámbar", "soft", "light", "opencode", "ivory"],
  ["soft-mint", "Menta", "Verde suave y tinta de bosque", "soft", "light", "opencode", "mint"]
]){
  ATLAS_THEMES[id]={scheme,style,variant:scheme==='dark'?'night':'light',palette};
  THEME_CATALOG.push([id,label,description,group,palette]);
}
registerAtlasLanguageThemes(ATLAS_THEMES,THEME_CATALOG,THEME_GROUPS);
