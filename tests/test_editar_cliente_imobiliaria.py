"""
Testes E2E da edição de clientes pelo painel da imobiliária.

Cobre o endpoint PUT /api/v1/imobiliaria/clientes/{cliente_id}:
  - happy path (cliente do grupo é atualizado e persiste)
  - isolamento multi-tenant (cliente de fora do grupo -> 404)
  - conflito de e-mail (e-mail já usado por outro cliente ativo -> 409)
  - UUID inválido -> 400
  - acesso negado para usuário que não é grupo de imobiliária -> 403
"""

import uuid
import pytest

from backend import models

PREFIX = "/api/v1/imobiliaria/clientes"


def _novo_cliente(db, **extra):
    suffix = uuid.uuid4().hex[:8]
    cliente = models.Cliente(
        nome=extra.get("nome", f"Cliente {suffix}"),
        email=extra.get("email", f"cli_{suffix}@test-engentoria.com"),
        telefone1=extra.get("telefone1"),
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


def test_editar_cliente_do_grupo_sucesso(api_client, grupo_token, db, test_imovel, test_cliente):
    # test_imovel vincula test_cliente à imobiliária da infra (logo, pertence ao grupo)
    novo_email = f"editado_{uuid.uuid4().hex[:8]}@test-engentoria.com"
    payload = {
        "nome": "Nome Editado",
        "email": novo_email,
        "telefone1": "(11) 98888-7777",
        "telefone2": "(11) 3333-2222",
    }

    resp = api_client.put(
        f"{PREFIX}/{test_cliente.id}",
        json=payload,
        headers={"Authorization": f"Bearer {grupo_token}"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["nome"] == "Nome Editado"
    assert body["email"] == novo_email
    assert body["telefone1"] == "(11) 98888-7777"
    assert body["telefone2"] == "(11) 3333-2222"

    # Persistiu no banco
    db.refresh(test_cliente)
    assert test_cliente.nome == "Nome Editado"
    assert test_cliente.email == novo_email


def test_nao_edita_cliente_de_outro_grupo(api_client, grupo_token, db):
    # Cliente sem nenhum imóvel na imobiliária do grupo -> não pertence ao grupo
    foreign = _novo_cliente(db)
    try:
        resp = api_client.put(
            f"{PREFIX}/{foreign.id}",
            json={"nome": "Hacker", "email": foreign.email},
            headers={"Authorization": f"Bearer {grupo_token}"},
        )
        assert resp.status_code == 404, resp.text
        # Não foi alterado
        db.refresh(foreign)
        assert foreign.nome != "Hacker"
    finally:
        db.delete(foreign)
        db.commit()


def test_email_duplicado_retorna_409(api_client, grupo_token, db, test_imovel, test_cliente):
    outro = _novo_cliente(db)
    try:
        resp = api_client.put(
            f"{PREFIX}/{test_cliente.id}",
            json={"nome": test_cliente.nome, "email": outro.email},
            headers={"Authorization": f"Bearer {grupo_token}"},
        )
        assert resp.status_code == 409, resp.text
    finally:
        db.delete(outro)
        db.commit()


def test_uuid_invalido_retorna_400(api_client, grupo_token):
    resp = api_client.put(
        f"{PREFIX}/nao-e-uuid",
        json={"nome": "X", "email": "x@test-engentoria.com"},
        headers={"Authorization": f"Bearer {grupo_token}"},
    )
    assert resp.status_code == 400, resp.text


def test_acesso_negado_para_nao_grupo(api_client, admin_token, test_cliente):
    resp = api_client.put(
        f"{PREFIX}/{test_cliente.id}",
        json={"nome": "X", "email": "x@test-engentoria.com"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 403, resp.text
