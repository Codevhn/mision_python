import io
import json
import urllib.error

import app as app_module


def test_catalog_auth_cache_and_colon_ids(auth_client, monkeypatch):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "test-omniroute-key")
    monkeypatch.delenv("OMNIROUTE_MODELS", raising=False)
    monkeypatch.setattr(app_module, "_OMNIROUTE_MODELS_CACHE", {"models": None, "fetched_at": 0, "source": None})
    calls = []

    def catalog(request, timeout):
        calls.append(request)
        assert request.full_url.endswith("/v1/models")
        assert request.get_header("Authorization") == "Bearer test-omniroute-key"
        return io.BytesIO(json.dumps({"data": [{"id": "combo:estudio"}, {"id": "combo:estudio"}, {"id": "modelo/a"}]}).encode())

    monkeypatch.setattr(app_module.urllib.request, "urlopen", catalog)
    for _ in range(2):
        response = auth_client.get("/api/ai/providers")
        provider = next(p for p in response.json["providers"] if p["id"] == "omniroute")
        assert [m["id"] for m in provider["models"]] == ["combo:estudio", "modelo/a"]
    assert len(calls) == 1


def test_explicit_combos_without_catalog(monkeypatch):
    monkeypatch.setenv("OMNIROUTE_MODELS", "estudio, combo:codigo, estudio, ")
    assert [m["id"] for m in app_module._fetch_omniroute_models()] == ["estudio", "combo:codigo"]


def test_catalog_failure_keeps_last_success(monkeypatch):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "test-omniroute-key")
    monkeypatch.delenv("OMNIROUTE_MODELS", raising=False)
    url = app_module.PROVIDERS["omniroute"]["base_url"].removesuffix("/chat/completions") + "/models"
    models = [{"id": "estudio", "label": "Estudio", "hint": "Vía OmniRoute"}]
    monkeypatch.setattr(app_module, "_OMNIROUTE_MODELS_CACHE", {"models": models, "fetched_at": 0, "source": (url, "test-omniroute-key")})

    def unavailable(*args, **kwargs):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(app_module.urllib.request, "urlopen", unavailable)
    assert app_module._fetch_omniroute_models() == models


def test_chat_and_stream_dispatch_combo_unchanged(auth_client, monkeypatch):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "test-omniroute-key")
    calls = []

    def chat(url, key, model, *args):
        calls.append((url, key, model))
        return "Respuesta", False, {"total_tokens": 5}

    def stream(url, key, model, *args):
        calls.append((url, key, model))
        yield "Respuesta"

    monkeypatch.setattr(app_module, "_call_openai_compatible", chat)
    monkeypatch.setattr(app_module, "_call_openai_compatible_stream", stream)
    with app_module.app.test_request_context():
        content, error = app_module._call_ai("sistema", "hola", provider="omniroute", model="combo:estudio")
        assert content == "Respuesta" and error is None
        assert list(app_module._stream_ai("sistema", "hola", provider="omniroute", model="combo:estudio")) == ["Respuesta"]
    assert len(calls) == 2
    assert all(call[2] == "combo:estudio" and call[0].endswith("/v1/chat/completions") for call in calls)


def test_missing_key_is_reported(auth_client, monkeypatch):
    monkeypatch.delenv("OMNIROUTE_API_KEY", raising=False)
    response = auth_client.get("/api/ai/providers")
    assert response.status_code == 200
    assert any("OMNIROUTE_API_KEY" in warning["message"] for warning in response.json["warnings"])
    assert not any(provider["id"] == "omniroute" for provider in response.json["providers"])


def test_catalog_auth_failure_reported_without_secrets(auth_client, monkeypatch, caplog):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "private-test-key")
    monkeypatch.delenv("OMNIROUTE_MODELS", raising=False)
    monkeypatch.setattr(app_module, "_OMNIROUTE_MODELS_CACHE", {"models": None, "fetched_at": 0, "source": None})

    def denied(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 401, "private-test-key", {}, io.BytesIO(b'private-test-key'))

    monkeypatch.setattr(app_module.urllib.request, "urlopen", denied)
    response = auth_client.get("/api/ai/providers")
    assert any("HTTP 401" in warning["message"] for warning in response.json["warnings"])
    assert "private-test-key" not in response.get_data(as_text=True)
    assert "private-test-key" not in caplog.text


def test_connection_failure_reported(auth_client, monkeypatch):
    monkeypatch.setenv("OMNIROUTE_API_KEY", "private-test-key")
    monkeypatch.delenv("OMNIROUTE_MODELS", raising=False)
    monkeypatch.setattr(app_module, "_OMNIROUTE_MODELS_CACHE", {"models": None, "fetched_at": 0, "source": None})

    def offline(request, timeout):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(app_module.urllib.request, "urlopen", offline)
    response = auth_client.get("/api/ai/providers")
    assert any("No se pudo conectar" in warning["message"] for warning in response.json["warnings"])
