"""Bounded official-source candidates for lessons; candidates are not evidence."""
import re
from documentation import validate_urls
from source_routing import CATALOG


def lesson_urls(context, draft, meta):
    if 'reference_urls' in meta:
        return validate_urls(meta['reference_urls'])
    text = ' '.join(str(context.get(key) or '') for key in ('title', 'course_title', 'lesson_objective', 'lesson_outline')) + ' ' + draft
    candidates = []
    # Read the document headers themselves for attributed PEP types/statuses.
    peps = list(dict.fromkeys(re.findall(r'\bPEP\s*0*(\d{1,4})\b', text, re.I)))
    if re.search(r'\bPEP\b', text, re.I):
        candidates.append('https://peps.python.org/pep-0001/')
    for number in peps[:2]:
        candidates.append(f'https://peps.python.org/pep-{int(number):04d}/')
    if re.search(r'\bRFC\b', text, re.I):
        candidates.append('https://www.rfc-editor.org/rfc/rfc7841.html')
    if re.search(r'\b(intellij|jetbrains)\b', text, re.I):
        candidates.append('https://www.jetbrains.com/help/idea/discover-intellij-idea.html')
    if re.search(r'\beclipse\b', text, re.I):
        candidates.extend(['https://www.eclipse.org/ide/', 'https://www.eclipse.org/legal/epl-2.0/'])
    if re.search(r'\b(vs\s*code|visual studio code|vscode)\b', text, re.I):
        candidates.append('https://code.visualstudio.com/docs/java/java-tutorial' if re.search(r'\bjava\b', text, re.I) else 'https://code.visualstudio.com/docs')
    if re.search(r'\bpython\b', text, re.I):
        if re.search(r'\b(list|lista|remove|append|dict|tipos|types)\b', text, re.I):
            candidates.append('https://docs.python.org/3/library/stdtypes.html')
        if re.search(r'\b(sum|min|max|len|promedio|average)\b', text, re.I):
            candidates.append('https://docs.python.org/3/library/functions.html')
        if re.search(r'\b(algoritmo|algorítmico|algorithm|algorítmica)\b', text, re.I):
            candidates.append('https://xlinux.nist.gov/dads/HTML/algorithm.html')
        candidates.append('https://docs.python.org/3/reference/index.html')
    # Other catalogued technologies get their own documentation, never a
    # guessed SQL dialect or an arbitrary model-supplied destination.
    for technology, catalog in CATALOG.items():
        if technology != 'python' and re.search(r'\b' + re.escape(technology) + r'\b', text, re.I):
            candidates.append(catalog['concept'])
    return list(dict.fromkeys(candidates))[:6]


def lesson_documents(consult, context, draft, meta):
    urls = lesson_urls(context, draft, meta)
    sources, failures = [], []
    query = ' '.join(re.findall(r'\b(?:PEP\s*\d+|RFC|list\.remove|sum|min|len|algorithm|deterministic)\b', draft, re.I)) or str(context.get('title', ''))
    # Reuse the existing retrieval limits, DNS checks and redirect checks.
    for start in range(0, len(urls), 3):
        evidence = consult(urls[start:start + 3], query=query)
        sources.extend(evidence['sources']); failures.extend(evidence['failures'])
    return {'status': 'consulted' if sources else 'unavailable', 'sources': sources, 'failures': failures}
