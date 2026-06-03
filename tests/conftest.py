"""
Configuração dos testes E2E.

Requisitos:
  - .env com DATABASE_URL e SECRET_KEY válidos (mesmo banco da produção / banco de testes)
  - Supabase e envio de e-mail são mockados automaticamente

Execução:
  cd <raiz-do-projeto>
  pytest tests/ -v
"""

import os
import uuid
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Mock do cliente Supabase ANTES de qualquer import do backend.
# supabase_client.py chama create_client() no nível do módulo; se não houver
# credenciais válidas isso geraria um erro ao importar.
# ---------------------------------------------------------------------------
_mock_supabase = MagicMock()
_mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
    "signedURL": "https://test.supabase.co/storage/v1/signed/test"
}
_mock_supabase.storage.from_.return_value.upload.return_value = None
_mock_supabase.storage.from_.return_value.remove.return_value = []

with patch("supabase.create_client", return_value=_mock_supabase):
    from backend.main import app
    from backend.config import get_db, SessionLocal
    from backend import models, auth

# Substitui as referências ao supabase já importadas pelos módulos de rotas
import backend.supabase_client as _sc
_sc.supabase = _mock_supabase

import backend.routes.agendamento_externo_routes as _aer
_aer.supabase = _mock_supabase

import backend.routes.admin_panel_routes as _apr
if hasattr(_apr, "supabase"):
    _apr.supabase = _mock_supabase


# ---------------------------------------------------------------------------
# Infraestrutura compartilhada (criada uma vez por sessão de testes)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def infra():
    """
    Cria no banco de dados real os objetos base necessários para os testes:
    GrupoImobiliaria → Imobiliaria, Usuario admin, Usuario vistoriador.

    Removidos ao final da sessão.
    """
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]

    grupo = models.GrupoImobiliaria(
        nome=f"Grupo Teste {suffix}",
        email=f"grupo_{suffix}@test-engentoria.com",
        senha=auth.get_password_hash("senha123"),
    )
    db.add(grupo)
    db.flush()

    imob = models.Imobiliaria(
        grupo_id=grupo.id,
        nome=f"Imobiliaria Teste {suffix}",
        valor_sem_mobilia=200.0,
        valor_semi_mobiliado=250.0,
        valor_mobiliado=300.0,
        valor_minimo=100.0,
    )
    db.add(imob)
    db.flush()

    admin = models.Usuario(
        nome="Admin Teste",
        email=f"admin_{suffix}@test-engentoria.com",
        tipo="admin",
        senha=auth.get_password_hash("senha123"),
    )
    db.add(admin)
    db.flush()

    vistor = models.Usuario(
        nome="Vistoriador Teste",
        email=f"vistor_{suffix}@test-engentoria.com",
        tipo="vistoriador",
        senha=auth.get_password_hash("senha123"),
    )
    db.add(vistor)
    db.flush()

    db.commit()

    yield {
        "db": db,
        "grupo": grupo,
        "imobiliaria": imob,
        "admin": admin,
        "vistoriador": vistor,
    }

    # Teardown
    db.delete(vistor)
    db.delete(admin)
    db.delete(imob)
    db.delete(grupo)
    db.commit()
    db.close()


@pytest.fixture
def db(infra):
    return infra["db"]


@pytest.fixture
def admin_token(infra):
    return auth.create_access_token(
        data={"sub": infra["admin"].email, "dashboard": "admin"},
        expires_delta=timedelta(hours=1),
    )


@pytest.fixture
def grupo_token(infra):
    return auth.create_access_token(
        data={"sub": infra["grupo"].email, "dashboard": "imobiliaria"},
        expires_delta=timedelta(hours=1),
    )


@pytest.fixture
def api_client(infra, monkeypatch):
    """
    FastAPI TestClient com:
      - Sessão de banco sobrescrita (usa a mesma sessão da infra)
      - Envio de e-mail mockado
    """
    db = infra["db"]

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr("backend.email_utils.send_email", MagicMock())
    monkeypatch.setattr("backend.routes.agendamento_externo_routes.send_email", MagicMock(), raising=False)

    from fastapi.testclient import TestClient
    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Fixtures de dados reutilizáveis (criados e destruídos por teste)
# ---------------------------------------------------------------------------

@pytest.fixture
def test_cliente(infra):
    """Cliente de teste sem CPF."""
    db = infra["db"]
    suffix = uuid.uuid4().hex[:8]
    cliente = models.Cliente(
        nome=f"Cliente Teste {suffix}",
        email=f"cli_{suffix}@test-engentoria.com",
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    yield cliente
    db.delete(cliente)
    db.commit()


@pytest.fixture
def test_imovel(infra, test_cliente):
    """Imóvel de teste vinculado ao cliente e à imobiliária da infra."""
    db = infra["db"]
    suffix = uuid.uuid4().hex[:8]
    imovel = models.Imovel(
        cod_imovel=f"TEST-{suffix}",
        cliente_id=test_cliente.id,
        imobiliaria_id=infra["imobiliaria"].id,
        endereco=f"Rua Teste {suffix}, 123",
        tamanho=60.0,
        mobiliado="sem_mobilia",
        valor=200.0,
    )
    db.add(imovel)
    db.commit()
    db.refresh(imovel)
    yield imovel
    db.delete(imovel)
    db.commit()


@pytest.fixture
def available_slot(infra):
    """Slot de agenda disponível para o vistoriador de teste."""
    db = infra["db"]
    slot = models.Agenda(
        vistoriador_id=infra["vistoriador"].id,
        data=date.today() + timedelta(days=3),
        horario="10:00",
        disponivel=True,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    yield slot
    # O slot pode ter sido consumido pelo teste; deleta se ainda existir
    db.delete(slot)
    try:
        db.commit()
    except Exception:
        db.rollback()
