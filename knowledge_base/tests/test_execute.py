import app as app_module


def test_execute_requires_auth(client):
    resp = client.post("/api/execute", json={"code": "print(1)"})
    assert resp.status_code == 401


def test_execute_disabled_flag(auth_client, monkeypatch):
    monkeypatch.setattr(app_module, "CODE_EXECUTION_ENABLED", False)
    resp = auth_client.post("/api/execute", json={"code": "print(1)"})
    assert resp.status_code == 403
    assert "deshabilitada" in resp.get_json()["error"]


def test_execute_works_with_session(auth_client):
    resp = auth_client.post("/api/execute", json={"code": "print(1+1)"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "2" in data["output"]


def test_execute_works_with_admin_token(client, admin_headers):
    resp = client.post("/api/execute", json={"code": "print(2*3)"}, headers=admin_headers)
    assert resp.status_code == 200
    assert "6" in resp.get_json()["output"]


def test_execute_rejects_non_python(auth_client):
    resp = auth_client.post("/api/execute", json={"code": "SELECT 1", "language": "sql"})
    assert resp.status_code == 400


def test_practice_check_disabled_flag(auth_client, monkeypatch):
    monkeypatch.setattr(app_module, "CODE_EXECUTION_ENABLED", False)
    resp = auth_client.post("/api/practice/check-python", json={"code": "print(1)", "asserts": ["assert True"]})
    assert resp.status_code == 403


def test_practice_check_works(auth_client):
    resp = auth_client.post("/api/practice/check-python", json={"code": "x = 1", "asserts": ["assert x == 1"]})
    assert resp.status_code == 200
    assert resp.get_json()["passed"] is True
