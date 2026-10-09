import app as app_module


def _create(auth_client, title, category, topic, **extra):
    body = {
        "title": title,
        "category": category,
        "topic": topic,
        "raw_text": extra.pop("raw_text", "contenido"),
        "already_markdown": True,
        **extra,
    }
    return auth_client.post("/api/entry", json=body)


def test_create_requires_title(auth_client):
    resp = auth_client.post("/api/entry", json={"category": "Python", "topic": "Básico"})
    assert resp.status_code == 400


def test_create_knowledge_requires_category_and_topic(auth_client):
    resp = auth_client.post("/api/entry", json={"title": "Sin categoría"})
    assert resp.status_code == 400


def test_create_and_read_entry(auth_client):
    resp = _create(auth_client, "Mi primera entrada", "Python", "Sintaxis")
    assert resp.status_code == 200
    entry_id = resp.get_json()["id"]

    got = auth_client.get(f"/api/entry/{entry_id}")
    assert got.status_code == 200
    meta = got.get_json()["meta"]
    assert meta["category"] == "python"
    assert meta["category_label"] == "Python"
    assert meta["topic_label"] == "Sintaxis"
    assert "contenido" in got.get_json()["markdown"]


def test_duplicate_title_gets_suffixed_id(auth_client):
    first = _create(auth_client, "Repetida", "Python", "Básico")
    second = _create(auth_client, "Repetida", "Python", "Básico")
    assert first.get_json()["id"] != second.get_json()["id"]


def test_selection_creates_empty_knowledge_with_origin_and_blocks_duplicates(auth_client):
    origin = _create(auth_client, 'Lección Python', 'Programación', 'Python').json['id']
    preview = auth_client.post('/api/knowledge/selection', json={'title': 'requirements.txt', 'source_entry_id': origin}).json
    assert (preview['category'], preview['topic']) == ('Programación', 'Python')
    assert preview['duplicates'] == []
    body = {'title': 'requirements.txt', 'category': 'Programación', 'topic': 'Python',
            'source_entry_id': origin, 'source_excerpt': 'Contexto de la lección', 'raw_text': ''}
    created = auth_client.post('/api/entry', json=body)
    assert created.status_code == 200
    saved = auth_client.get('/api/entry/' + created.json['id']).json
    assert saved['markdown'] == ''
    assert saved['meta'].get('type') != 'page'
    assert saved['meta']['source_entry_id'] == origin
    assert saved['meta']['source_excerpt'] == 'Contexto de la lección'
    assert saved['knowledge_origin'] == {'id': origin, 'title': 'Lección Python'}
    assert auth_client.post('/api/entry', json=body).status_code == 409
    preview = auth_client.post('/api/knowledge/selection', json={'title': 'REQUIREMENTS.TXT', 'source_entry_id': origin}).json
    assert preview['duplicates'][0]['id'] == created.json['id']
    # Ordinary entry creation retains its established behavior.
    assert _create(auth_client, 'requirements.txt', 'Programación', 'Python').status_code == 200


def test_selection_origin_and_preview_validation(auth_client):
    assert auth_client.post('/api/knowledge/selection', json={'title': 'x', 'source_entry_id': 'missing'}).status_code == 404
    for title in ['', 'x' * 301, [], None]:
        assert auth_client.post('/api/knowledge/selection', json={'title': title, 'source_entry_id': 'missing'}).status_code == 400
    assert auth_client.post('/api/entry', json={'title': 'x', 'category': 'A', 'topic': 'B', 'source_entry_id': 'missing'}).status_code == 400


def test_course_selection_classification_is_suggested_and_ambiguous_domain_left_blank(auth_client, monkeypatch):
    index = {'lesson': {'title': 'Instalación', 'type': 'course', 'course': 'python', 'module': 'intro'}}
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    courses = {'courses': {'python': {'label': 'Python Profesional', 'domain': 'python'}}}
    monkeypatch.setattr(app_module, 'load_courses', lambda: courses)
    body = {'title': 'requirements.txt', 'source_entry_id': 'lesson'}
    preview = auth_client.post('/api/knowledge/selection', json=body).json
    assert (preview['category'], preview['topic']) == ('Programación', 'Python')
    courses['courses']['python'] = {'label': 'Python y SQL'}
    preview = auth_client.post('/api/knowledge/selection', json=body).json
    assert (preview['category'], preview['topic']) == ('', '')


def test_canonical_category_label_reused(auth_client):
    """A category's label is set by whoever files into it first; a later
    entry using different casing for the same slug doesn't overwrite it."""
    _create(auth_client, "Uno", "Bases de Datos", "SQL")
    resp = _create(auth_client, "Dos", "bases de datos", "SQL")
    entry_id = resp.get_json()["id"]
    meta = auth_client.get(f"/api/entry/{entry_id}").get_json()["meta"]
    assert meta["category_label"] == "Bases de Datos"


def test_update_persists_tags(auth_client):
    entry_id = _create(auth_client, "Con tags", "Python", "Básico").get_json()["id"]
    resp = auth_client.put(f"/api/entry/{entry_id}", json={
        "raw_text": "contenido", "already_markdown": True,
        "title": "Con tags", "category": "Python", "topic": "Básico",
        "tags": "uno, Dos",
    })
    assert resp.status_code == 200
    meta = auth_client.get(f"/api/entry/{entry_id}").get_json()["meta"]
    assert meta["tags"] == ["uno", "dos"]


def test_update_moves_category_and_topic(auth_client):
    entry_id = _create(auth_client, "Movible", "Python", "Básico").get_json()["id"]
    resp = auth_client.put(f"/api/entry/{entry_id}", json={
        "raw_text": "contenido", "already_markdown": True,
        "title": "Movible", "category": "Linux", "topic": "Shell",
    })
    assert resp.status_code == 200
    meta = auth_client.get(f"/api/entry/{entry_id}").get_json()["meta"]
    assert meta["category"] == "linux"
    assert meta["topic"] == "shell"


