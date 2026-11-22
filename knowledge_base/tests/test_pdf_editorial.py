"""Exercise the real export fetcher: bundled WOFF2 must reach the PDF."""
import pymupdf


def test_editorial_export_embeds_serif_and_preserves_code_and_pagination(auth_client):
    paragraphs = '\n\n'.join(f'Párrafo {i}: La práctica permite comprender el problema y comprobar el resultado. ' * 4 for i in range(30))
    markdown = '## Comprender el problema\n\nUn texto **importante** y una *observación*.\n\n```python\nprint("área")\n```\n\n' + paragraphs + '\n\nFIN-LECCIÓN'
    created = auth_client.post('/api/entry', json={'title':'Lección de impresión', 'entry_type':'page', 'already_markdown':True, 'raw_text':markdown}).get_json()
    response = auth_client.post('/api/export/' + created['id'] + '/document', json={'format':'pdf'})
    assert response.status_code == 200
    with pymupdf.open(stream=response.data, filetype='pdf') as pdf:
        assert len(pdf) > 1
        fonts = {font[3] for page in pdf for font in page.get_fonts()}
        assert any('Lora' in font for font in fonts), fonts
        assert any('Lora-Italic' in font for font in fonts), fonts
        assert any('JetBrains' in font for font in fonts), fonts
        text = '\n'.join(page.get_text() for page in pdf)
        assert 'FIN-LECCIÓN' in text and 'print("área")' in text
        assert f'1 / {len(pdf)}' in pdf[0].get_text()
        assert 'Atlas · Cuaderno de estudio' in pdf[0].get_text()
        assert 'Lección de impresión' in pdf[-1].get_text()
