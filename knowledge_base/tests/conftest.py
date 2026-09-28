import os
import sys
from pathlib import Path

# Env must exist BEFORE importing app: its startup security check refuses to
# boot without SECRET_KEY/KB_PASSWORD, and config reads env at import time.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-weak")
os.environ.setdefault("KB_PASSWORD", "test-password")
os.environ.setdefault("ADMIN_TOKEN", "test-admin-token")
os.environ.setdefault("ENABLE_CODE_EXECUTION", "true")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

import app as app_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Every request in a test runs against a throwaway data dir, never the
    real knowledge_base/data + knowledge/ trees — without this, any test that
    creates/edits/merges entries would corrupt the actual tracked index.json
    and knowledge/*.md files on disk."""
    data_dir = tmp_path / "data"
    knowledge_dir = tmp_path / "knowledge"
    data_dir.mkdir()
    knowledge_dir.mkdir()
    (data_dir / "index.json").write_text("{}")

    monkeypatch.setattr(app_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(app_module, "KNOWLEDGE_DIR", knowledge_dir)
    monkeypatch.setattr(app_module, "INDEX_FILE", data_dir / "index.json")
    monkeypatch.setattr(app_module, "BACKUP_DIR", data_dir / "backups")
    monkeypatch.setattr(app_module, "ENTRY_REVIEW_FILE", data_dir / "entry_review.json")
    monkeypatch.setattr(app_module, "COURSES_FILE", data_dir / "courses.json")
    monkeypatch.setattr(app_module, "KANBAN_FILE", data_dir / "kanban.json")
    monkeypatch.setattr(app_module, "RELATIONS_FILE", data_dir / "relations.json")
    monkeypatch.setattr(app_module, "ACTIVITY_FILE", data_dir / "activity.json")
    monkeypatch.setattr(app_module, "MINDMAPS_FILE", data_dir / "mindmaps.json")
    monkeypatch.setattr(app_module, "CONCEPTS_FILE", data_dir / "concepts.json")
    monkeypatch.setattr(app_module, "CONCEPT_PROGRESS_FILE", data_dir / "concept_progress.json")

    app_module.app.config["TESTING"] = True
    app_module.app.config["SERVER_NAME"] = "test.local"
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture
def auth_client(client):
    """Client already logged in via the password session."""
    resp = client.post("/login", data={"password": "test-password"})
    assert resp.status_code == 302
    return client


@pytest.fixture
def admin_headers():
    return {"Authorization": "Bearer test-admin-token"}
