# backend/routes/agendamento_externo_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Dict, Optional
from uuid import UUID
from datetime import date, datetime, timedelta, timezone, UTC
import uuid
import os
import unicodedata
import re
from .admin_panel_routes import calcular_valores_vistoria
from logging import getLogger

logger = getLogger(__name__)

from .. import models, schemas, auth
from ..config import get_db, settings
from ..email_utils import send_email
from ..supabase_client import supabase

def sanitize_filename(filename):
    filename = ''.join(c for c in unicodedata.normalize('NFD', filename) if unicodedata.category(c) != 'Mn')
    filename = filename.replace(" ", "_")
    return re.sub(r"[^a-zA-Z0-9._-]", "", filename)

# Roteador protegido (Para a Imobiliária/Admin criar os dados e o link)
router_protected = APIRouter(
    prefix="/agendamento-externo",
    tags=["Agendamento Externo (Gestão)"],
    dependencies=[Depends(auth.get_current_active_user_or_imobiliaria)]
)

# Roteador público (Para o Cliente final acessar)
router_public = APIRouter(
    prefix="/publico/agendamento",
    tags=["Agendamento Externo (Cliente)"]
)

# =================================================================
# --- Rotas Auxiliares de Cadastro Rápido (Inline) ---
# =================================================================

@router_protected.get("/clientes", response_model=List[schemas.ClienteDisplay])
def get_clientes_agendamento(
    current_user=Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    """Retorna clientes respeitando o isolamento do Grupo da Imobiliária (Multi-tenant)."""
    # Consulta base ignorando deletados lógicos
    query = db.query(models.Cliente).filter(models.Cliente.is_deleted == False)

    # Regra Multi-tenant: Se for GrupoImobiliaria, filtra apenas clientes com imóveis no grupo
    if isinstance(current_user, models.GrupoImobiliaria):
        query = query.join(models.Imovel).join(models.Imobiliaria).filter(
            models.Imobiliaria.grupo_id == current_user.id,
            models.Imovel.is_deleted == False
        ).distinct() # Distinct previne duplicação se o cliente tiver > 1 imóvel

    return query.order_by(models.Cliente.nome.asc()).all()

@router_protected.get("/imoveis", response_model=List[schemas.ImovelDisplay])
def get_imoveis_agendamento(
    current_user=Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    """Retorna imóveis respeitando o isolamento do Grupo da Imobiliária (Multi-tenant)."""
    # Consulta base com joinload para evitar N+1 queries na serialização
    query = db.query(models.Imovel).options(
        joinedload(models.Imovel.cliente), 
        joinedload(models.Imovel.imobiliaria)
    ).filter(models.Imovel.is_deleted == False)

    # Regra Multi-tenant: Se for GrupoImobiliaria, vê apenas imóveis de suas imobiliárias
    if isinstance(current_user, models.GrupoImobiliaria):
        query = query.join(models.Imobiliaria).filter(
            models.Imobiliaria.grupo_id == current_user.id
        )

    return query.order_by(models.Imovel.cod_imovel.asc()).all()


@router_protected.get("/vistoriadores", response_model=List[schemas.UsuarioDisplay])
def get_vistoriadores_para_filtro(db: Session = Depends(get_db)):
    """Lista vistoriadores ativos para seleção no filtro de agendamento."""
    return db.query(models.Usuario).filter(
        models.Usuario.tipo == 'vistoriador',
        models.Usuario.is_deleted == False
    ).all()

@router_protected.post("/clientes", response_model=schemas.ClienteDisplay)
def create_cliente_inline(
    cliente: schemas.ClienteCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(models.Cliente).filter(
        models.Cliente.email == cliente.email,
        models.Cliente.is_deleted == False
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cliente com e-mail {cliente.email} já existe."
        )

    new_cliente = models.Cliente(**cliente.model_dump())
    db.add(new_cliente)
    db.commit()
    db.refresh(new_cliente)
    return new_cliente

@router_protected.post("/imoveis", response_model=schemas.ImovelDisplay)
def create_imovel_inline(
    imovel: schemas.ImovelCreate,
    current_user = Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    if isinstance(current_user, models.GrupoImobiliaria):
        imob_pertence = db.query(models.Imobiliaria).filter(
            models.Imobiliaria.id == imovel.imobiliaria_id,
            models.Imobiliaria.grupo_id == current_user.id
        ).first()
        
        if not imob_pertence:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você não tem permissão para cadastrar imóveis nesta imobiliária."
            )

    existing = db.query(models.Imovel).filter(
        models.Imovel.cod_imovel == imovel.cod_imovel,
        models.Imovel.imobiliaria_id == imovel.imobiliaria_id,
        models.Imovel.is_deleted == False
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um imóvel com código {imovel.cod_imovel} nesta imobiliária."
        )

    new_imovel = models.Imovel(**imovel.model_dump())
    db.add(new_imovel)
    db.commit()
    db.refresh(new_imovel)
    return new_imovel

# =================================================================
# --- Rotas de Consultas imobiliaria ---
# =================================================================


@router_protected.get("/minhas-solicitacoes", response_model=schemas.PaginatedSolicitacoesResponse)
async def listar_minhas_solicitacoes(
    page: int = 1,
    page_size: int = 10,
    status: Optional[str] = None,
    current_user = Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    """Lista solicitações da imobiliária com paginação e isolamento multi-tenant."""
    query = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.imobiliaria)
    )

    # Isolamento Multi-tenant: Filtra pelas imobiliárias do grupo atual
    if isinstance(current_user, models.GrupoImobiliaria):
        query = query.join(models.Imobiliaria).filter(
            models.Imobiliaria.grupo_id == current_user.id
        )

    # Filtro opcional por status
    if status:
        query = query.filter(models.SolicitacaoAgendamento.status == status)

    total_items = query.count()
    total_pages = (total_items + page_size - 1) // page_size

    # Ordenação e Paginação
    items = query.order_by(
        models.SolicitacaoAgendamento.created_at.desc()
    ).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total_items,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": items
    }

@router_protected.get("/minhas-solicitacoes/{solicitacao_id}", response_model=schemas.SolicitacaoAgendamentoDisplay)
async def detalhes_minha_solicitacao(
    solicitacao_id: UUID,
    current_user = Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    """Retorna os detalhes de uma solicitação, validando o isolamento multi-tenant."""
    query = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.imobiliaria),
        joinedload(models.SolicitacaoAgendamento.anexos)
    ).filter(models.SolicitacaoAgendamento.id == solicitacao_id)

    # Isolamento Multi-tenant: Garante que a solicitação pertence ao grupo do usuário
    if isinstance(current_user, models.GrupoImobiliaria):
        query = query.join(models.Imobiliaria).filter(
            models.Imobiliaria.grupo_id == current_user.id
        )

    solicitacao = query.first()

    if not solicitacao:
        # Retorna 404 para não expor a existência de dados de outros grupos
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    
    for anexo in solicitacao.anexos:
        # Gera uma URL assinada válida por 60 minutos (3600 segundos)
        res = supabase.storage.from_('documentos').create_signed_url(anexo.file_path, 3600)
        
        # Injeta a URL na propriedade 'link' que o frontend está esperando
        anexo.link = res.get('signedURL') if res and 'signedURL' in res else None

    return solicitacao


