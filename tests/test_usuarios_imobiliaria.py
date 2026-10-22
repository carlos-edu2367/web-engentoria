"""
Testes E2E dos usuários adicionais de grupo de imobiliárias e suas permissões.

Cobre:
  - login principal do grupo continua com as duas permissões (padrão)
  - gestão pelo painel de TI (criar, editar, remover, validações)
  - usuário só financeiro: vê fechamento mensal, não vê vistorias/solicitações
  - usuário só vistorias: vê vistorias/solicitações, não vê fechamento mensal
  - permissões do login principal podem ser alteradas pelo TI
"""

import uuid
from datetime import timedelta

import pytest

from backend import models, auth

ADMIN = "/api/v1/admin/grupos-imobiliarias"
IMOB = "/api/v1/imobiliaria"


def _token(email):
    return auth.create_access_token(data={"sub": email, "dashboard": "imobiliaria"}, expires_delta=timedelta(hours=1))


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def ti_token(db):
    ti = models.UsuarioTI(
        nome="TI Teste",
        email=f"ti_{uuid.uuid4().hex[:8]}@test-engentoria.com",
        senha=auth.get_password_hash("senha123"),
        nivel_acesso="gestor",
    )
    db.add(ti)
    db.commit()
    yield auth.create_access_token(data={"sub": ti.email, "dashboard": "ti"}, expires_delta=timedelta(hours=1))
    db.delete(ti)
    db.commit()


@pytest.fixture
def criar_usuario(api_client, ti_token, infra, db):
    criados = []

    def _criar(financeiro=True, vistorias=True):
        email = f"usr_{uuid.uuid4().hex[:8]}@test-engentoria.com"
        resp = api_client.post(
            f"{ADMIN}/{infra['grupo'].id}/usuarios",
            json={"nome": "Usuário Teste", "email": email, "senha": "senha123",
                  "acesso_financeiro": financeiro, "acesso_vistorias": vistorias},
            headers=_h(ti_token),
        )
        assert resp.status_code == 201, resp.text
        criados.append(resp.json()["id"])
        return resp.json()

    yield _criar

    for usuario_id in criados:
        usuario = db.query(models.UsuarioImobiliaria).filter_by(id=uuid.UUID(usuario_id)).first()
        if usuario:
            db.delete(usuario)
    db.commit()


def _login(api_client, email):
    return api_client.post("/api/v1/auth/token", data={"username": email, "password": "senha123"})


def test_login_principal_tem_as_duas_permissoes(api_client, infra):
    resp = _login(api_client, infra["grupo"].email)
    assert resp.status_code == 200, resp.text
    info = resp.json()["user_info"]
    assert info["dashboard_type"] == "imobiliaria"
    assert info["permissoes"] == {"financeiro": True, "vistorias": True}


def test_usuario_so_financeiro(api_client, criar_usuario, infra):
    usuario = criar_usuario(financeiro=True, vistorias=False)

    login = _login(api_client, usuario["email"])
    assert login.status_code == 200, login.text
    assert login.json()["user_info"]["dashboard_type"] == "imobiliaria"
    assert login.json()["user_info"]["permissoes"] == {"financeiro": True, "vistorias": False}

    token = login.json()["access_token"]
    me = api_client.get(f"{IMOB}/me", headers=_h(token)).json()
    assert me["email"] == usuario["email"]
    assert me["grupo"] == infra["grupo"].nome
    assert me["usuario_principal"] is False

    assert api_client.get(f"{IMOB}/relatorio-mensal?mes=1&ano=2025", headers=_h(token)).status_code == 200

    negado = api_client.get(f"{IMOB}/agenda?start_date=2025-01-01&end_date=2025-01-31", headers=_h(token))
    assert negado.status_code == 403
    assert negado.json()["detail"]["code"] == "permissao_negada"
    assert api_client.get(f"{IMOB}/laudos", headers=_h(token)).status_code == 403
    assert api_client.get("/api/v1/agendamento-externo/minhas-solicitacoes", headers=_h(token)).status_code == 403


def test_usuario_so_financeiro_ve_fechamento_sem_passar_pelo_dashboard(api_client, criar_usuario, db, infra):
    from datetime import datetime
    usuario = criar_usuario(financeiro=True, vistorias=False)
    hoje = datetime.now()
    mes, ano = (12, hoje.year - 1) if hoje.month == 1 else (hoje.month - 1, hoje.year)

    resp = api_client.get(f"{IMOB}/status_info_mensal/{mes}/{ano}", headers=_h(_token(usuario["email"])))
    try:
        assert resp.status_code == 200, resp.text
        assert resp.json()["month"] == mes
    finally:
        db.query(models.InfoMensal).filter_by(grupo_id=infra["grupo"].id, month=mes, year=ano).delete()
        db.commit()


