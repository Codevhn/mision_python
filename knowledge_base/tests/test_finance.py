import io
import sqlite3
import zipfile

import pytest
import app as app_module


def account(client, name="Principal", currency="HNL", kind="spending", opening=1_000_000):
    result=client.post('/api/finance/accounts',json=dict(name=name,currency=currency,kind=kind,opening_cents=opening))
    assert result.status_code==201
    return result.json['id']


def movement(client, source, amount=10_001, kind="expense", **extra):
    return client.post('/api/finance/movements',json=dict(account_id=source,amount_cents=amount,type=kind,category="Alimentación",description="Compra",date="2026-10-10",**extra))


def test_finances_auth_and_no_demo_data(client,auth_client):
    client.get('/logout')
    assert client.get('/api/finance').status_code==401
    assert client.post('/api/finance/accounts',json={}).status_code==401
    client.post('/login',data={'password':'test-password'})
    assert auth_client.get('/api/finance').json==dict(accounts=[],movements=[],budgets=[])


def test_exact_balances_transfer_not_income_or_expense(auth_client):
    main=account(auth_client)
    savings=account(auth_client,"Ahorro",kind="savings",opening=0)
    assert movement(auth_client,main).status_code==201
    assert movement(auth_client,main,20_002,"income").status_code==201
    assert movement(auth_client,main,30_003,"transfer",destination_id=savings).status_code==201
    data=auth_client.get('/api/finance').json
    assert [a['balance_cents'] for a in data['accounts']]==[979_998,30_003]
    assert sum(a['balance_cents'] for a in data['accounts'])==1_010_001
    assert sorted(m['type'] for m in data['movements'])==['expense','income','transfer']


def test_insufficient_funds_and_cross_currency_transfer_do_not_write(auth_client):
    main=account(auth_client,opening=100)
    dollars=account(auth_client,"USD",currency="USD",opening=0)
    assert movement(auth_client,main,101).status_code==400
    assert movement(auth_client,main,50,"transfer",destination_id=dollars).status_code==400
    assert movement(auth_client,main,50,"transfer",destination_id=main).status_code==400
    assert auth_client.get('/api/finance').json['movements']==[]


@pytest.mark.parametrize('field,value',[("amount_cents",True),("amount_cents",1.1),("amount_cents",0),("amount_cents",-1),("account_id",{}),("date","2026-02-30"),("date","10/10/2026"),("type",[]),("description",""),("category"," ")])
def test_invalid_movement_rejected_without_changing_balance(auth_client,field,value):
    main=account(auth_client)
    body=dict(account_id=main,amount_cents=100,type="expense",category="Alimentación",description="Compra",date="2026-10-10")
    body[field]=value
    assert auth_client.post('/api/finance/movements',json=body).status_code==400
    assert auth_client.get('/api/finance').json['accounts'][0]['balance_cents']==1_000_000


def test_delete_recalculates_and_refuses_negative_balances(auth_client):
    main=account(auth_client,opening=0)
    income=movement(auth_client,main,100,"income").json['id']
    expense=movement(auth_client,main,90).json['id']
    assert auth_client.delete('/api/finance/movements/'+income).status_code==400
    assert len(auth_client.get('/api/finance').json['movements'])==2
    assert auth_client.delete('/api/finance/movements/'+expense).status_code==200
    assert auth_client.get('/api/finance').json['accounts'][0]['balance_cents']==100
    assert auth_client.delete('/api/finance/movements/'+expense).status_code==404


def test_budgets_are_scoped_by_month_and_currency(auth_client):
    body=dict(month="2026-10",currency="HNL",category="Alimentación",limit_cents=30_000)
    for change in ({},{"limit_cents":40_000},{"month":"2026-11"},{"currency":"USD"}):
        assert auth_client.put('/api/finance/budgets',json={**body,**change}).status_code==200
    budgets=auth_client.get('/api/finance').json['budgets']
    assert len(budgets)==3
    assert next(b for b in budgets if b['currency']=='HNL' and b['month']=='2026-10')['limit_cents']==40_000
    assert auth_client.put('/api/finance/budgets',json={**body,'month':'2026-13'}).status_code==400


def test_live_finance_database_is_in_consistent_export(auth_client,tmp_path):
    main=account(auth_client)
    movement(auth_client,main)
    with zipfile.ZipFile(io.BytesIO(auth_client.get('/api/export-all').data)) as archive:
        path=tmp_path/'restored-finance.db'
        path.write_bytes(archive.read('data/finance.db'))
    connection=sqlite3.connect(path)
    try:
        assert connection.execute('SELECT amount_cents FROM movements').fetchone()[0]==10_001
        assert connection.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    finally:
        connection.close()


def test_malformed_account_and_payloads(auth_client):
    for body in ([],None,{"name":"A","currency":[],"kind":"savings","opening_cents":0}):
        assert auth_client.post('/api/finance/accounts',json=body).status_code==400
