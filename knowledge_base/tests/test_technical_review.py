import json
import pytest
from technical_review import audit_claims, output_issues, review_constraints

ORIGINAL = '''requirements.txt garantiza reproducibilidad y un entorno idéntico.
### Formato y sintaxis
- Variaciones: --all, --exclude-editable, --exclude paquete.
pip freeze captura todos los paquetes con versiones exactas.
pyproject.toml es una herramienta.'''
DOCS = [
 {'url':'https://pip.pypa.io/en/stable/cli/pip_freeze/', 'excerpt':'pip freeze reports what is installed; it does not compute a lockfile or a solver result. By default some packaging tools are omitted. --all includes these tools.'},
 {'url':'https://pip.pypa.io/en/stable/reference/requirements-file-format/', 'excerpt':'Each line of the requirements file indicates something to be installed, or arguments to pip install. It is not a specification of a complete operating system environment.'},
]


def test_claims_require_literal_evidence_and_original_text():
    claims = [
      {'claim':'pip freeze captura todos los paquetes con versiones exactas.', 'status':'contradicted', 'source_url':DOCS[0]['url'], 'quote':'By default some packaging tools are omitted.', 'correction':'Hay exclusiones por defecto.'},
      {'claim':'pyproject.toml es una herramienta.', 'status':'supported', 'source_url':DOCS[1]['url'], 'quote':'Invented evidence that is not in the document.', 'correction':'Afirmación correcta'},
      {'claim':'requirements.txt garantiza reproducibilidad y un entorno idéntico.', 'status':'supported', 'source_url':'https://invented.example/', 'quote':DOCS[0]['excerpt'], 'correction':'Afirmación correcta'},
    ]
    result = audit_claims(lambda *a, **k:(json.dumps({'claims':claims}),None), ORIGINAL, DOCS, 'deepseek','model')
    assert [c['status'] for c in result['claims']] == ['contradicted','unconfirmed','unconfirmed']
    assert result['claims'][0]['quote'] == claims[0]['quote']
    assert all(not c['source_url'] and not c['quote'] for c in result['claims'][1:])
    assert 'Afirmación correcta' not in json.dumps(result)


@pytest.mark.parametrize('result', ['', None, '{}', '{"claims":[]}', '{"claims":[{"claim":"texto no presente", "status":"supported"}]}'])
def test_bad_audit_is_not_treated_as_success(result):
    with pytest.raises(ValueError):
        audit_claims(lambda *a, **k:(result,None), ORIGINAL, DOCS,'deepseek','model')


def test_no_documents_does_not_call_model_or_claim_contrast():
    result = audit_claims(lambda *a, **k:pytest.fail('No evidence to audit'), ORIGINAL, [],'deepseek','model')
    assert result == {'status':'unavailable','claims':[]}


def test_known_requirements_regression_is_rejected():
    assert len(output_issues(ORIGINAL,'requirements.txt')) == 2
    corrected = '''requirements.txt declara requisitos para pip install. No garantiza reproducibilidad ni un entorno idéntico por sí solo.
### Formato y sintaxis
- requests==2.31.0
--all y --exclude son opciones de pip freeze, no del archivo.
python -m pip install -r requirements.txt'''
    assert output_issues(corrected,'requirements.txt') == []
    assert output_issues('Otro sistema garantiza reproducibilidad.', 'otro sistema') == []
    assert '--exclude-editable' in review_constraints(ORIGINAL,'requirements.txt')