# =================================================================
# --- Rotas de Geração de Link ---
# =================================================================

@router_protected.post("/solicitacao", response_model=schemas.SolicitacaoLinkResponse)
async def criar_solicitacao(
    imovel_id: UUID = Form(...),
    cliente_id: UUID = Form(...),
    tipo_vistoria: str = Form(...),
    origem: str = Form("LINK_CLIENTE"),
    observacao: Optional[str] = Form(None),
    vistoriadores_ids: Optional[str] = Form(None),
    arquivos: Optional[List[UploadFile]] = File(None),
    request: Request = None,
    db: Session = Depends(get_db)
):
    imovel = db.query(models.Imovel).filter(models.Imovel.id == imovel_id).first()
    if not imovel:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado")
    
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    lista_vistoriadores = None
    if vistoriadores_ids and vistoriadores_ids.strip():
        lista_vistoriadores = [v.strip() for v in vistoriadores_ids.split(",") if v.strip()]

    token = str(uuid.uuid4())
    status_solicitacao = "PENDENTE_ADMIN"
    expires_at = None
    
    if origem == "LINK_CLIENTE":
        status_solicitacao = "PENDENTE_CLIENTE"
        expires_at = datetime.now(UTC) + timedelta(days=7)
    
    nova_solicitacao = models.SolicitacaoAgendamento(
        token=token,
        imovel_id=imovel_id,
        cliente_id=cliente_id,
        imobiliaria_id=imovel.imobiliaria_id,
        tipo_vistoria=tipo_vistoria,
        vistoriadores_permitidos=lista_vistoriadores,
        origem=origem,
        observacao=observacao,
        status=status_solicitacao,
        expires_at=expires_at
    )
    
    db.add(nova_solicitacao)
    db.commit()
    db.refresh(nova_solicitacao)
    
    if arquivos:
        for arquivo in arquivos:
            if arquivo.filename:
                nome, extensao = os.path.splitext(arquivo.filename)
                nome_sanitizado = sanitize_filename(nome)
                nome_arquivo = f"{nome_sanitizado}_SOLICIT_{uuid.uuid4()}{extensao}"
                
                conteudo = await arquivo.read()
                MAX_MB = 100
                if len(conteudo) > MAX_MB * 1024 * 1024:
                    raise HTTPException(status_code=400, detail=f"Arquivo '{arquivo.filename}' ultrapassa o tamanho máximo de {MAX_MB}MB")
                res = supabase.storage.from_("documentos").upload(nome_arquivo, conteudo, {"content-type": arquivo.content_type})
                
                if not getattr(res, "error", None):
                    novo_doc = models.DocumentoSolicitacao(
                        solicitacao_id=nova_solicitacao.id,
                        file_path=nome_arquivo
                    )
                    db.add(novo_doc)
    
    db.commit()
    
    link_completo = None
    if origem == "LINK_CLIENTE" and token:
        if hasattr(settings, 'FRONTEND_URL') and settings.FRONTEND_URL:
            base = settings.FRONTEND_URL
        else:
            base = str(request.base_url).rstrip('/') if request else ""
        link_completo = f"{base}/api/v1/publico/agendamento/view/{token}"
    
    return {
        "solicitacao_id": nova_solicitacao.id,
        "token": token,
        "link_completo": link_completo,
        "expires_at": nova_solicitacao.expires_at,
        "status": nova_solicitacao.status
    }

