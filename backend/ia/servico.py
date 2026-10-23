# backend/ia/servico.py
"""
Orquestração do Laudo de Não Conformidades com o banco de dados:
fila (status no banco), execução em background, varredura de pendências
e montagem dos dados para PDF/listagens.
"""

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .. import models
from ..config import SessionLocal
from . import extracao
from .extracao import Bloco, ErroExtracao
from .nao_conformidades import analisar_blocos, ErroAnalise, MAX_PARTES, PROMPT_VERSAO, ResultadoAnalise
from .providers import PROVIDERS, PROVIDER_PADRAO, ErroProviderIA, criar_provider, listar_modelos

logger = logging.getLogger(__name__)

MAX_TENTATIVAS = 3
STATUS_EM_ANDAMENTO = ("PENDENTE", "PROCESSANDO")
PENDENTE_SEM_EXECUCAO_APOS = timedelta(minutes=2)
PROCESSANDO_TRAVADO_APOS = timedelta(minutes=20)
RETENTAR_ERRO_APOS = timedelta(minutes=5)

Analise = models.AnaliseNaoConformidade
Item = models.ItemNaoConformidade


def _agora() -> datetime:
    return datetime.now(timezone.utc)


# --- Configuração ----------------------------------------------------------------

def obter_config_ia(db: Session) -> models.ConfiguracaoIA:
    config = db.query(models.ConfiguracaoIA).filter(models.ConfiguracaoIA.id == 1).first()
    if not config:
        config = models.ConfiguracaoIA(
            id=1,
            provider=PROVIDER_PADRAO,
            modelo=PROVIDERS[PROVIDER_PADRAO]["modelo_padrao"],
            habilitado=True,
        )
        db.add(config)
        try:
            db.commit()
        except IntegrityError:  # outra requisição criou a linha ao mesmo tempo
            db.rollback()
            return db.query(models.ConfiguracaoIA).filter(models.ConfiguracaoIA.id == 1).one()
        db.refresh(config)
    return config


# --- Regras ---------------------------------------------------------------------

def laudo_e_de_entrada(laudo: models.Laudo) -> bool:
    return bool(laudo.agenda and (laudo.agenda.tipo or "").upper() == "ENTRADA")


def arquivo_anexado(laudo: models.Laudo) -> Optional[str]:
    # Laudos antigos podem ter file_path == "false" (bug antigo ao remover o anexo)
    caminho = laudo.file_path
    if not caminho or str(caminho).strip().lower() in ("false", "none", "null"):
        return None
    return caminho


# --- Fila -----------------------------------------------------------------------

def enfileirar_analise(db: Session, laudo: models.Laudo) -> models.AnaliseNaoConformidade:
    """Cria ou reinicia a análise do laudo com status PENDENTE.
    Uma execução em andamento perde a posse do resultado (execucao_id zerado)."""
    analise = laudo.analise_nc
    if analise is None:
        analise = Analise(laudo_id=laudo.id)
        db.add(analise)
    analise.status = "PENDENTE"
    analise.execucao_id = None
    analise.tentativas = 0
    analise.erro = None
    analise.aviso = None
    analise.updated_at = _agora()
    db.commit()
    db.refresh(analise)
    return analise


def agendar_analise_ao_finalizar(db: Session, laudo: models.Laudo, background_tasks) -> bool:
    """Gatilho chamado quando o vistoriador finaliza o laudo. Nunca propaga erro:
    falhar aqui não pode impedir a finalização do laudo."""
    try:
        if not laudo_e_de_entrada(laudo):
            return False
        if not obter_config_ia(db).habilitado:
            return False
        analise = enfileirar_analise(db, laudo)
        background_tasks.add_task(processar_analise, analise.id)
        return True
    except Exception:
        logger.exception(f"[IA] Falha ao enfileirar análise de não conformidades do laudo {laudo.id}")
        db.rollback()
        return False


# --- Execução -------------------------------------------------------------------

def _reivindicar(db: Session, analise_id) -> Optional[uuid.UUID]:
    """Claim atômico: só uma execução assume a análise PENDENTE."""
    execucao = uuid.uuid4()
    linhas = (db.query(Analise)
              .filter(Analise.id == analise_id, Analise.status == "PENDENTE")
              .update({
                  Analise.status: "PROCESSANDO",
                  Analise.execucao_id: execucao,
                  Analise.iniciado_em: _agora(),
                  Analise.tentativas: Analise.tentativas + 1,
                  Analise.erro: None,
                  Analise.updated_at: _agora(),
              }, synchronize_session=False))
    db.commit()
    return execucao if linhas else None


