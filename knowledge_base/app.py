import os
import json
import re
import subprocess
import shutil
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_file
import mistune

app = Flask(__name__)

BASE_DIR = Path(__file__).parent
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
KNOWLEDGE_DIR.mkdir(exist_ok=True)
INDEX_FILE = DATA_DIR / "index.json"


def load_index():
    if INDEX_FILE.exists():
        return json.loads(INDEX_FILE.read_text())
    return {}


def save_index(index):
    INDEX_FILE.write_text(json.dumps(index, indent=2, ensure_ascii=False))


def slugify(text):
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text


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


def render_markdown(md_text):
    renderer = mistune.create_markdown(
        plugins=["strikethrough", "table", "url"],
    )
    return renderer(md_text)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tree")
def get_tree():
    index = load_index()
    tree = {}
    for entry_id, meta in index.items():
        cat = meta["category"]
        topic = meta["topic"]
        tree.setdefault(cat, {}).setdefault(topic, []).append({
            "id": entry_id,
            "title": meta["title"],
            "created_at": meta.get("created_at", ""),
        })
    return jsonify(tree)


@app.route("/api/entry/<entry_id>")
def get_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"
    if not path.exists():
        return jsonify({"error": "File not found"}), 404
    raw = path.read_text()
    html = render_markdown(raw)
    return jsonify({"meta": meta, "markdown": raw, "html": html})


@app.route("/api/entry", methods=["POST"])
def create_entry():
    data = request.json
    raw_text = data.get("raw_text", "").strip()
    title = data.get("title", "").strip()
    category = data.get("category", "").strip()
    topic = data.get("topic", "").strip()

    if not all([raw_text, title, category, topic]):
        return jsonify({"error": "Missing fields"}), 400

    md_content = smart_parse(raw_text)
    entry_id = slugify(title)
    index = load_index()

    # avoid collisions
    base_id = entry_id
    counter = 1
    while entry_id in index:
        entry_id = f"{base_id}-{counter}"
        counter += 1

    folder = KNOWLEDGE_DIR / slugify(category) / slugify(topic)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{entry_id}.md").write_text(md_content)

    index[entry_id] = {
        "title": title,
        "category": slugify(category),
        "category_label": category,
        "topic": slugify(topic),
        "topic_label": topic,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    save_index(index)

    return jsonify({"id": entry_id, "message": "Saved"})


@app.route("/api/entry/<entry_id>", methods=["PUT"])
def update_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    data = request.json
    raw_text = data.get("raw_text", "").strip()
    title = data.get("title", "").strip()
    category = data.get("category", "").strip()
    topic = data.get("topic", "").strip()
    if not raw_text:
        return jsonify({"error": "Missing content"}), 400

    meta = index[entry_id]
    old_path = KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"
    md_content = smart_parse(raw_text)

    # Update file — if category/topic changed, move the file
    new_category = slugify(category) if category else meta["category"]
    new_topic = slugify(topic) if topic else meta["topic"]
    new_folder = KNOWLEDGE_DIR / new_category / new_topic
    new_folder.mkdir(parents=True, exist_ok=True)
    new_path = new_folder / f"{entry_id}.md"

    if old_path != new_path and old_path.exists():
        old_path.unlink()

    new_path.write_text(md_content)

    # Update index metadata
    if title:
        index[entry_id]["title"] = title
    if category:
        index[entry_id]["category"] = new_category
        index[entry_id]["category_label"] = category
    if topic:
        index[entry_id]["topic"] = new_topic
        index[entry_id]["topic_label"] = topic

    save_index(index)
    return jsonify({"message": "Updated"})


@app.route("/api/entry/<entry_id>", methods=["DELETE"])
def delete_entry(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"
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
        path = KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"
        if path.exists():
            content = path.read_text().lower()
            if q in content or q in meta["title"].lower():
                snippet = _extract_snippet(path.read_text(), q)
                results.append({
                    "id": entry_id,
                    "title": meta["title"],
                    "category_label": meta.get("category_label", meta["category"]),
                    "topic_label": meta.get("topic_label", meta["topic"]),
                    "snippet": snippet,
                })
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
    md = smart_parse(raw_text)
    html = render_markdown(md)
    return jsonify({"markdown": md, "html": html})


@app.route("/api/export/<entry_id>/md")
def export_md(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    path = KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"
    return send_file(path, as_attachment=True, download_name=f"{entry_id}.md")


@app.route("/api/export/<entry_id>/pdf")
def export_pdf(entry_id):
    index = load_index()
    if entry_id not in index:
        return jsonify({"error": "Not found"}), 404
    meta = index[entry_id]
    md_path = KNOWLEDGE_DIR / meta["category"] / meta["topic"] / f"{entry_id}.md"
    pdf_path = DATA_DIR / f"{entry_id}.pdf"

    if not shutil.which("pandoc"):
        return jsonify({"error": "pandoc not installed"}), 500

    md_content = md_path.read_text()
    # prepend YAML front matter for pandoc styling
    front_matter = f"""---
title: "{meta['title']}"
author: "Knowledge Base"
date: "{meta.get('created_at', '')[:10]}"
geometry: margin=2.5cm
fontsize: 11pt
mainfont: "DejaVu Serif"
monofont: "DejaVu Sans Mono"
colorlinks: true
---

"""
    tmp_md = DATA_DIR / f"{entry_id}_tmp.md"
    tmp_md.write_text(front_matter + md_content)

    result = subprocess.run(
        ["pandoc", str(tmp_md), "-o", str(pdf_path), "--pdf-engine=xelatex"],
        capture_output=True, text=True
    )
    tmp_md.unlink(missing_ok=True)

    if result.returncode != 0:
        return jsonify({"error": result.stderr}), 500

    return send_file(pdf_path, as_attachment=True, download_name=f"{entry_id}.pdf")


@app.route("/api/categories")
def get_categories():
    index = load_index()
    cats = {}
    for meta in index.values():
        cat = meta["category"]
        cats[cat] = meta.get("category_label", cat)
    return jsonify(cats)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
