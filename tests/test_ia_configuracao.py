"""
Testes E2E da configuração de IA compartilhada:
  - GET /admin-panel/ia/modelos (lista de modelos do provider)
  - Insight IA da agenda usando o provider/modelo configurados
"""

from datetime import date, timedelta

import pytest

from backend import models
from backend.ia import servico
from backend.ia.providers import ErroProviderIA, RespostaIA

API = "/api/v1/admin-panel"


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def config_openrouter(db):
    config = servico.obter_config_ia(db)
    original = (config.provider, config.modelo)
    config.provider, config.modelo = "openrouter", "google/gemma-4-31b-it"
    db.commit()
    yield config
    config.provider, config.modelo = original
    db.commit()


def test_lista_modelos_do_provider(api_client, admin_token, grupo_token, monkeypatch):
    import backend.routes.nao_conformidades_routes as rotas
    pedidos = []

    def fake_listar(provider, forcar=False):
        pedidos.append((provider, forcar))
        return {"provider": provider, "modelos": [{"id": "gemma4:31b", "nome": "gemma4:31b"}],
                "atualizado_em": 1_700_000_000.5, "desatualizado": False}

    monkeypatch.setattr(rotas, "listar_modelos", fake_listar)
    resp = api_client.get(f"{API}/ia/modelos?provider=ollama_cloud&atualizar=true", headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["modelos"][0]["id"] == "gemma4:31b"
    assert resp.json()["atualizado_em"] == 1_700_000_000
    assert pedidos == [("ollama_cloud", True)]

    assert api_client.get(f"{API}/ia/modelos?provider=chatgpt", headers=_h(admin_token)).status_code == 422
    assert api_client.get(f"{API}/ia/modelos?provider=openrouter", headers=_h(grupo_token)).status_code == 403

    def falha(provider, forcar=False):
        raise ErroProviderIA("Não foi possível obter a lista de modelos de OpenRouter.")

    monkeypatch.setattr(rotas, "listar_modelos", falha)
    resp = api_client.get(f"{API}/ia/modelos?provider=openrouter", headers=_h(admin_token))
    assert resp.status_code == 502
    assert "lista de modelos" in resp.json()["detail"]


@pytest.fixture
def vistoria_amanha(db, infra, test_imovel):
    agenda = models.Agenda(vistoriador_id=infra["vistoriador"].id, imovel_id=test_imovel.id,
                           data=date.today() + timedelta(days=1), horario="09:00", disponivel=False, tipo="ENTRADA")
    db.add(agenda)
    db.commit()
    yield agenda
    db.delete(agenda)
    db.commit()


def test_insight_da_agenda_usa_provider_e_modelo_configurados(api_client, admin_token, monkeypatch,
                                                            config_openrouter, vistoria_amanha, test_imovel):
    import backend.routes.admin_panel_routes as admin_routes
    usados = {}

    class Fake:
        def completar(self, system, user, schema=None):
            usados["prompt"] = user
            return RespostaIA(conteudo="  A agenda dos próximos 3 dias parece equilibrada.  ")

    def fake_criar(provider, modelo, timeout=None):
        usados["provider"], usados["modelo"] = provider, modelo
        return Fake()

    monkeypatch.setattr(admin_routes, "criar_provider", fake_criar)
    resp = api_client.get(f"{API}/dashboard/analise-ia", headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["message"] == "A agenda dos próximos 3 dias parece equilibrada."
    assert (usados["provider"], usados["modelo"]) == ("openrouter", "google/gemma-4-31b-it")
    assert test_imovel.cod_imovel in usados["prompt"]


def test_insight_da_agenda_erro_do_provider_vira_502(api_client, admin_token, monkeypatch,
                                                    config_openrouter, vistoria_amanha):
    import backend.routes.admin_panel_routes as admin_routes

    def sem_chave(provider, modelo, timeout=None):
        raise ErroProviderIA("Variável de ambiente OPENROUTER_API_KEY não configurada no servidor.", recuperavel=False)

    monkeypatch.setattr(admin_routes, "criar_provider", sem_chave)
    resp = api_client.get(f"{API}/dashboard/analise-ia", headers=_h(admin_token))
    assert resp.status_code == 502
    assert "OPENROUTER_API_KEY" in resp.json()["detail"]
