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
        for number, page in enumerate(pdf, 1):
            footer = [word for word in page.get_text('words') if word[1] > page.rect.height - 55]
            assert len(footer) == 1 and footer[0][4] == str(number)
            assert abs((footer[0][0] + footer[0][2]) / 2 - page.rect.width / 2) < 1
        assert 'Lección de impresión' in pdf[-1].get_text()
