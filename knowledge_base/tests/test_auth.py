import app as app_module


def test_login_success(auth_client):
    resp = auth_client.get("/api/entries")
    assert resp.status_code == 200


def test_login_wrong_password(client):
    resp = client.post("/login", data={"password": "wrong-password"})
    assert resp.status_code == 200
    assert "Contraseña incorrecta" in resp.get_data(as_text=True)


def test_api_requires_auth(client):
    resp = client.get("/api/entries")
    assert resp.status_code == 401
    assert resp.is_json


def test_login_rate_limit(client):
    app_module._LOGIN_ATTEMPTS.clear()
    headers = {"X-Forwarded-For": "10.0.0.99"}
    for _ in range(5):
        client.post("/login", data={"password": "nope"}, headers=headers)
    resp = client.post("/login", data={"password": "nope"}, headers=headers)
    assert resp.status_code == 429


def test_login_succeeds_after_block_clears(client):
    app_module._LOGIN_ATTEMPTS.clear()
    headers = {"X-Forwarded-For": "10.0.0.100"}
    for _ in range(5):
        client.post("/login", data={"password": "nope"}, headers=headers)
    blocked = client.post("/login", data={"password": "test-password"}, headers=headers)
    assert blocked.status_code == 429
    fresh = client.post("/login", data={"password": "test-password"}, headers={"X-Forwarded-For": "10.0.0.101"})
    assert fresh.status_code == 302


def test_fail_closed_missing_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("KB_PASSWORD", "x")
    monkeypatch.setenv("ADMIN_TOKEN", "x")
    try:
        app_module._check_startup_security()
        assert False, "should have raised"
    except RuntimeError:
        pass


def test_fail_closed_missing_auth(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a-real-key")
    monkeypatch.delenv("KB_PASSWORD", raising=False)
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    try:
        app_module._check_startup_security()
        assert False, "should have raised"
    except RuntimeError:
        pass


def test_fail_closed_default_secret_key(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "dev-secret-change-in-prod")
    monkeypatch.setenv("KB_PASSWORD", "x")
    monkeypatch.setenv("ADMIN_TOKEN", "x")
    try:
        app_module._check_startup_security()
        assert False, "should have raised"
    except RuntimeError:
        pass


def test_allow_insecure_bypasses(monkeypatch):
    monkeypatch.setenv("ALLOW_INSECURE", "1")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("KB_PASSWORD", raising=False)
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    app_module._check_startup_security()


def test_security_headers(client):
    resp = client.get("/")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"
