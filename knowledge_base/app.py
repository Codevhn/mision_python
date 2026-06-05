import os
import json
import re
import subprocess
import shutil
import uuid
import base64
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_file, session, redirect, url_for
import mistune

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")

KB_PASSWORD = os.environ.get("KB_PASSWORD", "")

@app.before_request
def require_auth():
    if not KB_PASSWORD:
        return
    public = {"/login", "/logout"}
    if request.path in public or request.path.startswith("/static/"):
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


def _entry_path(entry_id, meta):
    if meta.get("type") == "course":
        return KNOWLEDGE_DIR / "courses" / meta["course"] / meta["module"] / f"{entry_id}.md"
    if meta.get("type") == "teamspace":
        return KNOWLEDGE_DIR / "teamspace" / meta.get("teamspace", "general") / f"{entry_id}.md"
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
        renderer=CodeBlockRenderer(),
        plugins=["strikethrough", "table", "url"],
    )
    html = renderer(processed)
    html = post_process_wikilinks(html)
    return html


def _build_pdf_html(title, date, body_html):
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{ margin: 1.8cm 1.5cm; }}
  body {{ font-family: "DejaVu Sans", sans-serif; font-size: 10.5pt; color: #1a1a1a; line-height: 1.7; }}
  h1 {{ font-size: 1.6em; border-bottom: 2.5px solid #1793d1; padding-bottom: 8px; color: #0a0a0a; margin-top: 0; margin-bottom: 0.7em; letter-spacing: -0.02em; }}
  h2 {{ font-size: 1.15em; color: #fff; background: #1793d1; padding: 5px 10px; margin-top: 1.6em; margin-bottom: 0.5em; border-radius: 3px; letter-spacing: 0.03em; text-transform: uppercase; }}
  h3 {{ font-size: 1em; color: #1793d1; font-weight: 700; margin-top: 1.3em; margin-bottom: 0.3em; border-bottom: 1px solid #d0e8f5; padding-bottom: 3px; }}
  h4 {{ font-size: 0.92em; color: #555; font-weight: 700; margin-top: 1em; margin-bottom: 0.3em; text-transform: uppercase; letter-spacing: 0.05em; font-style: italic; }}
  p  {{ margin: 0 0 0.7em; }}
  code {{ font-family: "DejaVu Sans Mono", monospace; font-size: 0.82em; background: #f4f4f4; padding: 1px 5px; border: 1px solid #ddd; border-radius: 3px; }}
  pre {{
    font-family: "DejaVu Sans Mono", monospace;
    font-size: 0.78em;
    background: #f7f7f7;
    border: 1px solid #ccc;
    border-left: 3px solid #1793d1;
    padding: 10px 12px;
    margin: 0.9em 0;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
    page-break-inside: avoid;
    line-height: 1.5;
  }}
  pre code {{ background: none; border: none; padding: 0; font-size: inherit; word-break: break-all; }}
  blockquote {{ border-left: 3px solid #1793d1; padding: 5px 14px; color: #555; background: #f0f7fc; margin: 0.9em 0; border-radius: 0 3px 3px 0; }}
  table {{ border-collapse: collapse; width: 100%; margin: 0.9em 0; font-size: 0.88em; page-break-inside: avoid; }}
  th {{ background: #1793d1; color: #fff; padding: 6px 9px; text-align: left; }}
  td {{ padding: 5px 9px; border: 1px solid #ddd; vertical-align: top; word-break: break-word; }}
  tr:nth-child(even) td {{ background: #f9f9f9; }}
  ul, ol {{ margin: 0.4em 0 0.8em 1.4em; padding: 0; }}
  li {{ margin: 3px 0; line-height: 1.6; }}
  .meta {{ font-size: 0.78em; color: #777; margin-bottom: 1.6em; font-family: "DejaVu Sans Mono", monospace; }}
  hr {{ border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }}
  a {{ color: #1793d1; text-decoration: none; }}
</style>
</head>
<body>
<div class="meta">{date}</div>
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
    css = _file_hash(_os.path.join(_STATIC_DIR, 'kanban.css'))
    js  = _file_hash(_os.path.join(_STATIC_DIR, 'kanban.js'))
    return f"{css}-{js}"

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
        if meta.get("type") in ("course", "teamspace"):
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

    # knowledge entry (default)
    category = data.get("category", "").strip()
    topic = data.get("topic", "").strip()
    if not all([category, topic]):
        return jsonify({"error": "Missing fields"}), 400

    folder = KNOWLEDGE_DIR / slugify(category) / slugify(topic)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{entry_id}.md").write_text(md_content)

    index[entry_id] = {
        "uid": uuid.uuid4().hex[:8],
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
    return jsonify({"id": entry_id, "message": "Saved"})


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


@app.route("/api/entry/<entry_id>", methods=["DELETE"])
def delete_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = _entry_path(entry_id, meta)
    if path.exists():
        path.unlink()
    del index[entry_id]
    save_index(index)
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
    md_path = _entry_path(entry_id, meta)
    pdf_path = DATA_DIR / f"{entry_id}.pdf"

    from weasyprint import HTML as WeasyprintHTML, CSS
    md_content = md_path.read_text()
    body_html = render_markdown(md_content)
    date = meta.get("created_at", "")[:10]
    full_html = _build_pdf_html(meta["title"], date, body_html)
    WeasyprintHTML(string=full_html).write_pdf(str(pdf_path))
    return send_file(pdf_path, as_attachment=True, download_name=f"{entry_id}.pdf")


@app.route("/api/categories")
def get_categories():
    index = load_index()
    cats = {}
    for meta in index.values():
        if meta.get("type") == "course":
            continue
        cat = meta["category"]
        cats[cat] = meta.get("category_label", cat)
    return jsonify(cats)


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
        if meta.get("type") == "course":
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
            if meta.get("type") == "course":
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
        if meta.get("type") == "course":
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
        if meta.get("type") == "course":
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
        {"id": eid, "title": m.get("title", eid), "icon": m.get("icon", "")}
        for eid, m in index.items()
        if m.get("parent_id") == entry_id
    ]
    children.sort(key=lambda c: c["title"])
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
    new_label = body.get("label", "").strip()
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
    tree = {}
    for entry_id, meta in index.items():
        if meta.get("type") != "course":
            continue
        course = meta["course"]
        module = meta["module"]
        tree.setdefault(course, {
            "label": meta.get("course_label", course),
            "modules": {}
        })
        tree[course]["modules"].setdefault(module, {
            "label": meta.get("module_label", module),
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
    course = data.get("course", "").strip()
    module = data.get("module", "").strip()
    title  = data.get("title", "").strip()
    raw    = data.get("raw_text", "").strip()
    icon   = data.get("icon", "").strip()
    if not all([course, module, title, raw]):
        return jsonify({"error": "Faltan campos"}), 400
    course_slug = slugify(course)
    courses_data = load_courses()
    if course_slug not in courses_data["courses"]:
        return jsonify({"error": f"El curso '{course}' no existe. Crea la entidad curso primero."}), 400
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
    index[entry_id] = {
        "uid": uuid.uuid4().hex[:8],
        "type": "course",
        "title": title,
        "course": course_slug,
        "course_label": course,
        "module": module_slug,
        "module_label": module,
        "created_at": now,
        "starred": False,
        "pinned": False,
        "status": "pendiente",
        "order": 0,
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
    RELATIONS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


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

    # Course entities (courses.json)
    try:
        for slug, course in load_courses().get("courses", {}).items():
            uid = course.get("uid")
            if uid:
                registry[uid] = {
                    "type":  "course",
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
