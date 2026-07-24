import os
import json
import re
import subprocess
import shutil
import uuid
import base64
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_file, session, redirect, url_for
import mistune

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")

KB_PASSWORD = os.environ.get("KB_PASSWORD", "")

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

@app.before_request
def require_auth():
    if not KB_PASSWORD:
        return
    public = {"/login", "/logout"}
    if request.path in public or request.path.startswith("/static/"):
        return
    # Allow admin endpoints with a bearer token
    if ADMIN_TOKEN and request.headers.get("Authorization") == f"Bearer {ADMIN_TOKEN}":
        return
    if not session.get("authenticated"):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Unauthorized"}), 401
        return redirect(url_for("login_page"))


@app.after_request
def prevent_api_cache(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

BASE_DIR = Path(__file__).parent
# Si existe la variable DATA_ROOT (Railway volume), usar esa ruta para datos y notas
_DATA_ROOT = os.environ.get("DATA_ROOT")
if _DATA_ROOT:
    _ROOT = Path(_DATA_ROOT)
    KNOWLEDGE_DIR = _ROOT / "knowledge"
    DATA_DIR = _ROOT / "data"
else:
    KNOWLEDGE_DIR = BASE_DIR / "knowledge"
    DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
INDEX_FILE = DATA_DIR / "index.json"


def load_index():
    if INDEX_FILE.exists():
        index = json.loads(INDEX_FILE.read_text())
    else:
        index = {}
    # One-shot migration: assign uid to any entry that lacks one
    changed = False
    for meta in index.values():
        if "uid" not in meta:
            meta["uid"] = uuid.uuid4().hex[:8]
            changed = True
    if changed:
        save_index(index)
    return index


def save_index(index):
    INDEX_FILE.write_text(json.dumps(index, indent=2, ensure_ascii=False))


def slugify(text):
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text


_SECTION_TYPE_LABELS = {
    "modulo": "Módulo", "fase": "Fase", "semana": "Semana",
    "unidad": "Unidad", "nivel": "Nivel", "bloque": "Bloque",
    "seccion": "Sección", "capitulo": "Capítulo",
}

def _generate_module_label(module_type, module_type_custom, module_number, module_title):
    if not module_type:
        return None
    tl = module_type_custom if module_type == "personalizado" else _SECTION_TYPE_LABELS.get(module_type, module_type.title())
    if module_number and module_title:
        return f"{tl} {module_number}: {module_title}"
    if module_number:
        return f"{tl} {module_number}"
    if module_title:
        return f"{tl}: {module_title}"
    return tl


def _entry_path(entry_id, meta):
    if meta.get("type") == "course":
        return KNOWLEDGE_DIR / "courses" / meta["course"] / meta["module"] / f"{entry_id}.md"
    if meta.get("type") == "teamspace":
        return KNOWLEDGE_DIR / "teamspace" / meta.get("teamspace", "general") / f"{entry_id}.md"
    if meta.get("type") == "page":
        return KNOWLEDGE_DIR / "pages" / f"{entry_id}.md"
    return KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"


def smart_parse(raw_text):
    """
    Converts semi-structured or plain text to clean Markdown.
    Detects: headings (lines ending with special patterns), lists, code blocks.
    """
    lines = raw_text.strip().splitlines()
    result = []
    i = 0
    in_code_block = False

    while i < len(lines):
        line = lines[i]

        # pass through existing code fences
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            result.append(line)
            i += 1
            continue

        if in_code_block:
            result.append(line)
            i += 1
            continue

        stripped = line.strip()

        # already markdown headings
        if stripped.startswith("#"):
            result.append(line)
            i += 1
            continue

        # detect TOPIC — Title pattern (em dash separator)
        if re.match(r"^[A-Z][A-Z\s]+\s*[—\-]{1,3}\s*.+", stripped):
            result.append(f"# {stripped}")
            i += 1
            continue

        # detect question-style headings (ends with ?)
        if stripped.endswith("?") and len(stripped) < 120 and len(stripped.split()) <= 15:
            prev_blank = (i == 0) or (lines[i - 1].strip() == "")
            if prev_blank:
                result.append(f"## {stripped}")
                i += 1
                continue

        # detect short bold-looking lines (capitalized, < 60 chars, no period)
        if (
            len(stripped) > 0
            and len(stripped) < 80
            and not stripped.endswith(".")
            and not stripped.endswith(",")
            and stripped[0].isupper()
            and len(stripped.split()) <= 8
            and (i == 0 or lines[i - 1].strip() == "")
            and (i + 1 >= len(lines) or lines[i + 1].strip() == "" or lines[i + 1].strip().startswith("*"))
        ):
            result.append(f"### {stripped}")
            i += 1
            continue

        # pass through list items
        if stripped.startswith("*") or stripped.startswith("-") or stripped.startswith("+"):
            result.append(line)
            i += 1
            continue

        # pass through numbered lists
        if re.match(r"^\d+\.", stripped):
            result.append(line)
            i += 1
            continue

        # detect inline code: wrap backtick-like words
        result.append(line)
        i += 1

    return "\n".join(result)


def process_chat_blocks(raw_text):
    """
    Detect chat-style notes and convert to HTML chat bubbles.
    Triggered when text contains 'MI RESPUESTA:' or '> yo:' patterns.
    Blocks are separated by blank lines; user blocks start with those prefixes.
    Returns (html_string, is_chat). If not a chat, returns ("", False).
    """
    USER_PREFIXES = ("mi respuesta:", "> yo:", "yo:", "[yo]:")
    text = raw_text.strip()
    lower = text.lower()
    if not any(p in lower for p in USER_PREFIXES):
        return "", False

    # Split into paragraphs (double newline)
    raw_blocks = re.split(r'\n\s*\n', text)
    bubbles = []
    for block in raw_blocks:
        block = block.strip()
        if not block:
            continue
        low = block.lower()
        is_user = any(low.startswith(p) for p in USER_PREFIXES)
        if is_user:
            # Strip the prefix label
            for p in USER_PREFIXES:
                if low.startswith(p):
                    content = block[len(p):].strip()
                    break
            role = "user"
        else:
            content = block
            role = "ai"
        # Render the block content as markdown
        rendered = mistune.create_markdown(
            plugins=["strikethrough", "table", "task_lists"]
        )(content)
        bubbles.append((role, rendered))

    if not bubbles:
        return "", False

    parts = ['<div class="chat-log">']
    for role, html in bubbles:
        parts.append(f'<div class="chat-bubble chat-bubble--{role}">{html}</div>')
    parts.append('</div>')
    return "\n".join(parts), True


def process_alert_blocks(md_text):
    """Convert GitHub-style alert blockquotes to styled HTML divs before Markdown parsing."""
    lines = md_text.splitlines()
    result = []
    i = 0
    alert_types = {"TIP": "tip", "WARNING": "warning", "NOTE": "note", "DANGER": "danger"}

    while i < len(lines):
        line = lines[i]
        m = re.match(r'^>\s*\[!(TIP|WARNING|NOTE|DANGER)\]\s*(.*)$', line, re.IGNORECASE)
        if m:
            alert_key = m.group(1).upper()
            alert_class = alert_types[alert_key]
            first_content = m.group(2).strip()
            content_lines = []
            if first_content:
                content_lines.append(first_content)
            i += 1
            while i < len(lines) and lines[i].startswith('>'):
                content_lines.append(lines[i][1:].lstrip())
                i += 1
            content = " ".join(content_lines)
            result.append(
                f'<div class="alert alert-{alert_class}">'
                f'<span class="alert-label">{alert_key}</span>{content}</div>'
            )
        else:
            result.append(line)
            i += 1

    return "\n".join(result)


def post_process_wikilinks(html):
    """Replace [[Entry Title]] patterns in rendered HTML with clickable spans."""
    # After mistune, wikilinks appear as literal [[...]] text (not escaped in code spans)
    def replace_wikilink(m):
        title = m.group(1)
        escaped = title.replace('"', '&quot;').replace("'", "&#39;")
        return f'<span class="wikilink" data-title="{escaped}">[[{title}]]</span>'
    return re.sub(r'\[\[(.+?)\]\]', replace_wikilink, html)


class CodeBlockRenderer(mistune.HTMLRenderer):
    def block_code(self, code, **attrs):
        lang = attrs.get("info", "") or ""
        lang = lang.strip().split()[0] if lang.strip() else ""
        lang_attr = f' class="language-{lang}"' if lang else ""
        data_lang = f' data-lang="{lang}"' if lang else ""
        return f'<pre{lang_attr}{data_lang}><code{lang_attr}>{mistune.escape(code)}</code></pre>\n'


def render_markdown(md_text):
    chat_html, is_chat = process_chat_blocks(md_text)
    if is_chat:
        return chat_html
    processed = process_alert_blocks(md_text)
    renderer = mistune.create_markdown(
        renderer=CodeBlockRenderer(escape=False),
        plugins=["strikethrough", "table", "url"],
    )
    html = renderer(processed)
    html = post_process_wikilinks(html)
    return html


def _strip_duplicate_heading_md(md, title):
    """Remove leading H1/H2/H3 from markdown if it matches the entry title."""
    import unicodedata
    def _clean(s):
        s = re.sub(r'[\U0001F000-\U0001FAFF\U00002600-\U000027BF]', '', s)
        s = re.sub(r'^[\s#\-*>]+', '', s)
        return s.strip().lower()
    ct = _clean(title)
    if not ct:
        return md
    lines = md.split('\n')
    for i, line in enumerate(lines[:4]):
        if not line.strip():
            continue
        m = re.match(r'^#{1,3}\s+(.*)', line)
        if m and _clean(m.group(1)) == ct:
            lines.pop(i)
            if i < len(lines) and not lines[i].strip():
                lines.pop(i)
            return '\n'.join(lines)
        break
    return md


def _inject_toc(body_html):
    """Add id attrs to h2/h3/h4, return (toc_html, patched_body)."""
    heading_re = re.compile(r'<(h[234])(\s[^>]*)?>(.+?)</\1>', re.IGNORECASE | re.DOTALL)
    items = []

    def _patch(m):
        tag   = m.group(1).lower()
        attrs = m.group(2) or ''
        inner = m.group(3)
        text  = re.sub(r'<[^>]+>', '', inner).strip()
        idx   = len(items)
        anchor = f'pdf-h-{idx}'
        items.append((tag, text, anchor))
        return f'<{tag}{attrs} id="{anchor}">{inner}</{tag}>'

    new_body = heading_re.sub(_patch, body_html)
    if not items:
        return '', new_body

    rows = []
    for tag, text, anchor in items:
        cls = {'h2': 'toc-h2', 'h3': 'toc-h3', 'h4': 'toc-h4'}.get(tag, 'toc-h2')
        rows.append(f'<div class="toc-row {cls}"><a href="#{anchor}">{text}</a></div>')

    toc_html = (
        '<div class="pdf-toc">'
        '<div class="pdf-toc-label">Contenidos</div>'
        + ''.join(rows) +
        '</div>'
    )
    return toc_html, new_body


_PDF_FONTS_DIR = Path(__file__).parent / "static" / "fonts"
_pdf_font_data_uri_cache = {}


def _pdf_font_data_uri(filename):
    """Base64-embed a font so exported files are fully self-contained. A
    file:// path only resolves on the machine that rendered it — the
    standalone HTML export is downloaded and opened on the user's own
    computer, which has no access to the server's filesystem."""
    cached = _pdf_font_data_uri_cache.get(filename)
    if cached is not None:
        return cached
    data = (_PDF_FONTS_DIR / filename).read_bytes()
    uri = "data:font/ttf;base64," + base64.b64encode(data).decode("ascii")
    _pdf_font_data_uri_cache[filename] = uri
    return uri


def _pdf_font_face(family, filename, weight=400, style="normal"):
    uri = _pdf_font_data_uri(filename)
    return f"""@font-face {{
    font-family: "{family}";
    src: url("{uri}") format("truetype");
    font-weight: {weight};
    font-style: {style};
  }}"""


def _build_pdf_html(title, date, body_html, meta=None):
    category  = (meta or {}).get("category_label") or (meta or {}).get("category", "")
    topic     = (meta or {}).get("topic_label")     or (meta or {}).get("topic", "")
    meta_parts = [p for p in [category, topic] if p]
    meta_line  = " · ".join(meta_parts)

    toc_html, body_html = _inject_toc(body_html)

    font_faces = "\n  ".join([
        _pdf_font_face("Inter", "Inter-Regular.ttf", 400),
        _pdf_font_face("Inter", "Inter-Medium.ttf", 500),
        _pdf_font_face("Inter", "Inter-SemiBold.ttf", 600),
        _pdf_font_face("Inter", "Inter-Bold.ttf", 700),
        _pdf_font_face("JetBrains Mono", "JetBrainsMono-Regular.ttf", 400),
        _pdf_font_face("JetBrains Mono", "JetBrainsMono-SemiBold.ttf", 600),
    ])

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  {font_faces}
  @page {{
    margin: 2.4cm 2.1cm 2.6cm;
    @bottom-right {{
      content: counter(page) " / " counter(pages);
      font-family: "Inter", sans-serif;
      font-size: 7.5pt;
      color: #a9afb8;
    }}
    @bottom-left {{
      content: "{title}";
      font-family: "Inter", sans-serif;
      font-size: 7.5pt;
      color: #a9afb8;
    }}
  }}
  @page :first {{
    @bottom-left {{ content: ""; }}
    @bottom-right {{ content: ""; }}
  }}
  body {{
    font-family: "Inter", sans-serif;
    font-weight: 400;
    font-size: 10.8pt;
    color: #23262b;
    line-height: 1.7;
    margin: 0;
  }}
  /* This file is also served standalone (the "export to HTML" download) and
     opened directly in a browser — WeasyPrint targets "print" media and
     paginates via @page above, so it ignores this block; a real browser
     defaults to "screen" media, where the page would otherwise render
     edge-to-edge full width with no page-like boundary. Give it one. */
  @media screen {{
    body {{
      max-width: 780px;
      margin: 0 auto;
      padding: 56px 32px 96px;
      background: #fff;
    }}
  }}
  /* ── Cover ── */
  .pdf-cover {{
    border-bottom: 1.5px solid #e2e6ec;
    padding-bottom: 22px;
    margin-bottom: 30px;
  }}
  .pdf-cover-meta {{
    font-size: 8.5pt;
    font-weight: 600;
    color: #1793d1;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    margin-bottom: 10px;
  }}
  .pdf-cover-title {{
    font-size: 23pt;
    font-weight: 700;
    color: #16181c;
    line-height: 1.25;
    margin: 0;
    letter-spacing: -0.01em;
  }}
  /* ── TOC ── */
  .pdf-toc {{
    background: #f6f9fc;
    border: 1px solid #e2e9f1;
    border-radius: 6px;
    padding: 16px 20px 14px;
    margin-bottom: 34px;
    page-break-inside: avoid;
  }}
  .pdf-toc-label {{
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #1793d1;
    margin-bottom: 11px;
  }}
  .toc-row {{ margin: 3px 0; font-size: 9.3pt; }}
  .toc-row a {{ color: #23262b; text-decoration: none; }}
  .toc-row.toc-h2 {{ font-weight: 600; margin-top: 6px; }}
  .toc-row.toc-h3 {{ padding-left: 16px; font-size: 8.8pt; color: #565c66; font-weight: 400; }}
  .toc-row.toc-h4 {{ padding-left: 30px; font-size: 8.3pt; color: #838993; font-weight: 400; }}
  /* ── Headings ── */
  h2 {{ font-size: 14.5pt; font-weight: 700; color: #16181c; border-bottom: 1px solid #e2e6ec; padding-bottom: 6px; margin: 1.8em 0 0.6em; page-break-after: avoid; letter-spacing: -0.01em; }}
  h3 {{ font-size: 12pt; font-weight: 600; color: #16181c; margin: 1.5em 0 0.5em; page-break-after: avoid; }}
  h4 {{ font-size: 10.8pt; color: #2b2f36; font-weight: 600; margin: 1.2em 0 0.4em; page-break-after: avoid; }}
  h5 {{ font-size: 9.5pt;  color: #565c66; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin: 1em 0 0.3em; }}
  /* ── Body ── */
  p  {{ margin: 0 0 0.85em; }}
  strong {{ color: #16181c; font-weight: 600; }}
  em     {{ color: #2b2f36; }}
  a {{ color: #1793d1; text-decoration: none; }}
  hr {{ border: none; border-top: 1px solid #e2e6ec; margin: 1.8em 0; }}
  /* ── Lists ── */
  ul, ol {{ margin: 0.35em 0 1em 1.5em; padding: 0; }}
  li {{ margin: 4px 0; line-height: 1.65; }}
  li > ul, li > ol {{ margin-top: 3px; margin-bottom: 3px; }}
  /* ── Inline code ── */
  code {{
    font-family: "JetBrains Mono", monospace;
    font-size: 0.82em;
    background: #f0f2f5;
    padding: 1.5px 5px;
    border: 1px solid #e2e6ec;
    border-radius: 3px;
  }}
  /* ── Code blocks ── */
  pre {{
    font-family: "JetBrains Mono", monospace;
    font-size: 8.3pt;
    background: #f7f8fa;
    border: 1px solid #e2e6ec;
    border-left: 3px solid #1793d1;
    padding: 12px 15px;
    margin: 1em 0;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
    page-break-inside: avoid;
    line-height: 1.55;
    border-radius: 0 5px 5px 0;
  }}
  pre code {{ background: none; border: none; padding: 0; font-size: inherit; }}
  /* ── Blockquote ── */
  blockquote {{
    border-left: 3px solid #1793d1;
    padding: 7px 15px;
    color: #2b2f36;
    background: #f3f8fc;
    margin: 1.1em 0;
    border-radius: 0 5px 5px 0;
    font-style: italic;
  }}
  /* ── Tables ── */
  table {{ border-collapse: collapse; width: 100%; margin: 1.1em 0; font-size: 9.2pt; page-break-inside: avoid; }}
  th {{ background: #1793d1; color: #fff; padding: 7px 11px; text-align: left; font-size: 9pt; font-weight: 600; }}
  td {{ padding: 6px 11px; border: 1px solid #e2e6ec; vertical-align: top; word-break: break-word; }}
  tr:nth-child(even) td {{ background: #f8fafb; }}
  /* ── Callout / alert boxes ── */
  .alert, .note {{
    padding: 10px 15px;
    margin: 1.1em 0;
    border-radius: 0 5px 5px 0;
    font-size: 9.8pt;
    page-break-inside: avoid;
  }}
  .alert-info,  .note {{ background: #eef6fc; border-left: 3px solid #1793d1; }}
  .alert-warn        {{ background: #fdf6e3; border-left: 3px solid #e6a817; }}
  .alert-danger      {{ background: #fdf0f0; border-left: 3px solid #e05252; }}
  .alert-success     {{ background: #eefaf2; border-left: 3px solid #27ae60; }}
  /* ── Task lists ── */
  input[type="checkbox"] {{ margin-right: 6px; }}
</style>
</head>
<body>
<div class="pdf-cover">
  {"<div class='pdf-cover-meta'>" + meta_line + "</div>" if meta_line else ""}
  <div class="pdf-cover-title">{title}</div>
</div>
{toc_html}
{body_html}
</body>
</html>"""


import hashlib, os as _os

def _file_hash(path):
    try:
        h = hashlib.md5()
        with open(path, 'rb') as f:
            h.update(f.read())
        return h.hexdigest()[:8]
    except Exception:
        return datetime.now().strftime("%Y%m%d%H%M%S")

_STATIC_DIR = _os.path.join(_os.path.dirname(__file__), 'static')

def _build_id():
    h = lambda f: _file_hash(_os.path.join(_STATIC_DIR, f))
    return f"{h('style.css')}-{h('app.js')}-{h('kanban.css')}-{h('kanban.js')}-{h('blocknote/editor.bundle.js')}"

@app.route("/login", methods=["GET", "POST"])
def login_page():
    if not KB_PASSWORD:
        return redirect(url_for("index"))
    if session.get("authenticated"):
        return redirect(url_for("index"))
    error = None
    if request.method == "POST":
        if request.form.get("password") == KB_PASSWORD:
            session["authenticated"] = True
            return redirect(url_for("index"))
        error = "Contraseña incorrecta."
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))

@app.route("/")
def index():
    return render_template("index.html", v=_build_id())


@app.route("/api/teamspace/tree")
def get_teamspace_tree():
    index = load_index()
    tree = {}
    for entry_id, meta in index.items():
        if meta.get("type") != "teamspace":
            continue
        space = meta.get("teamspace", "general")
        space_label = meta.get("teamspace_label") or space.replace("-", " ").title()
        tree.setdefault(space, {"_label": space_label, "_icon": "", "_home_id": "", "_entries": []})
        if meta.get("is_teamspace_home") and meta.get("icon"):
            tree[space]["_icon"] = meta["icon"]
        elif not tree[space]["_icon"] and meta.get("icon"):
            tree[space]["_icon"] = meta["icon"]
        if meta.get("is_teamspace_home"):
            tree[space]["_home_id"] = entry_id
        tree[space]["_entries"].append({
            "id": entry_id,
            "title": meta["title"],
            "icon": meta.get("icon", ""),
            "created_at": meta.get("created_at", ""),
            "status": meta.get("status", "pendiente"),
            "order": meta.get("order", 0),
        })
    for space in tree:
        tree[space]["_entries"].sort(key=lambda e: (e["order"], e["created_at"]))
    return jsonify(tree)


@app.route("/api/entries")
def get_all_entries():
    """Flat list of all entries with id, uid, title, category, topic."""
    index = load_index()
    entries = []
    for entry_id, meta in index.items():
        entries.append({
            "id":       entry_id,
            "uid":      meta.get("uid", entry_id),
            "title":    meta.get("title", ""),
            "type":     meta.get("type") or "page",
            "category": meta.get("category_label", meta.get("category", "")),
            "topic":    meta.get("topic_label", meta.get("topic", "")),
            "icon":     meta.get("icon", ""),
            "cover":    meta.get("cover", ""),
        })
    return jsonify(entries)


@app.route("/api/tree")
def get_tree():
    index = load_index()
    tree = {}
    cat_labels = {}
    topic_labels = {}
    for entry_id, meta in index.items():
        if meta.get("type") in ("course", "teamspace", "page"):
            continue
        cat = meta["category"]
        topic = meta["topic"]
        cat_labels[cat] = meta.get("category_label") or cat.replace("-", " ").title()
        topic_labels[f"{cat}/{topic}"] = meta.get("topic_label") or topic.replace("-", " ").title()
        tree.setdefault(cat, {}).setdefault(topic, []).append({
            "id": entry_id,
            "title": meta["title"],
            "icon": meta.get("icon", ""),
            "created_at": meta.get("created_at", ""),
            "status": meta.get("status", "pendiente"),
            "order": meta.get("order", 0),
        })
    # Sort entries within each topic by order, then created_at
    for cat in tree:
        for topic in tree[cat]:
            tree[cat][topic].sort(key=lambda e: (e["order"], e["created_at"]))
    # Wrap with labels
    result = {}
    for cat, topics in tree.items():
        result[cat] = {
            "_label": cat_labels.get(cat, cat),
            "_topics": {
                topic: {
                    "_label": topic_labels.get(f"{cat}/{topic}", topic),
                    "_entries": entries
                }
                for topic, entries in topics.items()
            }
        }
    return jsonify(result)


@app.route("/api/pages/tree")
def get_pages_tree():
    """Recursive nested tree of all type=='page' entries, ordered by (order, created_at)."""
    index = load_index()
    nodes = {}
    for entry_id, meta in index.items():
        if meta.get("type") != "page":
            continue
        nodes[entry_id] = {
            "id": entry_id,
            "title": meta.get("title", ""),
            "icon": meta.get("icon", ""),
            "created_at": meta.get("created_at", ""),
            "order": meta.get("order", 0),
            "parent_id": meta.get("parent_id"),
            "children": [],
        }

    roots = []
    for entry_id, node in nodes.items():
        parent_id = node["parent_id"]
        if parent_id and parent_id in nodes:
            nodes[parent_id]["children"].append(node)
        else:
            roots.append(node)

    def sort_tree(node_list):
        node_list.sort(key=lambda n: (n["order"], n["created_at"]))
        for n in node_list:
            sort_tree(n["children"])

    sort_tree(roots)
    return jsonify(roots)


@app.route("/api/entry/<entry_id>/parent", methods=["PATCH"])
def set_entry_parent(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    data = request.json or {}
    new_parent_id = data.get("parent_id") or None

    if new_parent_id:
        if new_parent_id not in index:
            return jsonify({"error": "Parent not found"}), 404
        if new_parent_id == entry_id:
            return jsonify({"error": "Cannot be its own parent"}), 400
        # cycle detection: walk up from new_parent_id, ensure entry_id is not an ancestor
        cursor = new_parent_id
        seen = set()
        while cursor:
            if cursor == entry_id:
                return jsonify({"error": "Cannot move a page under its own descendant"}), 400
            if cursor in seen:
                break
            seen.add(cursor)
            cursor = index.get(cursor, {}).get("parent_id")

    index[entry_id]["parent_id"] = new_parent_id
    save_index(index)
    return jsonify({"message": "Updated"})


def resolve_entry_id(ref, index):
    """Return slug (entry_id) for a given uid or slug. uid takes priority."""
    for entry_id, meta in index.items():
        if meta.get("uid") == ref:
            return entry_id
    return ref if ref in index else None


@app.route("/api/entry-by-uid/<uid>")
def get_entry_by_uid(uid):
    index = load_index()
    entry_id = resolve_entry_id(uid, index)
    if not entry_id:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    md = path.read_text(encoding="utf-8") if path.exists() else ""
    return jsonify({"id": entry_id, "uid": meta.get("uid"), "meta": meta, "markdown": md})


@app.route("/api/entry/<entry_id>")
def get_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    raw = path.read_text()
    html = render_markdown(raw)
    meta["last_viewed_at"] = datetime.now().isoformat(timespec="seconds")
    save_index(index)
    return jsonify({"id": entry_id, "uid": meta.get("uid"), "meta": meta, "markdown": raw, "html": html})


@app.route("/api/entry", methods=["POST"])
def create_entry():
    data = request.json
    raw_text = data.get("raw_text", "")
    already_markdown = bool(data.get("already_markdown"))
    title = data.get("title", "").strip()
    entry_type = data.get("entry_type", "knowledge")
    icon = data.get("icon", "").strip()

    if not title:
        return jsonify({"error": "Missing title"}), 400

    raw_text = raw_text if isinstance(raw_text, str) else ""
    raw_text = raw_text.strip()
    md_content = raw_text if already_markdown else (smart_parse(raw_text) if raw_text else "")
    entry_id = slugify(title)
    index = load_index()

    base_id = entry_id
    counter = 1
    while entry_id in index:
        entry_id = f"{base_id}-{counter}"
        counter += 1

    raw_tags = data.get("tags", "")
    tags = [t.strip().lower() for t in raw_tags.split(",") if t.strip()] if raw_tags else []
    parent_id = data.get("parent_id") or None

    if entry_type == "teamspace":
        teamspace = data.get("teamspace", "general").strip()
        folder = KNOWLEDGE_DIR / "teamspace" / slugify(teamspace)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{entry_id}.md").write_text(md_content)
        index[entry_id] = {
            "uid": uuid.uuid4().hex[:8],
            "title": title,
            "type": "teamspace",
            "teamspace": slugify(teamspace),
            "teamspace_label": teamspace,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "status": "pendiente",
            "order": 0,
            "tags": tags,
            "parent_id": parent_id,
            "icon": icon,
            "is_teamspace_home": bool(data.get("is_teamspace_home")),
        }
        save_index(index)
        return jsonify({"id": entry_id, "message": "Saved"})

    if entry_type == "page":
        folder = KNOWLEDGE_DIR / "pages"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{entry_id}.md").write_text(md_content)
        # A new row must always land at the END of its parent's children,
        # even after a manual drag-reorder has already assigned explicit
        # order values — defaulting to 0 would tie it with (and sort it
        # right after, by created_at) whatever row is currently first.
        next_order = 0
        if parent_id:
            sibling_orders = [m.get("order", 0) for m in index.values() if m.get("parent_id") == parent_id]
            if sibling_orders:
                next_order = max(sibling_orders) + 1
        index[entry_id] = {
            "uid": uuid.uuid4().hex[:8],
            "title": title,
            "type": "page",
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "status": "pendiente",
            "order": next_order,
            "tags": tags,
            "parent_id": parent_id,
            "icon": icon,
        }
        save_index(index)
        return jsonify({"id": entry_id, "message": "Saved"})

    # knowledge entry (default)
    category = data.get("category", "").strip()
    topic = data.get("topic", "").strip()
    if not all([category, topic]):
        return jsonify({"error": "Missing fields"}), 400

    folder = KNOWLEDGE_DIR / slugify(category) / slugify(topic)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{entry_id}.md").write_text(md_content)

    new_uid = uuid.uuid4().hex[:8]
    index[entry_id] = {
        "uid": new_uid,
        "title": title,
        "category": slugify(category),
        "category_label": category,
        "topic": slugify(topic),
        "topic_label": topic,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "status": "pendiente",
        "order": 0,
        "tags": tags,
        "parent_id": parent_id,
        "icon": icon,
    }
    save_index(index)
    return jsonify({"id": entry_id, "uid": new_uid, "message": "Saved"})


def _save_history_snapshot(entry_id, meta, old_path):
    """Save a snapshot of the current file before overwriting."""
    if not old_path.exists():
        return
    hist_dir = old_path.parent / ".history"
    hist_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%dT%H%M%S%f")
    snapshot_path = hist_dir / f"{entry_id}_{ts}.md"
    snapshot_path.write_text(old_path.read_text(encoding="utf-8"), encoding="utf-8")


@app.route("/api/entry/<entry_id>", methods=["PUT"])
def update_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    data = request.json
    raw_text = data.get("raw_text", "")
    already_markdown = bool(data.get("already_markdown"))
    title = data.get("title", "").strip()
    category = data.get("category", "").strip()
    topic = data.get("topic", "").strip()
    icon = data.get("icon")
    raw_text = raw_text if isinstance(raw_text, str) else ""
    raw_text = raw_text.strip()
    rendered_text = raw_text if already_markdown else (smart_parse(raw_text) if raw_text else "")

    meta = index[entry_id]
    old_path = _entry_path(entry_id, meta)
    if meta.get("type") == "course":
        course_raw = data.get("course", "").strip()
        module_raw = data.get("module", "").strip()
        new_course = slugify(course_raw) if course_raw else meta["course"]
        new_module = slugify(module_raw) if module_raw else meta["module"]
        new_path   = KNOWLEDGE_DIR / "courses" / new_course / new_module / f"{entry_id}.md"
        new_path.parent.mkdir(parents=True, exist_ok=True)
        if raw_text:
            _save_history_snapshot(entry_id, meta, old_path)
            if old_path != new_path and old_path.exists():
                old_path.unlink()
            new_path.write_text(rendered_text)
        elif old_path != new_path:
            new_path.parent.mkdir(parents=True, exist_ok=True)
            if old_path.exists():
                import shutil
                shutil.copy2(old_path, new_path)
                old_path.unlink()
        if title:
            index[entry_id]["title"] = title
        if course_raw:
            index[entry_id]["course"] = new_course
            index[entry_id]["course_label"] = course_raw
        if module_raw:
            index[entry_id]["module"] = new_module
            index[entry_id]["module_label"] = module_raw
        if icon is not None:
            index[entry_id]["icon"] = icon.strip()
        if "order" in data:
            index[entry_id]["order"] = int(data["order"])
        save_index(index)
        return jsonify({"message": "Updated"})

    if meta.get("type") == "teamspace":
        teamspace_raw = data.get("teamspace", "").strip()
        new_teamspace = slugify(teamspace_raw) if teamspace_raw else meta["teamspace"]
        new_path = KNOWLEDGE_DIR / "teamspace" / new_teamspace / f"{entry_id}.md"
        new_path.parent.mkdir(parents=True, exist_ok=True)
        if raw_text:
            _save_history_snapshot(entry_id, meta, old_path)
            if old_path != new_path and old_path.exists():
                old_path.unlink()
            new_path.write_text(rendered_text)
        elif old_path != new_path and old_path.exists():
            import shutil
            shutil.copy2(old_path, new_path)
            old_path.unlink()
        if title:
            index[entry_id]["title"] = title
        if teamspace_raw:
            index[entry_id]["teamspace"] = new_teamspace
            index[entry_id]["teamspace_label"] = teamspace_raw
        if icon is not None:
            index[entry_id]["icon"] = icon.strip()
        save_index(index)
        return jsonify({"message": "Updated"})

    if meta.get("type") == "page":
        if raw_text:
            _save_history_snapshot(entry_id, meta, old_path)
            old_path.parent.mkdir(parents=True, exist_ok=True)
            old_path.write_text(rendered_text)
        if title:
            index[entry_id]["title"] = title
        if icon is not None:
            index[entry_id]["icon"] = icon.strip()
        if "parent_id" in data:
            index[entry_id]["parent_id"] = data.get("parent_id") or None
        if "order" in data:
            index[entry_id]["order"] = int(data["order"])
        save_index(index)
        return jsonify({"message": "Updated"})

    # Knowledge entry — update file if content provided, move if cat/topic changed
    new_category = slugify(category) if category else meta["category"]
    new_topic    = slugify(topic)    if topic    else meta["topic"]
    new_folder   = KNOWLEDGE_DIR / new_category / new_topic
    new_folder.mkdir(parents=True, exist_ok=True)
    new_path     = new_folder / f"{entry_id}.md"

    if raw_text:
        _save_history_snapshot(entry_id, meta, old_path)
        if old_path != new_path and old_path.exists():
            old_path.unlink()
        new_path.write_text(rendered_text)
    elif old_path != new_path and old_path.exists():
        import shutil
        shutil.copy2(old_path, new_path)
        old_path.unlink()

    if title:
        index[entry_id]["title"] = title
    if category:
        index[entry_id]["category"] = new_category
        index[entry_id]["category_label"] = category
    if topic:
        index[entry_id]["topic"] = new_topic
        index[entry_id]["topic_label"] = topic
    if icon is not None:
        index[entry_id]["icon"] = icon.strip()

    save_index(index)
    return jsonify({"message": "Updated"})


def _collect_descendants(entry_id, index):
    """Return all descendant entry_ids of entry_id (children, grandchildren, ...)."""
    children_by_parent = {}
    for eid, meta in index.items():
        pid = meta.get("parent_id")
        if pid:
            children_by_parent.setdefault(pid, []).append(eid)
    descendants = []
    stack = list(children_by_parent.get(entry_id, []))
    while stack:
        cur = stack.pop()
        descendants.append(cur)
        stack.extend(children_by_parent.get(cur, []))
    return descendants


@app.route("/api/entry/<entry_id>", methods=["DELETE"])
def delete_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404

    ids_to_delete = [entry_id] + _collect_descendants(entry_id, index)
    uids = set()
    for eid in ids_to_delete:
        meta = index.get(eid)
        if not meta:
            continue
        uid = meta.get("uid")
        if uid:
            uids.add(uid)
        path = _entry_path(eid, meta)
        if path.exists():
            path.unlink()
        del index[eid]
    save_index(index)
    # Clean up any relations that reference any deleted entry's UID
    if uids:
        relations = load_relations()
        before = len(relations["relations"])
        relations["relations"] = {
            rid: rel for rid, rel in relations["relations"].items()
            if rel.get("from_uid") not in uids and rel.get("to_uid") not in uids
        }
        if len(relations["relations"]) != before:
            save_relations(relations)
    return jsonify({"message": "Deleted"})


@app.route("/api/search")
def search():
    q = request.args.get("q", "").lower().strip()
    if not q:
        return jsonify([])
    index = load_index()
    results = []
    for entry_id, meta in index.items():
        path = _entry_path(entry_id, meta)
        if path.exists():
            content = path.read_text().lower()
            tags = meta.get("tags", [])
            tag_match = any(q in tag for tag in tags)
            if q in content or q in meta["title"].lower() or tag_match:
                snippet = _extract_snippet(path.read_text(), q)
                cat_label = meta.get("course_label", meta.get("course", "")) if meta.get("type") == "course" else meta.get("category_label", meta.get("category", ""))
                topic_label = meta.get("module_label", meta.get("module", "")) if meta.get("type") == "course" else meta.get("topic_label", meta.get("topic", ""))
                results.append({
                    "id": entry_id,
                    "title": meta["title"],
                    "category_label": cat_label,
                    "topic_label": topic_label,
                    "snippet": snippet,
                    "tags": tags,
                    "tag_match": tag_match,
                })
    results.sort(key=lambda r: (0 if r.get("tag_match") else 1))
    return jsonify(results)


def _extract_snippet(text, q):
    lower = text.lower()
    idx = lower.find(q)
    if idx == -1:
        return text[:200]
    start = max(0, idx - 80)
    end = min(len(text), idx + 120)
    return ("..." if start > 0 else "") + text[start:end] + ("..." if end < len(text) else "")


@app.route("/api/preview", methods=["POST"])
def preview():
    raw_text = request.json.get("raw_text", "")
    already_markdown = bool(request.json.get("already_markdown"))
    md = raw_text if already_markdown else smart_parse(raw_text)
    html = render_markdown(md)
    return jsonify({"markdown": md, "html": html})


@app.route("/api/export/<entry_id>/md")
def export_md(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    return send_file(path, as_attachment=True, download_name=f"{entry_id}.md")


@app.route("/api/export/<entry_id>/pdf")
def export_pdf(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    try:
        from weasyprint import HTML as WeasyprintHTML
    except ImportError:
        return jsonify({"error": "weasyprint no instalado en el servidor"}), 503
    from io import BytesIO
    md_content = _entry_path(entry_id, meta).read_text()
    md_content = _strip_duplicate_heading_md(md_content, meta.get("title", ""))
    body_html  = render_markdown(md_content)
    date       = meta.get("created_at", "")[:10]
    full_html  = _build_pdf_html(meta["title"], date, body_html, meta=meta)
    buf = BytesIO()
    WeasyprintHTML(string=full_html).write_pdf(buf)
    buf.seek(0)
    safe_name  = entry_id.replace("/", "_")
    return send_file(buf, mimetype="application/pdf",
                     as_attachment=True, download_name=f"{safe_name}.pdf")


@app.route("/api/export/<entry_id>/html")
def export_html(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    md_content = _entry_path(entry_id, meta).read_text()
    date = meta.get("created_at", "")[:10]
    full_html = _build_pdf_html(meta["title"], date, render_markdown(md_content))
    from flask import Response
    return Response(full_html, mimetype="text/html",
                    headers={"Content-Disposition": f'attachment; filename="{entry_id}.html"'})


@app.route("/api/export/<entry_id>/json")
def export_json(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    md_content = _entry_path(entry_id, meta).read_text()
    from flask import Response
    import json as _json
    payload = _json.dumps({"id": entry_id, "meta": meta, "content": md_content},
                          indent=2, ensure_ascii=False)
    return Response(payload, mimetype="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{entry_id}.json"'})

@app.route("/api/categories")
def get_categories():
    index = load_index()
    cats = {}
    for meta in index.values():
        if meta.get("type") in ("course", "teamspace", "page"):
            continue
        cat = meta["category"]
        cats[cat] = meta.get("category_label", cat)
    return jsonify(cats)


@app.route("/api/reorganize-category", methods=["POST"])
def reorganize_category():
    """Bulk-reassign category/tema across every matching entry — the single
    primitive behind the sidebar's 'renombrar/fusionar' tools. Renaming a
    category, merging two categories, renaming a tema, or moving a tema to a
    different category are all the same operation: reassign every entry
    matching (category[, tema]) to a new category/tema label.
    - match_topic omitted/empty → matches (and moves) the whole category,
      each entry keeps its own current tema.
    - new_topic_label omitted/empty → tema is left untouched per entry.
    """
    data = request.json or {}
    match_category    = (data.get("match_category") or "").strip()
    match_topic       = (data.get("match_topic") or "").strip() or None
    new_category_label = (data.get("new_category_label") or "").strip()
    new_topic_label    = (data.get("new_topic_label") or "").strip() or None

    if not match_category or not new_category_label:
        return jsonify({"error": "Faltan campos"}), 400

    index = load_index()
    new_category_slug = slugify(new_category_label)
    moved = 0
    vacated_folders = set()

    for entry_id in list(index.keys()):
        meta = index[entry_id]
        if meta.get("type") in ("course", "teamspace", "page"):
            continue
        if meta.get("category") != match_category:
            continue
        if match_topic is not None and meta.get("topic") != match_topic:
            continue

        old_path = _entry_path(entry_id, meta)
        topic_label = new_topic_label or meta.get("topic_label") or meta.get("topic", "")
        new_topic_slug = slugify(topic_label)
        new_folder = KNOWLEDGE_DIR / new_category_slug / new_topic_slug
        new_folder.mkdir(parents=True, exist_ok=True)
        new_path = new_folder / f"{entry_id}.md"

        target_id = entry_id
        if old_path.exists() and old_path != new_path:
            if new_path.exists():
                # Merging into a category/tema that already has an entry with
                # this same slug — keep both, disambiguate the incoming one.
                base = entry_id
                n = 1
                while f"{base}-{n}" in index or (new_folder / f"{base}-{n}.md").exists():
                    n += 1
                target_id = f"{base}-{n}"
                new_path = new_folder / f"{target_id}.md"
            old_path.rename(new_path)
            vacated_folders.add(old_path.parent)

        if target_id != entry_id:
            index[target_id] = index.pop(entry_id)
        m = index[target_id]
        m["category"] = new_category_slug
        m["category_label"] = new_category_label
        m["topic"] = new_topic_slug
        m["topic_label"] = topic_label
        moved += 1

    save_index(index)

    # Best-effort cleanup: remove tema/categoría folders left empty by the move.
    # rmdir refuses (and we just ignore it) if anything unexpected is still there.
    for folder in vacated_folders:
        try:
            folder.rmdir()
            folder.parent.rmdir()
        except OSError:
            pass

    return jsonify({"moved": moved})


_ES_STOPWORDS = {
    "el", "la", "los", "las", "de", "del", "y", "en", "un", "una", "unos", "unas",
    "que", "con", "para", "por", "es", "al", "lo", "se", "su", "sus", "o", "a",
    "como", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "mas",
    "más", "pero", "sin", "sobre", "entre", "hay", "ser", "son", "fue", "ya", "muy",
    "the", "and", "for", "with", "from", "this", "that",
}


def _keywords(text, limit=None):
    words = re.findall(r"[a-záéíóúñü0-9_+#.\-]+", (text or "").lower())
    kw = [w for w in words if len(w) > 2 and w not in _ES_STOPWORDS]
    return kw[:limit] if limit else kw


@app.route("/api/suggest-category", methods=["POST"])
def suggest_category():
    """Suggest an existing category/topic for a new entry by keyword overlap
    against other knowledge entries' titles and content — a lightweight
    stand-in for semantic search that needs no embeddings/external calls."""
    data = request.json or {}
    title = data.get("title", "")
    content = data.get("content", "")
    exclude_id = data.get("exclude_id", "")

    title_kw = set(_keywords(title))
    content_kw = set(_keywords(content, limit=400))
    if not title_kw and not content_kw:
        return jsonify({"suggestions": []})

    index = load_index()
    best_by_group = {}
    for entry_id, meta in index.items():
        if entry_id == exclude_id or meta.get("type") in ("course", "teamspace", "page"):
            continue
        category = meta.get("category_label") or meta.get("category")
        topic = meta.get("topic_label") or meta.get("topic")
        if not category or not topic:
            continue
        path = _entry_path(entry_id, meta)
        entry_title_kw = set(_keywords(meta.get("title", "")))
        entry_body_kw = set(_keywords(path.read_text(), limit=600)) if path.exists() else set()
        score = (
            3 * len(title_kw & entry_title_kw)
            + 2 * len(title_kw & entry_body_kw)
            + 1 * len(content_kw & (entry_title_kw | entry_body_kw))
        )
        if score <= 0:
            continue
        key = (category, topic)
        if key not in best_by_group or score > best_by_group[key]["score"]:
            best_by_group[key] = {
                "category": category, "topic": topic, "score": score,
                "example_title": meta.get("title", ""), "example_id": entry_id,
            }

    suggestions = sorted(best_by_group.values(), key=lambda s: -s["score"])[:3]
    return jsonify({"suggestions": suggestions})


# ── FEATURE 2: Star toggle ──────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/star", methods=["POST"])
def toggle_star(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    current = index[entry_id].get("starred", False)
    index[entry_id]["starred"] = not current
    save_index(index)
    return jsonify({"starred": index[entry_id]["starred"]})


# ── FEATURE 6: Stats ────────────────────────────────────────────────────────
@app.route("/api/stats")
def get_stats():
    index = load_index()
    total_entries = len(index)
    categories = {}
    topics = set()
    total_words = 0
    last_entry = None
    last_dt = None

    for entry_id, meta in index.items():
        if meta.get("type") in ("course", "teamspace", "page"):
            continue
        cat = meta["category"]
        cat_label = meta.get("category_label", cat)
        categories[cat] = {"label": cat_label, "count": categories.get(cat, {}).get("count", 0) + 1}
        topics.add(meta["topic"])
        path = _entry_path(entry_id, meta)
        if path.exists():
            total_words += len(path.read_text().split())
        created = meta.get("created_at", "")
        if created:
            try:
                dt = datetime.fromisoformat(created)
                if last_dt is None or dt > last_dt:
                    last_dt = dt
                    last_entry = {"title": meta["title"], "date": created[:10]}
            except ValueError:
                pass

    most_active_cat = max(categories.items(), key=lambda x: x[1]["count"])[1] if categories else None
    chart = sorted(categories.values(), key=lambda x: x["count"], reverse=True)

    return jsonify({
        "total_entries": total_entries,
        "total_categories": len(categories),
        "total_topics": len(topics),
        "total_words": total_words,
        "most_active": most_active_cat,
        "last_entry": last_entry,
        "chart": chart,
    })


# ── FEATURE 7: Bulk export by category ─────────────────────────────────────
@app.route("/api/export/category/<category>/md")
def export_category_md(category):
    import zipfile, io
    index = load_index()
    buf = io.BytesIO()
    found = False
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry_id, meta in index.items():
            if meta.get("type") in ("course", "teamspace", "page"):
                continue
            if meta["category"] == category:
                path = _entry_path(entry_id, meta)
                if path.exists():
                    zf.write(path, arcname=f"{entry_id}.md")
                    found = True
    if not found:
        return jsonify({"error": "No entries found"}), 404
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name=f"{category}.zip")


@app.route("/api/export/category/<category>/pdf")
def export_category_pdf(category):
    if not shutil.which("pandoc"):
        pass  # pandoc not required anymore
    from weasyprint import HTML as WeasyprintHTML
    index = load_index()
    combined_html = ""
    for entry_id, meta in index.items():
        if meta.get("type") in ("course", "teamspace", "page"):
            continue
        if meta["category"] == category:
            path = _entry_path(entry_id, meta)
            if path.exists():
                combined_html += f"<h1>{meta['title']}</h1>" + render_markdown(path.read_text()) + "<hr style='page-break-after:always'>"
    if not combined_html:
        return jsonify({"error": "No entries found"}), 404

    pdf_path = DATA_DIR / f"_cat_{category}.pdf"
    full_html = _build_pdf_html(category, "", combined_html)
    WeasyprintHTML(string=full_html).write_pdf(str(pdf_path))
    return send_file(pdf_path, as_attachment=True, download_name=f"{category}.pdf")


# ── FEATURE 8: Extended search with filters ─────────────────────────────────
@app.route("/api/search/filtered")
def search_filtered():
    q = request.args.get("q", "").lower().strip()
    category_filter = request.args.get("category", "").strip()
    from_date = request.args.get("from", "").strip()
    to_date = request.args.get("to", "").strip()

    index = load_index()
    results = []
    for entry_id, meta in index.items():
        if meta.get("type") in ("course", "teamspace", "page"):
            continue
        # Category filter
        if category_filter and meta["category"] != category_filter:
            continue
        # Date filters
        created = meta.get("created_at", "")[:10]
        if from_date and created and created < from_date:
            continue
        if to_date and created and created > to_date:
            continue
        # Text search (if q provided)
        path = _entry_path(entry_id, meta)
        if q:
            if not path.exists():
                continue
            content = path.read_text().lower()
            if q not in content and q not in meta["title"].lower():
                continue
        snippet = _extract_snippet(path.read_text(), q) if q and path.exists() else ""
        results.append({
            "id": entry_id,
            "title": meta["title"],
            "category_label": meta.get("category_label", meta["category"]),
            "topic_label": meta.get("topic_label", meta["topic"]),
            "snippet": snippet,
        })
    return jsonify(results)


# ── FEATURE: Interactive Checkboxes ────────────────────────────────────────
@app.route("/api/entry/<entry_id>/checkbox", methods=["PATCH"])
def toggle_checkbox(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    data = request.json
    line_index = data.get("line_index")
    checked = data.get("checked", False)
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    lines = path.read_text().splitlines(keepends=True)
    if line_index < 0 or line_index >= len(lines):
        return jsonify({"error": "Invalid line index"}), 400
    line = lines[line_index]
    if checked:
        lines[line_index] = re.sub(r'\[ \]', '[x]', line, count=1)
    else:
        lines[line_index] = re.sub(r'\[x\]', '[ ]', line, flags=re.IGNORECASE, count=1)
    path.write_text("".join(lines))
    return jsonify({"ok": True})


# ── FEATURE: Entry cover ───────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/cover", methods=["PATCH"])
def update_cover(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    body = request.json or {}
    cover = body.get("cover", "")   # CSS gradient/color string or ""
    index[entry_id]["cover"] = cover
    save_index(index)
    return jsonify({"ok": True, "cover": cover})


@app.route("/api/photos/search")
def search_photos():
    """Search photos via Unsplash API (requires UNSPLASH_ACCESS_KEY env var)."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"photos": [], "source": "none"})

    key = os.environ.get("UNSPLASH_ACCESS_KEY", "")
    if key:
        try:
            url = (
                f"https://api.unsplash.com/photos/random"
                f"?query={urllib.request.quote(q)}&count=12&orientation=landscape"
                f"&client_id={key}"
            )
            req = urllib.request.Request(url, headers={"Accept-Version": "v1"})
            with urllib.request.urlopen(req, timeout=6) as r:
                data = json.loads(r.read())
            photos = [
                {
                    "thumb": p["urls"]["small"],
                    "full": p["urls"]["regular"],
                    "alt": p.get("alt_description") or q,
                    "author": p["user"]["name"],
                    "author_url": p["user"]["links"]["html"],
                }
                for p in data
            ]
            return jsonify({"photos": photos, "source": "unsplash"})
        except Exception:
            pass  # fall through to loremflickr

    # Fallback: loremflickr (free, no key, keyword search)
    safe_q = urllib.request.quote(q.replace(" ", ","))
    photos = [
        {
            "thumb": f"https://loremflickr.com/400/220/{safe_q}?random={i}",
            "full": f"https://loremflickr.com/1280/480/{safe_q}?random={i}",
            "alt": q,
        }
        for i in range(12)
    ]
    return jsonify({"photos": photos, "source": "flickr"})


@app.route("/api/upload/cover", methods=["POST"])
def upload_cover_image():
    """Receive a base64-encoded image, save to static/covers/, return URL."""
    covers_dir = Path(app.root_path) / "static" / "covers"
    covers_dir.mkdir(exist_ok=True)
    body = request.json or {}
    data_url = body.get("dataUrl", "")
    if not data_url.startswith("data:image/"):
        return jsonify({"error": "Invalid image"}), 400
    header, encoded = data_url.split(",", 1)
    ext = header.split("/")[1].split(";")[0]  # e.g. "jpeg", "png", "webp"
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    filepath = covers_dir / filename
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(encoded))
    return jsonify({"ok": True, "url": f"/static/covers/{filename}"})


@app.route("/api/entry/<entry_id>/icon", methods=["PATCH"])
def update_icon(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    body = request.json or {}
    icon = body.get("icon", "").strip()
    index[entry_id]["icon"] = icon
    save_index(index)
    return jsonify({"ok": True, "icon": icon})


# ── FEATURE: Custom Properties ─────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/properties", methods=["PATCH"])
def update_properties(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    props = request.json.get("properties", [])
    index[entry_id]["properties"] = props
    save_index(index)
    return jsonify({"ok": True})


@app.route("/api/entry/<entry_id>/content", methods=["PATCH"])
def patch_content(entry_id):
    """Inline auto-save: update file content and optionally title."""
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    data = request.json
    meta = index[entry_id]
    raw_text = data.get("raw_text")
    restore = data.get("restore", False)  # if True, write markdown verbatim (no smart_parse)
    already_markdown = bool(data.get("already_markdown"))
    if raw_text is not None:
        path = _entry_path(entry_id, meta)
        _save_history_snapshot(entry_id, meta, path)
        # Restore: write markdown as-is; normal save: smart_parse
        path.write_text(raw_text if restore or already_markdown else smart_parse(raw_text))
    title = data.get("title", "").strip()
    if title:
        index[entry_id]["title"] = title
    if raw_text is not None or title:
        save_index(index)
    return jsonify({"ok": True})


# ── FEATURE: Version History ────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/history")
def get_entry_history(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    hist_dir = path.parent / ".history"
    if not hist_dir.exists():
        return jsonify([])
    snapshots = []
    for f in sorted(hist_dir.glob(f"{entry_id}_*.md"), reverse=True):
        # Extract timestamp from filename: entryid_YYYYMMDDTHHMMSS.md
        stem = f.stem  # e.g. "my-entry_20240101T120000"
        ts_part = stem[len(entry_id)+1:] if stem.startswith(entry_id + "_") else ""
        snapshots.append({
            "timestamp": ts_part,
            "filename": f.name,
            "size": f.stat().st_size,
        })
    return jsonify(snapshots)


@app.route("/api/entry/<entry_id>/history/<timestamp>")
def get_entry_history_snapshot(entry_id, timestamp):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    hist_dir = path.parent / ".history"
    snapshot_path = hist_dir / f"{entry_id}_{timestamp}.md"
    if not snapshot_path.exists():
        return jsonify({"error": "Snapshot not found"}), 404
    content = snapshot_path.read_text()
    html = render_markdown(content)
    return jsonify({"markdown": content, "html": html, "timestamp": timestamp})


@app.route("/api/entry/<entry_id>/history/<timestamp>/restore", methods=["POST"])
def restore_entry_history_snapshot(entry_id, timestamp):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    hist_dir = path.parent / ".history"
    snapshot_path = hist_dir / f"{entry_id}_{timestamp}.md"
    if not snapshot_path.exists():
        return jsonify({"error": "Snapshot not found"}), 404
    _save_history_snapshot(entry_id, meta, path)
    content = snapshot_path.read_text(encoding="utf-8")
    path.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "markdown": content})


# ── FEATURE: Backlinks ──────────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/children")
def get_children(entry_id):
    index = load_index()
    children = [
        {
            "id": eid,
            "title": m.get("title", eid),
            "icon": m.get("icon", ""),
            "type": m.get("type", "knowledge"),
            "status": m.get("status", "pendiente"),
            "properties": m.get("properties", []),
            "order": m.get("order", 0),
            "created_at": m.get("created_at", ""),
        }
        for eid, m in index.items()
        if m.get("parent_id") == entry_id
    ]
    # Same (order, created_at) convention used for every other sibling list in
    # the app (teamspaces/categories/topics) — manually reordered rows (via
    # the shared /api/entry/reorder endpoint) win; untouched siblings fall
    # back to creation order, not alphabetical.
    children.sort(key=lambda c: (c["order"], c["created_at"]))
    return jsonify(children)


@app.route("/api/entry/<entry_id>/backlinks")
def get_backlinks(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    target_title = index[entry_id]["title"].lower()
    results = []
    for eid, meta in index.items():
        if eid == entry_id:
            continue
        path = _entry_path(eid, meta)
        if not path.exists():
            continue
        content = path.read_text()
        if target_title in content.lower():
            snippet = _extract_snippet(content, target_title)
            cat_label = meta.get("course_label", meta.get("course", "")) if meta.get("type") == "course" else meta.get("category_label", meta.get("category", ""))
            topic_label = meta.get("module_label", meta.get("module", "")) if meta.get("type") == "course" else meta.get("topic_label", meta.get("topic", ""))
            results.append({
                "id": eid,
                "title": meta["title"],
                "category_label": cat_label,
                "topic_label": topic_label,
                "snippet": snippet,
            })
    return jsonify(results)


# ── FEATURE: Duplicate Entry ────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/duplicate", methods=["POST"])
def duplicate_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    if not path.exists():
        return jsonify({"error": "File not found"}), 404

    new_id = entry_id + "-copy"
    counter = 1
    while new_id in index:
        new_id = f"{entry_id}-copy-{counter}"
        counter += 1

    new_path = _entry_path(new_id, meta)
    new_path.parent.mkdir(parents=True, exist_ok=True)
    new_path.write_text(path.read_text())

    new_meta = dict(meta)
    new_meta["title"] = meta["title"] if meta["title"].startswith("[copy]") else "[copy] " + meta["title"]
    new_meta["created_at"] = datetime.now().isoformat(timespec="seconds")
    index[new_id] = new_meta
    save_index(index)
    return jsonify({"id": new_id, "message": "Duplicated"})


# ── FEATURE: Pin Entry ──────────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/pin", methods=["POST"])
def toggle_pin(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    current = index[entry_id].get("pinned", False)
    index[entry_id]["pinned"] = not current
    save_index(index)
    return jsonify({"pinned": index[entry_id]["pinned"]})


# ── FEATURE: Study Status ──────────────────────────────────────────────────
@app.route("/api/entry/<entry_id>/status", methods=["POST"])
def update_status(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    data = request.json
    status = data.get("status", "pendiente")
    if status not in ("pendiente", "progreso", "dominado", "en_progreso", "completado"):
        return jsonify({"error": "Invalid status"}), 400
    index[entry_id]["status"] = status
    save_index(index)
    return jsonify({"status": status})


# ── FEATURE: Manual Ordering ────────────────────────────────────────────────
@app.route("/api/entry/reorder", methods=["POST"])
def reorder_entries():
    index = load_index()
    data = request.json
    ids = data.get("ids", [])
    for i, entry_id in enumerate(ids):
        if entry_id in index:
            index[entry_id]["order"] = i
    save_index(index)
    return jsonify({"ok": True})


# ── FEATURE: Auto-format (add logical spacing) ─────────────────────────────
def _beautify_markdown(text):
    """Insert blank lines between block-level elements that need separation."""
    def line_type(line):
        s = line.strip()
        if not s:
            return "blank"
        if s.startswith("```"):
            return "fence"
        if re.match(r"^#{1,6}\s", s):
            return "heading"
        if re.match(r"^[-*+]\s", s) or re.match(r"^\d+\.\s", s):
            return "list"
        if s.startswith(">"):
            return "blockquote"
        if s.startswith("|"):
            return "table"
        if re.match(r"^[-*_]{3,}$", s):
            return "divider"
        return "paragraph"

    lines = text.splitlines()
    out = []
    in_fence = False
    prev_type = "blank"

    # Pairs that NEED a blank line between them
    needs_blank = {
        ("heading",    "paragraph"),
        ("heading",    "list"),
        ("heading",    "blockquote"),
        ("heading",    "table"),
        ("paragraph",  "heading"),
        ("paragraph",  "list"),
        ("list",       "heading"),
        ("list",       "paragraph"),
        ("blockquote", "heading"),
        ("blockquote", "paragraph"),
        ("blockquote", "list"),
        ("table",      "heading"),
        ("table",      "paragraph"),
        ("divider",    "heading"),
        ("divider",    "paragraph"),
        ("fence",      "paragraph"),
        ("fence",      "heading"),
        ("fence",      "list"),
        ("paragraph",  "blockquote"),
    }

    for line in lines:
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence

        if in_fence:
            out.append(line)
            prev_type = "fence"
            continue

        lt = line_type(line)

        if lt == "blank":
            # Only keep one consecutive blank line
            if out and out[-1].strip() != "":
                out.append("")
            prev_type = "blank"
            continue

        if prev_type != "blank" and (prev_type, lt) in needs_blank:
            out.append("")

        out.append(line)
        prev_type = lt

    # Remove leading/trailing blank lines
    while out and out[0].strip() == "":
        out.pop(0)
    while out and out[-1].strip() == "":
        out.pop()

    return "\n".join(out) + "\n"


@app.route("/api/entry/<entry_id>/beautify", methods=["POST"])
def beautify_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    original = path.read_text()
    formatted = _beautify_markdown(original)
    if formatted == original:
        return jsonify({"ok": True, "changed": False})
    path.write_text(formatted)
    return jsonify({"ok": True, "changed": True})


# ── FEATURE: Wiki-link resolution ──────────────────────────────────────────
@app.route("/api/resolve-wikilink")
def resolve_wikilink():
    title = request.args.get("title", "").strip().lower()
    if not title:
        return jsonify({"id": None})
    index = load_index()
    for entry_id, meta in index.items():
        if meta["title"].lower() == title:
            return jsonify({"id": entry_id})
    return jsonify({"id": None})


# ── COURSES ENTITY ─────────────────────────────────────────────────────────
COURSES_FILE = DATA_DIR / "courses.json"

def load_courses():
    if not COURSES_FILE.exists():
        return {"courses": {}}
    data = json.loads(COURSES_FILE.read_text(encoding="utf-8"))
    # Lazy migration: assign uid to any course that lacks one
    migrated = 0
    for course in data.get("courses", {}).values():
        if not course.get("uid"):
            course["uid"] = uuid.uuid4().hex[:8]
            migrated += 1
    if migrated:
        # Write backup before first mutation
        shutil.copy2(COURSES_FILE, COURSES_FILE.with_suffix(".json.bak"))
        COURSES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data

def save_courses(data):
    COURSES_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))

def _sync_courses_from_index():
    """Auto-register any course slugs found in index.json that lack a courses.json entry."""
    index   = load_index()
    courses = load_courses()
    changed = False
    for meta in index.values():
        if meta.get("type") != "course":
            continue
        slug  = meta.get("course", "")
        label = meta.get("course_label", slug)
        if slug and slug not in courses["courses"]:
            courses["courses"][slug] = {
                "id":          slug,
                "uid":         uuid.uuid4().hex[:8],
                "label":       label,
                "description": "",
                "cover":       "",
                "level":       "",
                "created_at":  meta.get("created_at", datetime.utcnow().isoformat()),
            }
            changed = True
    if changed:
        save_courses(courses)
    return courses


@app.route("/api/courses", methods=["GET"])
def list_courses():
    courses = _sync_courses_from_index()
    index   = load_index()
    include_archived = request.args.get("archived") == "1"
    result  = []
    for slug, c in courses["courses"].items():
        if c.get("archived") and not include_archived:
            continue
        entries = [m for m in index.values() if m.get("type") == "course" and m.get("course") == slug]
        total   = len(entries)
        done    = sum(1 for e in entries if e.get("status") == "completado")
        modules = len({e.get("module") for e in entries})
        result.append({**c, "entry_count": total, "done_count": done, "module_count": modules})
    result.sort(key=lambda c: c.get("created_at", ""))
    return jsonify(result)


@app.route("/api/courses", methods=["POST"])
def create_course():
    body  = request.json or {}
    label = body.get("label", "").strip()
    if not label:
        return jsonify({"error": "label is required"}), 400
    slug  = slugify(label)
    courses = load_courses()
    if slug in courses["courses"]:
        return jsonify({"error": "Course already exists", "id": slug}), 409
    now = datetime.utcnow().isoformat()
    courses["courses"][slug] = {
        "id":          slug,
        "uid":         uuid.uuid4().hex[:8],
        "label":       label,
        "description": body.get("description", "").strip(),
        "cover":       body.get("cover", "").strip(),
        "level":       body.get("level", "").strip(),
        "created_at":  now,
    }
    save_courses(courses)
    return jsonify(courses["courses"][slug]), 201


@app.route("/api/courses/<course_id>", methods=["PATCH"])
def update_course(course_id):
    courses = load_courses()
    if course_id not in courses["courses"]:
        return jsonify({"error": "Not found"}), 404
    body = request.json or {}
    for field in ("label", "description", "cover", "level", "archived"):
        if field in body:
            courses["courses"][course_id][field] = body[field]
    save_courses(courses)
    return jsonify(courses["courses"][course_id])


@app.route("/api/courses/<course_id>", methods=["DELETE"])
def delete_course(course_id):
    courses = load_courses()
    if course_id not in courses["courses"]:
        return jsonify({"error": "Not found"}), 404
    # Cascade: remove all lesson entries from index + files
    index = load_index()
    to_delete = [eid for eid, m in index.items()
                 if m.get("type") == "course" and m.get("course") == course_id]
    for eid in to_delete:
        meta = index[eid]
        path = _entry_path(eid, meta)
        if path.exists():
            path.unlink()
        del index[eid]
    save_index(index)
    # Remove course folder if empty
    course_folder = KNOWLEDGE_DIR / "courses" / course_id
    if course_folder.exists():
        import shutil
        shutil.rmtree(str(course_folder), ignore_errors=True)
    del courses["courses"][course_id]
    save_courses(courses)
    return jsonify({"ok": True})


@app.route("/api/courses/<course_id>/duplicate", methods=["POST"])
def duplicate_course(course_id):
    courses = load_courses()
    if course_id not in courses["courses"]:
        return jsonify({"error": "Not found"}), 404
    original = courses["courses"][course_id]
    new_label = f"Copia de {original['label']}"
    new_slug  = slugify(new_label)
    # Ensure unique slug
    base = new_slug; n = 1
    while new_slug in courses["courses"]:
        new_slug = f"{base}-{n}"; n += 1
    now = datetime.utcnow().isoformat()
    courses["courses"][new_slug] = {
        "id": new_slug, "label": new_label,
        "description": original.get("description", ""),
        "cover": original.get("cover", ""),
        "level": original.get("level", ""),
        "created_at": now,
    }
    save_courses(courses)
    # Duplicate all lesson entries
    index = load_index()
    originals = [(eid, m) for eid, m in index.items()
                 if m.get("type") == "course" and m.get("course") == course_id]
    for eid, meta in originals:
        new_eid  = slugify(meta["title"])
        base_eid = new_eid; n2 = 1
        while new_eid in index:
            new_eid = f"{base_eid}-{n2}"; n2 += 1
        src  = _entry_path(eid, meta)
        new_meta = {**meta, "uid": uuid.uuid4().hex[:8],
                    "course": new_slug, "course_label": new_label,
                    "created_at": now, "status": "pendiente"}
        dest = _entry_path(new_eid, new_meta)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.exists():
            dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        index[new_eid] = new_meta
    save_index(index)
    return jsonify(courses["courses"][new_slug]), 201


@app.route("/api/courses/<course_id>/module/<module_slug>", methods=["PATCH"])
def rename_module(course_id, module_slug):
    body = request.json or {}
    new_label          = body.get("label", "").strip()
    module_type        = body.get("module_type")
    module_type_custom = body.get("module_type_custom")
    module_number      = body.get("module_number")
    module_title       = body.get("module_title")
    if not new_label:
        return jsonify({"error": "label required"}), 400
    new_slug = slugify(new_label)
    index = load_index()
    updated = 0
    for eid, meta in index.items():
        if meta.get("type") == "course" and meta.get("course") == course_id and meta.get("module") == module_slug:
            old_path = _entry_path(eid, meta)
            meta["module"]       = new_slug
            meta["module_label"] = new_label
            if module_type is not None:
                meta["module_type"]        = module_type
                meta["module_type_custom"] = module_type_custom or ""
                meta["module_number"]      = module_number or ""
                meta["module_title"]       = module_title or ""
            new_path = _entry_path(eid, meta)
            if old_path.exists() and old_path != new_path:
                new_path.parent.mkdir(parents=True, exist_ok=True)
                old_path.rename(new_path)
            updated += 1
    save_index(index)
    return jsonify({"ok": True, "updated": updated, "new_slug": new_slug})


@app.route("/api/courses/<course_id>/module/<module_slug>", methods=["DELETE"])
def delete_module(course_id, module_slug):
    index = load_index()
    to_delete = [eid for eid, m in index.items()
                 if m.get("type") == "course" and m.get("course") == course_id and m.get("module") == module_slug]
    for eid in to_delete:
        meta = index[eid]
        path = _entry_path(eid, meta)
        if path.exists():
            path.unlink()
        del index[eid]
    save_index(index)
    return jsonify({"ok": True, "deleted": len(to_delete)})


@app.route("/api/entry/<entry_id>/move", methods=["POST"])
def move_entry(entry_id):
    """Move a course lesson to a different course/module."""
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    body        = request.json or {}
    new_course  = body.get("course", "").strip()
    new_module  = body.get("module", "").strip()
    if not new_course or not new_module:
        return jsonify({"error": "course and module required"}), 400
    courses_data = load_courses()
    course_slug  = slugify(new_course)
    if course_slug not in courses_data["courses"]:
        return jsonify({"error": f"Curso '{new_course}' no existe"}), 400
    meta     = index[entry_id]
    old_path = _entry_path(entry_id, meta)
    meta["course"]       = course_slug
    meta["course_label"] = courses_data["courses"][course_slug]["label"]
    meta["module"]       = slugify(new_module)
    meta["module_label"] = new_module
    new_path = _entry_path(entry_id, meta)
    if old_path.exists() and old_path != new_path:
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.rename(new_path)
    save_index(index)
    return jsonify({"ok": True})


@app.route("/api/courses/<course_id>/stats", methods=["GET"])
def course_stats(course_id):
    index   = load_index()
    entries = [m for m in index.values() if m.get("type") == "course" and m.get("course") == course_id]
    total   = len(entries)
    done    = sum(1 for e in entries if e.get("status") == "completado")
    pending = sum(1 for e in entries if e.get("status") in ("pendiente", ""))
    modules = {}
    for e in entries:
        mod = e.get("module", "")
        if mod not in modules:
            modules[mod] = {"label": e.get("module_label", mod), "total": 0, "done": 0}
        modules[mod]["total"] += 1
        if e.get("status") == "completado":
            modules[mod]["done"] += 1
    return jsonify({
        "course_id": course_id, "total": total, "done": done,
        "pending": pending, "pct": round(done / total * 100) if total else 0,
        "modules": list(modules.values()),
    })


@app.route("/api/courses/tree")
def get_courses_tree():
    index = load_index()
    courses_master = load_courses()["courses"]
    tree = {}
    for entry_id, meta in index.items():
        if meta.get("type") != "course":
            continue
        course = meta["course"]
        module = meta["module"]
        tree.setdefault(course, {
            "label": courses_master.get(course, {}).get("label") or meta.get("course_label", course),
            "modules": {}
        })
        tree[course]["modules"].setdefault(module, {
            "label":             meta.get("module_label", module),
            "module_type":       meta.get("module_type", ""),
            "module_type_custom":meta.get("module_type_custom", ""),
            "module_number":     meta.get("module_number", ""),
            "module_title":      meta.get("module_title", ""),
            "entries": []
        })
        tree[course]["modules"][module]["entries"].append({
            "id": entry_id,
            "title": meta["title"],
            "icon": meta.get("icon", ""),
            "status": meta.get("status", "pendiente"),
            "order": meta.get("order", 0),
        })
    for course in tree:
        for mod in tree[course]["modules"]:
            tree[course]["modules"][mod]["entries"].sort(
                key=lambda e: (e["order"], "")
            )
    return jsonify(tree)


@app.route("/api/courses/entry", methods=["POST"])
def create_course_entry():
    data = request.json
    course             = data.get("course", "").strip()
    module             = data.get("module", "").strip()
    title              = data.get("title", "").strip()
    raw                = data.get("raw_text", "").strip()
    icon               = data.get("icon", "").strip()
    module_type        = data.get("module_type", "").strip()
    module_type_custom = data.get("module_type_custom", "").strip()
    module_number      = data.get("module_number", "").strip()
    module_title_meta  = data.get("module_title", "").strip()
    if not all([course, module, title, raw]):
        return jsonify({"error": "Faltan campos"}), 400
    # `course` is now sent as the slug directly from the frontend
    course_slug = course
    courses_data = _sync_courses_from_index()
    if course_slug not in courses_data["courses"]:
        return jsonify({"error": f"El curso '{course_slug}' no existe. Crea la entidad curso primero."}), 400
    course_label_stored = courses_data["courses"][course_slug].get("label", course_slug)
    module_slug = slugify(module)
    entry_id    = slugify(title)
    index = load_index()
    base = entry_id
    n = 1
    while entry_id in index:
        entry_id = f"{base}-{n}"; n += 1
    folder = KNOWLEDGE_DIR / "courses" / course_slug / module_slug
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{entry_id}.md").write_text(raw, encoding="utf-8")
    history_dir = folder / ".history" / entry_id
    history_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.utcnow().isoformat()
    (history_dir / f"{now.replace(':','-')}.md").write_text(raw, encoding="utf-8")
    max_order = max(
        (m.get("order", 0) for m in index.values()
         if m.get("type") == "course"
         and m.get("course") == course_slug
         and m.get("module") == module_slug),
        default=-1,
    )
    index[entry_id] = {
        "uid": uuid.uuid4().hex[:8],
        "type": "course",
        "title": title,
        "course": course_slug,
        "course_label": course_label_stored,
        "module": module_slug,
        "module_label": module,
        "module_type":        module_type,
        "module_type_custom": module_type_custom,
        "module_number":      module_number,
        "module_title":       module_title_meta,
        "created_at": now,
        "starred": False,
        "pinned": False,
        "status": "pendiente",
        "order": max_order + 1,
        "icon": icon,
    }
    save_index(index)
    return jsonify({"id": entry_id})


# ── REINDEX: scan knowledge/ folder and rebuild index.json ─────────────────
@app.route("/api/reindex", methods=["POST"])
def reindex():
    index = load_index()
    added = 0

    for md_file in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        parts = md_file.relative_to(KNOWLEDGE_DIR).parts
        if ".history" in parts:
            continue

        if parts[0] == "courses":
            if len(parts) != 4:
                continue
            course_slug = parts[1]
            module_slug = parts[2]
            entry_id = md_file.stem
            if entry_id in index:
                continue
            content = md_file.read_text(encoding="utf-8")
            title_match = re.search(r"^#\s+(.+)", content, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else entry_id.replace("-", " ").title()
            mtime = datetime.fromtimestamp(md_file.stat().st_mtime).isoformat()
            index[entry_id] = {
                "type": "course", "title": title,
                "course": course_slug, "course_label": course_slug.replace("-", " ").title(),
                "module": module_slug, "module_label": module_slug.replace("-", " ").title(),
                "created_at": mtime, "starred": False, "pinned": False,
                "status": "pendiente", "order": 0,
            }
            added += 1
        else:
            if len(parts) != 3:
                continue

            cat_slug   = parts[0]
            topic_slug = parts[1]
            entry_id   = md_file.stem

            if entry_id in index:
                continue  # already indexed

            content = md_file.read_text(encoding="utf-8")
            # extract title from first # heading, fallback to slug
            title_match = re.search(r"^#\s+(.+)", content, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else entry_id.replace("-", " ").title()

            # try to get created_at from file mtime
            mtime = datetime.fromtimestamp(md_file.stat().st_mtime).isoformat()

            # history dir for this entry
            history_dir = md_file.parent / ".history" / entry_id
            history_dir.mkdir(parents=True, exist_ok=True)

            index[entry_id] = {
                "title": title,
                "category": cat_slug,
                "category_label": cat_slug.replace("-", " ").title(),
                "topic": topic_slug,
                "topic_label": topic_slug.replace("-", " ").title(),
                "created_at": mtime,
                "starred": False,
                "pinned": False,
                "status": "pendiente",
                "order": 0,
            }
            added += 1

    save_index(index)
    return jsonify({"ok": True, "added": added, "total": len(index)})


# ── KANBAN ──────────────────────────────────────────────────────────────────

KANBAN_FILE = DATA_DIR / "kanban.json"


def load_kanban():
    if KANBAN_FILE.exists():
        data = json.loads(KANBAN_FILE.read_text())
    else:
        data = {"boards": {}, "workspaces": {}}

    # Migrate: ensure workspaces key exists
    if "workspaces" not in data:
        data["workspaces"] = {}

    # Migrate: ensure a default workspace exists
    if not data["workspaces"]:
        ws_id = uuid.uuid4().hex[:8]
        data["workspaces"][ws_id] = {
            "id": ws_id,
            "name": "Default",
            "color": "#0079bf",
            "created": datetime.utcnow().isoformat()
        }
        save_kanban(data)

    # Migrate: assign orphan boards to first workspace
    first_ws_id = next(iter(data["workspaces"]))
    for board in data["boards"].values():
        if not board.get("workspace_id"):
            board["workspace_id"] = first_ws_id

    return data


def save_kanban(data):
    KANBAN_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def _build_card_index(kanban=None):
    """Return {card_id -> descriptor} by scanning kanban.json once.

    descriptor = {
        "type": "kanban_card",
        "id": card_id,
        "title": str,
        "board_id": str,
        "board_name": str,
        "col_id": str,
        "col_name": str,
        "card": <original card dict>   ← full card data, no copy of kanban needed
    }
    Never persisted — rebuilt from kanban.json on demand.
    """
    if kanban is None:
        try:
            kanban = load_kanban()
        except Exception:
            return {}

    index = {}
    for board in kanban["boards"].values():
        board_id   = board.get("id", "")
        board_name = board.get("name", "")
        for col in board.get("columns", []):
            col_id   = col.get("id", "")
            col_name = col.get("name", "")
            for card in col.get("cards", []):
                card_id = card.get("id")
                if not card_id:
                    continue
                index[card_id] = {
                    "type":       "kanban_card",
                    "id":         card_id,
                    "title":      card.get("title", ""),
                    "board_id":   board_id,
                    "board_name": board_name,
                    "col_id":     col_id,
                    "col_name":   col_name,
                    "card":       card,
                }
    return index


# ── RELATIONS ───────────────────────────────────────────────────────────────

RELATIONS_FILE = DATA_DIR / "relations.json"


def load_relations():
    if RELATIONS_FILE.exists():
        return json.loads(RELATIONS_FILE.read_text())
    return {"version": 1, "relations": {}}


def save_relations(data):
    tmp = RELATIONS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, RELATIONS_FILE)


def _build_uid_index():
    """Return {uid -> descriptor} covering all known entities.

    For KB entries  → descriptor has type, id (slug), title.
    For kanban boards → type=kanban_board, id=board_id, title.
    For kanban cards  → full _build_card_index descriptor (board_id, col_id, card).
    """
    registry = {}

    # KB entries (pages, notes, courses, roadmaps, teamspace)
    for entry_id, meta in load_index().items():
        uid = meta.get("uid")
        if not uid:
            continue
        etype = meta.get("type") or "page"
        registry[uid] = {
            "type":  etype,
            "id":    entry_id,
            "title": meta.get("title", entry_id),
        }

    # Load kanban once and reuse for both boards and cards
    try:
        kanban = load_kanban()
    except Exception:
        kanban = {"boards": {}, "workspaces": {}}

    for board in kanban["boards"].values():
        board_uid = board.get("id")
        if board_uid:
            registry[board_uid] = {
                "type":  "kanban_board",
                "id":    board_uid,
                "title": board.get("name", board_uid),
            }

    # Cards via dedicated index (single scan)
    for card_id, desc in _build_card_index(kanban).items():
        registry[card_id] = desc

    # Course root entities (courses.json) — distinct from lesson entries
    try:
        for slug, course in load_courses().get("courses", {}).items():
            uid = course.get("uid")
            if uid:
                registry[uid] = {
                    "type":  "course_root",
                    "id":    slug,
                    "title": course.get("label", slug),
                }
    except Exception:
        pass

    return registry


def _resolve_uid(uid):
    """Resolve a single uid to its entity descriptor, or None if not found."""
    return _build_uid_index().get(uid)


def _relation_key(from_uid, to_uid, rel_type):
    """Canonical dedup key for a relation (directional)."""
    return f"{from_uid}:{to_uid}:{rel_type}"


def _find_duplicate(relations, from_uid, to_uid, rel_type):
    """Return existing relation id if (from, to, type) already exists, else None."""
    key = _relation_key(from_uid, to_uid, rel_type)
    for rel_id, rel in relations.items():
        if _relation_key(rel["from_uid"], rel["to_uid"], rel["rel_type"]) == key:
            return rel_id
    # For 'related' (symmetric) also check reverse
    if rel_type == "related":
        rev_key = _relation_key(to_uid, from_uid, rel_type)
        for rel_id, rel in relations.items():
            if _relation_key(rel["from_uid"], rel["to_uid"], rel["rel_type"]) == rev_key:
                return rel_id
    return None


VALID_REL_TYPES = {"references", "implements", "belongs_to", "blocks", "related", "derived_from"}


@app.route("/api/relations", methods=["POST"])
def create_relation():
    body = request.json or {}
    from_uid  = (body.get("from_uid") or "").strip()
    to_uid    = (body.get("to_uid") or "").strip()
    rel_type  = (body.get("rel_type") or "related").strip()

    if not from_uid or not to_uid:
        return jsonify({"error": "from_uid and to_uid are required"}), 400
    if from_uid == to_uid:
        return jsonify({"error": "Self-relations are not allowed"}), 400
    if rel_type not in VALID_REL_TYPES:
        return jsonify({"error": f"Invalid rel_type. Valid: {sorted(VALID_REL_TYPES)}"}), 400

    uid_index = _build_uid_index()
    if from_uid not in uid_index:
        return jsonify({"error": f"from_uid '{from_uid}' does not exist"}), 400
    if to_uid not in uid_index:
        return jsonify({"error": f"to_uid '{to_uid}' does not exist"}), 400

    data = load_relations()
    dup = _find_duplicate(data["relations"], from_uid, to_uid, rel_type)
    if dup:
        return jsonify({"error": "Relation already exists", "existing_id": dup}), 409

    rel_id = "rel_" + uuid.uuid4().hex[:8]
    data["relations"][rel_id] = {
        "id": rel_id,
        "from_uid": from_uid,
        "to_uid": to_uid,
        "rel_type": rel_type,
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
    }
    save_relations(data)
    return jsonify(data["relations"][rel_id]), 201


@app.route("/api/relations/<rel_id>", methods=["DELETE"])
def delete_relation(rel_id):
    data = load_relations()
    if rel_id not in data["relations"]:
        return jsonify({"error": "Not found"}), 404
    del data["relations"][rel_id]
    save_relations(data)
    return jsonify({"ok": True})


@app.route("/api/relations", methods=["GET"])
def get_relations():
    uid       = request.args.get("uid", "").strip()
    from_uid  = request.args.get("from_uid", "").strip()
    to_uid    = request.args.get("to_uid", "").strip()
    rel_type  = request.args.get("rel_type", "").strip()

    data      = load_relations()
    uid_index = _build_uid_index()

    def enrich(rel):
        """Attach entity descriptors; mark missing entities as orphaned."""
        r = dict(rel)
        r["from_entity"] = uid_index.get(r["from_uid"]) or {"type": "unknown", "id": None, "title": None, "orphaned": True}
        r["to_entity"]   = uid_index.get(r["to_uid"])   or {"type": "unknown", "id": None, "title": None, "orphaned": True}
        return r

    rels = list(data["relations"].values())

    # Filter by rel_type if given
    if rel_type:
        rels = [r for r in rels if r["rel_type"] == rel_type]

    # Mode 1: uid= → return split outgoing/incoming
    if uid:
        outgoing = [enrich(r) for r in rels if r["from_uid"] == uid]
        incoming = [enrich(r) for r in rels if r["to_uid"] == uid]
        # symmetric 'related' appears in both directions
        for r in rels:
            if r["rel_type"] == "related" and r["to_uid"] == uid:
                if not any(o["id"] == r["id"] for o in outgoing):
                    outgoing.append(enrich(r))
        return jsonify({"uid": uid, "outgoing": outgoing, "incoming": incoming})

    # Mode 2: from_uid= → outgoing only
    if from_uid:
        result = [enrich(r) for r in rels if r["from_uid"] == from_uid]
        return jsonify({"relations": result})

    # Mode 3: to_uid= → incoming only (backlinks)
    if to_uid:
        result = [enrich(r) for r in rels if r["to_uid"] == to_uid]
        return jsonify({"relations": result})

    # Mode 4: no filter → return all
    return jsonify({"relations": [enrich(r) for r in rels]})



@app.route("/api/kanban/boards", methods=["GET"])
def kanban_list_boards():
    data = load_kanban()
    workspace_id_filter = request.args.get("workspace_id", "").strip()
    boards = []
    for b in data["boards"].values():
        if workspace_id_filter and b.get("workspace_id") != workspace_id_filter:
            continue
        card_count = sum(len(col.get("cards", [])) for col in b.get("columns", []))
        boards.append({
            "id": b["id"],
            "name": b["name"],
            "description": b.get("description", ""),
            "color": b.get("color", "#1793d1"),
            "background": b.get("background", ""),
            "created": b.get("created", ""),
            "card_count": card_count,
            "col_count": len(b.get("columns", [])),
            "workspace_id": b.get("workspace_id"),
        })
    boards.sort(key=lambda b: b["created"])
    return jsonify(boards)


@app.route("/api/kanban/boards", methods=["POST"])
def kanban_create_board():
    data = load_kanban()
    body = request.json
    # Determine workspace_id
    workspace_id = body.get("workspace_id", "").strip() if body.get("workspace_id") else ""
    if not workspace_id:
        if data["workspaces"]:
            workspace_id = next(iter(data["workspaces"]))
        else:
            ws_id = uuid.uuid4().hex[:8]
            data["workspaces"][ws_id] = {
                "id": ws_id,
                "name": "Default",
                "color": "#0079bf",
                "created": datetime.utcnow().isoformat()
            }
            workspace_id = ws_id
    board_id = uuid.uuid4().hex[:8]
    board = {
        "id": board_id,
        "name": body.get("name", "Nuevo tablero").strip(),
        "description": body.get("description", "").strip(),
        "color": body.get("color", "#1793d1"),
        "created": datetime.now().isoformat(timespec="seconds"),
        "workspace_id": workspace_id,
        "columns": [
            {"id": uuid.uuid4().hex[:8], "name": "Pendiente", "cards": []},
            {"id": uuid.uuid4().hex[:8], "name": "En proceso", "cards": []},
            {"id": uuid.uuid4().hex[:8], "name": "En revisión", "cards": []},
            {"id": uuid.uuid4().hex[:8], "name": "Terminado", "cards": []},
        ],
    }
    data["boards"][board_id] = board
    save_kanban(data)
    return jsonify(board), 201


@app.route("/api/kanban/boards/<board_id>", methods=["GET"])
def kanban_get_board(board_id):
    data = load_kanban()
    board = data["boards"].get(board_id)
    if not board:
        return jsonify({"error": "Not found"}), 404
    return jsonify(board)


@app.route("/api/kanban/boards/<board_id>", methods=["PUT"])
def kanban_update_board(board_id):
    data = load_kanban()
    board = data["boards"].get(board_id)
    if not board:
        return jsonify({"error": "Not found"}), 404
    body = request.json
    if "name" in body:
        board["name"] = body["name"].strip()
    if "description" in body:
        board["description"] = body["description"].strip()
    if "color" in body:
        board["color"] = body["color"]
    if "background" in body:
        board["background"] = body["background"]
    if "customFields" in body:
        board["customFields"] = body["customFields"]
    save_kanban(data)
    return jsonify(board)


@app.route("/api/kanban/boards/<board_id>", methods=["DELETE"])
def kanban_delete_board(board_id):
    data = load_kanban()
    if board_id not in data["boards"]:
        return jsonify({"error": "Not found"}), 404
    del data["boards"][board_id]
    save_kanban(data)
    return jsonify({"ok": True})


@app.route("/api/kanban/boards/<board_id>/columns", methods=["PUT"])
def kanban_save_columns(board_id):
    data = load_kanban()
    board = data["boards"].get(board_id)
    if not board:
        return jsonify({"error": "Not found"}), 404
    body = request.json
    board["columns"] = body.get("columns", [])
    if "customFields" in body and body["customFields"] is not None:
        board["customFields"] = body["customFields"]
    save_kanban(data)
    return jsonify({"ok": True})


@app.route("/api/kanban/cards/<card_id>", methods=["GET"])
def kanban_get_card(card_id):
    """Resolve a card by id without knowing its board or column.
    Uses _build_card_index() — single scan of kanban.json, no iteration at call site.
    """
    card_index = _build_card_index()
    desc = card_index.get(card_id)
    if not desc:
        return jsonify({"error": "Card not found"}), 404
    return jsonify({
        "id":         desc["id"],
        "title":      desc["title"],
        "board_id":   desc["board_id"],
        "board_name": desc["board_name"],
        "col_id":     desc["col_id"],
        "col_name":   desc["col_name"],
        "card":       desc["card"],
    })


@app.route("/api/kanban/workspaces", methods=["GET"])
def kanban_list_workspaces():
    data = load_kanban()
    workspaces = sorted(data["workspaces"].values(), key=lambda w: w.get("created", ""))
    return jsonify(workspaces)


@app.route("/api/kanban/workspaces", methods=["POST"])
def kanban_create_workspace():
    data = load_kanban()
    body = request.json or {}
    ws_id = uuid.uuid4().hex[:8]
    workspace = {
        "id": ws_id,
        "name": body.get("name", "Nuevo workspace").strip(),
        "color": body.get("color", "#0079bf"),
        "created": datetime.utcnow().isoformat()
    }
    data["workspaces"][ws_id] = workspace
    save_kanban(data)
    return jsonify(workspace), 201


@app.route("/api/kanban/workspaces/<ws_id>", methods=["PATCH"])
def kanban_update_workspace(ws_id):
    data = load_kanban()
    ws = data["workspaces"].get(ws_id)
    if not ws:
        return jsonify({"error": "Not found"}), 404
    body = request.json or {}
    if "name" in body:
        ws["name"] = body["name"].strip()
    if "color" in body:
        ws["color"] = body["color"]
    save_kanban(data)
    return jsonify(ws)


@app.route("/api/kanban/workspaces/<ws_id>", methods=["DELETE"])
def kanban_delete_workspace(ws_id):
    data = load_kanban()
    if ws_id not in data["workspaces"]:
        return jsonify({"error": "Not found"}), 404
    del data["workspaces"][ws_id]
    # Move boards to first remaining workspace or set to None
    remaining = list(data["workspaces"].keys())
    new_ws_id = remaining[0] if remaining else None
    for board in data["boards"].values():
        if board.get("workspace_id") == ws_id:
            board["workspace_id"] = new_ws_id
    save_kanban(data)
    return jsonify({"ok": True})


# ── Mindmaps ──────────────────────────────────────────────────────────────────
MINDMAPS_FILE = DATA_DIR / "mindmaps.json"


def load_mindmaps():
    if MINDMAPS_FILE.exists():
        return json.loads(MINDMAPS_FILE.read_text())
    return {"maps": {}}


def save_mindmaps(data):
    tmp = MINDMAPS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, MINDMAPS_FILE)


def _count_mindmap_nodes(node):
    if not node:
        return 0
    return 1 + sum(_count_mindmap_nodes(c) for c in node.get("children", []))


def _new_mindmap_node(text, node_id=None):
    return {
        "id": node_id or uuid.uuid4().hex[:8],
        "text": text,
        "children": [],
        "notes": "",
        "color": None,
        "collapsed": False,
        "linked_entry_uid": None,
        "emoji": "",
    }


def _find_mindmap_node(node, node_id):
    """DFS lookup — small trees (dozens to low hundreds of nodes), so no index needed."""
    if node.get("id") == node_id:
        return node
    for child in node.get("children", []):
        found = _find_mindmap_node(child, node_id)
        if found:
            return found
    return None


def _remove_mindmap_node(node, node_id):
    """Remove node_id from node's subtree in place. Returns True if removed."""
    children = node.get("children", [])
    for i, child in enumerate(children):
        if child.get("id") == node_id:
            children.pop(i)
            return True
        if _remove_mindmap_node(child, node_id):
            return True
    return False


@app.route("/api/mindmaps", methods=["GET"])
def list_mindmaps():
    data = load_mindmaps()
    maps = [
        {
            "id": m["id"],
            "title": m["title"],
            "created": m.get("created", ""),
            "updated": m.get("updated", ""),
            "node_count": _count_mindmap_nodes(m.get("root")),
        }
        for m in data["maps"].values()
    ]
    maps.sort(key=lambda m: m["updated"], reverse=True)
    return jsonify(maps)


@app.route("/api/mindmaps", methods=["POST"])
def create_mindmap():
    body = request.json or {}
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title es requerido"}), 400
    data = load_mindmaps()
    map_id = uuid.uuid4().hex[:8]
    now = datetime.utcnow().isoformat(timespec="seconds")
    mindmap = {
        "id": map_id,
        "title": title,
        "created": now,
        "updated": now,
        "root": _new_mindmap_node(title, node_id="root"),
    }
    data["maps"][map_id] = mindmap
    save_mindmaps(data)
    return jsonify(mindmap), 201


@app.route("/api/mindmaps/<map_id>", methods=["GET"])
def get_mindmap(map_id):
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    return jsonify(mindmap)


@app.route("/api/mindmaps/<map_id>", methods=["PUT"])
def update_mindmap(map_id):
    """Whole-tree replace, same pattern as PUT /api/kanban/boards/<id>/columns —
    the frontend edits its in-memory tree freely and saves it back wholesale."""
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    body = request.json or {}
    if "title" in body and body["title"].strip():
        mindmap["title"] = body["title"].strip()
    if "root" in body and body["root"]:
        mindmap["root"] = body["root"]
    mindmap["updated"] = datetime.utcnow().isoformat(timespec="seconds")
    save_mindmaps(data)
    return jsonify(mindmap)


@app.route("/api/mindmaps/<map_id>", methods=["DELETE"])
def delete_mindmap(map_id):
    data = load_mindmaps()
    if map_id not in data["maps"]:
        return jsonify({"error": "Not found"}), 404
    del data["maps"][map_id]
    save_mindmaps(data)
    return jsonify({"ok": True})


@app.route("/api/mindmaps/<map_id>/nodes", methods=["POST"])
def add_mindmap_node(map_id):
    """Add a single child node under parent_id — a lighter-weight alternative to
    PUT-ing the whole tree, used by the manual 'add child' UI in the list view."""
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    body = request.json or {}
    parent_id = body.get("parent_id") or "root"
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text es requerido"}), 400
    parent = _find_mindmap_node(mindmap["root"], parent_id)
    if not parent:
        return jsonify({"error": "parent_id no encontrado"}), 404
    node = _new_mindmap_node(text)
    parent.setdefault("children", []).append(node)
    mindmap["updated"] = datetime.utcnow().isoformat(timespec="seconds")
    save_mindmaps(data)
    return jsonify(mindmap), 201


@app.route("/api/mindmaps/<map_id>/nodes/<node_id>", methods=["PATCH"])
def edit_mindmap_node(map_id, node_id):
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    node = _find_mindmap_node(mindmap["root"], node_id)
    if not node:
        return jsonify({"error": "Node not found"}), 404
    body = request.json or {}
    if "text" in body and body["text"].strip():
        node["text"] = body["text"].strip()
    if "notes" in body:
        node["notes"] = (body["notes"] or "").strip()
    if "color" in body:
        node["color"] = body["color"] or None
    if "collapsed" in body:
        node["collapsed"] = bool(body["collapsed"])
    if "linked_entry_uid" in body:
        node["linked_entry_uid"] = body["linked_entry_uid"] or None
    if "emoji" in body:
        node["emoji"] = (body["emoji"] or "").strip()[:8]
    mindmap["updated"] = datetime.utcnow().isoformat(timespec="seconds")
    save_mindmaps(data)
    return jsonify(mindmap)


@app.route("/api/mindmaps/<map_id>/nodes/<node_id>/detach", methods=["POST"])
def detach_mindmap_node(map_id, node_id):
    """Move a branch out into its own standalone mind map — ideamap's 'detach'."""
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    if node_id == "root":
        return jsonify({"error": "No se puede desprender el nodo raíz"}), 400
    node = _find_mindmap_node(mindmap["root"], node_id)
    if not node:
        return jsonify({"error": "Node not found"}), 404
    if not _remove_mindmap_node(mindmap["root"], node_id):
        return jsonify({"error": "Node not found"}), 404
    mindmap["updated"] = datetime.utcnow().isoformat(timespec="seconds")

    new_root = dict(node)
    new_root["id"] = "root"
    new_id = uuid.uuid4().hex[:8]
    now = datetime.utcnow().isoformat(timespec="seconds")
    new_map = {"id": new_id, "title": node["text"], "created": now, "updated": now, "root": new_root}
    data["maps"][new_id] = new_map
    save_mindmaps(data)
    return jsonify({"source_map": mindmap, "new_map": new_map}), 201


@app.route("/api/mindmaps/<map_id>/nodes/<node_id>", methods=["DELETE"])
def delete_mindmap_node(map_id, node_id):
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    if node_id == "root":
        return jsonify({"error": "No se puede eliminar el nodo raíz"}), 400
    if not _remove_mindmap_node(mindmap["root"], node_id):
        return jsonify({"error": "Node not found"}), 404
    mindmap["updated"] = datetime.utcnow().isoformat(timespec="seconds")
    save_mindmaps(data)
    return jsonify(mindmap)


# ── Multi-provider AI abstraction ───────────────────────────────────────────
# Every AI-backed feature in the app (mindmap generation/transform, quiz,
# practice challenges, Ask AI) goes through _call_ai() instead of each
# hand-rolling its own HTTP call — the user wants the freedom to pick which
# LLM answers ANY given request (fast/cheap for a quick explanation, deeper
# for a hard problem), and that's only maintainable from one place that
# knows how to reach each provider. DeepSeek and Groq are both OpenAI-
# compatible chat-completions APIs and share one code path; Gemini's REST
# API has its own request/response shape and gets its own.
PROVIDERS = {
    "deepseek": {
        "label": "DeepSeek",
        "kind": "openai_compat",
        "base_url": "https://api.deepseek.com/chat/completions",
        "env": "DEEPSEEK_API_KEY",
        "models": [
            {"id": "deepseek-chat", "label": "DeepSeek Chat", "hint": "Equilibrado, buen default general"},
            {"id": "deepseek-reasoner", "label": "DeepSeek Reasoner", "hint": "Razonamiento profundo, más lento"},
        ],
    },
    "groq": {
        "label": "Groq",
        "kind": "openai_compat",
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "env": "GROQ_API_KEY",
        "models": [
            {"id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B Instant", "hint": "Muy rápido, ideal para respuestas cortas"},
            {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B Versatile", "hint": "Rápido y capaz, buen equilibrio"},
        ],
    },
    "gemini": {
        "label": "Gemini",
        "kind": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/models",
        "env": "GEMINI_API_KEY",
        "models": [
            {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash", "hint": "Rápido, bueno para explicaciones"},
            {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro", "hint": "Más profundo, mejor para análisis complejos"},
        ],
    },
}
DEFAULT_PROVIDER = "deepseek"
DEFAULT_MODEL = "deepseek-chat"


# Python's urllib defaults to "Python-urllib/3.x", which some providers'
# edge/WAF layers (Cloudflare in front of Groq, at least) reject outright —
# an ordinary API request with a valid key showing up as "error code: 1010".
# A normal-looking User-Agent (and Accept header) is the standard fix.
_AI_HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; ProjectAtlas/1.0; +https://mision-pythonhn.fly.dev)",
    "Accept": "application/json",
}


def _call_openai_compatible(base_url, api_key, model, system, user_msg, max_tokens, json_mode):
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base_url,
        data=body,
        headers={**_AI_HTTP_HEADERS, "Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        result = json.loads(r.read())
    return result["choices"][0]["message"]["content"]


def _call_gemini(base_url, api_key, model, system, user_msg, max_tokens, json_mode):
    payload = {
        "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/{model}:generateContent",
        data=body,
        headers={**_AI_HTTP_HEADERS, "Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        result = json.loads(r.read())
    return result["candidates"][0]["content"]["parts"][0]["text"]


def _clean_ai_error(code, err_body):
    """Provider error bodies range from a one-line edge-block message to
    several KB of quota-metric JSON (seen from Gemini's 429s) — never dump
    either raw into the UI. Pulls out a short human message when the body is
    parseable JSON in a recognizable shape, always caps the length, and adds
    a plain-language prefix for the error codes users actually hit."""
    detail = None
    try:
        parsed = json.loads(err_body)
        if isinstance(parsed, list) and parsed:
            parsed = parsed[0]
        if isinstance(parsed, dict):
            err = parsed.get("error")
            if isinstance(err, dict):
                detail = err.get("message")
            elif isinstance(err, str):
                detail = err
    except (json.JSONDecodeError, ValueError):
        pass
    if not detail:
        detail = err_body.strip()
    detail = detail.split("\n")[0].strip()
    if len(detail) > 220:
        detail = detail[:220] + "…"

    if code == 429:
        return f"Límite de la API alcanzado (429). Probá con otro modelo o proveedor, o esperá unos minutos. Detalle: {detail}"
    if code in (401, 403):
        return f"La API rechazó la solicitud ({code}). Revisá la API key configurada o probá otro proveedor. Detalle: {detail}"
    return f"Error de la API ({code}): {detail}"


def _call_ai(system, user_msg, max_tokens=1000, json_mode=False, provider=None, model=None):
    """Single entry point for every AI-backed feature. `provider`/`model`
    come from the frontend's model selector (a request body field on every
    generation endpoint); left unset, every pre-existing call site keeps
    working exactly as before, on DeepSeek's chat model. Returns
    (content, None) on success, or (None, (response, status)) ready to
    `return` straight from a Flask route."""
    provider = provider or DEFAULT_PROVIDER
    model = model or DEFAULT_MODEL
    cfg = PROVIDERS.get(provider)
    if not cfg:
        return None, (jsonify({"error": f"Proveedor de IA desconocido: {provider}"}), 400)
    api_key = os.environ.get(cfg["env"], "")
    if not api_key:
        return None, (jsonify({
            "error": f"{cfg['env']} no configurada. Añádela con: fly secrets set {cfg['env']}=...",
        }), 503)
    try:
        if cfg["kind"] == "gemini":
            content = _call_gemini(cfg["base_url"], api_key, model, system, user_msg, max_tokens, json_mode)
        else:
            content = _call_openai_compatible(cfg["base_url"], api_key, model, system, user_msg, max_tokens, json_mode)
        return content, None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        return None, (jsonify({"error": _clean_ai_error(e.code, err_body)}), 502)
    except Exception as e:
        return None, (jsonify({"error": str(e)}), 500)


def _call_deepseek(system, user_msg, max_tokens=1000, json_mode=False):
    """Back-compat shim so every call site that hasn't been wired up to the
    model selector yet keeps working unmodified — new/updated call sites
    should call _call_ai directly with an explicit provider/model."""
    return _call_ai(system, user_msg, max_tokens=max_tokens, json_mode=json_mode)


@app.route("/api/ai/providers")
def list_ai_providers():
    """Only lists providers whose API key is actually configured, so the
    frontend's model selector never offers a choice that would just 503."""
    available = [
        {"id": pid, "label": cfg["label"], "models": cfg["models"]}
        for pid, cfg in PROVIDERS.items()
        if os.environ.get(cfg["env"])
    ]
    return jsonify({"providers": available, "default": {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL}})


_MINDMAP_SHORTEN_PROMPT = (
    "Reescribe el siguiente texto de un nodo de mapa mental de forma MÁS BREVE, "
    "conservando el significado exacto. Devuelve SOLO el texto reescrito — sin "
    "comillas, sin explicaciones, sin markdown."
)
_MINDMAP_LENGTHEN_PROMPT = (
    "Expande el siguiente texto de un nodo de mapa mental con más detalle y "
    "contexto útil, sin inventar información falsa. Devuelve SOLO el texto "
    "expandido — sin comillas, sin explicaciones, sin markdown."
)
_MINDMAP_FIND_TITLE_PROMPT = (
    "Dado el texto de un nodo de mapa mental (y opcionalmente sus sub-temas), "
    "genera un título corto y claro que lo resuma, máximo 6 palabras. Devuelve "
    "SOLO el título — sin comillas, sin explicaciones, sin markdown."
)
_MINDMAP_CUSTOM_PROMPT_PROMPT = (
    "Aplica la instrucción del usuario al texto de un nodo de mapa mental y "
    "devuelve SOLO el resultado — sin comillas, sin explicaciones, sin markdown, "
    "sin repetir la instrucción."
)


@app.route("/api/mindmaps/<map_id>/nodes/<node_id>/ai-transform", methods=["POST"])
def ai_transform_mindmap_node(map_id, node_id):
    """Per-node AI actions — Shorten / Lengthen / Find title / Prompt — the
    ideamap-style 'Transform idea with AI' panel. Distinct from /generate,
    which builds a whole new map instead of editing one existing node."""
    data = load_mindmaps()
    mindmap = data["maps"].get(map_id)
    if not mindmap:
        return jsonify({"error": "Not found"}), 404
    node = _find_mindmap_node(mindmap["root"], node_id)
    if not node:
        return jsonify({"error": "Node not found"}), 404

    body = request.json or {}
    action = body.get("action")
    custom_prompt = (body.get("custom_prompt") or "").strip()

    if action == "shorten":
        system, user_msg = _MINDMAP_SHORTEN_PROMPT, node["text"]
    elif action == "lengthen":
        system, user_msg = _MINDMAP_LENGTHEN_PROMPT, node["text"]
    elif action == "find_title":
        children_txt = "\n".join(f"- {c['text']}" for c in node.get("children", []))
        context = node["text"] + (f"\n\nSub-temas:\n{children_txt}" if children_txt else "")
        system, user_msg = _MINDMAP_FIND_TITLE_PROMPT, context
    elif action == "prompt":
        if not custom_prompt:
            return jsonify({"error": "custom_prompt es requerido"}), 400
        system = _MINDMAP_CUSTOM_PROMPT_PROMPT
        user_msg = f"Instrucción: {custom_prompt}\n\nTexto del nodo: {node['text']}"
    else:
        return jsonify({"error": "action inválida"}), 400

    content, err = _call_ai(system, user_msg, max_tokens=400, provider=body.get("provider"), model=body.get("model"))
    if err:
        return err

    new_text = content.strip().strip('"').strip()
    if not new_text:
        return jsonify({"error": "La IA no devolvió texto."}), 502
    node["text"] = new_text[:500]
    mindmap["updated"] = datetime.utcnow().isoformat(timespec="seconds")
    save_mindmaps(data)
    return jsonify(mindmap)


_MINDMAP_SYSTEM_PROMPT = (
    "Eres un generador de mapas mentales educativos. Dado un tema o pregunta, "
    "devuelve SOLO un JSON (sin texto adicional, sin bloques de código markdown, "
    "sin explicaciones) con esta forma EXACTA:\n"
    '{"title": "...", "branches": [{"text": "...", "children": [{"text": "...", '
    '"children": [{"text": "...", "children": []}]}]}]}\n\n'
    "Reglas estrictas:\n"
    "- 5 a 7 ramas principales, cada una cubriendo un aspecto distinto y relevante del tema.\n"
    "- Cada rama principal con 2 a 4 subtemas.\n"
    "- Cada subtema con 1 a 3 puntos concretos, específicos y accionables — NUNCA "
    "placeholders genéricos como 'Detalle 1' o 'Aspecto 2'.\n"
    "- Si un punto incluye un comando, nombre de archivo, función, o cualquier "
    "fragmento de código, envuélvelo entre comillas invertidas simples "
    "(`como esto`) — se muestra como código real en el mapa.\n"
    "- Texto claro, específico y en español en todos los niveles.\n"
    "- 'title' es el tema reformulado como título corto (máximo 8 palabras)."
)

# Different job from _MINDMAP_SYSTEM_PROMPT above: that one INVENTS a broad plan
# from a bare topic (the ideamap.ai-style "brainstorm" mode). This one is the
# classic student study-map technique — reorganize content that ALREADY EXISTS
# (a specific lesson) into a hierarchical map, grounded in what the text
# actually says, not a fresh curriculum about the title in the abstract.
_MINDMAP_SUMMARIZE_SYSTEM_PROMPT = (
    "Eres un asistente que convierte contenido educativo YA EXISTENTE en un "
    "mapa mental de estudio — la técnica que usan los estudiantes para repasar "
    "organizando visualmente lo que el material YA dice, no un plan nuevo "
    "inventado a partir del título. Recibirás el título y el contenido "
    "completo de una lección.\n\n"
    "Devuelve SOLO un JSON (sin texto adicional, sin bloques de código "
    "markdown, sin explicaciones) con esta forma EXACTA:\n"
    '{"title": "...", "branches": [{"text": "...", "children": [{"text": "...", '
    '"children": [{"text": "...", "children": []}]}]}]}\n\n'
    "Reglas estrictas:\n"
    "- Las ramas y subramas deben reflejar la estructura y los conceptos que "
    "REALMENTE aparecen en el contenido — NUNCA inventes temas, herramientas "
    "o pasos que no estén en el material, aunque sean típicos del tema en "
    "general.\n"
    "- Puedes reformular para que sea más claro, breve o esté mejor "
    "organizado, pero sin agregar información externa al texto dado.\n"
    "- Si el contenido incluye comandos, código o términos técnicos "
    "específicos, consérvalos tal cual como nodos hoja — son justo lo que el "
    "estudiante necesita repasar. Envuélvelos entre comillas invertidas simples "
    "(`como esto`) — se muestran como código real en el mapa.\n"
    "- Usa tantas ramas principales como secciones o ideas distintas tenga el "
    "contenido (normalmente 3 a 8) — no fuerces un número fijo si el "
    "contenido es corto.\n"
    "- Texto claro, específico y en español en todos los niveles.\n"
    "- 'title' es el título de la lección tal cual, o una versión muy similar."
)


def _build_mindmap_node_from_ai(node_dict, depth=0):
    text = str((node_dict or {}).get("text", "")).strip() or "Sin título"
    node = _new_mindmap_node(text)
    if depth < 4:  # sane depth cap regardless of what the model actually returned
        for child in (node_dict.get("children") or [])[:8]:
            if isinstance(child, dict):
                node["children"].append(_build_mindmap_node_from_ai(child, depth + 1))
    return node


@app.route("/api/mindmaps/generate", methods=["POST"])
def generate_mindmap():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    lesson_content = (data.get("content") or "").strip()
    mode = data.get("mode") or "explore"
    if not prompt:
        return jsonify({"error": "prompt es requerido"}), 400

    # "summarize" (used by the course-lesson shortcut) needs real lesson text to
    # ground the map in — without it, fall back to "explore" so we never silently
    # invent a generic plan from the title alone and call it a lesson map.
    if mode == "summarize" and lesson_content:
        system = _MINDMAP_SUMMARIZE_SYSTEM_PROMPT
        user_msg = f"Título de la lección: {prompt}\n\nContenido:\n{lesson_content[:8000]}"
    else:
        system = _MINDMAP_SYSTEM_PROMPT
        user_msg = prompt

    content, err = _call_ai(system, user_msg, max_tokens=4000, json_mode=True, provider=data.get("provider"), model=data.get("model"))
    if err:
        return err

    # Defensive: strip stray markdown fences in case the model ignores response_format
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(cleaned)
    except Exception:
        return jsonify({"error": "La IA no devolvió un JSON válido. Intenta de nuevo."}), 502

    title = (parsed.get("title") or prompt).strip()[:120]
    branches = parsed.get("branches") or []
    if not isinstance(branches, list):
        return jsonify({"error": "Respuesta de la IA con formato inesperado."}), 502

    root = _new_mindmap_node(title, node_id="root")
    for b in branches[:10]:
        if isinstance(b, dict):
            root["children"].append(_build_mindmap_node_from_ai(b))

    mindmaps_data = load_mindmaps()
    map_id = uuid.uuid4().hex[:8]
    now = datetime.utcnow().isoformat(timespec="seconds")
    mindmap = {"id": map_id, "title": title, "created": now, "updated": now, "root": root}
    mindmaps_data["maps"][map_id] = mindmap
    save_mindmaps(mindmaps_data)
    return jsonify(mindmap), 201


# ── Radar Tech ────────────────────────────────────────────────────────────────

_radar_cache = {"ts": 0, "items": []}
_RADAR_TTL = 1800  # 30 minutes

_RSS_FEEDS = [
    ("OpenAI",       "https://openai.com/news/rss.xml",           "ai"),
    ("GitHub",       "https://github.blog/feed/",                  "dev"),
    ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/technology", "tech"),
    ("MIT Tech",     "https://www.technologyreview.com/feed/",     "tech"),
    ("arXiv AI",     "https://rss.arxiv.org/rss/cs.AI",           "research"),
]

_HN_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
_HN_ITEM = "https://hacker-news.firebaseio.com/v0/item/{}.json"


def _fetch_rss(url, source, category):
    items = []
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ProjectAtlas/1.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = r.read()
        root = ET.fromstring(raw)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        # RSS 2.0
        for item in root.findall(".//item")[:5]:
            title = (item.findtext("title") or "").strip()
            link  = (item.findtext("link") or "").strip()
            pub   = (item.findtext("pubDate") or "").strip()
            if title and link:
                items.append({"title": title, "url": link, "source": source, "category": category, "pub": pub})
        # Atom
        if not items:
            for entry in root.findall(".//atom:entry", ns)[:5]:
                title = (entry.findtext("atom:title", namespaces=ns) or "").strip()
                link_el = entry.find("atom:link", ns)
                link  = link_el.get("href", "") if link_el is not None else ""
                pub   = (entry.findtext("atom:published", namespaces=ns) or entry.findtext("atom:updated", namespaces=ns) or "").strip()
                if title and link:
                    items.append({"title": title, "url": link, "source": source, "category": category, "pub": pub})
    except Exception:
        pass
    return items


def _fetch_hn(limit=10):
    items = []
    try:
        req = urllib.request.Request(_HN_URL, headers={"User-Agent": "ProjectAtlas/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            ids = json.loads(r.read())[:limit]
        for story_id in ids:
            url = _HN_ITEM.format(story_id)
            req2 = urllib.request.Request(url, headers={"User-Agent": "ProjectAtlas/1.0"})
            with urllib.request.urlopen(req2, timeout=5) as r2:
                story = json.loads(r2.read())
            if story and story.get("url"):
                items.append({
                    "title":    story.get("title", ""),
                    "url":      story.get("url", ""),
                    "source":   "Hacker News",
                    "category": "dev",
                    "pub":      "",
                    "score":    story.get("score", 0),
                })
    except Exception:
        pass
    return items


@app.route("/api/radar/feed")
def radar_feed():
    global _radar_cache
    now = time.time()
    if now - _radar_cache["ts"] < _RADAR_TTL and _radar_cache["items"]:
        return jsonify({"items": _radar_cache["items"], "cached": True})

    items = []
    for source, url, cat in _RSS_FEEDS:
        items.extend(_fetch_rss(url, source, cat))
    items.extend(_fetch_hn(10))

    _radar_cache = {"ts": now, "items": items}
    return jsonify({"items": items, "cached": False})


# ── Weather proxy ──────────────────────────────────────────────────────────────

_weather_cache = {"ts": 0, "data": None}
_WEATHER_TTL = 600  # 10 minutes

@app.route("/api/weather")
def weather_proxy():
    global _weather_cache
    lat = request.args.get("lat", "")
    lon = request.args.get("lon", "")
    if not lat or not lon:
        return jsonify({"error": "lat/lon required"}), 400

    now = time.time()
    cache_key = f"{lat},{lon}"
    if (now - _weather_cache["ts"] < _WEATHER_TTL
            and _weather_cache["data"]
            and _weather_cache.get("key") == cache_key):
        return jsonify(_weather_cache["data"])

    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&current=temperature_2m,weather_code,is_day"
            f"&temperature_unit=celsius&timezone=auto"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "ProjectAtlas/1.0"})
        with urllib.request.urlopen(req, timeout=2) as r:
            data = json.loads(r.read())
        current = data.get("current", {})
        result = {
            "temp":         current.get("temperature_2m"),
            "weather_code": current.get("weather_code"),
            "is_day":       current.get("is_day", 1),
            "city":         None,
        }
        # Reverse geocoding via Nominatim
        try:
            geo_url = (
                f"https://nominatim.openstreetmap.org/reverse"
                f"?lat={lat}&lon={lon}&format=json&zoom=10"
            )
            geo_req = urllib.request.Request(
                geo_url,
                headers={"User-Agent": "ProjectAtlas/1.0 (knowledge-base-app)"}
            )
            with urllib.request.urlopen(geo_req, timeout=4) as gr:
                geo = json.loads(gr.read())
            addr = geo.get("address", {})
            city = (addr.get("city") or addr.get("town") or addr.get("village")
                    or addr.get("municipality") or addr.get("county") or "")
            result["city"] = city or None
        except Exception:
            pass
        _weather_cache = {"ts": now, "data": result, "key": cache_key}
        return jsonify(result)
    except Exception:
        return jsonify({"error": "weather_unavailable"})


# ── Ask AI ────────────────────────────────────────────────────────────────────

@app.route("/api/ai", methods=["POST"])
def ai_ask():
    data = request.json or {}
    prompt  = data.get("prompt",  "").strip()
    context = data.get("context", "").strip()
    action  = data.get("action",  "ask")

    systems = {
        "explain":   "Eres un tutor técnico experto. Explica el contenido de forma clara y concisa con ejemplos prácticos. Responde en español.",
        "summarize": "Resume el contenido en viñetas clave ordenadas. Sé conciso. Responde en español.",
        "improve":   "Mejora la claridad y fluidez del texto manteniendo su significado e idioma. Devuelve solo el texto mejorado, sin añadir comentarios ni prefijos.",
        "example":   "Genera un ejemplo práctico y completo del concepto. Usa código Python si aplica. Responde en español.",
        "ask":       "Eres un asistente técnico experto en programación. Responde de forma clara y útil en español.",
        # Inline AI actions
        "expand":    "Amplía y desarrolla el siguiente fragmento con más detalle, ejemplos y contexto. Mantén el mismo estilo y tono. Devuelve solo el texto ampliado, sin comentarios.",
        "fix":       "Corrige la gramática, ortografía y claridad del siguiente texto. Mantén el significado original. Devuelve solo el texto corregido, sin explicaciones.",
        "continue":  "Continúa escribiendo de forma natural a partir del siguiente fragmento, manteniendo el estilo, tono y tema. Devuelve solo la continuación.",
        "translate_en": "Traduce el siguiente texto al inglés de forma natural y precisa. Devuelve solo la traducción.",
    }
    system = systems.get(action, systems["ask"])
    user_msg = f"Contexto:\n```\n{context}\n```\n\n{prompt}" if (context and action not in ("expand","fix","continue","translate_en","improve")) else (context or prompt)

    content, err = _call_ai(system, user_msg, max_tokens=2048, provider=data.get("provider"), model=data.get("model"))
    if err:
        return err
    # Render server-side with the same Markdown pipeline used for note content
    # (tables, ordered/unordered lists, fenced code) instead of leaving the
    # frontend to re-parse the reply with a much more limited hand-rolled parser.
    return jsonify({"result": content, "html": render_markdown(content)})


# ── Quiz generation (structured, multiple-choice) ──────────────────────────────

@app.route("/api/quiz", methods=["POST"])
def generate_quiz():
    data    = request.json or {}
    context = (data.get("context") or "").strip()
    title   = (data.get("title") or "").strip()
    course  = (data.get("course") or "").strip()
    if not context:
        return jsonify({"error": "Sin contenido para generar el quiz"}), 400

    concepts = _load_course_concepts(course) if course else []
    concept_instructions = ""
    if concepts:
        names = "\n".join(f"- {c['name']}" for c in concepts)
        concept_instructions = (
            "\n- Cada pregunta incluye \"concept\": el nombre EXACTO del concepto de esta lista al que pertenece "
            f"(o cadena vacía si ninguno aplica bien):\n{names}\n"
        )

    system = (
        "Eres un diseñador experto de evaluaciones educativas técnicas. A partir del contenido de una "
        "lección, genera un quiz RIGUROSO de opción múltiple que verifique si el estudiante realmente "
        "comprendió el tema, no solo si memorizó frases sueltas.\n\n"
        "Reglas estrictas:\n"
        "- Genera exactamente 8 preguntas.\n"
        "- Combina niveles de dificultad: recordar datos concretos, comprender conceptos, y aplicar/analizar "
        "en un escenario práctico o un fragmento de código si el contenido lo permite.\n"
        "- Cada pregunta tiene EXACTAMENTE 4 opciones y solo una es correcta.\n"
        "- Los 3 distractores deben ser específicos y plausibles (errores o confusiones reales sobre el tema), "
        "nunca absurdos ni obviamente falsos.\n"
        "- No repitas la misma idea en varias preguntas; cubre distintas partes del contenido.\n"
        "- Incluye una explicación breve (1-2 frases) de por qué la respuesta correcta lo es."
        f"{concept_instructions}"
        "\n- Responde en español.\n\n"
        "Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional, sin comentarios) "
        "con este esquema exacto:\n"
        '{"questions":[{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"...","concept":"..."}]}'
    )
    user_msg = f"Lección: {title}\n\nContenido:\n```\n{context[:8000]}\n```"

    content, err = _call_ai(system, user_msg, max_tokens=3500, json_mode=True, provider=data.get("provider"), model=data.get("model"))
    if err:
        return err
    try:
        quiz = json.loads(content)
        # Validate shape — drop malformed questions rather than failing the whole quiz
        clean = []
        for q in quiz.get("questions", []):
            opts    = q.get("options")
            correct = q.get("correct")
            if (isinstance(q.get("question"), str) and isinstance(opts, list) and len(opts) == 4
                    and isinstance(correct, int) and 0 <= correct < 4):
                clean.append({
                    "question":    q["question"],
                    "options":     [str(o) for o in opts],
                    "correct":     correct,
                    "explanation": str(q.get("explanation") or ""),
                    "concept_id":  _match_concept_id(concepts, q.get("concept")),
                })
        if not clean:
            return jsonify({"error": "La IA no devolvió preguntas válidas. Intenta de nuevo."}), 502
        return jsonify({"questions": clean, "course": course})
    except (json.JSONDecodeError, KeyError, TypeError):
        return jsonify({"error": "La IA devolvió una respuesta con formato inválido. Intenta de nuevo."}), 502


# ── FEATURE: Practice/Quiz attempt history (Fase 0 — fundación de dominio) ──
ATTEMPTS_FILE = DATA_DIR / "attempts.json"


def load_attempts():
    if ATTEMPTS_FILE.exists():
        return json.loads(ATTEMPTS_FILE.read_text())
    return {"attempts": []}


def save_attempts(data):
    tmp = ATTEMPTS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, ATTEMPTS_FILE)


@app.route("/api/attempts", methods=["POST"])
def create_attempt():
    data = request.json or {}
    entry_id = (data.get("entry_id") or "").strip()
    attempt_type = data.get("type", "quiz")
    score = data.get("score")
    total = data.get("total")
    if not entry_id or not isinstance(score, int) or not isinstance(total, int) or total <= 0:
        return jsonify({"error": "Missing or invalid fields"}), 400
    if attempt_type not in ("quiz", "practice"):
        return jsonify({"error": "Invalid type"}), 400

    index = load_index()
    meta = index.get(entry_id, {})

    record = {
        "id": uuid.uuid4().hex[:8],
        "entry_id": entry_id,
        "entry_title": meta.get("title", "") or (data.get("topic") or "").strip(),
        "course": meta.get("course", ""),
        "type": attempt_type,
        "mode": (data.get("mode") or "").strip(),
        "difficulty": (data.get("difficulty") or "").strip(),
        "score": score,
        "total": total,
        "percentage": round(score / total * 100),
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }

    store = load_attempts()
    store["attempts"].append(record)
    save_attempts(store)
    return jsonify(record)


@app.route("/api/attempts", methods=["GET"])
def list_attempts():
    store = load_attempts()
    attempts = store["attempts"]
    entry_id = request.args.get("entry_id")
    if entry_id:
        attempts = [a for a in attempts if a["entry_id"] == entry_id]
    attempts = sorted(attempts, key=lambda a: a["created_at"], reverse=True)
    limit = request.args.get("limit", type=int)
    if limit:
        attempts = attempts[:limit]
    return jsonify({"attempts": attempts})


# ── FEATURE: Práctica — retos generados por IA, sin sandbox real ────────────
_PRACTICE_SYSTEM_PROMPT = (
    "Eres un instructor técnico senior que diseña retos prácticos realistas de una empresa de software, "
    "para que un estudiante aplique lo aprendido en vez de solo leer.\n\n"
    "Reglas estrictas:\n"
    "- Genera un escenario breve y creíble de un caso real de industria relacionado con el tema.\n"
    "- Divide el reto en 3 a 5 pasos verificables, en orden creciente de dificultad.\n"
    "- Cada paso es de tipo \"python\" (código Python real y ejecutable) o \"text\" (un comando de git/shell/SQL, "
    "o una respuesta conceptual corta que el estudiante escribe pero NO se ejecuta, solo se evalúa como texto).\n"
    "- Usa pasos \"python\" solo si el tema es de programación en Python. Para git, shell, SQL, CSS o conceptos, usa \"text\".\n"
    "- Para pasos \"python\": incluye \"starter_code\" (una plantilla mínima con comentarios guía; puede ser cadena vacía) "
    "y \"asserts\" (una lista de 1 a 4 líneas `assert ...` en Python que validan la solución correcta al ejecutarse "
    "justo después del código del estudiante; deben poder fallar si la solución es incorrecta).\n"
    "- Para pasos \"text\": incluye \"rubric\" (qué debe contener una respuesta correcta, para que otra IA la evalúe).\n"
    "- Cada paso incluye \"hints\": una lista de EXACTAMENTE 3 pistas progresivas (de sutil a casi explícita, "
    "sin revelar la solución completa en las dos primeras).\n"
    "- Cada paso incluye \"solution\": la solución de referencia completa (código o comando/respuesta).\n"
    "- Ajusta la dificultad real del reto al nivel pedido: facil, medio o dificil.\n"
    "- Formato de texto en \"scenario\" y en el \"instruction\" de cada paso: si incluyes código, un traceback/"
    "stack trace, salida de terminal, contenido de un archivo o un comando, escríbelo SIEMPRE dentro de un bloque "
    "de código Markdown con triple backtick indicando el lenguaje cuando aplique (```python, ```bash, ```sql, o "
    "```text para tracebacks y salidas genéricas) — nunca como texto corrido en el mismo párrafo. Para un nombre "
    "de variable, función o comando suelto dentro de una oración, usa un backtick simple.\n"
    "- Responde en español.\n\n"
    "Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional, sin comentarios) "
    "con este esquema exacto:\n"
    '{"title":"...","scenario":"...","steps":[{"type":"python|text","instruction":"...",'
    '"starter_code":"...","asserts":["..."],"rubric":"...","hints":["...","...","..."],"solution":"...","concept":"..."}]}'
)


# ── FEATURE: Historial de retos guardados ────────────────────────────────────
# Every generated challenge is saved the moment it's generated (status
# "in_progress"), not just once finished — the whole point is that nothing
# a user asked the AI for (and paid an API call for) ever silently
# disappears, whether they finish it, abandon it, or just close the tab.
PRACTICE_CHALLENGES_FILE = DATA_DIR / "practice_challenges.json"


def load_practice_challenges():
    if PRACTICE_CHALLENGES_FILE.exists():
        return json.loads(PRACTICE_CHALLENGES_FILE.read_text())
    return {"challenges": {}}


def save_practice_challenges(data):
    tmp = PRACTICE_CHALLENGES_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, PRACTICE_CHALLENGES_FILE)


@app.route("/api/practice/history", methods=["GET"])
def list_practice_history():
    store = load_practice_challenges()
    challenges = list(store["challenges"].values())
    status = request.args.get("status")
    if status:
        challenges = [c for c in challenges if c.get("status") == status]
    challenges = sorted(challenges, key=lambda c: c["updated_at"], reverse=True)
    limit = request.args.get("limit", type=int)
    if limit:
        challenges = challenges[:limit]
    # The list view doesn't need each challenge's full step content (hints,
    # solutions, asserts...) — just enough to render a row and decide
    # whether to resume it.
    summary = [{
        "id": c["id"], "title": c["title"], "status": c["status"],
        "difficulty": c.get("difficulty"), "course": c.get("course"),
        "provider": c.get("provider"), "model": c.get("model"),
        "step_count": len(c.get("steps", [])), "current_step": c.get("current_step", 0),
        "created_at": c["created_at"], "updated_at": c["updated_at"],
    } for c in challenges]
    return jsonify({"challenges": summary})


@app.route("/api/practice/<challenge_id>", methods=["GET"])
def get_practice_challenge(challenge_id):
    store = load_practice_challenges()
    challenge = store["challenges"].get(challenge_id)
    if not challenge:
        return jsonify({"error": "Reto no encontrado"}), 404
    return jsonify(challenge)


@app.route("/api/practice/<challenge_id>", methods=["DELETE"])
def delete_practice_challenge(challenge_id):
    store = load_practice_challenges()
    if challenge_id not in store["challenges"]:
        return jsonify({"error": "Reto no encontrado"}), 404
    del store["challenges"][challenge_id]
    save_practice_challenges(store)
    return jsonify({"ok": True})


@app.route("/api/practice/<challenge_id>/progress", methods=["POST"])
def save_practice_progress(challenge_id):
    """Autosave while solving — current step index and per-step results
    (passed/revealed/hints shown/last answer), so resuming a saved
    challenge picks up exactly where the user left off."""
    store = load_practice_challenges()
    challenge = store["challenges"].get(challenge_id)
    if not challenge:
        return jsonify({"error": "Reto no encontrado"}), 404
    body = request.json or {}
    if "current_step" in body:
        challenge["current_step"] = body["current_step"]
    if "step_results" in body:
        challenge["step_results"] = body["step_results"]
    challenge["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_practice_challenges(store)
    return jsonify({"ok": True})


@app.route("/api/practice/<challenge_id>/finish", methods=["POST"])
def finish_practice_challenge(challenge_id):
    store = load_practice_challenges()
    challenge = store["challenges"].get(challenge_id)
    if not challenge:
        return jsonify({"error": "Reto no encontrado"}), 404
    body = request.json or {}
    status = body.get("status", "completed")
    if status not in ("completed", "abandoned"):
        return jsonify({"error": "status inválido"}), 400
    challenge["status"] = status
    if "step_results" in body:
        challenge["step_results"] = body["step_results"]
    challenge["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_practice_challenges(store)
    return jsonify({"ok": True})


@app.route("/api/practice/generate", methods=["POST"])
def generate_practice_challenge():
    data             = request.json or {}
    mode             = data.get("mode", "topic")
    topic            = (data.get("topic") or "").strip()
    context          = (data.get("context") or "").strip()
    course           = (data.get("course") or "").strip()
    entry_id         = (data.get("entry_id") or "").strip()
    force_concept_id = (data.get("concept_id") or "").strip()
    difficulty       = data.get("difficulty", "medio")
    if difficulty not in ("facil", "medio", "dificil"):
        difficulty = "medio"
    if not topic:
        return jsonify({"error": "Falta el tema del reto"}), 400

    concepts = _load_course_concepts(course) if course else []
    concept_note = ""
    if concepts:
        names = "\n".join(f"- {c['name']}" for c in concepts)
        concept_note = (
            f"\n\nConceptos clave del curso (etiqueta cada paso con \"concept\": el nombre EXACTO del que "
            f"más aplique, o cadena vacía si ninguno aplica bien):\n{names}"
        )

    if context:
        user_msg = (
            f"Lección de referencia: {topic}\nDificultad: {difficulty}\n\n"
            f"Contenido de la lección (el reto debe reforzar exactamente estos conceptos):\n"
            f"```\n{context[:6000]}\n```{concept_note}"
        )
    else:
        user_msg = (
            f"Tema: {topic}\nDificultad: {difficulty}\n"
            "Genera un reto de tema libre sobre este tema, sin atarlo a ninguna lección específica."
            f"{concept_note}"
        )

    content, err = _call_ai(_PRACTICE_SYSTEM_PROMPT, user_msg, max_tokens=3000, json_mode=True, provider=data.get("provider"), model=data.get("model"))
    if err:
        return err

    try:
        challenge = json.loads(content)
    except json.JSONDecodeError:
        return jsonify({"error": "La IA devolvió una respuesta con formato inválido. Intenta de nuevo."}), 502

    clean_steps = []
    for step in challenge.get("steps", []):
        step_type = step.get("type")
        instruction = step.get("instruction")
        if step_type not in ("python", "text") or not isinstance(instruction, str) or not instruction.strip():
            continue
        hints = step.get("hints")
        hints = [str(h) for h in hints][:3] if isinstance(hints, list) else []
        clean = {
            "type": step_type,
            "instruction": instruction,
            "instruction_html": render_markdown(instruction),
            "hints": hints,
            "hints_html": [render_markdown(h) for h in hints],
            "solution": str(step.get("solution") or ""),
            "concept_id": force_concept_id or _match_concept_id(concepts, step.get("concept")),
        }
        if step_type == "python":
            asserts = step.get("asserts")
            asserts = [str(a) for a in asserts if isinstance(a, str) and a.strip()] if isinstance(asserts, list) else []
            if not asserts:
                continue
            clean["starter_code"] = str(step.get("starter_code") or "")
            clean["asserts"] = asserts
        else:
            rubric = step.get("rubric")
            if not isinstance(rubric, str) or not rubric.strip():
                continue
            clean["rubric"] = rubric
        clean_steps.append(clean)

    if not clean_steps:
        return jsonify({"error": "La IA no devolvió pasos válidos. Intenta de nuevo."}), 502

    now = datetime.now().isoformat(timespec="seconds")
    record = {
        "id": uuid.uuid4().hex[:8],
        "title": str(challenge.get("title") or topic),
        "scenario": str(challenge.get("scenario") or ""),
        "scenario_html": render_markdown(str(challenge.get("scenario") or "")),
        "difficulty": difficulty,
        "mode": mode,
        "topic": topic,
        "course": course,
        "entry_id": entry_id,
        "provider": data.get("provider") or DEFAULT_PROVIDER,
        "model": data.get("model") or DEFAULT_MODEL,
        "steps": clean_steps,
        "status": "in_progress",
        "current_step": 0,
        "step_results": [],
        "created_at": now,
        "updated_at": now,
    }
    store = load_practice_challenges()
    store["challenges"][record["id"]] = record
    save_practice_challenges(store)

    return jsonify(record)


@app.route("/api/practice/check-python", methods=["POST"])
def check_practice_python():
    data    = request.json or {}
    code    = data.get("code", "")
    asserts = data.get("asserts")
    if not isinstance(asserts, list) or not asserts:
        return jsonify({"error": "Missing asserts"}), 400

    full_code = code + "\n\n" + "\n".join(str(a) for a in asserts)
    result = _run_python(full_code)
    if "error" in result:
        return jsonify({"passed": False, "output": "", "stderr": result["error"]})

    passed = result["returncode"] == 0 and not result["stderr"]
    return jsonify({"passed": passed, "output": result["output"], "stderr": result["stderr"]})


@app.route("/api/practice/check-text", methods=["POST"])
def check_practice_text():
    data        = request.json or {}
    instruction = (data.get("instruction") or "").strip()
    rubric      = (data.get("rubric") or "").strip()
    answer      = (data.get("answer") or "").strip()
    if not instruction or not rubric:
        return jsonify({"error": "Missing instruction or rubric"}), 400
    if not answer:
        return jsonify({"passed": False, "feedback": "No escribiste ninguna respuesta.", "feedback_html": ""})

    system = (
        "Eres un evaluador técnico estricto pero justo. Un estudiante escribió un comando (git/shell/SQL) o una "
        "respuesta conceptual corta para un paso de un reto práctico; el comando NO se ejecuta, solo evalúas el texto.\n\n"
        "Evalúa si la respuesta cumple la rúbrica. Sé tolerante con variantes válidas (flags en distinto orden, "
        "sinónimos técnicos correctos), pero estricto con errores reales.\n\n"
        "Si tu feedback cita código, un comando o el comando correcto, usa Markdown: backtick simple para un "
        "token suelto, o un bloque con triple backtick (con el lenguaje si aplica) si es más de una línea.\n\n"
        "Responde ÚNICAMENTE con JSON: {\"correct\": true|false, \"feedback\": \"...\"} — feedback en español, "
        "1-2 frases, explicando qué está bien o qué falta/está mal."
    )
    user_msg = f"Instrucción del paso:\n{instruction}\n\nRúbrica esperada:\n{rubric}\n\nRespuesta del estudiante:\n{answer}"

    content, err = _call_ai(system, user_msg, max_tokens=300, json_mode=True, provider=data.get("provider"), model=data.get("model"))
    if err:
        return err
    try:
        result = json.loads(content)
        feedback = str(result.get("feedback") or "")
        return jsonify({
            "passed": bool(result.get("correct")),
            "feedback": feedback,
            "feedback_html": render_markdown(feedback),
        })
    except json.JSONDecodeError:
        return jsonify({"error": "La IA devolvió una respuesta con formato inválido."}), 502


@app.route("/api/practice/explain", methods=["POST"])
def explain_practice_step():
    """A step between "otra pista" and "revelar la solución": a real
    explanation of the underlying concept, on request — not a hint, not the
    answer. Used when a student is stuck even after all 3 progressive
    hints, so the next thing they see teaches instead of just handing over
    the literal solution."""
    data = request.json or {}
    instruction = (data.get("instruction") or "").strip()
    rubric = (data.get("rubric") or "").strip()
    if not instruction:
        return jsonify({"error": "Falta la instrucción del paso"}), 400

    system = (
        "Eres un tutor técnico paciente. Un estudiante está atascado en un paso de un reto práctico y ya usó "
        "todas las pistas disponibles sin lograrlo — necesita ENTENDER el concepto o la técnica involucrada, no "
        "que le regalen la respuesta.\n\n"
        "Explica el concepto general en 1-2 párrafos breves, con un ejemplo GENÉRICO distinto al del paso si "
        "ayuda a ilustrarlo. NO resuelvas el paso en sí ni reveles la respuesta/comando/código exacto que lo "
        "resolvería — eso lo decide el estudiante ver aparte, en 'Ver solución'.\n\n"
        "Si citas código, usa bloques Markdown con triple backtick indicando el lenguaje. Responde en español, "
        "en tono cercano de instructor explicando en persona, no de examen."
    )
    user_msg = f"Paso del reto:\n{instruction}"
    if rubric:
        user_msg += f"\n\n(Rúbrica interna de evaluación — no la cites literal, es solo para tu contexto): {rubric}"

    content, err = _call_ai(system, user_msg, max_tokens=500, provider=data.get("provider"), model=data.get("model"))
    if err:
        return err
    return jsonify({"explanation": content, "explanation_html": render_markdown(content)})


# ── FEATURE: Dominio — mapa de conceptos, repetición espaciada y Pareto (Fase 2) ──
CONCEPTS_FILE = DATA_DIR / "concepts.json"
CONCEPT_PROGRESS_FILE = DATA_DIR / "concept_progress.json"


def load_concepts():
    if CONCEPTS_FILE.exists():
        return json.loads(CONCEPTS_FILE.read_text())
    return {"courses": {}}


def save_concepts(data):
    tmp = CONCEPTS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, CONCEPTS_FILE)


def load_concept_progress():
    if CONCEPT_PROGRESS_FILE.exists():
        return json.loads(CONCEPT_PROGRESS_FILE.read_text())
    return {}


def save_concept_progress(data):
    tmp = CONCEPT_PROGRESS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, CONCEPT_PROGRESS_FILE)


def _load_course_concepts(course):
    """Concept list for a course, or [] if none generated yet. Used to tag
    quiz questions and practice steps with a concept_id."""
    if not course:
        return []
    return load_concepts()["courses"].get(course, {}).get("concepts", [])


def _match_concept_id(concepts, name):
    """Map the free-text concept name an AI call returned back to our canonical
    concept id, by case-insensitive exact match. Empty/unmatched -> ''."""
    if not concepts or not isinstance(name, str) or not name.strip():
        return ""
    name_norm = name.strip().lower()
    for c in concepts:
        if c["name"].strip().lower() == name_norm:
            return c["id"]
    return ""


@app.route("/api/courses/<course>/concepts", methods=["GET"])
def get_course_concepts(course):
    data = load_concepts()
    entry = data["courses"].get(course)
    if not entry:
        return jsonify({"course": course, "generated_at": None, "concepts": []})
    return jsonify({"course": course, "generated_at": entry.get("generated_at"), "concepts": entry.get("concepts", [])})


def _generate_concepts_for_course(course):
    """Core concept-map extraction, shared by the manual regenerate endpoint
    and the lazy auto-generate-on-first-domain-fetch path. Returns
    (concepts_list, None) on success or (None, error_message) on failure —
    plain strings for errors since callers may not always want to `return`
    a Flask response straight from a background/loop context."""
    index = load_index()
    titles = [meta["title"] for meta in index.values()
              if meta.get("type") == "course" and meta.get("course") == course]
    if not titles:
        return None, "Este curso no tiene lecciones todavía"

    courses_master = load_courses()["courses"]
    course_label = courses_master.get(course, {}).get("label", course)

    system = (
        "Eres un experto en diseño curricular técnico. A partir de la lista de lecciones de un curso, "
        "extrae el mapa de conceptos clave que un estudiante debe dominar.\n\n"
        "Reglas estrictas:\n"
        "- Identifica entre 6 y 15 conceptos concretos y accionables (habilidades o temas puntuales, no lecciones completas).\n"
        "- Aplica el principio de Pareto: marca con \"pareto\": true solo el ~20% de los conceptos de mayor "
        "apalancamiento práctico (los que más impactan el dominio real del curso si se aprenden bien); el resto \"pareto\": false.\n"
        "- Cada concepto incluye una descripción breve (1 frase) de qué implica dominarlo.\n"
        "- No dupliques conceptos ni los hagas demasiado genéricos ni demasiado específicos.\n"
        "- Responde en español.\n\n"
        "Responde ÚNICAMENTE con JSON: {\"concepts\":[{\"name\":\"...\",\"description\":\"...\",\"pareto\":true|false}]}"
    )
    user_msg = f"Curso: {course_label}\n\nLecciones:\n" + "\n".join(f"- {t}" for t in titles[:120])

    content, err = _call_deepseek(system, user_msg, max_tokens=2000, json_mode=True)
    if err:
        # err is a (jsonify(...), status) tuple meant for a route; unwrap its message for callers that just want text
        try:
            message = err[0].get_json().get("error", "Error al llamar a la IA")
        except Exception:
            message = "Error al llamar a la IA"
        return None, message

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None, "La IA devolvió una respuesta con formato inválido"

    seen_names = set()
    clean_concepts = []
    for c in parsed.get("concepts", []):
        name = c.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        key = name.strip().lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        clean_concepts.append({
            "id": uuid.uuid4().hex[:8],
            "name": name.strip(),
            "description": str(c.get("description") or ""),
            "pareto": bool(c.get("pareto")),
        })

    if not clean_concepts:
        return None, "La IA no devolvió conceptos válidos"

    data = load_concepts()
    data["courses"][course] = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "concepts": clean_concepts,
    }
    save_concepts(data)
    return clean_concepts, None


@app.route("/api/courses/<course>/concepts/generate", methods=["POST"])
def generate_course_concepts(course):
    concepts, error = _generate_concepts_for_course(course)
    if error:
        return jsonify({"error": error}), 502
    data = load_concepts()
    return jsonify({"course": course, "generated_at": data["courses"][course]["generated_at"], "concepts": concepts})


@app.route("/api/concepts/review", methods=["POST"])
def review_concept():
    """Record a single concept-level result (one quiz question or one practice
    step) and update its simplified SM-2 spaced-repetition state: a correct
    answer grows the review interval, a miss resets it — same idea as full
    SM-2 without the 0-5 quality scale, just a correct/incorrect signal."""
    data = request.json or {}
    concept_id = (data.get("concept_id") or "").strip()
    course = (data.get("course") or "").strip()
    correct = bool(data.get("correct"))
    if not concept_id:
        return jsonify({"error": "Missing concept_id"}), 400

    progress = load_concept_progress()
    state = progress.get(concept_id, {"ease": 2.5, "interval": 0, "reps": 0, "course": course})

    if correct:
        state["reps"] += 1
        if state["reps"] == 1:
            state["interval"] = 1
        elif state["reps"] == 2:
            state["interval"] = 3
        else:
            state["interval"] = max(1, round(state["interval"] * state["ease"]))
        state["ease"] = min(2.8, state["ease"] + 0.1)
    else:
        state["reps"] = 0
        state["interval"] = 1
        state["ease"] = max(1.3, state["ease"] - 0.2)

    state["course"] = course or state.get("course", "")
    state["last_result"] = correct
    state["last_reviewed_at"] = datetime.now().isoformat(timespec="seconds")
    state["next_review_at"] = (datetime.now() + timedelta(days=state["interval"])).isoformat(timespec="seconds")

    progress[concept_id] = state
    save_concept_progress(progress)
    return jsonify({"concept_id": concept_id, **state})


def _concept_mastery(progress_state):
    """0-100 mastery proxy: how many days the concept can go before its next
    review is due, capped at a month (interval 0 = never practiced = 0)."""
    if not progress_state:
        return 0
    return min(100, round(progress_state.get("interval", 0) / 30 * 100))


def _ensure_concepts_for_all_courses():
    """Lazily generate a concept map for any course that has lessons but no
    map yet, so domain tracking works out of the box with no separate "analyze
    this course" step in the UI. Silently skipped without an API key (e.g. in
    local dev) or if a course's generation fails — domain just omits it."""
    if not os.environ.get("DEEPSEEK_API_KEY"):
        return
    index = load_index()
    known_courses = {meta["course"] for meta in index.values()
                      if meta.get("type") == "course" and meta.get("course")}
    courses_master = load_courses()["courses"]
    known_courses = {c for c in known_courses if not courses_master.get(c, {}).get("archived")}
    concepts_data = load_concepts()["courses"]
    for course in known_courses - concepts_data.keys():
        _generate_concepts_for_course(course)


@app.route("/api/domain", methods=["GET"])
def get_domain():
    _ensure_concepts_for_all_courses()
    concepts_data = load_concepts()["courses"]
    progress = load_concept_progress()
    courses_master = load_courses()["courses"]

    result = {}
    for course, entry in concepts_data.items():
        if courses_master.get(course, {}).get("archived"):
            continue
        concepts = entry.get("concepts", [])
        if not concepts:
            continue
        weighted_sum = 0
        weight_total = 0
        concept_out = []
        for c in concepts:
            weight = 2 if c.get("pareto") else 1
            score = _concept_mastery(progress.get(c["id"]))
            weighted_sum += score * weight
            weight_total += weight
            concept_out.append({**c, "mastery": score})
        domain = round(weighted_sum / weight_total) if weight_total else 0
        result[course] = {
            "label": courses_master.get(course, {}).get("label", course),
            "domain": domain,
            "concepts": concept_out,
        }
    return jsonify({"courses": result})


def _find_unstarted_course():
    """The earliest-added course the user hasn't opened a single lesson of yet.
    This is a stronger signal than any concept decaying — there's nothing to
    decay if nothing was studied — so it outranks spaced-repetition reminders."""
    index = load_index()
    courses_master = load_courses()["courses"]
    lessons_by_course = {}
    for meta in index.values():
        if meta.get("type") == "course" and meta.get("course"):
            lessons_by_course.setdefault(meta["course"], []).append(meta)

    candidates = []
    for slug, info in courses_master.items():
        if info.get("archived"):
            continue
        lessons = lessons_by_course.get(slug, [])
        touched = any(l.get("last_viewed_at") for l in lessons)
        if not touched:
            candidates.append((info.get("created_at", ""), slug, info, len(lessons)))

    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0])
    _, slug, info, lesson_count = candidates[0]
    return {"course": slug, "course_label": info.get("label", slug), "lesson_count": lesson_count}


@app.route("/api/domain/reminder", methods=["GET"])
def get_domain_reminder():
    unstarted = _find_unstarted_course()
    if unstarted:
        if unstarted["lesson_count"] > 0:
            plural = "es" if unstarted["lesson_count"] != 1 else ""
            message = (f"Todavía no empezaste \"{unstarted['course_label']}\" — tiene "
                       f"{unstarted['lesson_count']} lección{plural} esperando. Es hora de dar el primer paso.")
        else:
            message = f"\"{unstarted['course_label']}\" está en tu lista pero todavía no tiene lecciones cargadas."
        return jsonify({"reminder": {
            "kind": "start",
            "course": unstarted["course"],
            "course_label": unstarted["course_label"],
            "has_lessons": unstarted["lesson_count"] > 0,
            "lesson_count": unstarted["lesson_count"],
            "message": message,
        }})

    concepts_data = load_concepts()["courses"]
    progress = load_concept_progress()
    courses_master = load_courses()["courses"]
    now = datetime.now()

    best = None
    best_priority = -1
    for course, entry in concepts_data.items():
        if courses_master.get(course, {}).get("archived"):
            continue
        for c in entry.get("concepts", []):
            state = progress.get(c["id"])
            if not state or state.get("reps", 0) == 0 or not state.get("next_review_at"):
                continue
            next_review = datetime.fromisoformat(state["next_review_at"])
            if next_review > now:
                continue
            overdue_days = max(0, (now - next_review).days)
            weight = 2 if c.get("pareto") else 1
            priority = (overdue_days + 1) * weight
            if priority > best_priority:
                best_priority = priority
                best = (course, c)

    if not best:
        return jsonify({"reminder": None})

    course, concept = best
    course_label = courses_master.get(course, {}).get("label", course)
    if concept.get("pareto"):
        message = f"Practica \"{concept['name']}\" ahora — es de tus conceptos de mayor peso y ya casi se te olvida."
    else:
        message = f"Repasa \"{concept['name']}\" — se te empieza a olvidar."

    return jsonify({"reminder": {
        "kind": "review",
        "concept_id": concept["id"],
        "concept_name": concept["name"],
        "course": course,
        "course_label": course_label,
        "pareto": bool(concept.get("pareto")),
        "message": message,
    }})


@app.route("/api/domain/weakest", methods=["GET"])
def get_domain_weakest():
    """The single weakest, highest-leverage concept across every analyzed
    course — unlike /api/domain/reminder this doesn't require it to be
    "due" for review; a concept never practiced (mastery 0) is the weakest
    possible and a perfectly valid pick. Powers "reto sorpresa" in Fase 3:
    instead of a random lesson, it targets your actual weakest Pareto spot."""
    _ensure_concepts_for_all_courses()
    concepts_data = load_concepts()["courses"]
    progress = load_concept_progress()
    courses_master = load_courses()["courses"]

    best = None
    best_priority = -1
    for course, entry in concepts_data.items():
        if courses_master.get(course, {}).get("archived"):
            continue
        for c in entry.get("concepts", []):
            mastery = _concept_mastery(progress.get(c["id"]))
            weight = 2 if c.get("pareto") else 1
            priority = weight * (100 - mastery)
            if priority > best_priority:
                best_priority = priority
                best = (course, c, mastery)

    if not best:
        return jsonify({"weakest": None})

    course, concept, mastery = best
    return jsonify({"weakest": {
        "concept_id": concept["id"],
        "concept_name": concept["name"],
        "course": course,
        "course_label": courses_master.get(course, {}).get("label", course),
        "pareto": bool(concept.get("pareto")),
        "mastery": mastery,
    }})


# ── Code execution ────────────────────────────────────────────────────────────

def _run_python(code):
    """Run Python source in a bare subprocess. Returns a dict with output/stderr/
    returncode, or an {"error": ...} dict on timeout. Shared by /api/execute and
    the Práctica python-step checker so grading matches manual execution exactly."""
    try:
        result = subprocess.run(
            ["python3", "-c", code],
            capture_output=True, text=True, timeout=10, cwd="/tmp",
        )
        return {
            "output":     result.stdout,
            "stderr":     result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": "⏱ Timeout: el código superó 10 segundos."}


@app.route("/api/execute", methods=["POST"])
def execute_code():
    data     = request.json or {}
    code     = data.get("code", "").strip()
    language = data.get("language", "python").lower().replace("python3", "python")

    if not code:
        return jsonify({"output": "", "stderr": ""}), 200
    if language != "python":
        return jsonify({"error": f"Lenguaje '{language}' no soportado. Solo Python disponible."}), 400

    try:
        result = _run_python(code)
        if "error" in result:
            return jsonify(result), 408
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/cleanup-injected-text", methods=["POST"])
def cleanup_injected_text():
    """Remove lines that were accidentally injected into entries by the buggy postProcessEntry."""
    # Lines matching the corrupted button text patterns
    bad_patterns = [
        re.compile(r'^[▶⏳]\s*(Ejecutar|Ejecutando)[^\n]*$', re.MULTILINE),
        re.compile(r'^✕\s*cerrar[^\n]*$', re.MULTILINE),
    ]
    index = load_index()
    fixed = []
    for entry_id, meta in index.items():
        path = _entry_path(entry_id, meta)
        if not path.exists():
            continue
        original = path.read_text()
        cleaned = original
        for pat in bad_patterns:
            cleaned = pat.sub('', cleaned)
        # Also collapse multiple blank lines left behind
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip() + '\n'
        if cleaned != original:
            path.write_text(cleaned)
            fixed.append({"id": entry_id, "title": meta.get("title", "")})
    return jsonify({"fixed": len(fixed), "entries": fixed})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
