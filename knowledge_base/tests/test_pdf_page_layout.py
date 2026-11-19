"""Measure actual A4 output; fitting must not crop text or alter the source."""
import io
import json
import zipfile
import pytest
import pymupdf
import app as application
from test_database_workspace import workspace, create
from test_database_export import write_body


def ritual(steps=9):
    body='## Materiales\n\n- Papel y un cuaderno.\n- Un lugar tranquilo para trabajar.\n\n## Pasos de la práctica\n\n'
    for i in range(1,steps+1):
        body+=f'### Paso {i}\n\n- Marcador{i:03d}: Observa el espacio con atención y escribe una idea importante en tu cuaderno. Lee lo escrito con calma y conserva todos los detalles para volver a consultarlos.\n\n'
    return body+'\nÚltimo marcador: FINAL-CONSERVADO.\n'


def document(response):
    assert response.status_code==200,response.json
    return pymupdf.open(stream=response.data,filetype='pdf')


@pytest.mark.parametrize('record',[True,False])
def test_measured_fit_reduces_two_pages_to_one_and_keeps_every_item(workspace,record):
    client,base,_=workspace;body=ritual()
    if record:
        row=create(client,base,title='Práctica breve');key=row['id'];write_body(client,row,body)
        endpoint=base+'/rows/'+key+'/export'
    else:
        key=client.post('/api/entry',json={'entry_type':'page','title':'Práctica breve','raw_text':body,'already_markdown':True}).json['id']
        endpoint='/api/export/'+key+'/document'
    original=application._entry_path(key,application.load_index()[key]).read_bytes()
    response=client.post(endpoint,json={'format':'pdf'})
    with document(response) as normal:
        assert len(normal)==2,'Fixture must reproduce the unwanted extra page'
        assert response.headers['X-Atlas-PDF-Pages']=='2'
    response=client.post(endpoint,json={'format':'pdf','pdf_layout':'one_page'})
    with document(response) as fitted:
        assert len(fitted)==1 and response.headers['X-Atlas-PDF-Pages']=='1'
        assert 9<=float(response.headers['X-Atlas-PDF-Font-Size'])<=10.5
        assert response.headers['X-Atlas-PDF-Compact']=='1'
        page=fitted[0];assert abs(page.rect.width-595.28)<1 and abs(page.rect.height-841.89)<1
        text=page.get_text()
        for i in range(1,10):assert f'Marcador{i:03d}' in text
        assert 'FINAL-CONSERVADO' in text
        for block in page.get_text('dict')['blocks']:
            if 'lines' not in block:continue
            for line in block['lines']:
                for span in line['spans']:
                    assert span['bbox'][0]>=0 and span['bbox'][1]>=0 and span['bbox'][2]<=page.rect.width+.5 and span['bbox'][3]<=page.rect.height+.5
    assert application._entry_path(key,application.load_index()[key]).read_bytes()==original


def test_manual_font_is_applied_without_changing_default_pagination(workspace):
    client,base,_=workspace;row=create(client,base);write_body(client,row,'MARCADOR-TAMAÑO, texto del cuerpo.')
    endpoint=base+'/rows/'+row['id']+'/export'
    for size in (9,10.5,12,14):
        response=client.post(endpoint,json={'format':'pdf','pdf_font_size':size})
        with document(response) as pdf:
            spans=[span for block in pdf[0].get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans'] if 'MARCADOR' in span['text']]
            assert len(spans)==1 and abs(spans[0]['size']-size)<.1
            assert response.headers['X-Atlas-PDF-Compact']=='0'
    # An already fitting note should keep its normal layout even when requested.
    response=client.post(endpoint,json={'format':'pdf','pdf_layout':'one_page'})
    assert response.headers['X-Atlas-PDF-Compact']=='0'


def test_impossible_fit_returns_explanation_without_truncation_or_download(workspace):
    client,base,_=workspace;row=create(client,base);body=ritual(80);write_body(client,row,body)
    endpoint=base+'/rows/'+row['id']+'/export'
    result=client.post(endpoint,json={'format':'pdf','pdf_layout':'one_page'})
    assert result.status_code==422 and result.json['code']=='pdf_one_page_unavailable'
    assert 'no cabe' in result.json['error'] and '9 pt' in result.json['error']
    assert 'Content-Disposition' not in result.headers
    normal=client.post(endpoint,json={'format':'pdf'})
    with document(normal) as pdf:assert 'FINAL-CONSERVADO' in pdf[-1].get_text()
    assert application._entry_path(row['id'],application.load_index()[row['id']]).read_text()==body


def test_layout_applies_to_each_pdf_in_explicit_zip(workspace):
    client,base,_=workspace;row=create(client,base);write_body(client,row,ritual())
    child=client.post('/api/entry',json={'entry_type':'page','parent_id':row['id'],'title':'Hija','raw_text':'Contenido hija.','already_markdown':True}).json['id']
    result=client.post(base+'/rows/'+row['id']+'/export',json={'format':'pdf','pdf_layout':'one_page','archive':True,'include_subpages':True})
    assert result.status_code==200,result.json
    with zipfile.ZipFile(io.BytesIO(result.data)) as archive:
        manifest=json.loads(archive.read('manifest.json'))
        assert {item['id'] for item in manifest['pdf_layouts']}=={row['id'],child}
        assert all(item['pages']==1 for item in manifest['pdf_layouts'])
        for path in archive.namelist():
            if path.endswith('.pdf'):
                with pymupdf.open(stream=archive.read(path),filetype='pdf') as pdf:assert len(pdf)==1


@pytest.mark.parametrize('options',[{'pdf_font_size':True},{'pdf_font_size':'9'},{'pdf_font_size':8},{'pdf_font_size':15},{'pdf_font_size':None},{'pdf_layout':'crop'},{'pdf_layout':True},{'format':'html','pdf_layout':'one_page'}])
def test_invalid_layout_options_are_rejected(workspace,options):
    client,base,_=workspace;row=create(client,base)
    assert client.post(base+'/rows/'+row['id']+'/export',json={'format':'pdf',**options}).status_code==400
