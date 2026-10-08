import pytest

import app as app_module


@pytest.mark.parametrize("body", [
    '<!DOCTYPE html><html><head><meta name="viewport"></head><body>Not found</body></html>',
    '\n<HTML lang="en"><body>Internal dashboard details</body></HTML>',
    '<head><script src="/_next/static/private.js"></script></head>',
])
def test_html_404_is_actionable_without_leaking_page(body):
    message = app_module._clean_ai_error(404, body)
    assert "404" in message
    assert "/v1/chat/completions" in message
    assert "<" not in message
    assert "private.js" not in message
    assert "Internal dashboard" not in message


def test_html_gateway_error_keeps_status_without_page():
    message = app_module._clean_ai_error(502, '<html><body>Gateway details</body></html>')
    assert "HTTP 502" in message
    assert "<" not in message
    assert "Gateway details" not in message


def test_provider_json_message_is_preserved():
    message = app_module._clean_ai_error(404, '{"error":{"message":"Unknown model: model-a"}}')
    assert "Unknown model: model-a" in message
    assert "página web" not in message
