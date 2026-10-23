# backend/routes/nao_conformidades_routes.py
"""
Laudo de Não Conformidades (gerado por IA a partir do laudo de ENTRADA).

- Admin: configura o provider/modelo de IA, acompanha, regera e edita os itens.
- Imobiliária: baixa o PDF quando o laudo de entrada está aprovado
  (o laudo de não conformidades é aprovado junto com o laudo de entrada).
"""

import re
import time
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas, auth
from ..config import get_db
from ..ia import servico
from ..ia.pdf_nao_conformidades import gerar_pdf_nao_conformidades
from ..ia.providers import PROVIDERS, ErroProviderIA, chave_configurada, criar_provider, listar_modelos

logger = logging.getLogger(__name__)

router_admin = APIRouter(
    prefix="/admin-panel",
    tags=["Laudo de Não Conformidades"],
    dependencies=[Depends(auth.get_current_admin_user)],
)

router_imobiliaria = APIRouter(
    prefix="/imobiliaria",
    tags=["Laudo de Não Conformidades"],
    dependencies=[Depends(auth.require_acesso_vistorias)],
)


# --- Helpers ---------------------------------------------------------------------

def _uuid(valor: str) -> UUID:
    try:
        return UUID(valor)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID inválido")


def _texto(valor: str, campo: str) -> str:
    valor = (valor or "").strip()
    if not valor:
        raise HTTPException(status_code=400, detail=f"O campo '{campo}' é obrigatório.")
    return valor


def _buscar_laudo(db: Session, laudo_id: UUID) -> models.Laudo:
    laudo = (db.query(models.Laudo)
             .options(joinedload(models.Laudo.agenda),
                      joinedload(models.Laudo.imovel),
                      joinedload(models.Laudo.imobiliaria),
                      joinedload(models.Laudo.vistoriador),
                      joinedload(models.Laudo.analise_nc))
             .filter(models.Laudo.id == laudo_id)
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    return laudo


def _serializar_item(item: models.ItemNaoConformidade) -> dict:
    return {
        "id": item.id,
        "tipo": item.tipo,
        "ambiente": item.ambiente,
        "item": item.item,
        "descricao": item.descricao,
        "categoria": item.categoria,
        "gravidade": item.gravidade,
        "trecho_origem": item.trecho_origem,
        "evidencia_validada": item.evidencia_validada,
        "origem": item.origem,
    }


def _serializar_analise(analise: models.AnaliseNaoConformidade) -> dict:
    return {
        "id": analise.id,
        "status": analise.status,
        "erro": analise.erro,
        "aviso": analise.aviso,
        "fontes": analise.fontes or [],
        "provider": analise.provider,
        "modelo": analise.modelo,
        "prompt_versao": analise.prompt_versao,
        "tentativas": analise.tentativas,
        "tokens_entrada": analise.tokens_entrada,
        "tokens_saida": analise.tokens_saida,
        "iniciado_em": analise.iniciado_em,
        "concluido_em": analise.concluido_em,
        "updated_at": analise.updated_at,
        "itens": [_serializar_item(i) for i in servico.itens_visiveis(analise)],
    }


def _resposta_laudo(db: Session, laudo: models.Laudo) -> dict:
    config = servico.obter_config_ia(db)
    return {
        "laudo_id": laudo.id,
        "tipo_vistoria": laudo.agenda.tipo if laudo.agenda else None,
        "elegivel": servico.laudo_e_de_entrada(laudo),
        "ia_habilitada": config.habilitado,
        "analise": _serializar_analise(laudo.analise_nc) if laudo.analise_nc else None,
    }


def _analise_para_edicao(db: Session, laudo: models.Laudo) -> models.AnaliseNaoConformidade:
    """Análise que o admin pode editar manualmente. Bloqueia durante o processamento,
    pois o resultado da IA substituiria a edição."""
    if not servico.laudo_e_de_entrada(laudo):
        raise HTTPException(status_code=400, detail="Somente laudos de vistoria de ENTRADA possuem laudo de não conformidades.")
    analise = laudo.analise_nc
    if analise is None:
        analise = models.AnaliseNaoConformidade(laudo_id=laudo.id, status="CONCLUIDA", fontes=[])
        db.add(analise)
        db.flush()
    elif analise.status in servico.STATUS_EM_ANDAMENTO:
        raise HTTPException(status_code=409, detail="Aguarde a análise em andamento terminar para editar os itens.")
    elif analise.status == "ERRO":
        # Admin assumiu a lista manualmente: deixa de ser erro e passa a valer o que ele cadastrar
        analise.status = "CONCLUIDA"
        analise.erro = None
        analise.tentativas = servico.MAX_TENTATIVAS
    return analise


def _buscar_item(db: Session, item_id: str) -> models.ItemNaoConformidade:
    item = (db.query(models.ItemNaoConformidade)
            .options(joinedload(models.ItemNaoConformidade.analise))
            .filter(models.ItemNaoConformidade.id == _uuid(item_id))
            .first())
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    if item.analise.status in servico.STATUS_EM_ANDAMENTO:
        raise HTTPException(status_code=409, detail="Aguarde a análise em andamento terminar para editar os itens.")
    return item


def _nome_arquivo(laudo: models.Laudo) -> str:
    codigo = re.sub(r"[^A-Za-z0-9_-]", "", (laudo.imovel.cod_imovel if laudo.imovel else "") or "") or "imovel"
    return f"nao_conformidades_{codigo}_{str(laudo.id)[:8]}.pdf"


async def _pdf_response(laudo: models.Laudo, analise: models.AnaliseNaoConformidade) -> StreamingResponse:
    dados = servico.dados_pdf(laudo, analise)
    buffer = await run_in_threadpool(gerar_pdf_nao_conformidades, dados)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{_nome_arquivo(laudo)}"'},
    )


