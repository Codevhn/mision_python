// Bidirectional converter between this app's markdown dialect (as produced by
// the legacy static/editor.js: mdToBlocks / blocksToMd) and BlockNote's
// PartialBlock tree. Kept independent from BlockNote's own (lossy, generic)
// markdown import/export so the on-disk format used by app.py never changes.

const HEADING_PREFIX = ["#", "##", "###", "####"];

function textContent(str) {
  return str ? [{ type: "text", text: str, styles: {} }] : [];
}

function plain(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  // Non-array content (e.g. a table block's `{ type: "tableContent", rows }`)
  // never goes through this path on purpose — callers serialize it themselves.
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c.type === "text" ? c.text : c.type === "link" ? plain(c.content) : "")).join("");
}

// ── INLINE MARKDOWN (bold/italic/code/strike/links) ─────────────────
// Mirrors the dialect the legacy static/editor.js renderInline/htmlToMd
// pair used, so old on-disk content (and anything still produced by that
// dialect) round-trips into real BlockNote rich-text instead of showing
// literal **/`` markers. Patterns are tried in priority order (most
// specific delimiter first) and the earliest match in the string wins,
// same precedence the legacy sequential .replace() chain implied.
const INLINE_PATTERNS = [
  { re: /\[([^\]]+)\]\(([^)]+)\)/, type: "link" },
  { re: /\*\*\*((?:[^*]|\*(?!\*))+?)\*\*\*/, styles: { bold: true, italic: true } },
  { re: /\*\*((?:[^*]|\*(?!\*))+?)\*\*/, styles: { bold: true } },
  { re: /__([^_]+?)__/, styles: { bold: true } },
  { re: /~~([^~]+?)~~/, styles: { strike: true } },
  { re: /`([^`]+?)`/, styles: { code: true } },
  { re: /(?<![a-zA-Z0-9])\*([^*\n]+?)\*(?![a-zA-Z0-9])/, styles: { italic: true } },
  { re: /(?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/, styles: { italic: true } },
  { re: /(https?:\/\/[^\s<>"]+|www\.[^\s<>"\]]+)/i, type: "autolink" },
];

// Trim trailing punctuation that's almost certainly not part of the URL
// (e.g. "ver https://x.com." or "(ver https://x.com)") — same heuristic
// as the legacy editor's autolink().
function trimUrlTrail(raw) {
  let url = raw;
  let trail = "";
  const m = url.match(/[.,;:!?)\]}'"]+$/);
  if (m) { trail = m[0]; url = url.slice(0, -trail.length); }
  return { url, trail };
}

function parseInline(text, baseStyles = {}) {
  if (!text) return [];
  let best = null;
  for (const p of INLINE_PATTERNS) {
    const m = p.re.exec(text);
    if (m && (!best || m.index < best.m.index)) best = { p, m };
  }
  if (!best) return [{ type: "text", text, styles: { ...baseStyles } }];
  const { p, m } = best;
  const before = text.slice(0, m.index);
  let after = text.slice(m.index + m[0].length);
  const runs = [];
  if (before) runs.push({ type: "text", text: before, styles: { ...baseStyles } });

  if (p.type === "link") {
    runs.push({ type: "link", href: m[2], content: parseInline(m[1], baseStyles) });
  } else if (p.type === "autolink") {
    const { url, trail } = trimUrlTrail(m[0]);
    if (!url) {
      runs.push({ type: "text", text: m[0], styles: { ...baseStyles } });
    } else {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      runs.push({ type: "link", href, content: [{ type: "text", text: url, styles: { ...baseStyles } }] });
      after = trail + after;
    }
  } else {
    runs.push(...parseInline(m[1], { ...baseStyles, ...p.styles }));
  }
  runs.push(...parseInline(after, baseStyles));
  return runs;
}

function styleWrap(text, styles) {
  if (!text) return text;
  if (styles.code) return "`" + text + "`";
  let out = text;
  if (styles.bold && styles.italic) out = "***" + out + "***";
  else if (styles.bold) out = "**" + out + "**";
  else if (styles.italic) out = "_" + out + "_";
  if (styles.strike) out = "~~" + out + "~~";
  return out;
}

function inlineToMd(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => {
    if (c.type === "link") {
      const inner = inlineToMd(c.content);
      const bareHref = c.href.replace(/^https?:\/\//, "");
      // Re-emit as a bare URL (not [text](url)) when the visible text is
      // just the href, so plain autolinked URLs round-trip losslessly
      // through the same dialect the legacy editor wrote.
      if (inner === c.href || inner === bareHref) return c.href;
      return `[${inner}](${c.href})`;
    }
    if (c.type === "text") return styleWrap(c.text, c.styles || {});
    return "";
  }).join("");
}

function colorProps(block) {
  const props = {};
  if (block.color && block.color !== "default") props.textColor = block.color;
  if (block.bgColor && block.bgColor !== "default") props.backgroundColor = block.bgColor;
  return props;
}

function isSpecialLine(l) {
  return (
    /^#{1,6} /.test(l) ||
    /^- \[[ x]\] /.test(l) ||
    /^[-*] /.test(l) ||
    /^\d+\. /.test(l) ||
    l.startsWith("> ") ||
    l === "---" || l === "***" ||
    /^\[\[.+\]\]$/.test(l.trim()) ||
    l.startsWith(":::") ||
    l.startsWith("```") ||
    l.trimStart().startsWith("|") ||
    l === "<!--blank-->" ||
    /^<!--\s*color:/.test(l)
  );
}

