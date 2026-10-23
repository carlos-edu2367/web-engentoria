"""
Testes E2E do Laudo de Não Conformidades.

Cobre:
  - gatilho ao finalizar laudo de ENTRADA (e não de SAÍDA)
  - finalização só pelo vistoriador dono do laudo
  - erro do provider registrado na análise
  - edição manual (admin), regeração e bloqueio durante o processamento
  - configuração do provider de IA
  - visibilidade para a imobiliária: só após aprovação e só para o próprio grupo
  - isolamento de tenant em GET /imobiliaria/laudo/{id} e /categoria/{id}
"""

import json
import uuid
from datetime import date, timedelta

import pytest

from backend import auth, models
from backend.ia import servico
from backend.ia.providers import ErroProviderIA, RespostaIA

API = "/api/v1"

RESPOSTA_IA = {
    "nao_conformidades": [
        {"ambiente": "Banheiro social", "item": "Sifão da pia", "descricao": "Sifão solto com vazamento",
         "categoria": "HIDRAULICA", "gravidade": "MEDIA", "trecho_origem": "Sifão da pia solto com vazamento"},
        {"ambiente": "Quarto", "item": "Tomada", "descricao": "Tomada sem funcionamento",
         "categoria": "ELETRICA", "gravidade": "MEDIA", "trecho_origem": "Tomada ao lado da cama sem funcionamento"},
    ],
    "nao_verificados": [],
}


class FakeProvider:
    def __init__(self, conteudo=None, erro=None):
        self.conteudo = conteudo if conteudo is not None else json.dumps(RESPOSTA_IA)
        self.erro = erro
        self.chamadas = 0

    def completar(self, system, user, schema=None):
        self.chamadas += 1
        if self.erro:
            raise self.erro
        return RespostaIA(conteudo=self.conteudo, tokens_entrada=50, tokens_saida=10)


@pytest.fixture
def fake_provider(monkeypatch):
    provider = FakeProvider()
    monkeypatch.setattr(servico, "criar_provider", lambda *a, **k: provider)
    return provider


@pytest.fixture
def config_ia(db):
    config = servico.obter_config_ia(db)
    config.habilitado = True
    db.commit()
    return config


def _token(email, dashboard):
    return auth.create_access_token(data={"sub": email, "dashboard": dashboard}, expires_delta=timedelta(hours=1))


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def vistoriador_token(infra):
    return _token(infra["vistoriador"].email, "vistoriador")


def _criar_laudo(db, infra, imovel, tipo="ENTRADA"):
    agenda = models.Agenda(
        vistoriador_id=infra["vistoriador"].id, imovel_id=imovel.id,
        data=date.today(), horario="09:00", disponivel=False, tipo=tipo,
    )
    db.add(agenda)
    db.flush()
    laudo = models.Laudo(agenda_id=agenda.id, imovel_id=imovel.id,
                         imobiliaria_id=imovel.imobiliaria_id, user_id=infra["vistoriador"].id)
    db.add(laudo)
    db.flush()
    categoria = models.CategoriaLaudo(laudo_id=laudo.id, titulo="Banheiro social")
    db.add(categoria)
    db.flush()
    db.add(models.ItemCategoria(categoria_id=categoria.id, descricao="Sifão da pia solto com vazamento"))
    db.add(models.ItemCategoria(categoria_id=categoria.id, descricao="Paredes com pequenas manchas"))
    categoria2 = models.CategoriaLaudo(laudo_id=laudo.id, titulo="Quarto")
    db.add(categoria2)
    db.flush()
    db.add(models.ItemCategoria(categoria_id=categoria2.id, descricao="Tomada ao lado da cama sem funcionamento"))
    db.commit()
    db.refresh(laudo)
    return laudo


@pytest.fixture
def laudo_entrada(db, infra, test_imovel):
    laudo = _criar_laudo(db, infra, test_imovel, "ENTRADA")
    yield laudo
    _remover_laudo(db, laudo)


@pytest.fixture
def laudo_saida(db, infra, test_imovel):
    laudo = _criar_laudo(db, infra, test_imovel, "SAIDA")
    yield laudo
    _remover_laudo(db, laudo)


def _remover_laudo(db, laudo):
    db.rollback()
    agenda = db.get(models.Agenda, laudo.agenda_id)
    laudo = db.get(models.Laudo, laudo.id)
    if laudo:
        db.delete(laudo)
    if agenda:
        db.delete(agenda)
    db.commit()


