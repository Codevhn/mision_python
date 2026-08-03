import base64

import app as app_module

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _data_url(mime, raw):
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def test_svg_rejected(auth_client):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    resp = auth_client.post("/api/upload/cover", json={"dataUrl": _data_url("image/svg+xml", svg)})
    assert resp.status_code == 400


def test_text_as_png_rejected(auth_client):
    resp = auth_client.post("/api/upload/cover", json={"dataUrl": _data_url("image/png", b"plain text, not a png")})
    assert resp.status_code == 400
    assert "formato" in resp.get_json()["error"].lower()


def test_valid_png_accepted(auth_client):
    raw = _PNG_MAGIC + b"\x00" * 16
    resp = auth_client.post("/api/upload/cover", json={"dataUrl": _data_url("image/png", raw)})
    assert resp.status_code == 200
    url = resp.get_json()["url"]
    assert url.startswith("/static/covers/")


def test_valid_jpeg_accepted(auth_client):
    raw = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    resp = auth_client.post("/api/upload/cover", json={"dataUrl": _data_url("image/jpeg", raw)})
    assert resp.status_code == 200


def test_bad_webp_rejected(auth_client):
    raw = b"RIFF" + b"\x00" * 4 + b"XXXX" + b"\x00" * 8
    resp = auth_client.post("/api/upload/cover", json={"dataUrl": _data_url("image/webp", raw)})
    assert resp.status_code == 400


def test_oversize_rejected(auth_client):
    raw = _PNG_MAGIC + b"\x00" * (9 * 1024 * 1024)
    resp = auth_client.post("/api/upload/cover", json={"dataUrl": _data_url("image/png", raw)})
    assert resp.status_code == 400
    assert "grande" in resp.get_json()["error"].lower()


def test_upload_requires_auth(client):
    raw = _PNG_MAGIC + b"\x00" * 16
    resp = client.post("/api/upload/cover", json={"dataUrl": _data_url("image/png", raw)})
    assert resp.status_code == 401
