"""Read-only course target discovery; links are saved through the normal editor."""
import re
import unicodedata
from collections import defaultdict
import mistune
from flask import request, jsonify


def plain(tokens):
    return ''.join(plain(t['children']) if 'children' in t else
                   (' ' if t['type'] in ('softbreak', 'linebreak') else
                    t.get('raw', '') if t['type'] in ('text', 'codespan') else '')
                   for t in tokens)


def heading_key(text):
    return ' '.join(unicodedata.normalize('NFC', text).split())


def topic_key(text):
    text = re.sub(r'^\s*(?:\d+(?:\.\d+)*[.)\-:]\s*|\d+(?:\.\d+)*\s+)', '', text)
    text = ''.join(c for c in unicodedata.normalize('NFKD', text).casefold()
                   if not unicodedata.combining(c))
    return ' '.join(re.sub(r'[^\w]+', ' ', text).replace('_', ' ').split())


def headings(markdown):
    result = []
    def visit(tokens):
        for token in tokens:
            if token['type'] == 'heading':
                result.append(heading_key(plain(token.get('children', []))))
            elif token['type'] not in ('block_code', 'block_html'):
                visit(token.get('children', []))
    visit(mistune.create_markdown(renderer='ast')(markdown))
    return result


def register_course_topic_links(app, ns):
    def targets(course):
        entries = ns['load_index']()
        result = []
        for entry_id, meta in entries.items():
            if meta.get('type') != 'course' or meta.get('course') != course or meta.get('database_deleted'):
                continue
            path = ns['_entry_path'](entry_id, meta)
            if not path.exists():
                continue
            content = ns['_strip_duplicate_heading_md'](path.read_text(), meta.get('title', ''))
            counts = defaultdict(int)
            base = dict(entry_id=entry_id, title=meta.get('title', ''),
                        module=meta.get('module_label', meta.get('module', '')), course_id=course)
            result.append(dict(base, id=entry_id + ':page', heading=None, occurrence=0))
            for i, heading in enumerate(headings(content)):
                occurrence = counts[heading]
                counts[heading] += 1
                result.append(dict(base, id=entry_id + ':' + str(i), heading=heading, occurrence=occurrence))
        return result

    @app.post('/api/roadmap/course-topics')
    def course_topics():
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify(error='Solicitud no válida.'), 400
        course, topics = data.get('course_id'), data.get('topics')
        if not isinstance(course, str) or course not in ns['load_courses']()['courses']:
            return jsonify(error='Elige un curso existente.'), 400
        if not isinstance(topics, list) or len(topics) > 1000 or any(
            not isinstance(t, dict) or not isinstance(t.get('key'), str) or len(t['key']) > 300
            or not isinstance(t.get('text'), str) or len(t['text']) > 2000 for t in topics
        ):
            return jsonify(error='El temario debe contener como máximo 1000 subtemas de hasta 2000 caracteres.'), 400
        choices = targets(course)
        exact = defaultdict(list)
        for choice in choices:
            exact[topic_key(choice['heading'] or choice['title'])].append(choice)
        token_sets = [(choice, set(topic_key(choice['heading'] or choice['title']).split())) for choice in choices]
        results = []
        for topic in topics:
            matches = exact.get(topic_key(topic['text']), [])
            # Prefer an explicit heading to the same lesson's page-level duplicate.
            heading_entries = {c['entry_id'] for c in matches if c['heading'] is not None}
            matches = [c for c in matches if c['heading'] is not None or c['entry_id'] not in heading_entries]
            tokens = set(topic_key(topic['text']).split())
            candidates = matches or [choice for choice, _ in sorted(
                token_sets, key=lambda item: len(tokens & item[1]) / max(1, len(tokens | item[1])), reverse=True)[:6]]
            results.append(dict(key=topic['key'], selected=matches[0]['id'] if len(matches) == 1 else None,
                                candidates=[c['id'] for c in candidates]))
        return jsonify(course_id=course, targets=choices, results=results)

    @app.post('/api/roadmap/course-topic/validate')
    def validate_course_topic():
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify(error='Solicitud no válida.'), 400
        entry_id, course = data.get('entry_id'), data.get('course_id')
        heading, occurrence = data.get('heading'), data.get('occurrence', 0)
        if not isinstance(entry_id, str) or not isinstance(course, str) or (heading is not None and not isinstance(heading, str)) or type(occurrence) is not int or occurrence < 0 or (heading is None and occurrence != 0):
            return jsonify(error='Vínculo de lección no válido.'), 400
        meta = ns['load_index']().get(entry_id)
        if not meta or meta.get('type') != 'course' or meta.get('course') != course or meta.get('database_deleted'):
            return jsonify(error='La lección ya no pertenece a este curso o no está disponible.'), 404
        path = ns['_entry_path'](entry_id, meta)
        if not path.exists():
            return jsonify(error='La lección no está disponible.'), 404
        content = ns['_strip_duplicate_heading_md'](path.read_text(), meta.get('title', ''))
        found = None
        if heading is None or sum(1 for text in headings(content) if text == heading) > occurrence:
            found = dict(entry_id=entry_id, course_id=course, title=meta.get('title', ''), heading=heading, occurrence=occurrence)
        if found is None:
            return jsonify(error='El apartado ha cambiado. Vuelve a vincularlo desde el temario.'), 409
        return jsonify(target=found)