@router_protected.put("/marcar_agendada")
async def marcar_agendada(solicitacao_id: UUID, agenda_id: UUID, db: Session = Depends(get_db)):
    sol = db.query(models.SolicitacaoAgendamento).filter(models.SolicitacaoAgendamento.id == solicitacao_id).first()
    agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not sol or not agenda:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    sol.status = "AGENDADO"
    sol.agenda_id = agenda_id
    db.commit()
    return

STATUSES_EDITAVEIS = {"PENDENTE_ADMIN", "PENDENTE_CLIENTE"}

@router_protected.patch("/minhas-solicitacoes/{solicitacao_id}/cancelar", response_model=schemas.SolicitacaoAgendamentoDisplay)
async def cancelar_solicitacao(
    solicitacao_id: UUID,
    current_user=Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    """Cancela uma solicitação que ainda não foi agendada."""
    query = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.imobiliaria),
        joinedload(models.SolicitacaoAgendamento.anexos)
    ).filter(models.SolicitacaoAgendamento.id == solicitacao_id)

    if isinstance(current_user, models.GrupoImobiliaria):
        query = query.join(models.Imobiliaria).filter(
            models.Imobiliaria.grupo_id == current_user.id
        )

    solicitacao = query.first()

    if not solicitacao:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")

    if solicitacao.status not in STATUSES_EDITAVEIS:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível cancelar uma solicitação com status '{solicitacao.status}'."
        )

    solicitacao.status = "CANCELADO"
    db.commit()
    db.refresh(solicitacao)
    return solicitacao


