import app as app_module


def test_script_stripped():
    html = app_module.render_markdown("<script>alert('xss')</script>hola")
    assert "<script" not in html.lower()


def test_iframe_stripped():
    html = app_module.render_markdown('<iframe src="https://evil.example"></iframe>hola')
    assert "iframe" not in html.lower()


def test_onerror_stripped():
    html = app_module.render_markdown('<img src="x" onerror="alert(1)">')
    assert "onerror" not in html.lower()
    assert "alert" not in html.lower()


def test_javascript_url_removed():
    html = app_module.render_markdown("[click](javascript:alert(1))")
    assert "javascript:" not in html.lower()
    assert 'href="#harmful-link"' in html  # bleach neuters dangerous protocols


def test_allowed_structure_kept():
    md = "> [!TIP] Haz esto"
    html = app_module.render_markdown(md)
    assert 'class="alert alert-tip"' in html


def test_wikilink_kept():
    html = app_module.render_markdown("[[Mi Entrada]]")
    assert 'class="wikilink"' in html


def test_code_block_kept():
    html = app_module.render_markdown("```python\nprint(1)\n```")
    assert 'class="language-python"' in html


def test_table_kept():
    md = "| a | b |\n|---|---|\n| 1 | 2 |"
    html = app_module.render_markdown(md)
    assert "<table>" in html
    assert "<td>1</td>" in html


def test_inline_style_kept_but_sanitized():
    html = app_module.render_markdown('<span style="color:red">rojo</span>')
    assert "rojo" in html
    assert "color" in html


def test_chat_blocks_sanitized():
    md = "yo: hola\n\nMI RESPUESTA: <script>alert(1)</script>hola"
    html = app_module.render_markdown(md)
    assert "chat-bubble" in html
    assert "<script" not in html.lower()


def test_alert_content_with_script_stripped():
    html = app_module.render_markdown("> [!DANGER] <script>alert(1)</script>peligro")
    assert "<script" not in html.lower()
    assert "peligro" in html