let _uidCounter = 0;
function uid() {
  return "b" + (Date.now().toString(36)) + (_uidCounter++).toString(36);
}

// ── MARKDOWN -> FLAT BLOCKS (with `indent`) ─────────────────────────
function mdToFlat(md) {
  if (!md || !md.trim()) return [{ id: uid(), type: "paragraph", content: "", indent: 0 }];
  const blocks = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    let l = lines[i];

    let blockColor = "", blockBgColor = "";
    const colorMatch = l.match(/^<!--\s*color:(\w+)(?:\s+bgColor:(\w+))?\s*-->$/);
    if (colorMatch) {
      blockColor = colorMatch[1]; blockBgColor = colorMatch[2] || "";
      i++; if (i >= lines.length) break; l = lines[i];
    }
    const push = (b) => {
      if (blockColor) b.color = blockColor;
      if (blockBgColor) b.bgColor = blockBgColor;
      blocks.push(b);
    };

    if (!l.trim()) { i++; continue; }

    if (l === "<!--blank-->") { push({ id: uid(), type: "paragraph", content: "", indent: 0 }); i++; continue; }

    let hLevel = 0;
    for (let h = 6; h >= 1; h--) {
      const prefix = "#".repeat(h) + " ";
      if (l.startsWith(prefix)) { hLevel = Math.min(h, 4); push({ id: uid(), type: "heading", level: hLevel, content: l.slice(prefix.length), indent: 0 }); break; }
    }
    if (hLevel) { i++; continue; }

    const trimmedL = l.trimStart();
    const leadingSpaces = l.length - trimmedL.length;
    const listIndent = Math.floor(leadingSpaces / 2);

    if (trimmedL.startsWith("- [x] ")) { push({ id: uid(), type: "todo", content: trimmedL.slice(6), checked: true, indent: listIndent }); i++; continue; }
    if (trimmedL.startsWith("- [ ] ")) { push({ id: uid(), type: "todo", content: trimmedL.slice(6), checked: false, indent: listIndent }); i++; continue; }
    if (trimmedL.startsWith("- ") || trimmedL.startsWith("* ")) { push({ id: uid(), type: "bullet", content: trimmedL.slice(2), indent: listIndent }); i++; continue; }
    if (/^\d+\. /.test(trimmedL)) { push({ id: uid(), type: "numbered", content: trimmedL.replace(/^\d+\. /, ""), indent: listIndent }); i++; continue; }

    if (l.startsWith("> ")) { push({ id: uid(), type: "quote", content: l.slice(2), indent: 0 }); i++; continue; }

    if (l === "---" || l === "***") { push({ id: uid(), type: "divider", content: "", indent: 0 }); i++; continue; }

    if (/^\[\[.+\]\]$/.test(l.trim())) {
      const inner = l.trim().slice(2, -2);
      const pipe = inner.lastIndexOf("|");
      const title = pipe >= 0 ? inner.slice(0, pipe) : inner;
      const pageId = pipe >= 0 ? inner.slice(pipe + 1) : undefined;
      push({ id: uid(), type: "pageLink", title, pageId, indent: 0 });
      i++; continue;
    }

    if (l.startsWith(":::toggle")) {
      const typeMatch = l.match(/^:::(toggle(?:-h([123]))?)\s*(.*)/);
      const toggleLevel = typeMatch && typeMatch[2] ? parseInt(typeMatch[2], 10) : 0;
      const tHeader = typeMatch ? typeMatch[3] : "";
      const bodyLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) { bodyLines.push(lines[i]); i++; }
      if (i < lines.length && lines[i].startsWith(":::")) i++;
      const bodyMd = bodyLines.join("\n").trim();
      const children = bodyMd ? mdToFlat(bodyMd) : [];
      push({ id: uid(), type: "toggle", toggleLevel, content: tHeader, indent: 0, _children: children });
      continue;
    }

    if (l.startsWith(":::database")) {
      const bodyLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) { bodyLines.push(lines[i]); i++; }
      if (i < lines.length && lines[i].startsWith(":::")) i++;
      push({ id: uid(), type: "database", data: bodyLines.join("\n"), indent: 0 });
      continue;
    }

    if (l.trimStart().startsWith("|")) {
      const tableLines = [l.trimStart()];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i].trim()); i++; }
      push({ id: uid(), type: "table", tableLines, indent: 0 });
      continue;
    }

    if (l.startsWith("```")) {
      const lang = l.slice(3).trim();
      const code = [];
      i++;
      let fenceLines = 0;
      while (i < lines.length && !lines[i].startsWith("```") && fenceLines < 500) { code.push(lines[i]); i++; fenceLines++; }
      if (i < lines.length && lines[i].startsWith("```")) i++;
      push({ id: uid(), type: "code", content: code.join("\n"), lang, indent: 0 });
      continue;
    }

    const paraLines = [l];
    i++;
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) { paraLines.push(lines[i]); i++; }
    push({ id: uid(), type: "paragraph", content: paraLines.join("\n"), indent: 0 });
  }

  return blocks.length ? blocks : [{ id: uid(), type: "paragraph", content: "", indent: 0 }];
}