# --- Admin: configuração de IA ---------------------------------------------------

def _resposta_config(config: models.ConfiguracaoIA) -> dict:
    return {
        "provider": config.provider,
        "modelo": config.modelo,
        "habilitado": config.habilitado,
        "providers": [{
            "id": provider_id,
            "nome": info["nome"],
            "modelo_padrao": info["modelo_padrao"],
            "variavel_ambiente": info["env_key"],
            "chave_configurada": chave_configurada(provider_id),
        } for provider_id, info in PROVIDERS.items()],
    }


@router_admin.get("/ia/config", summary="Configuração do provider de IA")
def obter_config_ia(db: Session = Depends(get_db)):
    return _resposta_config(servico.obter_config_ia(db))


@router_admin.put("/ia/config", summary="Atualiza provider/modelo de IA")
def atualizar_config_ia(payload: schemas.ConfiguracaoIAUpdate, db: Session = Depends(get_db)):
    modelo = payload.modelo.strip()
    if not modelo:
        raise HTTPException(status_code=400, detail="Informe o modelo.")
    config = servico.obter_config_ia(db)
    config.provider = payload.provider.value
    config.modelo = modelo
    config.habilitado = payload.habilitado
    db.commit()
    db.refresh(config)
    return _resposta_config(config)


@router_admin.get("/ia/modelos", summary="Lista os modelos disponíveis no provider (cache de 24h)")
def listar_modelos_ia(provider: schemas.ProviderIAEnum, atualizar: bool = False):
    try:
        resultado = listar_modelos(provider.value, forcar=atualizar)
    except ErroProviderIA as e:
        raise HTTPException(status_code=502, detail=e.mensagem)
    return {
        "provider": resultado["provider"],
        "modelos": resultado["modelos"],
        "atualizado_em": int(resultado["atualizado_em"]),
        "desatualizado": resultado["desatualizado"],
    }


@router_admin.post("/ia/testar", summary="Testa a conexão com o provider de IA")
def testar_config_ia(payload: schemas.TesteIARequest = None, db: Session = Depends(get_db)):
    config = servico.obter_config_ia(db)
    provider_id = payload.provider.value if payload and payload.provider else config.provider
    modelo = (payload.modelo or "").strip() if payload and payload.modelo else config.modelo
    inicio = time.monotonic()
    try:
        provider = criar_provider(provider_id, modelo, timeout=60)
        resposta = provider.completar("Você é um assistente de testes.", "Responda apenas com a palavra OK.")
    except ErroProviderIA as e:
        return {"ok": False, "erro": e.mensagem, "provider": provider_id, "modelo": modelo}
    return {
        "ok": True,
        "provider": provider_id,
        "modelo": modelo,
        "latencia_ms": int((time.monotonic() - inicio) * 1000),
        "resposta": (resposta.conteudo or "").strip()[:200],
    }


@router_admin.get("/ia/uso", summary="Laudos gerados pela IA, tokens e custo estimado no período")
def uso_ia(dias: int = Query(30, ge=0, le=3650, description="Últimos N dias; 0 = todo o período"),
           limite: int = Query(200, ge=1, le=1000),
           db: Session = Depends(get_db)):
    desde = datetime.now(timezone.utc) - timedelta(days=dias) if dias else None
    return {"dias": dias, **servico.relatorio_uso(db, desde, limite)}


# --- Admin: laudo de não conformidades -------------------------------------------

@router_admin.get("/laudo/{id_laudo}/nao-conformidades", summary="Laudo de não conformidades de um laudo")
def ver_nao_conformidades(id_laudo: str, db: Session = Depends(get_db)):
    laudo = _buscar_laudo(db, _uuid(id_laudo))
    return _resposta_laudo(db, laudo)


