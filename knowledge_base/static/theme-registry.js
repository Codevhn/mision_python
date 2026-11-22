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
const THEME_GROUPS = {desktop:'Escritorios',classic:'Aero clásico',neon:'Aero neón',vivid:'Aero intenso',opencode:'OpenCode',glass:'Aero Glass',cyber:'Neón creativo',editor:'Estilos de editor',soft:'Claros suaves'};
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

ATLAS_THEMES.horizon={scheme:'dark',style:'aero',variant:'night',preview:'linear-gradient(165deg,#3888b7 0%,#bad4db 48%,#709aa5 49%,#254f53 72%,#102e37 100%)'};
THEME_GROUPS.landscape='Paisajes vivos';
THEME_CATALOG.push(['horizon','Horizonte','Cristal translúcido · Paisaje vivo según el clima','landscape','horizon']);

// A separate family, rather than replacing the existing Aero/editor themes.
// Styling depends on the same root attributes used by every persisted theme.
THEME_GROUPS.notion='Notion Native';
ATLAS_THEMES['notion-native']={scheme:'dark',style:'notion',variant:'night'};
ATLAS_THEMES['notion-native-light']={scheme:'light',style:'notion',variant:'light'};
THEME_CATALOG.push(
  ['notion-native','Notion Native','Oscuro · Superficies neutras y controles discretos','notion','notion-native'],
  ['notion-native-light','Notion Native Claro','Claro · Papel, separadores suaves y tinta neutra','notion','notion-native-light']
);

ATLAS_THEMES.hyprland={scheme:'dark',style:'hyprland',variant:'night',
  preview:'linear-gradient(135deg,#11131e 12%,#242337 50%,#8edee6 51%,#b6a0ef 54%,#151725 55%)'};
THEME_CATALOG.unshift(['hyprland','Hyprland','Ventanas flotantes · Bordes cian y lavanda · Cristal oscuro','desktop','hyprland']);

// Papel reuses the flat control/portal bridge with a dedicated ink palette.
THEME_GROUPS.reading='Lectura';
ATLAS_THEMES.paper={scheme:'light',style:'notion',variant:'light',palette:'paper',preview:'#f6f4ec'};
THEME_CATALOG.push(['paper','Papel','Marfil mate · Tinta profunda · Lectura serena','reading','paper']);

// Warm grid-and-gradient desktop, with independent light/dark preferences.
THEME_GROUPS.atmosphere='Atmósferas';
ATLAS_THEMES['terracotta-dark']={scheme:'dark',style:'notion',variant:'night',palette:'terracotta',preview:'linear-gradient(145deg,#302824,#6b3b2e 65%,#272724)'};
ATLAS_THEMES['terracotta-light']={scheme:'light',style:'notion',variant:'light',palette:'terracotta',preview:'linear-gradient(145deg,#edd1ad,#c98b63 65%,#f1d9bc)'};
THEME_CATALOG.push(
  ['terracotta-dark','Terracota · Oscuro','Degradado cobre y carbón · Cuadrícula tenue · Tarjetas marfil','atmosphere','terracotta-dark'],
  ['terracotta-light','Terracota · Claro','Arena y cobre suave · Lectura cálida · Código claro','atmosphere','terracotta-light']
);

// Dark atmospheres use the same flat component bridge and reading canvas.
ATLAS_THEMES['atmosphere-ocean']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-ocean',preview:'linear-gradient(145deg,#173647,#28627b 65%,#111b28)'};
THEME_CATALOG.push(['atmosphere-ocean','Océano · Oscuro','Azul profundo y bruma turquesa · Cuadrícula sutil','atmosphere','atmosphere-ocean']);
ATLAS_THEMES['atmosphere-forest']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-forest',preview:'linear-gradient(145deg,#244634,#467854 65%,#13231f)'};
THEME_CATALOG.push(['atmosphere-forest','Bosque · Oscuro','Verde pino y reflejos de jade · Cuadrícula sutil','atmosphere','atmosphere-forest']);
ATLAS_THEMES['atmosphere-plum']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-plum',preview:'linear-gradient(145deg,#492d48,#83456b 65%,#211c2b)'};
THEME_CATALOG.push(['atmosphere-plum','Ciruela · Oscuro','Berenjena y resplandor malva · Cuadrícula sutil','atmosphere','atmosphere-plum']);
ATLAS_THEMES['atmosphere-graphite']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-graphite',preview:'linear-gradient(145deg,#373a37,#77715a 65%,#202326)'};
THEME_CATALOG.push(['atmosphere-graphite','Grafito · Oscuro','Carbón suave y luz de champán · Cuadrícula sutil','atmosphere','atmosphere-graphite']);

// Neutral atmospheres: mineral gray, charcoal and deep black.
ATLAS_THEMES['atmosphere-gray']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-gray',preview:'linear-gradient(145deg,#3a3a3a,#686868 65%,#292929)'};
THEME_CATALOG.push(['atmosphere-gray','Gris','Gris mineral y reflejos de plata · Cuadrícula sutil','atmosphere','atmosphere-gray']);
ATLAS_THEMES['atmosphere-charcoal']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-charcoal',preview:'linear-gradient(145deg,#2c2c2c,#464646 65%,#181818)'};
THEME_CATALOG.push(['atmosphere-charcoal','Gris oscuro','Carbón neutro y sombras suaves · Cuadrícula sutil','atmosphere','atmosphere-charcoal']);
ATLAS_THEMES['atmosphere-black']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-black',preview:'linear-gradient(145deg,#191919,#303030 65%,#080808)'};
THEME_CATALOG.push(['atmosphere-black','Negro','Negro profundo y luz de grafito · Cuadrícula sutil','atmosphere','atmosphere-black']);

// Warm near-black atmospheres inspired by the user’s Rust reading reference.
ATLAS_THEMES['atmosphere-rust']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-rust',preview:'linear-gradient(145deg,#1b130d,#623015 65%,#0b0a09)'};
THEME_CATALOG.push(['atmosphere-rust','Óxido','Negro cálido y naranja óxido · Cuadrícula sutil','atmosphere','atmosphere-rust']);
ATLAS_THEMES['atmosphere-amber']={scheme:'dark',style:'notion',variant:'night',palette:'atmosphere-amber',preview:'linear-gradient(145deg,#2a1d10,#75502a 65%,#100e0b)'};
THEME_CATALOG.push(['atmosphere-amber','Ámbar nocturno','Carbón tostado y luz de ámbar · Cuadrícula sutil','atmosphere','atmosphere-amber']);
