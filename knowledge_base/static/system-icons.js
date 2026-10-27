/* Decorative system labels; never parses or modifies user content. */
const ATLAS_SYSTEM_ICONS = {
  "🎯": "practice", "📖": "knowledge", "📚": "library", "🎓": "courses",
  "👥": "team", "📄": "pages", "🗂": "folder", "📁": "folder",
  "📘": "knowledge", "📭": "folder", "📋": "clipboard", "🖼️": "image",
  "🖼": "image", "🗑️": "trash", "🗑": "trash", "🔁": "refresh",
  "🔄": "refresh", "🔗": "link", "💡": "hint", "🕘": "history",
  "🎲": "dice", "🧭": "radar", "🗣️": "info", "✏️": "edit",
  "📅": "calendar", "📦": "folder", "👤": "person", "📎": "attach",
  "🏷️": "tag", "🏷": "tag", "🎨": "paint", "🔓": "unlock",
  "🤔": "hint", "✺": "mindmaps", "◈": "conceptmaps", "⚡": "practice",
  "ℹ": "info", "🔒": "lock", "↗": "export", "★": "star",
  "⚙": "settings", "✦": "hint", "⌂": "home", "⊞": "boards",
  "◉": "knowledge", "◎": "courses", "☆": "star", "⊙": "radar",
  "¶": "clipboard", "↓": "export", "⊕": "diagrams", "📊": "boards",
  "◐": "paint", "🔵": "info", "☀️": "sun", "🌙": "moon",
  "🌤️": "sun", "☁️": "cloud", "🌫️": "cloud", "🌧️": "rain",
  "❄️": "snow", "⛈️": "rain", "🌡️": "weather", "🔌": "settings",
  "📌": "tag", "🕐": "history", "👁": "search", "⏰": "history",
  "⚠": "info", "✨": "hint",
};
function atlasSystemIconMarkup(text) {
  const element = document.createElement('span');
  setAtlasSystemLabel(element, text);
  return element.innerHTML;
}
function setAtlasSystemLabel(element, text) {
  const icons = ATLAS_SYSTEM_ICONS;
  const prefix = Object.keys(icons).find(key => text.startsWith(key));
  element.replaceChildren();
  if (prefix) {
    for (const native of [false, true]) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', `atlas-system-icon ${native ? 'native-system-icon' : 'aero-system-icon'}`);
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      if (native) {
        for (const [name,value] of Object.entries({fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round'})) svg.setAttribute(name,value);
      }
      const use = document.createElementNS(svg.namespaceURI, 'use');
      use.setAttribute('href', `/static/${native ? 'native' : 'aero'}-icons.svg#${icons[prefix]}`);
      svg.appendChild(use);
      element.appendChild(svg);
    }
    text = text.slice(prefix.length);
  }
  element.appendChild(document.createTextNode(text));
}

// Older system widgets render a single SVG rather than the paired component.
// Switch only owned sprite references on those SVGs; never scan note text,
// images, uploaded SVGs, arbitrary <use> elements or illustrated previews.
(() => {
  const known = new Set([...Object.values(ATLAS_SYSTEM_ICONS), 'finance', 'power', 'graph']);
  const originals = new WeakMap();
  const line = {fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round'};
  function sync(svg) {
    if (svg.matches('.aero-system-icon,.native-system-icon')) return;
    const use = svg.querySelector('use'); if (!use) return;
    let original = originals.get(svg);
    if (!original) {
      const href = use.getAttribute('href') || '';
      const match = href.match(/(?:^|\/)aero-icons\.svg#([a-z][\w-]*)$/);
      if (!match || !known.has(match[1])) return;
      original = {href, id:match[1], attributes:Object.fromEntries(Object.keys(line).map(key=>[key,svg.getAttribute(key)]))};
      originals.set(svg, original);
    }
    const flat = ['opencode','notion','hyprland'].includes(document.documentElement.dataset.style);
    use.setAttribute('href', flat ? `/static/native-icons.svg#${original.id}` : original.href);
    svg.classList.toggle('native-system-single', flat);
    for (const [key,value] of Object.entries(flat ? line : original.attributes)) {
      if (value === null) svg.removeAttribute(key); else svg.setAttribute(key,value);
    }
  }
  function scan(node) {
    if (!(node instanceof Element)) return;
    if (node.matches('svg.atlas-system-icon')) sync(node);
    node.querySelectorAll('svg.atlas-system-icon').forEach(sync);
  }
  scan(document.body);
  new MutationObserver(()=>scan(document.body)).observe(document.documentElement,{attributes:true,attributeFilter:['data-style']});
  new MutationObserver(records=>{
    for (const record of records) {
      if (record.target instanceof Element && record.target.matches('svg.atlas-system-icon')) sync(record.target);
      for (const node of record.addedNodes) scan(node);
    }
  }).observe(document.body,{childList:true,subtree:true});
})();
