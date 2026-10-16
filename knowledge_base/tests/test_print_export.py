import app as app_module


def test_print_expands_nested_toggles_without_changing_code():
    source = ':::toggle-h3 Ritual\nTexto\n:::toggle-h2 Interior\nMás texto\n:::\n:::toggle Lista\nPaso\n:::\n::: \n\n```text\n:::toggle-h3 Literal\n::: \n```'
    result = app_module._print_markdown(source)
    assert '### Ritual' in result
    assert '## Interior' in result
    assert '**Lista**' in result
    assert result.count(':::toggle') == 1
    assert '```text\n:::toggle-h3 Literal\n::: \n```' in result
    assert 'Más texto' in result


def test_section_html_is_clean_and_escaped(auth_client):
    response = auth_client.post('/api/export/section', json={
        'title': 'Tema <script>alert(1)</script>',
        'markdown': ':::toggle-h3 Mi ritual\n**Materiales**\n\n- Vela 🕯️\n- Papel\n:::',
    })
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert ':::toggle' not in html
    assert '<h3' in html and 'Mi ritual' in html
    assert '<li>' in html and 'Vela' in html
    assert '<script>' not in html
    assert 'Noto Emoji' in html
    assert '<div class="pdf-toc">' not in html
    assert 'size: A4' in html


def test_selected_pdf_is_a_real_pdf(auth_client):
    response = auth_client.post('/api/export/section', json={
        'title': 'Ritual para ser más asertivo',
        'markdown': ':::toggle-h3 Ritual para ser más asertivo\n### Materiales\n\n- Papel\n\n🕯️ Texto legible.\n:::',
        'format': 'pdf',
    })
    assert response.status_code == 200
    assert response.mimetype == 'application/pdf'
    assert response.data.startswith(b'%PDF-')


def test_section_requires_authentication(client):
    assert client.post('/api/export/section', json={'title': 'Tema', 'markdown': 'Texto'}).status_code in (302, 401)


def test_section_rejects_invalid_payload(auth_client):
    for data in [[], {}, {'title':'Tema','markdown':''}, {'title':'Tema','markdown':'Texto','format':'exe'}, {'title':'Tema','markdown':'x'*300001}]:
        assert auth_client.post('/api/export/section', json=data).status_code == 400


def test_emoji_font_does_not_change_numbers_or_markup():
    html = app_module._pdf_emoji_html('<h3>Fase 1 🕯️</h3><a href="/uno">Paso 2</a>')
    assert '<h3>Fase 1 <span class="pdf-emoji">🕯️</span></h3>' in html
    assert '<a href="/uno">Paso 2</a>' in html


def test_legacy_inline_marks_render_as_formatting_for_print():
    source = '**DI EN VOZ ALTA: ** **"Una frase completa."**\n**"Otra afirmación." **\n\n*Una observación en cursiva. *'
    html = app_module.render_markdown(source, print_mode=True)
    assert '**' not in html and '*Una' not in html
    assert '<strong>DI EN VOZ ALTA: </strong>' in html
    assert '<em>Una observación en cursiva. </em>' in html
    assert '<br' in html


def test_print_keeps_code_and_literal_multiplication():
    source = '`**literal **` y 2 * 3 * 4\n\n```python\nx = "**literal**"\n```\n\n**negrita _con cursiva_ **'
    html = app_module.render_markdown(source, print_mode=True)
    assert '<code>**literal **</code>' in html
    assert '2 * 3 * 4' in html
    assert '**literal**' in html
    assert '<strong>negrita <em>con cursiva</em> </strong>' in html


def test_print_conversation_uses_same_emphasis_rules():
    html = app_module.render_markdown('MI RESPUESTA: **Hola. **\n\n**Respuesta correcta. **', print_mode=True)
    assert '**' not in html
    assert '<strong>Hola. </strong>' in html


def test_whole_entry_html_uses_print_dialect(auth_client):
    created = auth_client.post('/api/entry', json={'title':'Documento de prueba', 'category':'personal', 'topic':'notas', 'already_markdown':True, 'raw_text':':::toggle-h3 Tema\n**Etiqueta: ** **Texto en negrita. **\n:::'})
    entry_id = created.get_json()['id']
    response = auth_client.get(f'/api/export/{entry_id}/html')
    assert response.status_code == 200
    body = response.get_data(as_text=True).split('<body>')[1]
    assert ':::toggle' not in body and '**' not in body
    assert '<strong>Etiqueta: </strong>' in body
