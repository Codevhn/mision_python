"""Read-only extraction of lesson topics, excluding developed lesson bodies."""
import unicodedata

import mistune
from mistune import BlockState
from mistune.renderers.markdown import MarkdownRenderer

from course_topic_links import plain


def lesson_topics(markdown, title=''):
    """Keep primary headings; support heading scaffolds and list-only outlines.

    A lesson's own H1 is document chrome. Deeper explanatory headings are not
    additional roadmap topics. Code, quotes, HTML and tables cannot supply
    headings because only top-level Markdown nodes are inspected.
    """
    tokens = mistune.create_markdown(renderer='ast')(markdown or '')
    key = lambda text: ' '.join(unicodedata.normalize('NFC', text).split()).casefold()
    def is_title(token):
        return token['type'] == 'heading' and key(plain(token.get('children', []))) == key(title)
    headings = [token for token in tokens if token['type'] == 'heading'
                and token['attrs']['level'] >= 2 and not is_title(token)]
    if headings:
        level = min(token['attrs']['level'] for token in headings)
        selected = [token for token in headings if token['attrs']['level'] == level]
    else:
        # Older imported outlines may consist only of topic list items. Do
        # not scrape instructional lists out of developed prose.
        body = [token for token in tokens if token['type'] != 'blank_line'
                and not is_title(token) and not (token['type'] == 'heading' and token['attrs']['level'] == 1)]
        if not body or any(token['type'] != 'list' for token in body):
            return []
        selected = []
        for token in body:
            for item in token.get('children', []):
                parts = [part for part in item.get('children', []) if part['type'] != 'blank_line']
                if len(parts) != 1 or parts[0]['type'] not in ('block_text', 'paragraph'):
                    return []
                selected.append(parts[0])
    renderer = MarkdownRenderer()
    result = []
    for token in selected:
        paragraph = {'type': 'paragraph', 'children': token.get('children', [])}
        label = ' '.join(renderer([paragraph], BlockState()).strip().splitlines())
        if label:
            result.append(label)
    return result
