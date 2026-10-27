import io
import json
import urllib.error

import pytest
import app as app_module


@pytest.fixture
def openrouter(monkeypatch):
    for cfg in app_module.PROVIDERS.values():
        monkeypatch.delenv(cfg["env"], raising=False)
    monkeypatch.delenv("KOBOLDCPP_BASE_URL", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    cache = {"models": None, "fetched_at": 0, "error": None}
    monkeypatch.setattr(app_module, "_OPENROUTER_MODELS_CACHE", cache)
    return cache


def test_catalog_lists_paid_and_free_chat_models_and_caches(auth_client, monkeypatch, openrouter):
    calls = []
    def catalog(request, timeout):
        calls.append(request)
        assert request.full_url == "https://openrouter.ai/api/v1/models"
        assert request.get_header("Authorization") is None  # Public catalog needs no key.
        return io.BytesIO(json.dumps({"data": [
            {"id": "vendor/paid", "name": "A paid", "pricing": {"prompt": "0.000001", "completion": "0.000003"}},
            {"id": "vendor/free:free", "name": "B free"},
            {"id": "vendor/zero", "pricing": {"prompt": "0.0000", "completion": "0"}},
            {"id": "vendor/paid"},
            {"id": "vendor/image", "architecture": {"output_modalities": ["image"]}},
            {"id": "vendor/embedding", "architecture": {"output_modalities": ["embeddings"]}},
            {"id": "vendor/transcription", "architecture": {"input_modalities": ["audio"], "output_modalities": ["text"]}},
            {"id": ""}, None,
        ]}).encode())
    monkeypatch.setattr(app_module.urllib.request, "urlopen", catalog)
    for _ in range(2):
        response = auth_client.get("/api/ai/providers")
        assert response.status_code == 200
        assert [p["id"] for p in response.json["providers"]] == ["openrouter"]
        models = response.json["providers"][0]["models"]
        assert [m["id"] for m in models] == ["vendor/paid", "vendor/free:free", "vendor/zero"]
        assert models[0]["hint"] == "De pago vía OpenRouter"
        assert all("Gratis" in m["hint"] for m in models[1:])
    assert len(calls) == 1


def test_direct_catalog_requires_direct_key(auth_client, monkeypatch, openrouter):
    monkeypatch.delenv("OPENROUTER_API_KEY")
    def unexpected(*args, **kwargs):
        pytest.fail("No catalog request without the direct provider configured")
    monkeypatch.setattr(app_module, "_fetch_openrouter_models", unexpected)
    assert not auth_client.get("/api/ai/providers").json["providers"]


@pytest.mark.parametrize("stale", [False, True])
def test_catalog_failure_is_visible_and_preserves_last_success(auth_client, monkeypatch, openrouter, stale, caplog):
    previous = [{"id": "vendor/paid", "label": "Paid", "hint": "De pago vía OpenRouter"}]
    openrouter["models"] = previous if stale else None
    def offline(*args, **kwargs):
        raise urllib.error.URLError("test-openrouter-key")
    monkeypatch.setattr(app_module.urllib.request, "urlopen", offline)
    response = auth_client.get("/api/ai/providers")
    assert any(w["provider"] == "openrouter" and "conectar" in w["message"] for w in response.json["warnings"])
    assert bool(response.json["providers"]) == stale
    if stale:
        assert response.json["providers"][0]["models"] == previous
    assert "test-openrouter-key" not in response.get_data(as_text=True) + caplog.text


def test_direct_paid_model_stream_uses_openrouter_key_and_endpoint(auth_client, monkeypatch, openrouter):
    calls = []
    def stream(request, **kwargs):
        calls.append(request)
        assert request.full_url == "https://openrouter.ai/api/v1/chat/completions"
        assert request.get_header("Authorization") == "Bearer test-openrouter-key"
        payload = json.loads(request.data)
        assert payload["model"] == "vendor/paid"
        assert payload["stream"] is True
        return io.BytesIO(b'data: {"choices":[{"delta":{"content":"Respuesta real de prueba"}}]}\n\ndata: [DONE]\n\n')
    monkeypatch.setattr(app_module.urllib.request, "urlopen", stream)
    conversation = auth_client.post("/api/assistant/conversations", json={}).json["id"]
    route = f"/api/assistant/conversations/{conversation}"
    response = auth_client.post(route + "/messages", json={"prompt": "Hola", "provider": "openrouter", "model": "vendor/paid", "use_atlas": False})
    text = response.get_data(as_text=True)
    assert "event: done" in text and "event: error" not in text
    messages = auth_client.get(route).json["messages"]
    assert messages[-1]["content"] == "Respuesta real de prueba"
    assert messages[-1]["provider"] == "openrouter"
    assert len(calls) == 1


@pytest.mark.parametrize("code", [402, "429"])
def test_provider_error_during_stream_reaches_assistant_ui(auth_client, monkeypatch, openrouter, code):
    def stream(*args, **kwargs):
        payload = {"error": {"code": code, "message": "Provider error detail"}, "choices": []}
        return io.BytesIO(("data: " + json.dumps(payload) + "\n\ndata: [DONE]\n\n").encode())
    monkeypatch.setattr(app_module.urllib.request, "urlopen", stream)
    conversation = auth_client.post("/api/assistant/conversations", json={}).json["id"]
    route = f"/api/assistant/conversations/{conversation}"
    response = auth_client.post(route + "/messages", json={"prompt": "Hola", "provider": "openrouter", "model": "vendor/paid", "use_atlas": False})
    text = response.get_data(as_text=True)
    assert "event: error" in text and "event: done" not in text
    assert "Provider error detail" in text
    assert str(code) in text
    assert "respuesta vac" not in text
    assert all(m["role"] != "assistant" for m in auth_client.get(route).json["messages"])


def test_paid_catalog_does_not_expand_automatic_fallback_rotation(monkeypatch, openrouter):
    def unexpected():
        pytest.fail("A large paid catalog must not enter automatic fallback rotation")
    monkeypatch.setattr(app_module, "_fetch_openrouter_models", unexpected)
    assert app_module._list_available_ai_models() == []
