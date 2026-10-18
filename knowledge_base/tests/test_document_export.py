"""First-delivery page/course document exports use temporary stores only."""
import json
from pathlib import Path
import pytest
import app as application

CONTENT = '# Documento QA\n\nMarcador ATLAS-DOC-V1-7319.\n\n## Ejemplo\n\n```python\nprint("conservado")\n```\n\n| Campo | Valor |\n| --- | --- |\n| Resultado | 42 |\n'

@pytest.mark.parametrize('kind',['page','course'])
@pytest.mark.parametrize('fmt',['md','html','pdf','json'])
def test_document_export_keeps_saved_content_and_original(auth_client,kind,fmt):
    client=auth_client
    if kind=='course':
        course=client.post('/api/courses',json={'label':'Curso QA'}).json['id']
        result=client.post('/api/courses/entry',json={'course':course,'module':'Módulo QA','title':'Documento QA','raw_text':CONTENT})
    else:result=client.post('/api/entry',json={'entry_type':'page','title':'Documento QA','raw_text':CONTENT,'already_markdown':True})
    assert result.status_code in (200,201),result.json
    key=result.json['id'];meta=application.load_index()[key]
    path=application._entry_path(key,meta);original=path.read_bytes()
    history={str(p):p.read_bytes() for p in Path(application.KNOWLEDGE_DIR).rglob('*.md')}
    response=client.get(f'/api/export/{key}/{fmt}')
    assert response.status_code==200 and 'attachment' in response.headers['Content-Disposition']
    if fmt=='pdf':
        import fitz
        doc=fitz.open(stream=response.data,filetype='pdf');text='\n'.join(page.get_text() for page in doc)
        assert response.data.startswith(b'%PDF') and len(doc)>0
    elif fmt=='json':
        data=response.json;assert data['id']==key and data['content']==CONTENT.strip();text=data['content']
    else:text=response.data.decode()
    assert 'ATLAS-DOC-V1-7319' in text and 'conservado' in text and '42' in text
    if fmt=='html':assert '<html' in text.lower() and '<table' in text.lower()
    assert path.read_bytes()==original and application.load_index()[key]==meta
    assert {str(p):p.read_bytes() for p in Path(application.KNOWLEDGE_DIR).rglob('*.md')}==history
