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
def client(tmp_path):
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
