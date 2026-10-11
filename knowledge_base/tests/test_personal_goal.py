import io
import json
import zipfile

import pytest
import app as app_module
import personal_goal


def goal(**updates):
    return dict(title="Mi próximo equipo", target_cents=1_200_000,
                saved_cents=400_001, currency="HNL", **updates)


def test_goal_requires_authentication(client):
    assert client.get("/api/personal-goal").status_code == 401
    assert client.put("/api/personal-goal", json=goal()).status_code == 401


def test_new_user_has_no_fictitious_savings(auth_client):
    assert auth_client.get("/api/personal-goal").json == {"goal": None}
    assert not (app_module.DATA_DIR / "personal_goal.json").exists()


def test_goal_persists_exact_cents_and_is_backed_up(auth_client):
    data = goal()
    assert auth_client.put("/api/personal-goal", json=data).json == {"goal": data}
    assert auth_client.get("/api/personal-goal").json == {"goal": data}
    persisted = json.loads((app_module.DATA_DIR / "personal_goal.json").read_text())
    assert persisted == data
    backup = auth_client.get("/api/export-all")
    with zipfile.ZipFile(io.BytesIO(backup.data)) as archive:
        assert json.loads(archive.read("data/personal_goal.json")) == data
    assert not list(app_module.DATA_DIR.glob(".personal-goal-*.tmp"))


@pytest.mark.parametrize("field,value", [
    ("target_cents", 0), ("target_cents", True), ("target_cents", 12.5),
    ("saved_cents", -1), ("saved_cents", "400000"),
    ("saved_cents", personal_goal.MAX_CENTS+1), ("currency", []),
    ("currency", "UNKNOWN"), ("title", " "), ("title", "x"*101),
])
def test_invalid_goal_preserves_existing_data(auth_client, field, value):
    data = goal()
    auth_client.put("/api/personal-goal", json=data)
    invalid = {**data, field: value}
    assert auth_client.put("/api/personal-goal", json=invalid).status_code == 400
    assert auth_client.get("/api/personal-goal").json == {"goal": data}


def test_zero_savings_and_exceeding_target_are_valid(auth_client):
    for saved in (0, 1_500_000):
        data = {**goal(), "saved_cents": saved, "currency": "USD"}
        assert auth_client.put("/api/personal-goal", json=data).status_code == 200
        assert auth_client.get("/api/personal-goal").json == {"goal": data}


def test_bad_json_is_rejected(auth_client):
    assert auth_client.put("/api/personal-goal", json=[]).status_code == 400
    assert auth_client.put("/api/personal-goal", data="invalid", content_type="application/json").status_code == 400


def test_corrupt_saved_file_reports_error_instead_of_resetting(auth_client):
    path = app_module.DATA_DIR / "personal_goal.json"
    path.write_text("invalid")
    assert auth_client.get("/api/personal-goal").status_code == 503
    assert path.read_text() == "invalid"


def test_failed_write_keeps_previous_goal(auth_client, monkeypatch):
    data = goal()
    auth_client.put("/api/personal-goal", json=data)
    def fail(*args):
        raise OSError("disk unavailable")
    monkeypatch.setattr(personal_goal.os, "replace", fail)
    assert auth_client.put("/api/personal-goal", json={**data,"saved_cents":500_000}).status_code == 503
    assert auth_client.get("/api/personal-goal").json == {"goal": data}
    assert not list(app_module.DATA_DIR.glob(".personal-goal-*.tmp"))
