"""One manually maintained savings goal, stored with the user's backed-up data."""
import json
import os
import tempfile
from pathlib import Path

from flask import Blueprint, jsonify, request

MAX_CENTS = 10_000_000_000
CURRENCIES = {"HNL", "USD", "EUR"}


def _validated_goal(data):
    if not isinstance(data, dict):
        raise ValueError("Envía los datos de tu meta.")
    title = data.get("title")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 100:
        raise ValueError("El nombre debe tener entre 1 y 100 caracteres.")
    target = data.get("target_cents")
    saved = data.get("saved_cents")
    if type(target) is not int or not 1 <= target <= MAX_CENTS:
        raise ValueError("Indica un importe objetivo válido, mayor que cero.")
    if type(saved) is not int or not 0 <= saved <= MAX_CENTS:
        raise ValueError("Indica un ahorro válido, de cero o más.")
    if not isinstance(data.get("currency"), str) or data["currency"] not in CURRENCIES:
        raise ValueError("Elige HNL, USD o EUR como moneda.")
    return {"title": title.strip(), "target_cents": target,
            "saved_cents": saved, "currency": data["currency"]}


def create_goal_blueprint(data_directory):
    blueprint = Blueprint("personal_goal", __name__)

    @blueprint.get("/api/personal-goal")
    def get_goal():
        path = Path(data_directory()) / "personal_goal.json"
        try:
            goal = _validated_goal(json.loads(path.read_text(encoding="utf-8")))
        except FileNotFoundError:
            goal = None
        except (OSError, ValueError, TypeError):
            return jsonify(error="No se pudo leer tu meta guardada. Reintenta en un momento."), 503
        return jsonify(goal=goal)

    @blueprint.put("/api/personal-goal")
    def save_goal():
        try:
            goal = _validated_goal(request.get_json(silent=True))
        except ValueError as error:
            return jsonify(error=str(error)), 400
        directory = Path(data_directory())
        temporary = None
        try:
            directory.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory,
                                             prefix=".personal-goal-", suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                json.dump(goal, stream, ensure_ascii=False, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, directory / "personal_goal.json")
        except OSError:
            return jsonify(error="No se pudo guardar tu meta. Tus cambios siguen en el formulario."), 503
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        return jsonify(goal=goal)

    return blueprint