function parseMdTable(tableLines) {
  const rows = tableLines.filter((l) => !/^\|?[\s:|-]+\|?$/.test(l));
  const cells = rows.map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  return cells;
}

function flatToBlock(fb) {
  const props = colorProps(fb);
  switch (fb.type) {
    case "heading":
      return { id: fb.id, type: "heading", props: { ...props, level: fb.level }, content: parseInline(fb.content), children: [] };
    case "bullet":
      return { id: fb.id, type: "bulletListItem", props, content: parseInline(fb.content), children: [] };
    case "numbered":
      return { id: fb.id, type: "numberedListItem", props, content: parseInline(fb.content), children: [] };
    case "todo":
      return { id: fb.id, type: "checkListItem", props: { ...props, checked: !!fb.checked }, content: parseInline(fb.content), children: [] };
    case "quote":
      return { id: fb.id, type: "quote", props, content: parseInline(fb.content), children: [] };
    case "divider":
      return { id: fb.id, type: "divider", props, children: [] };
    case "code":
      // Code blocks are never inline-parsed: literal `**`, `_`, backtick,
      // etc. inside source code must stay exactly as typed.
      return { id: fb.id, type: "codeBlock", props: { language: fb.lang || "" }, content: textContent(fb.content), children: [] };
    case "pageLink":
      return { id: fb.id, type: "pageLink", props: { ...props, title: fb.title || "", pageId: fb.pageId || "" }, children: [] };
    case "database":
      return { id: fb.id, type: "database", props: { ...props, data: fb.data || "{}" }, children: [] };
    case "table": {
      const rows = parseMdTable(fb.tableLines).map((cells) => ({
        cells: cells.map((c) => parseInline(c)),
      }));
      // Legacy content sometimes used a separator-only table line (e.g. "|---|")
      // as a visual blank-space hack before this editor existed. That leaves
      // zero real rows here, and BlockNote's table node rejects empty content
      // with a RangeError. Fall back to a blank paragraph instead of crashing.
      if (rows.length === 0) {
        return { id: fb.id, type: "paragraph", props, content: [], children: [] };
      }
      return { id: fb.id, type: "table", props, content: { type: "tableContent", rows }, children: [] };
    }
    case "toggle": {
      const children = buildTree(fb._children || []);
      if (fb.toggleLevel) {
        return { id: fb.id, type: "heading", props: { ...props, level: fb.toggleLevel, isToggleable: true }, content: parseInline(fb.content), children };
      }
      return { id: fb.id, type: "toggleListItem", props, content: parseInline(fb.content), children };
    }
    default:
      return { id: fb.id, type: "paragraph", props, content: parseInline(fb.content), children: [] };
  }
}