@router_protected.patch("/minhas-solicitacoes/{solicitacao_id}", response_model=schemas.SolicitacaoAgendamentoDisplay)
async def editar_solicitacao(
    solicitacao_id: UUID,
    tipo_vistoria: Optional[str] = Form(None),
    observacao: Optional[str] = Form(None),
    vistoriadores_ids: Optional[str] = Form(None),
    arquivos: Optional[List[UploadFile]] = File(None),
    current_user=Depends(auth.get_current_active_user_or_imobiliaria),
    db: Session = Depends(get_db)
):
    """Edita os campos de uma solicitação que ainda não foi agendada."""
    query = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.imobiliaria),
        joinedload(models.SolicitacaoAgendamento.anexos)
    ).filter(models.SolicitacaoAgendamento.id == solicitacao_id)

    if isinstance(current_user, models.GrupoImobiliaria):
        query = query.join(models.Imobiliaria).filter(
            models.Imobiliaria.grupo_id == current_user.id
        )

    solicitacao = query.first()

    if not solicitacao:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")

    if solicitacao.status not in STATUSES_EDITAVEIS:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível editar uma solicitação com status '{solicitacao.status}'."
        )

    if tipo_vistoria is not None:
        solicitacao.tipo_vistoria = tipo_vistoria
    if observacao is not None:
        solicitacao.observacao = observacao
    if vistoriadores_ids is not None:
        if vistoriadores_ids.strip():
            solicitacao.vistoriadores_permitidos = [v.strip() for v in vistoriadores_ids.split(",") if v.strip()]
        else:
            solicitacao.vistoriadores_permitidos = None

    if arquivos:
        for arquivo in arquivos:
            if arquivo.filename:
                nome, extensao = os.path.splitext(arquivo.filename)
                nome_sanitizado = sanitize_filename(nome)
                nome_arquivo = f"{nome_sanitizado}_SOLICIT_{uuid.uuid4()}{extensao}"

                conteudo = await arquivo.read()
                MAX_MB = 100
                if len(conteudo) > MAX_MB * 1024 * 1024:
                    raise HTTPException(status_code=400, detail=f"Arquivo '{arquivo.filename}' ultrapassa o tamanho máximo de {MAX_MB}MB")
                res = supabase.storage.from_("documentos").upload(nome_arquivo, conteudo, {"content-type": arquivo.content_type})

                if not getattr(res, "error", None):
                    novo_doc = models.DocumentoSolicitacao(
                        solicitacao_id=solicitacao.id,
                        file_path=nome_arquivo
                    )
                    db.add(novo_doc)

    db.commit()
    db.refresh(solicitacao)

    for anexo in solicitacao.anexos:
        res = supabase.storage.from_('documentos').create_signed_url(anexo.file_path, 3600)
        anexo.link = res.get('signedURL') if res and 'signedURL' in res else None

    return solicitacao

# =================================================================
# --- Rotas Públicas (Serving HTML & API) ---
# =================================================================

# 1. Rota para servir o HTML da página de agendamento
@router_public.get("/view/{token}")
def serve_agendamento_page(token: str):
    """Serve o arquivo HTML estático para o cliente final."""
    file_path = os.path.join("frontend", "public-scheduling.html")
    
    if not os.path.exists(file_path):
        file_path = os.path.join("..", "frontend", "public-scheduling.html")
        
    if os.path.exists(file_path):
        return FileResponse(file_path)
    else:
        return HTTPException(status_code=404, detail="Arquivo de frontend não encontrado no servidor.")

# 2. Rota para servir os assets (JS/CSS)
@router_public.get("/view/assets/{filename}")
def serve_agendamento_assets(filename: str):
    file_path = os.path.join("frontend", "assets", filename)
    
    if not os.path.exists(file_path):
        file_path = os.path.join("..", "frontend", "assets", filename)
        
    if os.path.exists(file_path):
        return FileResponse(file_path)
    else:
        return HTTPException(status_code=404, detail="Asset não encontrado.")

