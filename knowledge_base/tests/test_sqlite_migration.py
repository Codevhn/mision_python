import json

import app as app_module


def _isolate(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(app_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(app_module, "INDEX_FILE", data_dir / "index.json")
    monkeypatch.setattr(app_module, "INDEX_DB_FILE", data_dir / "index.db")
    return data_dir


def test_fresh_install_has_no_entries(tmp_path, monkeypatch):
    """No legacy index.json and no index.db yet — same as a brand new
    install, must behave like the old empty-JSON-file case: an empty index,
    no crash."""
    _isolate(tmp_path, monkeypatch)
    assert app_module.load_index() == {}


def test_legacy_index_json_is_migrated_once(tmp_path, monkeypatch):
    data_dir = _isolate(tmp_path, monkeypatch)
    legacy = {
        "entrada-uno": {"title": "Uno", "category": "python", "category_label": "Python",
                         "topic": "básico", "topic_label": "Básico",
                         "created_at": "2026-01-01T00:00:00", "uid": "aaa11111"},
        "entrada-dos": {"title": "Dos", "category": "linux", "category_label": "Linux",
                         "topic": "shell", "topic_label": "Shell",
                         "created_at": "2026-01-02T00:00:00", "uid": "bbb22222"},
    }
    (data_dir / "index.json").write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")

    index = app_module.load_index()
    assert set(index.keys()) == {"entrada-uno", "entrada-dos"}
    assert index["entrada-uno"]["title"] == "Uno"
    assert index["entrada-dos"]["category_label"] == "Linux"
    assert app_module.INDEX_DB_FILE.exists()

    # The legacy file is left exactly as it was — it's never written to again.
    on_disk = json.loads((data_dir / "index.json").read_text(encoding="utf-8"))
    assert on_disk == legacy


def test_migration_does_not_duplicate_on_second_load(tmp_path, monkeypatch):
    data_dir = _isolate(tmp_path, monkeypatch)
    legacy = {"solo-uno": {"title": "Solo", "category": "python", "category_label": "Python",
                            "topic": "x", "topic_label": "X",
                            "created_at": "2026-01-01T00:00:00", "uid": "ccc33333"}}
    (data_dir / "index.json").write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")

    app_module.load_index()
    second = app_module.load_index()
    assert len(second) == 1


def test_writes_after_migration_persist_and_ignore_legacy_file(tmp_path, monkeypatch):
    """Once index.db exists, index.json is never consulted again — an entry
    added post-migration must survive even if the stale index.json on disk
    doesn't know about it."""
    data_dir = _isolate(tmp_path, monkeypatch)
    (data_dir / "index.json").write_text(json.dumps({}), encoding="utf-8")

    index = app_module.load_index()
    index["nueva"] = {"title": "Nueva", "category": "python", "category_label": "Python",
                       "topic": "x", "topic_label": "X",
                       "created_at": "2026-01-01T00:00:00", "uid": "ddd44444"}
    app_module.save_index(index)

    reloaded = app_module.load_index()
    assert "nueva" in reloaded
    # index.json on disk still shows the old, empty state — proof it wasn't rewritten.
    assert json.loads((data_dir / "index.json").read_text(encoding="utf-8")) == {}