def _baixar_arquivo(caminho: str) -> bytes:
    from ..supabase_client import supabase
    try:
        return supabase.storage.from_("documentos").download(caminho)
    except Exception as e:
        logger.warning(f"[IA] Falha ao baixar '{caminho}' do storage: {e}")
        raise ErroAnalise("Não foi possível baixar o arquivo anexado ao laudo.", recuperavel=True)


def _blocos_do_arquivo(caminho: str) -> List[Bloco]:
    extensao = os.path.splitext(caminho)[1].lower()
    if extensao not in (".pdf", ".docx"):
        raise ErroExtracao(f"Formato de arquivo anexado não suportado para análise ({extensao or 'sem extensão'}).")
    conteudo = _baixar_arquivo(caminho)
    if extensao == ".pdf":
        paginas = extracao.extrair_paginas_pdf(conteudo)
        if extracao.pdf_parece_digitalizado(paginas):
            raise ErroExtracao("O PDF anexado não possui texto extraível (parece ser digitalizado ou composto só de imagens).")
        return extracao.blocos_pdf(paginas)
    return extracao.blocos_docx(extracao.extrair_texto_docx(conteudo))


def coletar_blocos(laudo: models.Laudo) -> Tuple[List[Bloco], List[str], Optional[str]]:
    """Retorna (blocos, fontes usadas, aviso). Usa o laudo digital e o arquivo anexado."""
    blocos: List[Bloco] = []
    fontes: List[str] = []
    aviso = None

    categorias = sorted(laudo.categorias, key=lambda c: c.created_at or _agora())
    digitais = extracao.blocos_laudo_digital(
        (c.titulo, [i.descricao for i in sorted(c.itens, key=lambda i: i.created_at or _agora())])
        for c in categorias
    )
    if digitais:
        blocos += digitais
        fontes.append("LAUDO_DIGITAL")

    caminho = arquivo_anexado(laudo)
    if caminho:
        try:
            do_arquivo = _blocos_do_arquivo(caminho)
        except (ErroExtracao, ErroAnalise) as e:
            if not blocos:
                raise
            aviso = f"{getattr(e, 'mensagem', e)} A análise considerou apenas os itens do laudo digital."
        else:
            if do_arquivo:
                blocos += do_arquivo
                fontes.append("ARQUIVO_ANEXO")

    if not blocos:
        raise ErroExtracao("O laudo não possui itens descritos nem arquivo anexado com texto para analisar.")
    return blocos, fontes, aviso


def processar_analise(analise_id) -> None:
    """Executa a análise (chamada por BackgroundTasks ou pela varredura). Usa sessão própria."""
    db = SessionLocal()
    try:
        execucao = _reivindicar(db, analise_id)
        if not execucao:
            return  # já está sendo processada por outra execução ou não está pendente

        analise = (db.query(Analise)
                   .options(joinedload(Analise.laudo).joinedload(models.Laudo.agenda))
                   .filter(Analise.id == analise_id).first())
        if not analise:
            return
        config = obter_config_ia(db)
        provider_id, modelo = config.provider, config.modelo
        try:
            blocos, fontes, aviso = coletar_blocos(analise.laudo)
            db.commit()  # libera a conexão durante as chamadas ao LLM (que podem levar minutos)
            provider = criar_provider(provider_id, modelo)
            resultado = analisar_blocos(blocos, provider)
        except ErroExtracao as e:
            _registrar_erro(db, analise_id, execucao, str(e), recuperavel=False)
            return
        except (ErroAnalise, ErroProviderIA) as e:
            _registrar_erro(db, analise_id, execucao, e.mensagem, recuperavel=e.recuperavel)
            return
        except Exception:
            logger.exception(f"[IA] Erro inesperado na análise {analise_id}")
            _registrar_erro(db, analise_id, execucao, "Erro inesperado ao processar a análise.", recuperavel=True)
            return

        if resultado.truncado:
            aviso_truncado = (f"Laudo muito extenso: foram analisadas apenas as {MAX_PARTES} primeiras partes "
                              f"de {resultado.partes}.")
            aviso = f"{aviso} {aviso_truncado}" if aviso else aviso_truncado
        _salvar_resultado(db, analise_id, execucao, resultado, fontes, aviso, provider_id, modelo)
    finally:
        db.close()


def _registrar_erro(db: Session, analise_id, execucao, mensagem: str, recuperavel: bool) -> None:
    db.rollback()
    valores = {Analise.status: "ERRO", Analise.erro: mensagem[:1000], Analise.updated_at: _agora()}
    if not recuperavel:
        valores[Analise.tentativas] = MAX_TENTATIVAS  # não adianta tentar de novo automaticamente
    (db.query(Analise)
     .filter(Analise.id == analise_id, Analise.execucao_id == execucao)
     .update(valores, synchronize_session=False))
    db.commit()
    logger.warning(f"[IA] Análise {analise_id} com erro (recuperável={recuperavel}): {mensagem}")