@pytest.fixture
def outro_grupo(db):
    suffix = uuid.uuid4().hex[:8]
    grupo = models.GrupoImobiliaria(nome=f"Outro Grupo {suffix}", email=f"outro_{suffix}@test-engentoria.com",
                                    senha=auth.get_password_hash("senha123"))
    db.add(grupo)
    db.flush()
    imob = models.Imobiliaria(grupo_id=grupo.id, nome=f"Outra Imob {suffix}")
    db.add(imob)
    db.commit()
    yield grupo
    db.delete(imob)
    db.delete(grupo)
    db.commit()


def _finalizar(api_client, token, laudo_id):
    return api_client.put(f"{API}/agenda/laudos/laudo/status?id_laudo={laudo_id}&finalizado=true", headers=_h(token))


def _analise(db, laudo_id):
    db.expire_all()
    return db.query(models.AnaliseNaoConformidade).filter_by(laudo_id=laudo_id).first()


# --- Gatilho ---------------------------------------------------------------------

def test_finalizar_laudo_de_entrada_gera_nao_conformidades(api_client, vistoriador_token, db, laudo_entrada,
                                                           fake_provider, config_ia):
    resp = _finalizar(api_client, vistoriador_token, laudo_entrada.id)
    assert resp.status_code == 200, resp.text

    analise = _analise(db, laudo_entrada.id)
    assert analise is not None
    assert analise.status == "CONCLUIDA", analise.erro
    assert analise.fontes == ["LAUDO_DIGITAL"]
    assert analise.tokens_entrada == 50
    itens = sorted(analise.itens, key=lambda i: i.ordem)
    assert [i.item for i in itens] == ["Sifão da pia", "Tomada"]
    assert all(i.evidencia_validada for i in itens)
    assert all(i.origem == "IA" for i in itens)


def test_finalizar_laudo_de_saida_nao_gera(api_client, vistoriador_token, db, laudo_saida, fake_provider, config_ia):
    resp = _finalizar(api_client, vistoriador_token, laudo_saida.id)
    assert resp.status_code == 200, resp.text
    assert _analise(db, laudo_saida.id) is None
    assert fake_provider.chamadas == 0


def test_ia_desabilitada_nao_gera(api_client, vistoriador_token, db, laudo_entrada, fake_provider, config_ia):
    config_ia.habilitado = False
    db.commit()
    try:
        assert _finalizar(api_client, vistoriador_token, laudo_entrada.id).status_code == 200
        assert _analise(db, laudo_entrada.id) is None
    finally:
        config_ia.habilitado = True
        db.commit()


def test_outro_vistoriador_nao_finaliza_laudo(api_client, db, laudo_entrada, fake_provider, config_ia):
    suffix = uuid.uuid4().hex[:8]
    intruso = models.Usuario(nome="Outro", email=f"outro_vist_{suffix}@test-engentoria.com", tipo="vistoriador",
                             senha=auth.get_password_hash("senha123"))
    db.add(intruso)
    db.commit()
    try:
        resp = _finalizar(api_client, _token(intruso.email, "vistoriador"), laudo_entrada.id)
        assert resp.status_code == 404
        db.refresh(laudo_entrada)
        assert laudo_entrada.finalizado is False
    finally:
        db.delete(intruso)
        db.commit()


def test_erro_do_provider_fica_registrado(api_client, vistoriador_token, db, laudo_entrada, monkeypatch, config_ia):
    provider = FakeProvider(erro=ErroProviderIA("Variável de ambiente OLLAMA_API_KEY não configurada.", recuperavel=False))
    monkeypatch.setattr(servico, "criar_provider", lambda *a, **k: provider)
    assert _finalizar(api_client, vistoriador_token, laudo_entrada.id).status_code == 200

    analise = _analise(db, laudo_entrada.id)
    assert analise.status == "ERRO"
    assert "OLLAMA_API_KEY" in analise.erro
    assert analise.tentativas == servico.MAX_TENTATIVAS  # não recuperável: sem novas tentativas automáticas


def test_varredura_retoma_analise_pendente(db, laudo_entrada, fake_provider, config_ia):
    analise = servico.enfileirar_analise(db, laudo_entrada)
    analise.updated_at = analise.updated_at - timedelta(minutes=10)
    db.commit()

    servico.varrer_analises_pendentes()
    assert _analise(db, laudo_entrada.id).status == "CONCLUIDA"


