"""Manual personal-finance ledger. Integer cents, transactional writes, no bank links."""
import sqlite3
import uuid
from datetime import date
from pathlib import Path

from flask import Blueprint, jsonify, request

MAX_CENTS = 10_000_000_000
CURRENCIES = {"HNL", "USD", "EUR"}


def _connect(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(directory / "finance.db", timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL,
          kind TEXT NOT NULL, opening_cents INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS movements (
          id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
          destination_id TEXT REFERENCES accounts(id), type TEXT NOT NULL,
          amount_cents INTEGER NOT NULL, category TEXT NOT NULL,
          description TEXT NOT NULL, date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS budgets (
          month TEXT NOT NULL, currency TEXT NOT NULL, category TEXT NOT NULL,
          limit_cents INTEGER NOT NULL, PRIMARY KEY(month,currency,category));
    """)
    return connection


def _balances(connection):
    accounts = [dict(row) for row in connection.execute("SELECT * FROM accounts ORDER BY rowid")]
    amounts = {a["id"]:a["opening_cents"] for a in accounts}
    for movement in connection.execute("SELECT * FROM movements"):
        amounts[movement["account_id"]] += movement["amount_cents"] * (1 if movement["type"] == "income" else -1)
        if movement["type"] == "transfer":
            amounts[movement["destination_id"]] += movement["amount_cents"]
    for account in accounts:
        account["balance_cents"] = amounts[account["id"]]
    return accounts


def _text(data, field, maximum=100):
    value = data.get(field)
    if not isinstance(value,str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f"Indica {field} entre 1 y {maximum} caracteres.")
    return value.strip()


def _amount(data, field, zero=False):
    value = data.get(field)
    if type(value) is not int or not (0 if zero else 1) <= value <= MAX_CENTS:
        raise ValueError("Indica un importe válido en centavos enteros.")
    return value


def _currency(data):
    value = data.get("currency")
    if not isinstance(value,str) or value not in CURRENCIES:
        raise ValueError("Elige HNL, USD o EUR como moneda.")
    return value


def snapshot_finance_database(directory):
    path = Path(directory) / "finance.db"
    if not path.exists():
        return None
    source = sqlite3.connect(path)
    snapshot = sqlite3.connect(":memory:")
    try:
        source.backup(snapshot)
        return snapshot.serialize()
    finally:
        snapshot.close()
        source.close()


def create_finance_blueprint(data_directory):
    blueprint = Blueprint("finance", __name__)

    @blueprint.before_request
    def validate_finance_body():
        if request.method in {"POST","PUT"} and not isinstance(request.get_json(silent=True),dict):
            return jsonify(error="Envía los datos como un objeto JSON."),400

    @blueprint.errorhandler(ValueError)
    def invalid_data(error):
        return jsonify(error=str(error)),400

    @blueprint.errorhandler(sqlite3.Error)
    @blueprint.errorhandler(OSError)
    def storage_error(error):
        return jsonify(error="No se pudo acceder a tus finanzas. Reintenta en un momento."),503

    @blueprint.get("/api/finance")
    def get_finances():
        connection = _connect(data_directory())
        try:
            connection.execute("BEGIN")
            return jsonify(accounts=_balances(connection),
                           movements=[dict(row) for row in connection.execute("SELECT * FROM movements ORDER BY date DESC,rowid DESC")],
                           budgets=[dict(row) for row in connection.execute("SELECT * FROM budgets ORDER BY month,category")])
        finally:
            connection.close()

    @blueprint.post("/api/finance/accounts")
    def add_account():
        data = request.get_json()
        name, currency = _text(data,"name",60), _currency(data)
        kind = data.get("kind")
        if kind not in ("spending","savings"):
            raise ValueError("Elige una cuenta de uso diario o de ahorro.")
        opening = _amount(data,"opening_cents",zero=True)
        identifier = uuid.uuid4().hex
        connection = _connect(data_directory())
        try:
            with connection:
                connection.execute("INSERT INTO accounts VALUES(?,?,?,?,?)",(identifier,name,currency,kind,opening))
            return jsonify(id=identifier),201
        finally:
            connection.close()

    @blueprint.post("/api/finance/movements")
    def add_movement():
        data = request.get_json()
        amount, description = _amount(data,"amount_cents"), _text(data,"description",120)
        kind = data.get("type")
        if kind not in ("income","expense","transfer"):
            raise ValueError("Elige ingreso, gasto o transferencia.")
        category = "Transferencia" if kind == "transfer" else _text(data,"category",50)
        raw_date = data.get("date")
        try:
            if not isinstance(raw_date,str) or date.fromisoformat(raw_date).isoformat() != raw_date:
                raise ValueError()
        except (ValueError,TypeError):
            raise ValueError("Indica una fecha válida con formato AAAA-MM-DD.")
        account_id = data.get("account_id")
        destination = data.get("destination_id") if kind == "transfer" else None
        if not isinstance(account_id,str) or (kind == "transfer" and not isinstance(destination,str)):
            raise ValueError("Elige las cuentas del movimiento.")
        connection = _connect(data_directory())
        try:
            connection.execute("BEGIN IMMEDIATE")
            accounts = {a["id"]:a for a in _balances(connection)}
            if account_id not in accounts:
                raise ValueError("La cuenta elegida ya no existe.")
            if kind != "income" and amount > accounts[account_id]["balance_cents"]:
                raise ValueError("El importe supera el saldo de la cuenta.")
            if kind == "transfer":
                if destination == account_id or destination not in accounts:
                    raise ValueError("Elige una cuenta de destino diferente.")
                if accounts[account_id]["currency"] != accounts[destination]["currency"]:
                    raise ValueError("Las transferencias deben usar cuentas de la misma moneda.")
            identifier = uuid.uuid4().hex
            connection.execute("INSERT INTO movements VALUES(?,?,?,?,?,?,?,?)",(identifier,account_id,destination,kind,amount,category,description,raw_date))
            connection.commit()
            return jsonify(id=identifier),201
        finally:
            connection.close()

    @blueprint.delete("/api/finance/movements/<identifier>")
    def delete_movement(identifier):
        connection = _connect(data_directory())
        try:
            connection.execute("BEGIN IMMEDIATE")
            removed = connection.execute("DELETE FROM movements WHERE id=?",(identifier,)).rowcount
            if not removed:
                return jsonify(error="El movimiento ya no existe."),404
            if any(a["balance_cents"] < 0 for a in _balances(connection)):
                raise ValueError("No se puede eliminar: dejaría una cuenta con saldo negativo.")
            connection.commit()
            return jsonify(ok=True)
        finally:
            connection.close()

    @blueprint.put("/api/finance/budgets")
    def set_budget():
        data = request.get_json()
        currency, category, amount = _currency(data), _text(data,"category",50), _amount(data,"limit_cents")
        month = data.get("month")
        try:
            if not isinstance(month,str) or len(month) != 7 or date.fromisoformat(month+"-01").strftime("%Y-%m") != month:
                raise ValueError()
        except (ValueError,TypeError):
            raise ValueError("Indica un mes válido con formato AAAA-MM.")
        connection = _connect(data_directory())
        try:
            with connection:
                connection.execute("INSERT INTO budgets VALUES(?,?,?,?) ON CONFLICT(month,currency,category) DO UPDATE SET limit_cents=excluded.limit_cents",(month,currency,category,amount))
            return jsonify(ok=True)
        finally:
            connection.close()

    return blueprint