# --- API Endpoints normais (JSON) ---

def validar_token(token: str, db: Session) -> models.SolicitacaoAgendamento:
    solicitacao = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imobiliaria).joinedload(models.Imobiliaria.grupo)
    ).filter(models.SolicitacaoAgendamento.token == token).first()
    
    if not solicitacao:
        raise HTTPException(status_code=404, detail="Link inválido ou não encontrado.")
    
    if solicitacao.status != "PENDENTE":
        raise HTTPException(status_code=400, detail="Este link já foi utilizado ou cancelado.")
        
    if solicitacao.expires_at and solicitacao.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Este link expirou. Solicite um novo à imobiliária.")
        
    return solicitacao

@router_public.get("/{token}/info", response_model=schemas.PublicAgendamentoInfo)
def get_agendamento_info(token: str, db: Session = Depends(get_db)):
    solicitacao = validar_token(token, db)
    imovel = solicitacao.imovel
    
    return {
        "cliente_nome": solicitacao.cliente.nome,
        "imovel_cod": imovel.cod_imovel,
        "imovel_endereco": imovel.endereco,
        "imovel_tamanho": float(imovel.tamanho),
        "imovel_mobiliado": imovel.mobiliado or "Não informado",
        "tipo_vistoria": solicitacao.tipo_vistoria,
        "imobiliaria_nome": solicitacao.imobiliaria.nome,
        "status": solicitacao.status
    }

def time_str_to_int(t_str):
    h, m = map(int, t_str.split(':'))
    return h * 60 + m

@router_public.get("/{token}/slots", response_model=schemas.SlotsResponse)
def get_slots_disponiveis(token: str, db: Session = Depends(get_db)):
    
    solicitacao = validar_token(token, db)
    imovel = solicitacao.imovel
    logger.info(f"vistoriadores: {solicitacao.vistoriadores_permitidos}")
    # -----------------------------
    # REGRA: NECESSITA HORÁRIO DUPLO
    # -----------------------------
    precisa_duplo = False

    if solicitacao.tipo_vistoria in ["ENTRADA", "SAIDA"]:
        if float(imovel.tamanho) >= 100:
            precisa_duplo = True
        elif imovel.mobiliado and imovel.mobiliado.lower() in ["mobiliado", "semi_mobiliado"]:
            precisa_duplo = True

    # -----------------------------
    # BUSCA AGENDA
    # -----------------------------
    query = db.query(models.Agenda).filter(
        models.Agenda.is_deleted == False,
        models.Agenda.data >= date.today(),
        models.Agenda.data <= date.today() + timedelta(days=15)
    )

    if solicitacao.vistoriadores_permitidos:
        lista_ids = solicitacao.vistoriadores_permitidos
        if lista_ids:
            query = query.filter(models.Agenda.vistoriador_id.in_(lista_ids))

    slots_raw = (
        query
        .options(joinedload(models.Agenda.vistoriador))
        .order_by(models.Agenda.data, models.Agenda.horario)
        .all()
    )

    # -----------------------------
    # AGRUPA POR VISTORIADOR + DIA
    # -----------------------------
    mapa_slots_dia = {}

    for slot in slots_raw:
        key = f"{slot.vistoriador_id}|{slot.data.strftime('%Y-%m-%d')}"
        mapa_slots_dia.setdefault(key, []).append(slot)

    slots_validos = []

    # -----------------------------
    # FUNÇÃO AUXILIAR
    # -----------------------------
    def is_manha(mins: int) -> bool:
        return mins < 780  # antes das 13:00

    # -----------------------------
    # PROCESSAMENTO PRINCIPAL
    # -----------------------------
    for _, lista_slots_dia in mapa_slots_dia.items():
        lista_slots_dia.sort(key=lambda x: time_str_to_int(x.horario))

        for i, slot_atual in enumerate(lista_slots_dia):
            if not slot_atual.disponivel:
                continue

            if not precisa_duplo:
                slots_validos.append(slot_atual)
                continue

            h_atual = time_str_to_int(slot_atual.horario)
            turno_atual = is_manha(h_atual)

            # ==================================================
            # REGRA DE OURO — CONSECUTIVO REAL
            # ==================================================
            slot_consecutivo = None

            for j in range(i + 1, len(lista_slots_dia)):
                prox = lista_slots_dia[j]
                h_prox = time_str_to_int(prox.horario)

                # mudou de turno → para
                if is_manha(h_prox) != turno_atual:
                    break

                # próximo slot cronológico encontrado
                slot_consecutivo = prox
                break

            if slot_consecutivo and slot_consecutivo.disponivel:
                slots_validos.append(slot_atual)
                continue

            # ==================================================
            # REGRA DE DISTÂNCIA (240min)
            # ==================================================
            threshold = 240
            fim_turno = 720 if turno_atual else 1080  # 12:00 ou 18:00
            limite_tempo = fim_turno

            # procura próximo bloqueio no mesmo turno
            for j in range(i + 1, len(lista_slots_dia)):
                futuro = lista_slots_dia[j]
                h_futuro = time_str_to_int(futuro.horario)

                if is_manha(h_futuro) != turno_atual:
                    break

                if not futuro.disponivel:
                    limite_tempo = h_futuro
                    break

            gap = limite_tempo - h_atual

            if gap >= threshold:
                slots_validos.append(slot_atual)

    # -----------------------------
    # FORMATA RESPOSTA
    # -----------------------------
    grouped_response = {}

    for slot in slots_validos:
        data_str = slot.data.strftime("%Y-%m-%d")
        grouped_response.setdefault(data_str, []).append({
            "agenda_id": slot.id,
            "data": slot.data,
            "horario": slot.horario,
            "vistoriador_nome": slot.vistoriador.nome.split()[0]
        })

    return {
        "slots_por_dia": grouped_response,
        "necessita_horario_duplo": precisa_duplo
    }