// Indented flat list (bullet/numbered/todo use `indent`) -> tree of Block.
function buildTree(flat) {
  const root = [];
  const stack = [{ indent: -1, children: root }];
  for (const fb of flat) {
    const indent = fb.indent || 0;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const block = flatToBlock(fb);
    stack[stack.length - 1].children.push(block);
    stack.push({ indent, children: block.children });
  }
  return root;
}

export function mdToBlocks(md) {
  return buildTree(mdToFlat(md));
}

// ── BLOCKS -> MARKDOWN ───────────────────────────────────────────────
const LIST_TYPES = new Set(["bulletListItem", "numberedListItem", "checkListItem"]);

function colorComment(props) {
  const tc = props.textColor && props.textColor !== "default" ? props.textColor : "";
  const bg = props.backgroundColor && props.backgroundColor !== "default" ? props.backgroundColor : "";
  if (!tc && !bg) return "";
  return `<!-- color:${tc || "default"}${bg ? " bgColor:" + bg : ""} -->\n`;
}

function serializeListChildren(children, indentLevel) {
  // Re-emit nested list-like children with leading-space indent so the
  // markdown round-trips through mdToFlat's listIndent parsing.
  return children
    .map((c) => blockToMd(c, indentLevel))
    .filter((s) => s !== null);
}

function blockToMd(block, indentLevel = 0) {
  const prefix = colorComment(block.props || {});
  const ind = "  ".repeat(indentLevel);
  // codeBlock content must round-trip byte-for-byte, never re-encoded as
  // markdown emphasis/links (see the matching note in flatToBlock).
  const text = block.type === "codeBlock" ? plain(block.content) : inlineToMd(block.content);

  switch (block.type) {
    case "heading": {
      if (block.props.isToggleable) {
        const inner = (block.children || []).map((c) => blockToMd(c)).filter(Boolean).join("\n\n");
        return prefix + `:::toggle-h${block.props.level} ${text}\n${inner}\n:::`;
      }
      return prefix + HEADING_PREFIX[Math.min(block.props.level, 4) - 1] + " " + text;
    }
    case "bulletListItem":
      return prefix + ind + "- " + text + (block.children?.length ? "\n" + serializeListChildren(block.children, indentLevel + 1).join("\n") : "");
    case "numberedListItem":
      return prefix + ind + "1. " + text + (block.children?.length ? "\n" + serializeListChildren(block.children, indentLevel + 1).join("\n") : "");
    case "checkListItem":
      return prefix + ind + `- [${block.props.checked ? "x" : " "}] ` + text + (block.children?.length ? "\n" + serializeListChildren(block.children, indentLevel + 1).join("\n") : "");
    case "quote":
      return prefix + "> " + text;
    case "divider":
      return prefix + "---";
    case "codeBlock":
      return prefix + "```" + (block.props.language || "") + "\n" + text + "\n```";
    case "pageLink":
      return prefix + "[[" + (block.props.title || "") + (block.props.pageId ? "|" + block.props.pageId : "") + "]]";
    case "database":
      return prefix + ":::database\n" + (block.props.data || "{}") + "\n:::";
    case "toggleListItem": {
      const inner = (block.children || []).map((c) => blockToMd(c)).filter(Boolean).join("\n\n");
      return prefix + `:::toggle ${text}\n${inner}\n:::`;
    }
    case "table": {
      const rows = block.content?.rows || [];
      // BlockNote normalizes each cell into a `tableCell` node ({ content, props })
      // once it has passed through the live editor; cells produced fresh by
      // mdToBlocks (never round-tripped through the editor) are still plain
      // inline-content arrays. Support both shapes here.
      const cellMd = (c) => inlineToMd(c && c.content !== undefined ? c.content : c);
      const lines = rows.map((r) => "| " + r.cells.map(cellMd).join(" | ") + " |");
      if (lines.length) {
        const sep = "| " + rows[0].cells.map(() => "---").join(" | ") + " |";
        lines.splice(1, 0, sep);
      }
      return prefix + lines.join("\n");
    }
    case "paragraph":
    default:
      if (text.trim()) return prefix + text;
      return prefix ? prefix + "<!--blank-->" : null; // collapse pure-empty paragraphs below
  }
}

export function blocksToMd(blocks) {
  const parts = blocks.map((b, idx) => {
    const md = blockToMd(b);
    if (md === null) {
      // Preserve intentional blank paragraphs except at the very start/end.
      if (idx > 0 && idx < blocks.length - 1) return "<!--blank-->";
      return null;
    }
    return md;
  }).filter((s) => s !== null);
  return parts.join("\n\n");
}