def test_usuario_so_vistorias(api_client, criar_usuario):
    usuario = criar_usuario(financeiro=False, vistorias=True)
    token = _token(usuario["email"])

    assert api_client.get(f"{IMOB}/agenda?start_date=2025-01-01&end_date=2025-01-31", headers=_h(token)).status_code == 200
    assert api_client.get("/api/v1/agendamento-externo/minhas-solicitacoes", headers=_h(token)).status_code == 200

    assert api_client.get(f"{IMOB}/relatorio-mensal?mes=1&ano=2025", headers=_h(token)).status_code == 403
    assert api_client.get(f"{IMOB}/status_info_mensal/1/2025", headers=_h(token)).status_code == 403
    assert api_client.get(f"{IMOB}/relatorio-download?mes=1&ano=2025&formato=pdf", headers=_h(token)).status_code == 403


def test_principal_nao_herda_permissoes_de_usuario_anterior(api_client, criar_usuario, grupo_token):
    # A sessão do teste é compartilhada entre requisições: o grupo vem do identity map.
    usuario = criar_usuario(financeiro=False, vistorias=True)
    assert api_client.get(f"{IMOB}/relatorio-mensal?mes=1&ano=2025", headers=_h(_token(usuario["email"]))).status_code == 403

    resp = api_client.get(f"{IMOB}/relatorio-mensal?mes=1&ano=2025", headers=_h(grupo_token))
    assert resp.status_code == 200, resp.text
    assert api_client.get(f"{IMOB}/me", headers=_h(grupo_token)).json()["usuario_principal"] is True


def test_validacoes_de_criacao(api_client, ti_token, infra, criar_usuario):
    sem_permissao = api_client.post(
        f"{ADMIN}/{infra['grupo'].id}/usuarios",
        json={"nome": "X", "email": f"x_{uuid.uuid4().hex[:8]}@test-engentoria.com", "senha": "senha123",
              "acesso_financeiro": False, "acesso_vistorias": False},
        headers=_h(ti_token),
    )
    assert sem_permissao.status_code == 400

    email_do_grupo = api_client.post(
        f"{ADMIN}/{infra['grupo'].id}/usuarios",
        json={"nome": "X", "email": infra["grupo"].email, "senha": "senha123"},
        headers=_h(ti_token),
    )
    assert email_do_grupo.status_code == 409

    existente = criar_usuario()
    duplicado = api_client.post(
        f"{ADMIN}/{infra['grupo'].id}/usuarios",
        json={"nome": "X", "email": existente["email"], "senha": "senha123"},
        headers=_h(ti_token),
    )
    assert duplicado.status_code == 409


def test_editar_listar_e_remover_usuario(api_client, ti_token, criar_usuario, infra):
    usuario = criar_usuario()

    grupos = api_client.get(ADMIN, headers=_h(ti_token)).json()
    grupo = next(g for g in grupos if g["id"] == str(infra["grupo"].id))
    assert grupo["acesso_financeiro"] is True and grupo["acesso_vistorias"] is True
    assert any(u["id"] == usuario["id"] for u in grupo["usuarios"])

    resp = api_client.put(
        f"{ADMIN}/usuarios/{usuario['id']}",
        json={"nome": "Editado", "email": usuario["email"], "acesso_financeiro": False, "acesso_vistorias": True},
        headers=_h(ti_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["nome"] == "Editado"
    token = _token(usuario["email"])
    assert api_client.get(f"{IMOB}/relatorio-mensal?mes=1&ano=2025", headers=_h(token)).status_code == 403

    assert api_client.delete(f"{ADMIN}/usuarios/{usuario['id']}", headers=_h(ti_token)).status_code == 204
    assert _login(api_client, usuario["email"]).status_code == 401
    assert api_client.get(f"{IMOB}/me", headers=_h(token)).status_code == 401


def test_ti_altera_permissoes_do_login_principal(api_client, ti_token, infra, grupo_token, db):
    grupo = infra["grupo"]
    url = f"{ADMIN}/{grupo.id}"
    try:
        resp = api_client.put(url, json={"nome": grupo.nome, "email": grupo.email,
                                         "acesso_financeiro": True, "acesso_vistorias": False},
                              headers=_h(ti_token))
        assert resp.status_code == 200, resp.text
        assert api_client.get(f"{IMOB}/agenda?start_date=2025-01-01&end_date=2025-01-31", headers=_h(grupo_token)).status_code == 403

        # Sem os campos, mantém o que está salvo
        resp = api_client.put(url, json={"nome": grupo.nome, "email": grupo.email}, headers=_h(ti_token))
        assert resp.json()["acesso_vistorias"] is False

        resp = api_client.put(url, json={"nome": grupo.nome, "email": grupo.email,
                                         "acesso_financeiro": False, "acesso_vistorias": False},
                              headers=_h(ti_token))
        assert resp.status_code == 400
    finally:
        grupo.acesso_financeiro = True
        grupo.acesso_vistorias = True
        db.commit()