def _salvar_resultado(db: Session, analise_id, execucao, resultado: ResultadoAnalise, fontes, aviso,
                      provider_id: str, modelo: str) -> None:
    analise = (db.query(Analise)
               .filter(Analise.id == analise_id)
               .with_for_update()
               .first())
    if not analise or analise.execucao_id != execucao or analise.status != "PROCESSANDO":
        db.rollback()
        logger.info(f"[IA] Resultado da análise {analise_id} descartado: análise reiniciada durante o processamento.")
        return

    db.query(Item).filter(Item.analise_id == analise.id).delete(synchronize_session=False)
    for ordem, item in enumerate(resultado.itens):
        db.add(Item(
            analise_id=analise.id,
            tipo=item.tipo,
            ambiente=item.ambiente,
            item=item.item,
            descricao=item.descricao,
            categoria=item.categoria,
            gravidade=item.gravidade,
            trecho_origem=item.trecho_origem,
            evidencia_validada=item.evidencia_validada,
            origem="IA",
            ordem=ordem,
        ))
    analise.status = "CONCLUIDA"
    analise.fontes = fontes
    analise.aviso = aviso
    analise.erro = None
    analise.provider = provider_id
    analise.modelo = modelo
    analise.prompt_versao = PROMPT_VERSAO
    analise.tokens_entrada = resultado.tokens_entrada
    analise.tokens_saida = resultado.tokens_saida
    analise.concluido_em = _agora()
    analise.updated_at = _agora()
    db.commit()
    logger.info(f"[IA] Análise {analise_id} concluída: {len(resultado.itens)} item(ns), "
                f"{resultado.tokens_entrada}/{resultado.tokens_saida} tokens.")


def varrer_analises_pendentes() -> None:
    """Job periódico: retoma análises interrompidas (deploy/reinício) e re-tenta erros recuperáveis."""
    db = SessionLocal()
    try:
        agora = _agora()
        travadas = (db.query(Analise)
                    .filter(Analise.status == "PROCESSANDO", Analise.iniciado_em < agora - PROCESSANDO_TRAVADO_APOS)
                    .all())
        for analise in travadas:
            analise.execucao_id = None
            analise.updated_at = agora
            if analise.tentativas >= MAX_TENTATIVAS:
                analise.status = "ERRO"
                analise.erro = "A análise excedeu o tempo limite."
            else:
                analise.status = "PENDENTE"

        (db.query(Analise)
         .filter(Analise.status == "ERRO", Analise.tentativas < MAX_TENTATIVAS,
                 Analise.updated_at < agora - RETENTAR_ERRO_APOS)
         .update({Analise.status: "PENDENTE", Analise.execucao_id: None, Analise.updated_at: agora},
                 synchronize_session=False))
        db.commit()

        ids = [row.id for row in (db.query(Analise.id)
                                  .filter(Analise.status == "PENDENTE",
                                          Analise.updated_at < agora - PENDENTE_SEM_EXECUCAO_APOS)
                                  .all())]
    except Exception:
        logger.exception("[IA] Falha na varredura de análises pendentes")
        db.rollback()
        ids = []
    finally:
        db.close()

    for analise_id in ids:
        processar_analise(analise_id)


# --- Leitura --------------------------------------------------------------------

def itens_visiveis(analise: models.AnaliseNaoConformidade) -> List[models.ItemNaoConformidade]:
    return sorted(analise.itens, key=lambda i: (i.ordem, i.created_at or _agora()))


def qtd_nao_conformidades_por_laudo(db: Session, laudo_ids: Iterable) -> Dict:
    """{laudo_id: qtd de não conformidades} apenas para análises CONCLUIDAS."""
    laudo_ids = list(laudo_ids)
    if not laudo_ids:
        return {}
    linhas = (db.query(Analise.laudo_id, func.count(Item.id))
              .outerjoin(Item, (Item.analise_id == Analise.id) & (Item.tipo == "NAO_CONFORMIDADE"))
              .filter(Analise.laudo_id.in_(laudo_ids), Analise.status == "CONCLUIDA")
              .group_by(Analise.laudo_id)
              .all())
    return {laudo_id: qtd for laudo_id, qtd in linhas}