@router_admin.post("/laudo/{id_laudo}/nao-conformidades/gerar", summary="Gera (ou regera) o laudo de não conformidades")
def gerar_nao_conformidades(id_laudo: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    laudo = _buscar_laudo(db, _uuid(id_laudo))
    if not servico.laudo_e_de_entrada(laudo):
        raise HTTPException(status_code=400, detail="Somente laudos de vistoria de ENTRADA possuem laudo de não conformidades.")
    if not laudo.finalizado:
        raise HTTPException(status_code=400, detail="O laudo ainda não foi finalizado pelo vistoriador.")
    if not servico.obter_config_ia(db).habilitado:
        raise HTTPException(status_code=400, detail="A análise por IA está desabilitada nas configurações.")
    if laudo.analise_nc and laudo.analise_nc.status in servico.STATUS_EM_ANDAMENTO:
        raise HTTPException(status_code=409, detail="Já existe uma análise em andamento para este laudo.")

    analise = servico.enfileirar_analise(db, laudo)
    background_tasks.add_task(servico.processar_analise, analise.id)
    db.refresh(laudo)
    return _resposta_laudo(db, laudo)


@router_admin.post("/laudo/{id_laudo}/nao-conformidades/itens", summary="Adiciona item manualmente")
def adicionar_item_nc(id_laudo: str, payload: schemas.ItemNaoConformidadeCreate, db: Session = Depends(get_db)):
    laudo = _buscar_laudo(db, _uuid(id_laudo))
    analise = _analise_para_edicao(db, laudo)
    proxima_ordem = (db.query(func.coalesce(func.max(models.ItemNaoConformidade.ordem), -1))
                     .filter(models.ItemNaoConformidade.analise_id == analise.id)
                     .scalar()) + 1
    item = models.ItemNaoConformidade(
        analise_id=analise.id,
        tipo=payload.tipo.value,
        ambiente=_texto(payload.ambiente, "ambiente"),
        item=_texto(payload.item, "item"),
        descricao=_texto(payload.descricao, "descricao"),
        categoria=payload.categoria.value,
        gravidade="BAIXA" if payload.tipo == schemas.TipoItemNCEnum.NAO_VERIFICADO else payload.gravidade.value,
        origem="MANUAL",
        evidencia_validada=False,
        ordem=proxima_ordem,
    )
    db.add(item)
    db.commit()
    db.refresh(laudo)
    return _resposta_laudo(db, laudo)


@router_admin.put("/nao-conformidades/itens/{id_item}", summary="Edita item")
def editar_item_nc(id_item: str, payload: schemas.ItemNaoConformidadeUpdate, db: Session = Depends(get_db)):
    item = _buscar_item(db, id_item)
    dados = payload.model_dump(exclude_unset=True, exclude_none=True)
    for campo, valor in dados.items():
        setattr(item, campo, valor.value if hasattr(valor, "value") else _texto(valor, campo))
    if item.tipo == "NAO_VERIFICADO":
        item.gravidade = "BAIXA"
    db.commit()
    db.refresh(item)
    return _serializar_item(item)


@router_admin.delete("/nao-conformidades/itens/{id_item}", summary="Remove item")
def remover_item_nc(id_item: str, db: Session = Depends(get_db)):
    item = _buscar_item(db, id_item)
    db.delete(item)
    db.commit()
    return {"status": "ok"}


@router_admin.get("/laudo/{id_laudo}/nao-conformidades/pdf", summary="PDF do laudo de não conformidades (pré-visualização do admin)")
async def pdf_nao_conformidades_admin(id_laudo: str, db: Session = Depends(get_db)):
    laudo = _buscar_laudo(db, _uuid(id_laudo))
    if not laudo.analise_nc or laudo.analise_nc.status != "CONCLUIDA":
        raise HTTPException(status_code=404, detail="Laudo de não conformidades ainda não disponível.")
    return await _pdf_response(laudo, laudo.analise_nc)


# --- Imobiliária -----------------------------------------------------------------

@router_imobiliaria.get("/laudo/{id_laudo}/nao-conformidades/pdf", summary="PDF do laudo de não conformidades")
async def pdf_nao_conformidades_imobiliaria(
    id_laudo: str,
    db: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group),
):
    laudo_id = _uuid(id_laudo)
    imobiliaria_ids = [imob.id for imob in current_user.imobiliarias]
    laudo = _buscar_laudo(db, laudo_id)
    # 404 (e não 403) para não revelar a existência de laudos de outros grupos
    if (laudo.imobiliaria_id not in imobiliaria_ids or not laudo.aprovado
            or not laudo.analise_nc or laudo.analise_nc.status != "CONCLUIDA"):
        raise HTTPException(status_code=404, detail="Laudo de não conformidades não disponível.")
    return await _pdf_response(laudo, laudo.analise_nc)
