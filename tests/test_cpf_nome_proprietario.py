"""
Testes E2E para os campos:
  - cpf (Cliente)
  - nome_proprietario (SolicitacaoAgendamento e Agenda)

Cenários cobertos:
  1. Criar cliente COM CPF → CPF persiste e é retornado na resposta
  2. Criar cliente SEM CPF → campo é nulo
  3. Criar solicitação COM nome_proprietario (tipo ENTRADA) → campo persiste
  4. Criar solicitação SEM nome_proprietario → campo é nulo
  5. Admin agenda vistoria COM nome_proprietario → campo persiste na Agenda
  6. Admin agenda a partir de solicitação com nome_proprietario (sem enviar o campo
     manualmente) → auto-preenchimento da Agenda
  7. Cliente confirma agendamento via link público → nome_proprietario copiado
     da SolicitacaoAgendamento para a Agenda
"""

import uuid
import pytest
from datetime import date, timedelta

from backend import models


# =============================================================================
# Helpers
# =============================================================================

def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# =============================================================================
# 1 & 2 — CPF do Cliente
# =============================================================================

class TestClienteCPF:
    def test_criar_cliente_com_cpf(self, api_client, grupo_token):
        """CPF opcional é gravado e retornado quando informado."""
        cpf = "123.456.789-09"
        payload = {
            "nome": "Cliente Com CPF",
            "email": f"com_cpf_{uuid.uuid4().hex[:8]}@test-engentoria.com",
            "cpf": cpf,
        }
        resp = api_client.post(
            "/api/v1/agendamento-externo/clientes",
            json=payload,
            headers=_headers(grupo_token),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["cpf"] == cpf, "CPF deve ser retornado na resposta"

        # Verifica persitência no banco
        from backend.config import SessionLocal
        with SessionLocal() as db:
            cliente_db = db.query(models.Cliente).filter(
                models.Cliente.id == data["id"]
            ).first()
            assert cliente_db is not None
            assert cliente_db.cpf == cpf

    def test_criar_cliente_sem_cpf(self, api_client, grupo_token):
        """CPF é None quando não informado."""
        payload = {
            "nome": "Cliente Sem CPF",
            "email": f"sem_cpf_{uuid.uuid4().hex[:8]}@test-engentoria.com",
        }
        resp = api_client.post(
            "/api/v1/agendamento-externo/clientes",
            json=payload,
            headers=_headers(grupo_token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["cpf"] is None

    def test_cpf_retornado_no_display_do_cliente(self, api_client, grupo_token):
        """GET de clientes inclui o campo cpf na resposta."""
        cpf = "987.654.321-00"
        payload = {
            "nome": "Cliente Display CPF",
            "email": f"display_cpf_{uuid.uuid4().hex[:8]}@test-engentoria.com",
            "cpf": cpf,
        }
        create_resp = api_client.post(
            "/api/v1/agendamento-externo/clientes",
            json=payload,
            headers=_headers(grupo_token),
        )
        assert create_resp.status_code == 200
        cliente_id = create_resp.json()["id"]

        # Busca a lista de clientes e localiza o criado
        list_resp = api_client.get(
            "/api/v1/agendamento-externo/clientes",
            headers=_headers(grupo_token),
        )
        assert list_resp.status_code == 200
        clientes = list_resp.json()
        found = next((c for c in clientes if c["id"] == cliente_id), None)
        assert found is not None, "Cliente criado não encontrado na listagem"
        assert found["cpf"] == cpf


# =============================================================================
# 3 & 4 — nome_proprietario na SolicitacaoAgendamento
# =============================================================================

class TestSolicitacaoNomeProprietario:
    def test_solicitacao_com_nome_proprietario(
        self, api_client, grupo_token, test_imovel, test_cliente, infra
    ):
        """nome_proprietario é gravado na solicitação quando informado em vistoria de ENTRADA."""
        nome_prop = "João Proprietário da Silva"
        resp = api_client.post(
            "/api/v1/agendamento-externo/solicitacao",
            data={
                "imovel_id": str(test_imovel.id),
                "cliente_id": str(test_cliente.id),
                "tipo_vistoria": "ENTRADA",
                "origem": "DIRETO_IMOBILIARIA",
                "nome_proprietario": nome_prop,
            },
            headers=_headers(grupo_token),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data.get("nome_proprietario") == nome_prop, (
            "nome_proprietario deve ser retornado na resposta da solicitação"
        )

        # Verifica persistência no banco
        from backend.config import SessionLocal
        with SessionLocal() as db:
            sol = db.query(models.SolicitacaoAgendamento).filter(
                models.SolicitacaoAgendamento.id == data["solicitacao_id"]
            ).first()
            assert sol is not None
            assert sol.nome_proprietario == nome_prop

    def test_solicitacao_sem_nome_proprietario(
        self, api_client, grupo_token, test_imovel, test_cliente
    ):
        """nome_proprietario é None quando não informado."""
        resp = api_client.post(
            "/api/v1/agendamento-externo/solicitacao",
            data={
                "imovel_id": str(test_imovel.id),
                "cliente_id": str(test_cliente.id),
                "tipo_vistoria": "SAIDA",
                "origem": "DIRETO_IMOBILIARIA",
            },
            headers=_headers(grupo_token),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data.get("nome_proprietario") is None


# =============================================================================
# 5 — nome_proprietario na Agenda (agendamento manual pelo admin)
# =============================================================================

class TestAgendaNomeProprietario:
    def test_agendar_com_nome_proprietario(
        self, api_client, admin_token, test_imovel, available_slot, infra
    ):
        """Admin agenda vistoria informando nome_proprietario → campo persiste na Agenda."""
        nome_prop = "Maria Proprietária Souza"
        payload = {
            "horario_id": str(available_slot.id),
            "imovel_id": str(test_imovel.id),
            "imobiliaria_id": str(infra["imobiliaria"].id),
            "tipo": "ENTRADA",
            "nome_proprietario": nome_prop,
            "force_single_slot": True,
        }
        resp = api_client.post(
            "/api/v1/admin-panel/agenda/agendar",
            json=payload,
            headers=_headers(admin_token),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["nome_proprietario"] == nome_prop, (
            "nome_proprietario deve aparecer na resposta do agendamento"
        )

        # Verifica no banco
        from backend.config import SessionLocal
        with SessionLocal() as db:
            agenda = db.query(models.Agenda).filter(
                models.Agenda.id == data["id"]
            ).first()
            assert agenda is not None
            assert agenda.nome_proprietario == nome_prop

    def test_agendar_sem_nome_proprietario(
        self, api_client, admin_token, test_imovel, available_slot, infra
    ):
        """Admin agenda vistoria sem nome_proprietario → campo é None."""
        payload = {
            "horario_id": str(available_slot.id),
            "imovel_id": str(test_imovel.id),
            "imobiliaria_id": str(infra["imobiliaria"].id),
            "tipo": "SAIDA",
            "force_single_slot": True,
        }
        resp = api_client.post(
            "/api/v1/admin-panel/agenda/agendar",
            json=payload,
            headers=_headers(admin_token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["nome_proprietario"] is None


# =============================================================================
# 6 — Auto-preenchimento de nome_proprietario a partir da solicitação
# =============================================================================

class TestAutoFillNomeProprietario:
    def test_autofill_nome_proprietario_da_solicitacao(
        self, api_client, admin_token, grupo_token,
        test_imovel, test_cliente, available_slot, infra
    ):
        """
        Admin agenda sem fornecer nome_proprietario, mas a solicitação vinculada tem
        o campo preenchido → agenda recebe o valor automaticamente.
        """
        nome_prop = "Carlos Auto-Fill Propriedade"

        # Cria solicitação (DIRETO_IMOBILIARIA = PENDENTE_ADMIN)
        sol_resp = api_client.post(
            "/api/v1/agendamento-externo/solicitacao",
            data={
                "imovel_id": str(test_imovel.id),
                "cliente_id": str(test_cliente.id),
                "tipo_vistoria": "ENTRADA",
                "origem": "DIRETO_IMOBILIARIA",
                "nome_proprietario": nome_prop,
            },
            headers=_headers(grupo_token),
        )
        assert sol_resp.status_code == 200, sol_resp.text
        solicitacao_id = sol_resp.json()["id"]

        # Admin confirma o agendamento SEM passar nome_proprietario
        payload = {
            "horario_id": str(available_slot.id),
            "imovel_id": str(test_imovel.id),
            "imobiliaria_id": str(infra["imobiliaria"].id),
            "tipo": "ENTRADA",
            "force_single_slot": True,
            "solicitacao_id": solicitacao_id,
            # Intencionalmente sem "nome_proprietario"
        }
        agenda_resp = api_client.post(
            "/api/v1/admin-panel/agenda/agendar",
            json=payload,
            headers=_headers(admin_token),
        )
        assert agenda_resp.status_code == 200, agenda_resp.text
        data = agenda_resp.json()
        assert data["nome_proprietario"] == nome_prop, (
            "nome_proprietario deve ser copiado automaticamente da solicitação"
        )


# =============================================================================
# 7 — Fluxo público: cliente confirma o link → nome_proprietario é copiado
# =============================================================================

class TestConfirmarAgendamentoPublico:
    def test_confirmar_copia_nome_proprietario(
        self, api_client, grupo_token,
        test_imovel, test_cliente, available_slot, infra
    ):
        """
        Quando o cliente confirma o agendamento pelo link público, o
        nome_proprietario da solicitação é copiado para a Agenda.
        """
        nome_prop = "Pedro Proprietário Público"

        # Cria solicitação como LINK_CLIENTE (status = PENDENTE_CLIENTE)
        sol_resp = api_client.post(
            "/api/v1/agendamento-externo/solicitacao",
            data={
                "imovel_id": str(test_imovel.id),
                "cliente_id": str(test_cliente.id),
                "tipo_vistoria": "ENTRADA",
                "origem": "LINK_CLIENTE",
                "nome_proprietario": nome_prop,
            },
            headers=_headers(grupo_token),
        )
        assert sol_resp.status_code == 200, sol_resp.text
        token = sol_resp.json()["token"]

        # Confirma pelo endpoint público
        confirm_resp = api_client.post(
            f"/api/v1/publico/agendamento/{token}/confirmar",
            json={"agenda_id": str(available_slot.id)},
        )
        assert confirm_resp.status_code == 200, confirm_resp.text
        assert "Agendamento confirmado" in confirm_resp.json().get("message", "")

        # Verifica que nome_proprietario foi copiado para o slot
        from backend.config import SessionLocal
        with SessionLocal() as db:
            agenda = db.query(models.Agenda).filter(
                models.Agenda.id == available_slot.id
            ).first()
            assert agenda is not None
            assert agenda.nome_proprietario == nome_prop, (
                "nome_proprietario deve ser copiado da solicitação para a agenda"
            )
