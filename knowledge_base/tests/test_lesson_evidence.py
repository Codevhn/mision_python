from lesson_evidence import lesson_documents, lesson_urls


def test_official_candidates_cover_requested_classifications_and_language():
    context = {'course_title': 'Python', 'lesson_outline': ['PEP y RFC']}
    urls = lesson_urls(context, 'PEP 8 es estándar. Promedio de una lista: sum/min/len. Algoritmo determinista.', {})
    assert 'https://peps.python.org/pep-0008/' in urls
    assert 'https://peps.python.org/pep-0001/' in urls
    assert 'https://www.rfc-editor.org/rfc/rfc7841.html' in urls
    assert 'https://docs.python.org/3/library/stdtypes.html' in urls
    assert 'https://xlinux.nist.gov/dads/HTML/algorithm.html' in urls
    assert len(urls) <= 6
    assert not lesson_urls({}, 'https://localhost/evil https://arbitrary.example/evil', {})


def test_saved_references_and_unknown_domains_are_not_guessed():
    assert lesson_urls({'course_title': 'Python'}, 'PEP 8', {'reference_urls': []}) == []
    assert lesson_urls({}, '', {'reference_urls': ['https://example.org/guide']}) == ['https://example.org/guide']
    assert lesson_urls({'course_title': 'SQL'}, 'consultas', {}) == []
    assert lesson_urls({'course_title': 'Java'}, '', {}) == ['https://dev.java/learn/']


def test_tools_use_their_own_official_sources():
    urls = lesson_urls({'course_title': 'Java'}, 'IntelliJ IDEA, Eclipse IDE y Visual Studio Code', {})
    assert 'https://www.eclipse.org/legal/epl-2.0/' in urls
    assert 'https://www.jetbrains.com/help/idea/discover-intellij-idea.html' in urls
    assert 'https://code.visualstudio.com/docs/java/java-tutorial' in urls


def test_retrieval_batches_keep_existing_limits_and_report_missing_evidence():
    calls = []
    def consult(urls, **kwargs):
        assert len(urls) <= 3
        calls.extend(urls)
        return {'sources': [], 'failures': [{'url': url, 'reason': 'unavailable'} for url in urls]}
    result = lesson_documents(consult, {'course_title': 'Python'}, 'PEP 8 RFC listas list min sum algoritmo', {})
    assert result['status'] == 'unavailable'
    assert len(result['failures']) == len(calls)
    assert not result['sources']