# --- Admin -----------------------------------------------------------------------

def test_admin_edita_regera_e_baixa_pdf(api_client, admin_token, vistoriador_token, db, laudo_entrada,
                                        fake_provider, config_ia):
    _finalizar(api_client, vistoriador_token, laudo_entrada.id)
    base = f"{API}/admin-panel/laudo/{laudo_entrada.id}/nao-conformidades"

    resp = api_client.get(base, headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["elegivel"] is True
    assert body["analise"]["status"] == "CONCLUIDA"
    itens = body["analise"]["itens"]
    assert len(itens) == 2

    # Edita
    resp = api_client.put(f"{API}/admin-panel/nao-conformidades/itens/{itens[0]['id']}",
                          json={"gravidade": "ALTA", "descricao": "Sifão solto, vazando bastante"},
                          headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["gravidade"] == "ALTA"

    # Remove
    resp = api_client.delete(f"{API}/admin-panel/nao-conformidades/itens/{itens[1]['id']}", headers=_h(admin_token))
    assert resp.status_code == 200

    # Adiciona manual
    resp = api_client.post(f"{base}/itens", headers=_h(admin_token), json={
        "ambiente": "Cozinha", "item": "Torneira", "descricao": "Torneira pingando",
        "categoria": "HIDRAULICA", "gravidade": "BAIXA",
    })
    assert resp.status_code == 200, resp.text
    itens = resp.json()["analise"]["itens"]
    assert [i["item"] for i in itens] == ["Sifão da pia", "Torneira"]
    assert itens[1]["origem"] == "MANUAL"

    # Campo obrigatório só com espaços
    resp = api_client.post(f"{base}/itens", headers=_h(admin_token),
                           json={"ambiente": "  ", "item": "x", "descricao": "y"})
    assert resp.status_code == 400

    # PDF
    resp = api_client.get(f"{base}/pdf", headers=_h(admin_token))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")

    # Regerar substitui os itens pelo resultado da IA
    resp = api_client.post(f"{base}/gerar", headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    analise = _analise(db, laudo_entrada.id)
    assert analise.status == "CONCLUIDA"
    assert sorted(i.item for i in analise.itens) == ["Sifão da pia", "Tomada"]


def test_admin_nao_edita_durante_processamento(api_client, admin_token, db, laudo_entrada, config_ia):
    laudo_entrada.finalizado = True
    db.commit()
    analise = servico.enfileirar_analise(db, laudo_entrada)
    base = f"{API}/admin-panel/laudo/{laudo_entrada.id}/nao-conformidades"

    assert api_client.post(f"{base}/gerar", headers=_h(admin_token)).status_code == 409
    resp = api_client.post(f"{base}/itens", headers=_h(admin_token),
                           json={"ambiente": "Sala", "item": "Janela", "descricao": "Não fecha"})
    assert resp.status_code == 409
    assert analise.status == "PENDENTE"


def test_gerar_exige_laudo_de_entrada_finalizado(api_client, admin_token, laudo_entrada, laudo_saida, config_ia):
    resp = api_client.post(f"{API}/admin-panel/laudo/{laudo_entrada.id}/nao-conformidades/gerar", headers=_h(admin_token))
    assert resp.status_code == 400  # não finalizado
    resp = api_client.post(f"{API}/admin-panel/laudo/{laudo_saida.id}/nao-conformidades/gerar", headers=_h(admin_token))
    assert resp.status_code == 400  # não é de entrada


def test_config_ia(api_client, admin_token, db, config_ia, grupo_token):
    resp = api_client.get(f"{API}/admin-panel/ia/config", headers=_h(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert {p["id"] for p in body["providers"]} == {"ollama_cloud", "openrouter"}
    assert "OLLAMA_API_KEY" not in json.dumps({k: v for k, v in body.items() if k != "providers"})
    original = (body["provider"], body["modelo"])

    try:
        resp = api_client.put(f"{API}/admin-panel/ia/config", headers=_h(admin_token),
                              json={"provider": "openrouter", "modelo": "google/gemma-4-31b-it", "habilitado": True})
        assert resp.status_code == 200, resp.text
        assert resp.json()["provider"] == "openrouter"

        resp = api_client.put(f"{API}/admin-panel/ia/config", headers=_h(admin_token),
                              json={"provider": "chatgpt", "modelo": "x", "habilitado": True})
        assert resp.status_code == 422
    finally:
        api_client.put(f"{API}/admin-panel/ia/config", headers=_h(admin_token),
                       json={"provider": original[0], "modelo": original[1], "habilitado": True})

    # Imobiliária não acessa a configuração
    assert api_client.get(f"{API}/admin-panel/ia/config", headers=_h(grupo_token)).status_code == 403


# --- Imobiliária -----------------------------------------------------------------

def test_imobiliaria_so_ve_apos_aprovacao_e_do_proprio_grupo(api_client, vistoriador_token, admin_token, grupo_token,
                                                            db, laudo_entrada, outro_grupo, fake_provider, config_ia):
    _finalizar(api_client, vistoriador_token, laudo_entrada.id)
    url_pdf = f"{API}/imobiliaria/laudo/{laudo_entrada.id}/nao-conformidades/pdf"

    # Antes da aprovação: indisponível
    assert api_client.get(url_pdf, headers=_h(grupo_token)).status_code == 404

    resp = api_client.put(f"{API}/admin-panel/laudo/status", headers=_h(admin_token),
                          json={"laudo_id": str(laudo_entrada.id), "aprovado": True})
    assert resp.status_code == 200, resp.text

    # Aprovado: o laudo de não conformidades sai aprovado junto
    resp = api_client.get(url_pdf, headers=_h(grupo_token))
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF")

    resp = api_client.get(f"{API}/imobiliaria/laudos", headers=_h(grupo_token))
    assert resp.status_code == 200
    item = next(l for l in resp.json()["laudos"] if l["id"] == str(laudo_entrada.id))
    assert item["qtd_nao_conformidades"] == 2

    # Outro grupo não vê nada deste laudo
    token_outro = _token(outro_grupo.email, "imobiliaria")
    assert api_client.get(url_pdf, headers=_h(token_outro)).status_code == 404
    assert api_client.get(f"{API}/imobiliaria/laudo/{laudo_entrada.id}", headers=_h(token_outro)).status_code == 404
    assert api_client.get(f"{API}/imobiliaria/agenda/{laudo_entrada.agenda_id}/laudo",
                          headers=_h(token_outro)).status_code == 404
    categoria_id = laudo_entrada.categorias[0].id
    assert api_client.get(f"{API}/imobiliaria/categoria/{categoria_id}", headers=_h(token_outro)).status_code == 404

    # O próprio grupo continua vendo
    assert api_client.get(f"{API}/imobiliaria/laudo/{laudo_entrada.id}", headers=_h(grupo_token)).status_code == 200
    assert api_client.get(f"{API}/imobiliaria/categoria/{categoria_id}", headers=_h(grupo_token)).status_code == 200


# --- Arquivo anexado pelo vistoriador ---------------------------------------------

def _pdf_bytes(*linhas):
    import io
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for i, linha in enumerate(linhas):
        c.drawString(72, 720 - i * 20, linha)
    c.showPage()
    c.save()
    return buf.getvalue()


class ProviderQueGuardaTexto(FakeProvider):
    def __init__(self):
        super().__init__()
        self.textos = []

    def completar(self, system, user, schema=None):
        self.textos.append(user)
        return super().completar(system, user, schema)


def _sem_itens_digitais(db, laudo):
    for categoria in list(laudo.categorias):
        db.delete(categoria)
    db.commit()
    db.refresh(laudo)


def test_analisa_pdf_anexado_pelo_vistoriador(api_client, vistoriador_token, db, laudo_entrada, monkeypatch, config_ia):
    _sem_itens_digitais(db, laudo_entrada)
    laudo_entrada.file_path = "LAUDO_VISTORIA_teste.pdf"
    db.commit()
    pdf = _pdf_bytes("Banheiro social: Sifao da pia solto com vazamento.",
                     "Quarto: Tomada ao lado da cama sem funcionamento. Contato: joao@exemplo.com")
    monkeypatch.setattr(servico, "_baixar_arquivo", lambda caminho: pdf)
    provider = ProviderQueGuardaTexto()
    monkeypatch.setattr(servico, "criar_provider", lambda *a, **k: provider)

    assert _finalizar(api_client, vistoriador_token, laudo_entrada.id).status_code == 200

    analise = _analise(db, laudo_entrada.id)
    assert analise.status == "CONCLUIDA", analise.erro
    assert analise.fontes == ["ARQUIVO_ANEXO"]
    assert "Sifao da pia solto" in provider.textos[0]
    assert "joao@exemplo.com" not in provider.textos[0]  # dado pessoal mascarado
    assert len(analise.itens) == 2


def test_pdf_digitalizado_com_laudo_digital_gera_aviso(api_client, vistoriador_token, db, laudo_entrada,
                                                       monkeypatch, fake_provider, config_ia):
    laudo_entrada.file_path = "LAUDO_VISTORIA_escaneado.pdf"
    db.commit()
    monkeypatch.setattr(servico, "_baixar_arquivo", lambda caminho: _pdf_bytes(""))

    assert _finalizar(api_client, vistoriador_token, laudo_entrada.id).status_code == 200

    analise = _analise(db, laudo_entrada.id)
    assert analise.status == "CONCLUIDA"
    assert analise.fontes == ["LAUDO_DIGITAL"]
    assert "digitalizado" in analise.aviso


def test_laudo_sem_conteudo_gera_erro_definitivo(api_client, vistoriador_token, db, laudo_entrada, fake_provider, config_ia):
    _sem_itens_digitais(db, laudo_entrada)

    assert _finalizar(api_client, vistoriador_token, laudo_entrada.id).status_code == 200

    analise = _analise(db, laudo_entrada.id)
    assert analise.status == "ERRO"
    assert analise.tentativas == servico.MAX_TENTATIVAS
    assert fake_provider.chamadas == 0


# --- Uso da IA (painel do admin) -------------------------------------------------

def test_uso_ia_lista_laudos_tokens_e_custo(api_client, admin_token, vistoriador_token, grupo_token, db,
                                            laudo_entrada, fake_provider, config_ia, monkeypatch):
    _finalizar(api_client, vistoriador_token, laudo_entrada.id)
    modelo = f"teste/modelo-{uuid.uuid4().hex[:8]}"
    analise = _analise(db, laudo_entrada.id)
    assert analise.status == "CONCLUIDA"
    analise.provider, analise.modelo = "openrouter", modelo
    db.commit()

    pedidos = []

    def fake_listar(provider, forcar=False):
        pedidos.append(provider)
        return {"modelos": [{"id": modelo, "preco_entrada": 1.0, "preco_saida": 2.0}]}

    monkeypatch.setattr(servico, "listar_modelos", fake_listar)

    resp = api_client.get(f"{API}/admin-panel/ia/uso?dias=7", headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["dias"] == 7
    assert body["resumo"]["geradas_ia"] >= 1
    assert pedidos == ["openrouter"]

    por_modelo = next(m for m in body["modelos"] if m["modelo"] == modelo)
    assert por_modelo["laudos"] == 1
    assert por_modelo["provider_nome"] == "OpenRouter"
    assert por_modelo["media_tokens_entrada"] == 50
    assert por_modelo["media_tokens_saida"] == 10
    assert por_modelo["media_nao_conformidades"] == 2
    assert por_modelo["custo_estimado_usd"] == pytest.approx((50 * 1.0 + 10 * 2.0) / 1_000_000)

    laudo = next(l for l in body["laudos"] if l["laudo_id"] == str(laudo_entrada.id))
    assert laudo["status"] == "CONCLUIDA"
    assert laudo["gerado_por_ia"] is True
    assert laudo["tokens_total"] == 60
    assert laudo["qtd_nao_conformidades"] == 2
    assert laudo["codigo_imovel"] == laudo_entrada.imovel.cod_imovel
    assert laudo["vistoriador"] == "Vistoriador Teste"

    # Lista de preços indisponível: relatório sai sem custo, mas não falha
    def falha(provider, forcar=False):
        raise ErroProviderIA("fora do ar")

    monkeypatch.setattr(servico, "listar_modelos", falha)
    resp = api_client.get(f"{API}/admin-panel/ia/uso?dias=0", headers=_h(admin_token))
    assert resp.status_code == 200, resp.text
    assert next(m for m in resp.json()["modelos"] if m["modelo"] == modelo)["custo_estimado_usd"] is None

    assert api_client.get(f"{API}/admin-panel/ia/uso", headers=_h(grupo_token)).status_code == 403
    assert api_client.get(f"{API}/admin-panel/ia/uso?dias=-1", headers=_h(admin_token)).status_code == 422