def test_delete_entry(auth_client):
    entry_id = _create(auth_client, "Para borrar", "Python", "Básico").get_json()["id"]
    resp = auth_client.delete(f"/api/entry/{entry_id}")
    assert resp.status_code == 200
    assert auth_client.get(f"/api/entry/{entry_id}").status_code == 404


def test_entries_endpoints_require_auth(client):
    assert client.post("/api/entry", json={"title": "x"}).status_code == 401
    assert client.put("/api/entry/x", json={}).status_code == 401
    assert client.delete("/api/entry/x").status_code == 401


def test_reorganize_category_merges_entries(auth_client):
    id1 = _create(auth_client, "A", "Cat Uno", "Tema").get_json()["id"]
    id2 = _create(auth_client, "B", "Cat Dos", "Tema").get_json()["id"]

    resp = auth_client.post("/api/reorganize-category", json={
        "match_category": "cat-dos",
        "new_category_label": "Cat Uno",
    })
    assert resp.status_code == 200
    assert resp.get_json()["moved"] == 1

    meta1 = auth_client.get(f"/api/entry/{id1}").get_json()["meta"]
    meta2 = auth_client.get(f"/api/entry/{id2}").get_json()["meta"]
    assert meta1["category"] == "cat-uno"
    assert meta2["category"] == "cat-uno"


def test_bulk_merge_requires_at_least_two_sources(auth_client):
    resp = auth_client.post("/api/bulk-merge-categories", json={
        "sources": [{"category": "solo-una"}],
        "new_category_label": "Destino",
    })
    assert resp.status_code == 400


def test_bulk_merge_merges_multiple_categories(auth_client):
    ids = [
        _create(auth_client, f"Entrada {i}", f"Origen {i}", "Tema").get_json()["id"]
        for i in range(3)
    ]
    resp = auth_client.post("/api/bulk-merge-categories", json={
        "sources": [{"category": f"origen-{i}"} for i in range(3)],
        "new_category_label": "Unificada",
    })
    assert resp.status_code == 200
    assert resp.get_json()["moved"] == 3
    for entry_id in ids:
        meta = auth_client.get(f"/api/entry/{entry_id}").get_json()["meta"]
        assert meta["category"] == "unificada"


def test_broken_links_detected(auth_client):
    _create(auth_client, "Entrada Válida", "Python", "Básico")
    id_with_links = _create(
        auth_client, "Con enlaces", "Python", "Básico",
        raw_text="Ver [[Entrada Válida]] y también [[No Existe]].",
    ).get_json()["id"]

    resp = auth_client.get("/api/broken-links")
    assert resp.status_code == 200
    broken = resp.get_json()["broken_links"]
    assert len(broken) == 1
    assert broken[0]["source_id"] == id_with_links
    assert broken[0]["link_text"] == "No Existe"


def test_review_grading_schedules_next_review(auth_client):
    entry_id = _create(auth_client, "Para repasar", "Python", "Básico").get_json()["id"]

    empty = auth_client.get(f"/api/entry/{entry_id}/review")
    assert empty.get_json() == {}

    resp = auth_client.post(f"/api/entry/{entry_id}/review", json={"grade": "good"})
    assert resp.status_code == 200
    state = resp.get_json()
    assert state["reps"] == 1
    assert state["interval"] >= 1
    assert state["next_review_at"]


def test_review_rejects_invalid_grade(auth_client):
    entry_id = _create(auth_client, "Para repasar 2", "Python", "Básico").get_json()["id"]
    resp = auth_client.post(f"/api/entry/{entry_id}/review", json={"grade": "meh"})
    assert resp.status_code == 400


def test_review_again_resets_progress(auth_client):
    entry_id = _create(auth_client, "Para repasar 3", "Python", "Básico").get_json()["id"]
    auth_client.post(f"/api/entry/{entry_id}/review", json={"grade": "good"})
    auth_client.post(f"/api/entry/{entry_id}/review", json={"grade": "good"})
    resp = auth_client.post(f"/api/entry/{entry_id}/review", json={"grade": "again"})
    state = resp.get_json()
    assert state["reps"] == 0
    assert state["interval"] == 1


def test_review_due_lists_overdue_entries(auth_client):
    entry_id = _create(auth_client, "Vencida", "Python", "Básico").get_json()["id"]
    auth_client.post(f"/api/entry/{entry_id}/review", json={"grade": "good"})

    # Freshly graded — not due yet.
    due = auth_client.get("/api/review/due").get_json()
    assert due["count"] == 0

    # Force it into the past directly on disk, same as a real overdue review.
    reviews = app_module.load_entry_review()
    reviews[entry_id]["next_review_at"] = "2000-01-01T00:00:00"
    app_module.save_entry_review(reviews)

    due = auth_client.get("/api/review/due").get_json()
    assert due["count"] == 1
    assert due["due"][0]["id"] == entry_id


def test_knowledge_progress_breakdown(auth_client):
    id1 = _create(auth_client, "Prog 1", "Cat Progreso", "Tema").get_json()["id"]
    _create(auth_client, "Prog 2", "Cat Progreso", "Tema")

    index = app_module.load_index()
    index[id1]["status"] = "completado"
    app_module.save_index(index)

    resp = auth_client.get("/api/knowledge/progress")
    assert resp.status_code == 200
    data = resp.get_json()
    cat = next(c for c in data["categories"] if c["category"] == "cat-progreso")
    assert cat["total"] == 2
    assert cat["completado"] == 1
    assert cat["pendiente"] == 1
    assert cat["completion_pct"] == 50