def _enviar_email_confirmacao_task(cliente_email, cliente_nome, imobiliaria_email, vistoriador_email, data, horario, endereco, tipo_vistoria, cod_imovel):
    assunto = f"Confirmação de Agendamento - Vistoria {data.strftime('%d/%m/%Y')} às {horario}"
    
    html_content = f"""
<html>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif; color:#374151;">
    <div style="padding: 24px 12px;">
      <div style="max-width: 600px; margin: 0 auto; background-color:#ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.08);">
        <div style="background-color:#059669; padding: 24px;">
          <h2 style="margin:0; color:#ffffff; font-size:22px;">✔ Agendamento Confirmado</h2>
          <p style="margin:6px 0 0; color:#d1fae5; font-size:14px;">Sua vistoria foi registrada com sucesso</p>
        </div>
        <div style="padding: 28px;">
          <p style="margin-top:0; font-size:15px;">Olá, <strong>{cliente_nome}</strong> 👋</p>
          <p style="font-size:15px; line-height:1.6;">Informamos que a sua vistoria foi <strong>confirmada</strong>. Confira abaixo todos os detalhes:</p>
          <div style="background-color:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:20px; margin:24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
              <tr><td style="padding:6px 0;"><strong>🏠 Imóvel</strong></td><td style="padding:6px 0; text-align:right;">{endereco}</td></tr>
              <tr><td style="padding:6px 0;"><strong>🔢 Código</strong></td><td style="padding:6px 0; text-align:right;">{cod_imovel}</td></tr>
              <tr><td style="padding:6px 0;"><strong>📅 Data</strong></td><td style="padding:6px 0; text-align:right;">{data.strftime('%d/%m/%Y')}</td></tr>
              <tr><td style="padding:6px 0;"><strong>⏰ Horário</strong></td><td style="padding:6px 0; text-align:right;">{horario}</td></tr>
              <tr><td style="padding:6px 0;"><strong>📋 Tipo</strong></td><td style="padding:6px 0; text-align:right;">{tipo_vistoria}</td></tr>
            </table>
          </div>
          <p style="font-size:14px; line-height:1.6;">Caso precise <strong>reagendar</strong>, entre em contato com a imobiliária.</p>
        </div>
        <div style="background-color:#f9fafb; padding:18px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#6b7280;">Engentoria - Sistema Automático</p>
        </div>
      </div>
    </div>
  </body>
</html>
"""
    destinatarios = [cliente_email]
    cc_list = []
    if imobiliaria_email: cc_list.append(imobiliaria_email)
    if vistoriador_email: cc_list.append(vistoriador_email)
        
    try:
        send_email(to=destinatarios, subject=assunto, html=html_content, cc=cc_list if cc_list else None)
    except Exception as e:
        print(f"Erro ao enviar e-mail: {str(e)}")