def dados_pdf(laudo: models.Laudo, analise: models.AnaliseNaoConformidade) -> dict:
    return {
        "codigo_imovel": laudo.imovel.cod_imovel if laudo.imovel else None,
        "endereco": laudo.imovel.endereco if laudo.imovel else None,
        "imobiliaria": laudo.imobiliaria.nome if laudo.imobiliaria else None,
        "vistoriador": laudo.vistoriador.nome if laudo.vistoriador else None,
        "data_vistoria": laudo.agenda.data if laudo.agenda else None,
        "itens": [{
            "tipo": i.tipo,
            "ambiente": i.ambiente,
            "item": i.item,
            "descricao": i.descricao,
            "categoria": i.categoria,
            "gravidade": i.gravidade,
        } for i in itens_visiveis(analise)],
    }


# --- Uso da IA (painel do admin) ---------------------------------------------------

def _precos_por_modelo(provider: str) -> Dict[str, Tuple[Optional[float], Optional[float]]]:
    """{modelo: (US$/1M tokens de entrada, US$/1M de saída)} com os preços atuais do provider.
    Vazio se o provider não cobra por token (Ollama Cloud) ou se a lista falhar."""
    if provider != "openrouter":
        return {}
    try:
        modelos = listar_modelos(provider)["modelos"]
    except ErroProviderIA:
        return {}
    return {m["id"]: (m.get("preco_entrada"), m.get("preco_saida")) for m in modelos}


def _custo_usd(precos, tokens_entrada: int, tokens_saida: int) -> Optional[float]:
    if not precos or precos[0] is None or precos[1] is None:
        return None
    return round((tokens_entrada * precos[0] + tokens_saida * precos[1]) / 1_000_000, 6)


def _media(soma, qtd) -> Optional[float]:
    return round(soma / qtd, 1) if qtd else None


