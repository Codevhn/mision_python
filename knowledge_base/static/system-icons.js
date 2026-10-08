/* Decorative system labels; never parses or modifies user content. */
function atlasSystemIconMarkup(text) {
  const element = document.createElement('span');
  setAtlasSystemLabel(element, text);
  return element.innerHTML;
}
function setAtlasSystemLabel(element, text) {
  const icons = {
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
    "⚠": "info",
  };
  const prefix = Object.keys(icons).find(key => text.startsWith(key));
  element.replaceChildren();
  if (prefix) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'atlas-system-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', '/static/aero-icons.svg#' + icons[prefix]);
    svg.appendChild(use);
    element.appendChild(svg);
    text = text.slice(prefix.length);
  }
  element.appendChild(document.createTextNode(text));
}