@router_public.post("/{token}/confirmar", response_model=Dict[str, str])
def confirmar_agendamento(
    token: str,
    payload: schemas.ConfirmacaoAgendamento,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    solicitacao = validar_token(token, db)
    imovel = solicitacao.imovel
    imobiliaria = solicitacao.imobiliaria 
    
    # Lock no slot escolhido
    slot_escolhido = db.query(models.Agenda).filter(models.Agenda.id == payload.agenda_id).with_for_update().first()
    
    if not slot_escolhido:
        raise HTTPException(status_code=404, detail="Horário não encontrado.")
    if not slot_escolhido.disponivel:
        raise HTTPException(status_code=409, detail="Desculpe, este horário acabou de ser reservado.")
        
    if solicitacao.vistoriadores_permitidos:
         if str(slot_escolhido.vistoriador_id) not in solicitacao.vistoriadores_permitidos:
             raise HTTPException(status_code=400, detail="Vistoriador não autorizado.")

    vistoriador = slot_escolhido.vistoriador

    # Cálculo Financeiro
    valores = calcular_valores_vistoria(imovel, imobiliaria, solicitacao.tipo_vistoria, vistoriador)
    
    if not imovel.valor or float(imovel.valor) == 0.0:
        imovel.valor = valores["valor_base_ref"]
    
    # --- LOGICA DE SLOT DUPLO (VALIDAÇÃO FINAL) ---
    precisa_duplo = False
    if solicitacao.tipo_vistoria in ["ENTRADA", "SAIDA"]:
        if imovel.tamanho >= 100 or (imovel.mobiliado and imovel.mobiliado.lower() in ["mobiliado", "semi_mobiliado"]):
            precisa_duplo = True

    slot_seguinte = None
    
    if precisa_duplo:
        # Tenta achar o slot seguinte para reservar TAMBÉM
        h_atual_mins = time_str_to_int(slot_escolhido.horario)
        h_proximo_mins = h_atual_mins + 60
        hh = h_proximo_mins // 60
        mm = h_proximo_mins % 60
        horario_seguinte_str = f"{hh:02d}:{mm:02d}"
        
        slot_potencial = db.query(models.Agenda).filter(
            models.Agenda.vistoriador_id == slot_escolhido.vistoriador_id,
            models.Agenda.data == slot_escolhido.data,
            models.Agenda.horario == horario_seguinte_str
        ).with_for_update().first()
        
        if slot_potencial:
            if not slot_potencial.disponivel:
                 # Tem slot seguinte, mas está ocupado -> ERRO (Colisão)
                raise HTTPException(status_code=409, detail="Não foi possível reservar o horário sequencial (já ocupado).")
            # Tem slot seguinte e livre -> OK
            slot_seguinte = slot_potencial
        else:
            # NÃO existe slot seguinte consecutivo
            # Aplica a mesma lógica rigorosa do get_slots para validação final
            
            # Recarrega a grade completa do dia para este vistoriador
            grade_dia = db.query(models.Agenda).filter(
                models.Agenda.vistoriador_id == slot_escolhido.vistoriador_id,
                models.Agenda.data == slot_escolhido.data,
                models.Agenda.horario > slot_escolhido.horario # Só precisa olhar pra frente
            ).order_by(models.Agenda.horario).all()
            
            is_manha = h_atual_mins < 780
            fim_expediente = 720 if is_manha else 1080
            
            limite_tempo = fim_expediente
            threshold = 240 # SEMPRE 4h para slots únicos

            for slot_futuro in grade_dia:
                h_futuro = time_str_to_int(slot_futuro.horario)
                futuro_is_manha = h_futuro < 780
                
                if is_manha and not futuro_is_manha:
                    break
                
                if not slot_futuro.disponivel:
                     limite_tempo = h_futuro
                     break
            
            gap = limite_tempo - h_atual_mins
            
            if gap < threshold:
                 raise HTTPException(status_code=409, detail="Este horário não permite tempo suficiente para a vistoria (4 horas de intervalo exigido).")

    # Efetivar a reserva do Slot 1
    slot_escolhido.disponivel = False
    slot_escolhido.imovel_id = solicitacao.imovel_id
    slot_escolhido.imobiliaria_id = solicitacao.imobiliaria_id
    slot_escolhido.tipo = solicitacao.tipo_vistoria
    slot_escolhido.observacao_vistoriador = "Agendamento Externo (Principal)"
    slot_escolhido.valor_final_vistoria = valores["valor_final_vistoria"]
    slot_escolhido.valor_vistoriador = valores["valor_vistoriador"]
    
    # Slot 2 (Apenas se encontrou um slot físico seguinte)
    if slot_seguinte:
        slot_seguinte.disponivel = False
        slot_seguinte.imovel_id = solicitacao.imovel_id
        slot_seguinte.imobiliaria_id = solicitacao.imobiliaria_id
        slot_seguinte.tipo = solicitacao.tipo_vistoria
        slot_seguinte.observacao_vistoriador = "Agendamento Externo (Extensão)"
        
    solicitacao.status = "AGENDADO"
    solicitacao.agenda_id = slot_escolhido.id
    
    for anexo in solicitacao.anexos:
        novo_doc_agenda = models.DocumentoAgenda(
            agenda_id=slot_escolhido.id,
            file_path=anexo.file_path,
            usuario_id=None
        )
        db.add(novo_doc_agenda)

    db.commit()
    
    # Envio de E-mail
    imobiliaria_email = None
    if solicitacao.imobiliaria.grupo:
        imobiliaria_email = solicitacao.imobiliaria.grupo.email
    
    background_tasks.add_task(
        _enviar_email_confirmacao_task,
        cliente_email=solicitacao.cliente.email,
        cliente_nome=solicitacao.cliente.nome,
        imobiliaria_email=imobiliaria_email,
        vistoriador_email=vistoriador.email,
        data=slot_escolhido.data,
        horario=slot_escolhido.horario,
        endereco=imovel.endereco,
        tipo_vistoria=solicitacao.tipo_vistoria,
        cod_imovel=imovel.cod_imovel
    )

    return {"message": "Agendamento confirmado!", "data": str(slot_escolhido.data), "horario": slot_escolhido.horario}

@router_protected.get("/pendentes")
async def listar_pendentes(db: Session = Depends(get_db)):
    """Retorna todas as solicitações de vistoria pendentes (aguardando agendamento)."""
    solicitacoes = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imobiliaria)
    ).filter(
        models.SolicitacaoAgendamento.status == "PENDENTE_ADMIN"
    ).order_by(
        models.SolicitacaoAgendamento.created_at.desc()
    ).all()
    
    return solicitacoes

@router_protected.get("/pendentes/{solicitacao_id}", response_model=schemas.SolicitacaoAgendamentoDisplay)
async def get_solicitacao_info(solicitacao_id: UUID, db: Session = Depends(get_db)):
    """Retorna os dados completos e aninhados de uma solicitação específica."""
    solicitacao = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imobiliaria)
    ).filter(
        models.SolicitacaoAgendamento.id == solicitacao_id
    ).first()
    
    if not solicitacao:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    
    for anexo in solicitacao.anexos:
        # Gera uma URL assinada válida por 60 minutos (3600 segundos)
        res = supabase.storage.from_('documentos').create_signed_url(anexo.file_path, 3600)
        
        # Injeta a URL na propriedade 'link' que o frontend está esperando
        anexo.link = res.get('signedURL') if res and 'signedURL' in res else None
        
    return solicitacao