def relatorio_uso(db: Session, desde: Optional[datetime], limite: int) -> dict:
    """Resumo das análises feitas pela IA no período: quantidade, tokens, tempo, custo estimado
    e a lista dos laudos (mais recentes primeiro).

    Só a última execução de cada laudo fica registrada (regerar substitui os tokens anteriores)."""
    data_ref = func.coalesce(Analise.concluido_em, Analise.updated_at, Analise.created_at)
    filtros = [data_ref >= desde] if desde else []
    # provider só é gravado quando a IA conclui; análises montadas à mão pelo admin ficam sem ele
    concluida_ia = (Analise.status == "CONCLUIDA") & Analise.provider.isnot(None)

    qtd_itens = (db.query(Item.analise_id,
                          func.count(Item.id).filter(Item.tipo == "NAO_CONFORMIDADE").label("ncs"),
                          func.count(Item.id).filter(Item.tipo == "NAO_VERIFICADO").label("nao_verificados"))
                 .group_by(Item.analise_id)
                 .subquery())

    por_status = dict(db.query(Analise.status, func.count(Analise.id))
                      .filter(*filtros).group_by(Analise.status).all())
    manuais = (db.query(func.count(Analise.id))
               .filter(*filtros, Analise.status == "CONCLUIDA", Analise.provider.is_(None))
               .scalar())

    duracao = func.extract("epoch", Analise.concluido_em - Analise.iniciado_em)
    linhas_modelo = (db.query(Analise.provider, Analise.modelo,
                              func.count(Analise.id),
                              func.count(Analise.tokens_entrada),
                              func.coalesce(func.sum(Analise.tokens_entrada), 0),
                              func.coalesce(func.sum(Analise.tokens_saida), 0),
                              func.max(func.coalesce(Analise.tokens_entrada, 0) + func.coalesce(Analise.tokens_saida, 0)),
                              func.avg(duracao),
                              func.coalesce(func.sum(qtd_itens.c.ncs), 0))
                     .outerjoin(qtd_itens, qtd_itens.c.analise_id == Analise.id)
                     .filter(*filtros, concluida_ia)
                     .group_by(Analise.provider, Analise.modelo)
                     .all())

    precos = {p: _precos_por_modelo(p) for p in {linha[0] for linha in linhas_modelo}}
    modelos = []
    total_ncs = 0
    for provider, modelo, qtd, com_tokens, soma_ent, soma_sai, maximo, dur, ncs in linhas_modelo:
        ncs = int(ncs)
        total_ncs += ncs
        modelos.append({
            "provider": provider,
            "provider_nome": PROVIDERS.get(provider, {}).get("nome", provider),
            "modelo": modelo,
            "laudos": qtd,
            "laudos_com_tokens": com_tokens,
            "tokens_entrada": int(soma_ent),
            "tokens_saida": int(soma_sai),
            "media_tokens_entrada": _media(soma_ent, com_tokens),
            "media_tokens_saida": _media(soma_sai, com_tokens),
            "media_tokens_total": _media(soma_ent + soma_sai, com_tokens),
            "max_tokens_total": int(maximo or 0),
            "duracao_media_s": round(float(dur), 1) if dur is not None else None,
            "media_nao_conformidades": _media(ncs, qtd),
            "custo_estimado_usd": _custo_usd(precos[provider].get(modelo), soma_ent, soma_sai),
        })
    modelos.sort(key=lambda m: -m["laudos"])

    geradas = sum(m["laudos"] for m in modelos)
    com_tokens = sum(m["laudos_com_tokens"] for m in modelos)
    soma_ent = sum(m["tokens_entrada"] for m in modelos)
    soma_sai = sum(m["tokens_saida"] for m in modelos)
    soma_dur = sum(m["duracao_media_s"] * m["laudos"] for m in modelos if m["duracao_media_s"] is not None)
    qtd_dur = sum(m["laudos"] for m in modelos if m["duracao_media_s"] is not None)
    custos = [m["custo_estimado_usd"] for m in modelos if m["custo_estimado_usd"] is not None]
    erros = por_status.get("ERRO", 0)

    analises = (db.query(Analise, qtd_itens.c.ncs, qtd_itens.c.nao_verificados)
                .outerjoin(qtd_itens, qtd_itens.c.analise_id == Analise.id)
                .options(joinedload(Analise.laudo).joinedload(models.Laudo.agenda),
                         joinedload(Analise.laudo).joinedload(models.Laudo.imovel),
                         joinedload(Analise.laudo).joinedload(models.Laudo.imobiliaria),
                         joinedload(Analise.laudo).joinedload(models.Laudo.vistoriador))
                .filter(*filtros)
                .order_by(data_ref.desc())
                .limit(limite)
                .all())

    laudos = []
    for analise, ncs, nao_verificados in analises:
        laudo = analise.laudo
        duracao_s = None
        if analise.status == "CONCLUIDA" and analise.provider and analise.concluido_em and analise.iniciado_em:
            duracao_s = round((analise.concluido_em - analise.iniciado_em).total_seconds(), 1)
        tokens = None
        if analise.tokens_entrada is not None or analise.tokens_saida is not None:
            tokens = (analise.tokens_entrada or 0) + (analise.tokens_saida or 0)
        laudos.append({
            "laudo_id": laudo.id,
            "status": analise.status,
            "gerado_por_ia": analise.provider is not None,
            "provider": analise.provider,
            "modelo": analise.modelo,
            "tokens_entrada": analise.tokens_entrada,
            "tokens_saida": analise.tokens_saida,
            "tokens_total": tokens,
            "duracao_s": duracao_s,
            "tentativas": analise.tentativas,
            "erro": analise.erro,
            "aviso": analise.aviso,
            "fontes": analise.fontes or [],
            "qtd_nao_conformidades": ncs or 0,
            "qtd_nao_verificados": nao_verificados or 0,
            "concluido_em": analise.concluido_em,
            "atualizado_em": analise.updated_at,
            "codigo_imovel": laudo.imovel.cod_imovel if laudo.imovel else None,
            "endereco": laudo.imovel.endereco if laudo.imovel else None,
            "imobiliaria": laudo.imobiliaria.nome if laudo.imobiliaria else None,
            "vistoriador": laudo.vistoriador.nome if laudo.vistoriador else None,
            "data_vistoria": laudo.agenda.data if laudo.agenda else None,
            "laudo_finalizado": laudo.finalizado,
            "laudo_aprovado": laudo.aprovado,
        })

    return {
        "resumo": {
            "total_analises": sum(por_status.values()),
            "geradas_ia": geradas,
            "manuais": manuais,
            "com_erro": erros,
            "em_andamento": por_status.get("PENDENTE", 0) + por_status.get("PROCESSANDO", 0),
            "taxa_erro": round(erros / (geradas + erros), 4) if geradas + erros else None,
            "tokens_entrada": soma_ent,
            "tokens_saida": soma_sai,
            "media_tokens_entrada": _media(soma_ent, com_tokens),
            "media_tokens_saida": _media(soma_sai, com_tokens),
            "media_tokens_total": _media(soma_ent + soma_sai, com_tokens),
            "duracao_media_s": round(soma_dur / qtd_dur, 1) if qtd_dur else None,
            "media_nao_conformidades": _media(total_ncs, geradas),
            "custo_estimado_usd": round(sum(custos), 6) if custos else None,
        },
        "modelos": modelos,
        "laudos": laudos,
        "limite": limite,
    }
