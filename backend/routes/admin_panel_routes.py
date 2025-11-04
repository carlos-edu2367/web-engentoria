# backend/routes/admin_panel_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, extract, func, or_
from typing import List, Dict, Union
from uuid import UUID
from datetime import date, timedelta, datetime
from decimal import Decimal
from dateutil.relativedelta import relativedelta
from typing import Optional
import io
import logging, os, uuid, unicodedata, re

from ..supabase_client import deletar_arquivo_supabase, supabase, gerar_url_assinada


from .. import models, schemas, auth

# Imports para geração de relatórios
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.workbook import Workbook

from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

# Imports para envio de e-mail
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


# Importa a função para obter a sessão do banco e a função de hash de senha
from ..config import get_db, settings
from ..auth import get_password_hash, get_current_admin_user

# Cria um novo roteador para o painel de administração
# Todas as rotas aqui serão protegidas pela dependência 'get_current_admin_user'
router = APIRouter(
    prefix="/admin-panel",
    tags=["Painel de Administração"],
    dependencies=[Depends(get_current_admin_user)]
)

# Configura o logger
logger = logging.getLogger(__name__)

def sanitize_filename(filename):
    # remove acentos
    filename = ''.join(
        c for c in unicodedata.normalize('NFD', filename)
        if unicodedata.category(c) != 'Mn'
    )
    
    # substitui espaços por _
    filename = filename.replace(" ", "_")
    
    # remove caracteres não permitidos
    filename = re.sub(r"[^a-zA-Z0-9._-]", "", filename)

    return filename
# =================================================================
# --- Funções Auxiliares de Lógica de Negócio ---
# =================================================================

def _calculate_valor_base_imovel(imobiliaria: models.Imobiliaria, tamanho: float, mobiliado: str) -> float:
    """Calcula o valor BASE da vistoria com base nas regras da imobiliária."""
    tamanho = float(tamanho)
    if mobiliado == "mobiliado":
        valor_m2 = imobiliaria.valor_mobiliado
    elif mobiliado == "semi_mobiliado":
        valor_m2 = imobiliaria.valor_semi_mobiliado
    else: # sem_mobilia
        valor_m2 = imobiliaria.valor_sem_mobilia
    
    return round(tamanho * float(valor_m2), 2)

def _calculate_valor_final_vistoria(imovel: models.Imovel, tipo_vistoria: str) -> float:
    """Calcula o valor FINAL (cobrado) da vistoria com base no tipo."""
    if tipo_vistoria == 'AVERIGUACAO':
        return 65.00

    valor_base = float(imovel.valor)
    
    if tipo_vistoria in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        return round(valor_base * 0.5, 2)
    else:
        return round(valor_base, 2)

def _calculate_valor_comissao_vistoriador(tamanho_m2: float, mobiliado_status: str, tipo_vistoria_agenda: str) -> float:
    """Calcula o valor da COMISSÃO do vistoriador com base nas regras."""
    tamanho_m2 = float(tamanho_m2)
    if tipo_vistoria_agenda == 'AVERIGUACAO':
        return 65.00
    
    valor_base = 0.0
    if mobiliado_status == 'mobiliado':
        if tamanho_m2 < 50: valor_base = 65.00
        elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.25
        elif 100 <= tamanho_m2 <= 140: valor_base = 125.00
        else: valor_base = tamanho_m2 * 0.90
    elif mobiliado_status in ['sem_mobilia', 'semi_mobiliado']:
        if tamanho_m2 < 50: valor_base = 50.00
        elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.00
        elif 100 <= tamanho_m2 <= 135: valor_base = 100.00
        else: valor_base = tamanho_m2 * 0.75
    else:
        return 0.0

    valor_final = valor_base
    if tipo_vistoria_agenda in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        valor_final = valor_base * 0.5
        if valor_final < 45.00:
            valor_final = 45.00
        
    return round(valor_final, 2)

def _send_report_email(subject: str, html_content: str):
    """
    Função auxiliar para enviar e-mails usando SendGrid.
    """
    message = Mail(
        from_email=settings.EMAIL_FROM,
        to_emails=settings.EMAIL_REPORTS_TO,
        subject=subject,
        html_content=html_content
    )
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"E-mail de relatório enviado com sucesso para {settings.EMAIL_REPORTS_TO}, Status: {response.status_code}")
    except Exception as e:
        logger.error(f"Falha ao enviar e-mail de relatório: {e}")


# =================================================================
# --- Dashboard ---
# =================================================================

@router.get("/dashboard/stats", response_model=schemas.AdminDashboardStats, summary="Obter estatísticas gerais para o dashboard")
def get_admin_dashboard_stats(db: Session = Depends(get_db)):
    today = date.today()
    start_of_month = today.replace(day=1)

    total_vistoriadores = db.query(models.Usuario).filter(models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).count()
    total_imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).count()
    total_clientes = db.query(models.Cliente).filter(models.Cliente.is_deleted == False).count()
    
    vistorias_mes_atual = db.query(models.Agenda).filter(
        models.Agenda.data >= start_of_month,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).count()

    improdutivas_mes_atual = db.query(models.VistoriaImprodutiva).filter(
        models.VistoriaImprodutiva.data_vistoria_original >= start_of_month,
        models.VistoriaImprodutiva.is_deleted == False
    ).count()

    return schemas.AdminDashboardStats(
        total_vistoriadores=total_vistoriadores,
        total_imobiliarias=total_imobiliarias,
        total_clientes=total_clientes,
        vistorias_mes_atual=vistorias_mes_atual,
        improdutivas_mes_atual=improdutivas_mes_atual
    )

@router.get("/dashboard/financial-stats", response_model=schemas.AdminDashboardFinancialStats, summary="Obter estatísticas financeiras para o dashboard")
def get_financial_stats(db: Session = Depends(get_db)):
    today = date.today()
    
    # Período do Mês Atual
    start_of_current_month = today.replace(day=1)
    
    # Período Comparativo do Mês Anterior
    start_of_previous_month = start_of_current_month - relativedelta(months=1)
    end_of_previous_month_comparative = start_of_previous_month + timedelta(days=today.day - 1)

    # Função auxiliar para evitar repetição de código
    def get_financials_for_period(start_date, end_date):
        results = db.query(
            func.coalesce(func.sum(models.Agenda.valor_final_vistoria), 0),
            func.coalesce(func.sum(models.Agenda.valor_vistoriador), 0)
        ).filter(
            models.Agenda.data.between(start_date, end_date),
            models.Agenda.is_deleted == False,
            models.Agenda.tipo.isnot(None),
            models.Agenda.tipo.notin_(['LIVRE', 'FECHADO'])
        ).one()
        return float(results[0]), float(results[1])

    faturamento_atual, comissoes_atuais = get_financials_for_period(start_of_current_month, today)
    faturamento_anterior, _ = get_financials_for_period(start_of_previous_month, end_of_previous_month_comparative)

    lucro_atual = faturamento_atual - comissoes_atuais

    crescimento = 0.0
    if faturamento_anterior > 0:
        crescimento = ((faturamento_atual - faturamento_anterior) / faturamento_anterior) * 100
    elif faturamento_atual > 0:
        crescimento = 100.0 # Crescimento infinito se o anterior foi 0

    return schemas.AdminDashboardFinancialStats(
        faturamento_mes_atual=faturamento_atual,
        faturamento_mes_anterior_comparativo=faturamento_anterior,
        comissoes_a_pagar_mes_atual=comissoes_atuais,
        lucro_mes_atual=lucro_atual,
        crescimento_percentual=round(crescimento, 2)
    )


@router.get("/dashboard/vistorias-chart", response_model=List[schemas.VistoriasChartItem], summary="Obter dados para o gráfico de vistorias mensais")
def get_vistorias_chart_data(db: Session = Depends(get_db)):
    six_months_ago = date.today() - timedelta(days=180)
    
    results = db.query(
        extract('year', models.Agenda.data).label('ano'),
        extract('month', models.Agenda.data).label('mes'),
        func.count(models.Agenda.id).label('total')
    ).filter(
        models.Agenda.data >= six_months_ago,
        models.Agenda.tipo != 'LIVRE'
    ).group_by('ano', 'mes').order_by('ano', 'mes').all()

    chart_data = [
        schemas.VistoriasChartItem(mes_ano=f"{int(r.mes):02d}/{int(r.ano)}", total=r.total)
        for r in results
    ]
    return chart_data

# =================================================================
# --- CRUD para Imobiliárias ---
# =================================================================

@router.post("/imobiliarias/", response_model=schemas.ImobiliariaDisplay, status_code=status.HTTP_201_CREATED, summary="Criar uma nova imobiliária")
def create_imobiliaria(imobiliaria: schemas.ImobiliariaCreate, db: Session = Depends(get_db)):
    existing_by_name = db.query(models.Imobiliaria).filter(models.Imobiliaria.nome == imobiliaria.nome).first()
    if existing_by_name:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Já existe uma imobiliária com o nome '{imobiliaria.nome}'.")
    db_imobiliaria = models.Imobiliaria(**imobiliaria.model_dump())
    db.add(db_imobiliaria)
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

@router.get("/imobiliarias/", response_model=List[schemas.ImobiliariaDisplay], summary="Listar todas as imobiliárias")
def read_imobiliarias(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).order_by(models.Imobiliaria.nome).offset(skip).limit(limit).all()
    return imobiliarias

@router.put("/imobiliarias/{imobiliaria_id}", response_model=schemas.ImobiliariaDisplay, summary="Atualizar uma imobiliária")
def update_imobiliaria(imobiliaria_id: UUID, imobiliaria_update: schemas.ImobiliariaUpdate, db: Session = Depends(get_db)):
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")
    if imobiliaria_update.nome != db_imobiliaria.nome:
        existing = db.query(models.Imobiliaria).filter(models.Imobiliaria.nome == imobiliaria_update.nome, models.Imobiliaria.is_deleted == False).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma imobiliária com este nome.")
    update_data = imobiliaria_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_imobiliaria, key, value)
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

@router.delete("/imobiliarias/{imobiliaria_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar uma imobiliária")
def delete_imobiliaria(imobiliaria_id: UUID, db: Session = Depends(get_db)):
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")
    imoveis_associados = db.query(models.Imovel).filter(models.Imovel.imobiliaria_id == imobiliaria_id, models.Imovel.is_deleted == False).count()
    if imoveis_associados > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {imoveis_associados} imóveis ativos associados a esta imobiliária.")
    db_imobiliaria.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- CRUD para Vistoriadores ---
# =================================================================
@router.post("/vistoriadores/", response_model=schemas.UsuarioDisplay, status_code=status.HTTP_201_CREATED, summary="Criar um novo vistoriador")
def create_vistoriador(vistoriador: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    if vistoriador.tipo != 'vistoriador':
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de usuário inválido. Deve ser 'vistoriador'.")
    existing_user = db.query(models.Usuario).filter(models.Usuario.email == vistoriador.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"O e-mail '{vistoriador.email}' já está em uso.")
    hashed_password = get_password_hash(vistoriador.senha)
    db_vistoriador = models.Usuario(**vistoriador.model_dump(exclude={"senha"}), senha=hashed_password)
    db.add(db_vistoriador)
    db.commit()
    db.refresh(db_vistoriador)
    return db_vistoriador

@router.get("/vistoriadores/", response_model=List[schemas.UsuarioDisplay], summary="Listar todos os vistoriadores")
def read_vistoriadores(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    vistoriadores = db.query(models.Usuario).filter(models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).order_by(models.Usuario.nome).offset(skip).limit(limit).all()
    return vistoriadores

@router.get("/vistoriadores/{vistoriador_id}/detalhes", response_model=schemas.VistoriadorDetalhes, summary="Obter detalhes e estatísticas de um vistoriador")
def get_vistoriador_details(vistoriador_id: UUID, db: Session = Depends(get_db)):
    today = date.today()
    start_of_current_month = today.replace(day=1)
    # Garante 6 meses completos para trás
    six_months_ago = (start_of_current_month - timedelta(days=1)).replace(day=1) - timedelta(days=150) 

    vistorias_agrupadas = db.query(
        extract('year', models.Agenda.data).label('ano'),
        extract('month', models.Agenda.data).label('mes'),
        func.count(models.Agenda.id).label('total_vistorias'),
        func.sum(models.Agenda.valor_vistoriador).label('total_comissao')
    ).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        models.Agenda.data >= six_months_ago,
        models.Agenda.tipo != 'LIVRE' # Inclui normais e improdutivas
    ).group_by('ano', 'mes').all()
    
    monthly_data = {}
    for r in vistorias_agrupadas:
        key = f"{int(r.mes):02d}/{int(r.ano)}"
        monthly_data[key] = {
            'total_vistorias': r.total_vistorias, 
            'total_comissao': float(r.total_comissao or 0)
        }
    
    historico_mensal = [
        schemas.VistoriadorDetalhesItem(mes_ano=key, **value)
        for key, value in sorted(monthly_data.items())
    ]

    meses_finalizados = [
        item for item in historico_mensal 
        if datetime.strptime(f"01/{item.mes_ano}", "%d/%m/%Y").date() < start_of_current_month
    ]

    total_months_finalizados = len(meses_finalizados)
    if total_months_finalizados == 0:
        return schemas.VistoriadorDetalhes(media_vistorias_mensal=0, media_comissao_mensal=0, historico_mensal=historico_mensal)

    total_vistorias = sum(item.total_vistorias for item in meses_finalizados)
    total_comissao = sum(item.total_comissao for item in meses_finalizados)

    return schemas.VistoriadorDetalhes(
        media_vistorias_mensal=round(total_vistorias / total_months_finalizados, 2),
        media_comissao_mensal=round(total_comissao / total_months_finalizados, 2),
        historico_mensal=historico_mensal
    )

@router.put("/vistoriadores/{vistoriador_id}", response_model=schemas.UsuarioDisplay, summary="Atualizar um vistoriador")
def update_vistoriador(vistoriador_id: UUID, vistoriador_update: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == vistoriador_id, models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).first()
    if db_vistoriador is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado")
    if vistoriador_update.email != db_vistoriador.email:
        existing = db.query(models.Usuario).filter(models.Usuario.email == vistoriador_update.email).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este e-mail já está em uso.")
    update_data = vistoriador_update.model_dump(exclude_unset=True)
    if 'senha' in update_data and update_data['senha']:
        hashed_password = get_password_hash(update_data['senha'])
        db_vistoriador.senha = hashed_password
    db_vistoriador.nome = update_data.get('nome', db_vistoriador.nome)
    db_vistoriador.email = update_data.get('email', db_vistoriador.email)
    db_vistoriador.telefone1 = update_data.get('telefone1', db_vistoriador.telefone1)
    db_vistoriador.telefone2 = update_data.get('telefone2', db_vistoriador.telefone2)
    db.commit()
    db.refresh(db_vistoriador)
    return db_vistoriador

@router.delete("/vistoriadores/{vistoriador_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar um vistoriador")
def delete_vistoriador(vistoriador_id: UUID, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == vistoriador_id, models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).first()
    if db_vistoriador is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado")
    vistorias_futuras = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == vistoriador_id, models.Agenda.data >= date.today()).count()
    if vistorias_futuras > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {vistorias_futuras} vistorias futuras agendadas para este vistoriador.")
    db_vistoriador.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- CRUD para Clientes ---
# =================================================================
@router.post("/clientes/", response_model=schemas.ClienteDisplay, status_code=status.HTTP_201_CREATED, summary="Criar um novo cliente")
def create_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    existing_cliente = db.query(models.Cliente).filter(models.Cliente.email == cliente.email).first()
    if existing_cliente:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"O e-mail '{cliente.email}' já está cadastrado para outro cliente.")
    db_cliente = models.Cliente(**cliente.model_dump())
    db.add(db_cliente)
    db.commit()
    db.refresh(db_cliente)
    return db_cliente

@router.get("/clientes/", response_model=List[schemas.ClienteDisplay], summary="Listar todos os clientes")
def read_clientes(
    search: Optional[str] = None, 
    skip: int = 0, 
    limit: int = 10, # Reduzir o limite padrão para buscas é uma boa prática
    db: Session = Depends(get_db)
):
    """
    Lista os clientes com suporte a busca por nome ou e-mail e paginação.
    """
    query = db.query(models.Cliente).filter(models.Cliente.is_deleted == False)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                models.Cliente.nome.ilike(search_term),
                models.Cliente.email.ilike(search_term)
            )
        )

    clientes = query.order_by(models.Cliente.nome).offset(skip).limit(limit).all()
    return clientes

@router.put("/clientes/{cliente_id}", response_model=schemas.ClienteDisplay, summary="Atualizar um cliente")
def update_cliente(cliente_id: UUID, cliente_update: schemas.ClienteCreate, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id, models.Cliente.is_deleted == False).first()
    if db_cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    if cliente_update.email != db_cliente.email:
        existing = db.query(models.Cliente).filter(models.Cliente.email == cliente_update.email).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este e-mail já está em uso por outro cliente.")
    update_data = cliente_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cliente, key, value)
    db.commit()
    db.refresh(db_cliente)
    return db_cliente

@router.delete("/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar um cliente")
def delete_cliente(cliente_id: UUID, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id, models.Cliente.is_deleted == False).first()
    if db_cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    imoveis_associados = db.query(models.Imovel).filter(models.Imovel.cliente_id == cliente_id, models.Imovel.is_deleted == False).count()
    if imoveis_associados > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {imoveis_associados} imóveis ativos associados a este cliente.")
    db_cliente.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- CRUD para Imóveis ---
# =================================================================
@router.post("/imoveis/", response_model=schemas.ImovelDisplay, status_code=status.HTTP_201_CREATED, summary="Criar um novo imóvel")
def create_imovel(imovel: schemas.ImovelCreate, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == imovel.cliente_id, models.Cliente.is_deleted == False).first()
    if not db_cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imovel.imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada.")
    valor_calculado = _calculate_valor_base_imovel(db_imobiliaria, imovel.tamanho, imovel.mobiliado)
    db_imovel = models.Imovel(**imovel.model_dump(), valor=valor_calculado)
    db.add(db_imovel)
    db.commit()
    db.refresh(db_imovel)
    return db_imovel

@router.get("/imoveis/", response_model=List[schemas.ImovelDisplay], summary="Listar todos os imóveis")
def read_imoveis(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    imoveis = db.query(models.Imovel).options(joinedload(models.Imovel.cliente), joinedload(models.Imovel.imobiliaria)).filter(models.Imovel.is_deleted == False).order_by(models.Imovel.cod_imovel).offset(skip).limit(limit).all()
    return imoveis

@router.delete("/imoveis/{imovel_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar um imóvel")
def delete_imovel(imovel_id: UUID, db: Session = Depends(get_db)):
    db_imovel = db.query(models.Imovel).filter(models.Imovel.id == imovel_id, models.Imovel.is_deleted == False).first()
    if db_imovel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado")
    vistorias_futuras = db.query(models.Agenda).filter(models.Agenda.imovel_id == imovel_id, models.Agenda.data >= date.today()).count()
    if vistorias_futuras > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {vistorias_futuras} vistorias futuras agendadas para este imóvel.")
    db_imovel.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- Gestão de Disponibilidade e Agenda ---
# =================================================================

@router.get("/agenda/all", response_model=List[schemas.AgendaDisplay], summary="Busca todos os eventos da agenda para um período")
def get_all_agenda_events(start: date, end: date, db: Session = Depends(get_db)):
    events = db.query(models.Agenda).options(
        joinedload(models.Agenda.vistoriador),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.cliente),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
    ).filter(
        models.Agenda.data.between(start, end),
        models.Agenda.is_deleted == False
    ).order_by(models.Agenda.data, models.Agenda.horario).all()
    return events


@router.post("/horarios-fixos/", response_model=schemas.HorarioFixoDisplay, status_code=status.HTTP_201_CREATED, summary="Adicionar horário de trabalho fixo")
def add_horario_fixo(horario: schemas.HorarioFixoCreate, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == horario.vistoriador_id, models.Usuario.tipo == 'vistoriador').first()
    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado.")
    existing_horario = db.query(models.HorarioFixo).filter(models.HorarioFixo.vistoriador_id == horario.vistoriador_id, models.HorarioFixo.dia_semana == horario.dia_semana, models.HorarioFixo.horario == horario.horario).first()
    if existing_horario:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este horário fixo já existe para o vistoriador.")
    db_horario = models.HorarioFixo(**horario.model_dump())
    db.add(db_horario)
    db.commit()
    db.refresh(db_horario)
    return db_horario

@router.get("/vistoriadores/{vistoriador_id}/horarios-fixos/", response_model=List[schemas.HorarioFixoDisplay], summary="Listar horários fixos de um vistoriador")
def get_horarios_fixos(vistoriador_id: UUID, db: Session = Depends(get_db)):
    horarios = db.query(models.HorarioFixo).filter(models.HorarioFixo.vistoriador_id == vistoriador_id, models.HorarioFixo.is_deleted == False).all()
    return horarios

@router.delete("/horarios-fixos/{horario_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remover um horário de trabalho fixo")
def delete_horario_fixo(horario_id: UUID, db: Session = Depends(get_db)):
    db_horario = db.query(models.HorarioFixo).filter(models.HorarioFixo.id == horario_id).first()
    if not db_horario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário fixo não encontrado.")
    # Soft delete em vez de db.delete(db_horario)
    db_horario.is_deleted = True
    db.commit()
    return None

@router.post("/horarios-avulsos/", response_model=schemas.AgendaDisplay, status_code=status.HTTP_201_CREATED, summary="Adicionar horário de trabalho avulso")
def add_horario_avulso(horario: schemas.HorarioAvulsoCreate, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == horario.vistoriador_id, models.Usuario.tipo == 'vistoriador').first()
    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado.")
    existing_agenda = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == horario.vistoriador_id, models.Agenda.data == horario.data, models.Agenda.horario == horario.horario).first()
    if existing_agenda:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um registro na agenda para esta data e horário.")
    db_agenda = models.Agenda(vistoriador_id=horario.vistoriador_id, data=horario.data, horario=horario.horario, disponivel=True, tipo="LIVRE")
    db.add(db_agenda)
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.post("/agenda/gerar", summary="CORRIGIDO: Gerar agenda com base nos horários fixos")
def generate_agenda(semanas: int = 4, db: Session = Depends(get_db)):
    """
    Gera horários livres na agenda para as próximas semanas com base nos horários
    de trabalho fixos cadastrados para cada vistoriador.
    CORREÇÃO: Adicionado tratamento de erro e lógica de comparação de dias ajustada.
    """
    today = date.today()
    horarios_fixos = db.query(models.HorarioFixo).filter(models.HorarioFixo.is_deleted == False).all()
    if not horarios_fixos:
        return {"message": "Nenhum horário de trabalho fixo cadastrado. Nenhum horário foi gerado."}

    novos_agendamentos = 0
    try:
        for i in range(7 * semanas):
            current_date = today + timedelta(days=i)
            # weekday() retorna 0 para Segunda e 6 para Domingo. Convertemos para string.
            dia_semana_str = str(current_date.weekday())
            
            for hf in horarios_fixos:
                if hf.dia_semana == dia_semana_str:
                    existe = db.query(models.Agenda).filter(
                        models.Agenda.vistoriador_id == hf.vistoriador_id,
                        models.Agenda.data == current_date,
                        models.Agenda.horario == hf.horario
                    ).first()
                    
                    if not existe:
                        novo_agendamento = models.Agenda(
                            vistoriador_id=hf.vistoriador_id,
                            data=current_date,
                            horario=hf.horario,
                            disponivel=True,
                            tipo="LIVRE"
                        )
                        db.add(novo_agendamento)
                        novos_agendamentos += 1
        
        if novos_agendamentos > 0:
            db.commit()
            return {"message": f"Geração de agenda concluída. {novos_agendamentos} novos horários disponíveis foram criados."}
        else:
            return {"message": "Geração de agenda concluída. Nenhum novo horário precisou ser criado (possivelmente já existem)."}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocorreu um erro ao gerar a agenda: {str(e)}"
        )


# =================================================================
# --- Gestão de Vistorias ---
# =================================================================

@router.post("/agenda/agendar", response_model=schemas.AgendaDisplay, summary="Agendar uma nova vistoria")
def schedule_vistoria(agendamento: schemas.AgendaCreate, db: Session = Depends(get_db)):
    db_imovel = db.query(models.Imovel).filter(
        models.Imovel.id == agendamento.imovel_id,
        models.Imovel.imobiliaria_id == agendamento.imobiliaria_id,
        models.Imovel.is_deleted == False
    ).first()
    if not db_imovel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado ou não pertence à imobiliária informada.")
    
    db_agenda_1 = db.query(models.Agenda).filter(
        models.Agenda.id == agendamento.horario_id,
        models.Agenda.disponivel == True
    ).first()

    if not db_agenda_1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário selecionado não está livre ou não existe.")
    
    valor_final = _calculate_valor_final_vistoria(db_imovel, agendamento.tipo.value)
    valor_comissao = _calculate_valor_comissao_vistoriador(db_imovel.tamanho, db_imovel.mobiliado, agendamento.tipo.value)

    necessita_horario_duplo = ((agendamento.tipo.value in ["ENTRADA", "SAIDA"]) and 
                              (float(db_imovel.tamanho) >= 100 or db_imovel.mobiliado == "mobiliado"))

    if necessita_horario_duplo and not agendamento.force_single_slot:
        try:
            horario_principal_dt = datetime.strptime(db_agenda_1.horario, '%H:%M')
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de horário inválido no banco de dados.")

        db_agenda_2 = db.query(models.Agenda).filter(
            models.Agenda.data == db_agenda_1.data,
            models.Agenda.vistoriador_id == db_agenda_1.vistoriador_id,
            models.Agenda.horario > db_agenda_1.horario,
            models.Agenda.disponivel == True
        ).order_by(models.Agenda.horario).first()

        if not db_agenda_2:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, 
                detail="Este imóvel necessita de 2 horários, mas não há um segundo slot disponível no mesmo dia."
            )
            
        db_agenda_2.imovel_id = agendamento.imovel_id
        db_agenda_2.tipo = agendamento.tipo.value
        db_agenda_2.disponivel = False
        db_agenda_2.valor_final_vistoria = 0
        db_agenda_2.valor_vistoriador = 0

    # Atualiza o horário principal (ou único)
    db_agenda_1.imovel_id = agendamento.imovel_id
    db_agenda_1.tipo = agendamento.tipo.value
    db_agenda_1.disponivel = False
    db_agenda_1.valor_final_vistoria = valor_final if valor_final is not None else 0
    db_agenda_1.valor_vistoriador = valor_comissao if valor_comissao is not None else 0
    # ADICIONADO: Salva a observação para o vistoriador
    db_agenda_1.observacao_vistoriador = agendamento.observacao_vistoriador

    db.commit()
    db.refresh(db_agenda_1)
    return db_agenda_1


@router.put("/agenda/{agenda_id}", response_model=schemas.AgendaDisplay, summary="Atualiza os detalhes de uma vistoria")
def update_vistoria(
    agenda_id: UUID,
    update_data: schemas.AgendaUpdate,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
    ).filter(models.Agenda.id == agenda_id).first()

    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    if not db_agenda.imovel:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este agendamento não está vinculado a um imóvel.")

    update_payload = update_data.model_dump(exclude_unset=True)
    recalcular = False

    if "tamanho" in update_payload and float(update_payload["tamanho"]) != float(db_agenda.imovel.tamanho):
        db_agenda.imovel.tamanho = Decimal(str(update_payload["tamanho"]))
        recalcular = True
    
    if "mobiliado" in update_payload and update_payload["mobiliado"] != db_agenda.imovel.mobiliado:
        db_agenda.imovel.mobiliado = update_payload["mobiliado"]
        recalcular = True

    if "tipo_vistoria" in update_payload and update_payload["tipo_vistoria"] != db_agenda.tipo:
        db_agenda.tipo = update_payload["tipo_vistoria"]
        recalcular = True

    if recalcular and "valor_final_vistoria" not in update_payload and "valor_vistoriador" not in update_payload:
        db_agenda.imovel.valor = _calculate_valor_base_imovel(db_agenda.imovel.imobiliaria, db_agenda.imovel.tamanho, db_agenda.imovel.mobiliado)
        db_agenda.valor_final_vistoria = _calculate_valor_final_vistoria(db_agenda.imovel, db_agenda.tipo)
        db_agenda.valor_vistoriador = _calculate_valor_comissao_vistoriador(db_agenda.imovel.tamanho, db_agenda.imovel.mobiliado, db_agenda.tipo)
    else:
        if "valor_final_vistoria" in update_payload:
            db_agenda.valor_final_vistoria = Decimal(str(update_payload["valor_final_vistoria"]))
        if "valor_vistoriador" in update_payload:
            db_agenda.valor_vistoriador = Decimal(str(update_payload["valor_vistoriador"]))

    if "observacao_privada" in update_payload:
        db_agenda.observacao_privada = update_payload["observacao_privada"]
    
    # ADICIONADO: Atualiza a observação para o vistoriador
    if "observacao_vistoriador" in update_payload:
        db_agenda.observacao_vistoriador = update_payload["observacao_vistoriador"]

    db.commit()
    db.refresh(db_agenda)
    return db_agenda


@router.put("/agenda/{agenda_id}/improdutiva", status_code=status.HTTP_201_CREATED, summary="Marcar vistoria como improdutiva")
def mark_vistoria_improdutiva(
    agenda_id: UUID,
    data: schemas.AgendaImprodutiva,
    db: Session = Depends(get_db)
):
    """
    Cria um registro em VistoriaImprodutiva e libera o horário original na agenda.
    Esta é a única forma correta de registrar uma improdutiva.
    """
    db_agenda = db.query(models.Agenda).options(
        joinedload(models.Agenda.imovel)
    ).filter(models.Agenda.id == agenda_id).first()

    if not db_agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    if not db_agenda.imovel:
         raise HTTPException(status_code=400, detail="Agendamento não está associado a um imóvel para ser marcado como improdutivo.")

    config = db.query(models.Configuracao).first()
    if not config:
        raise HTTPException(status_code=500, detail="Configuração do sistema não encontrada.")

    valor_comissao_fixa = config.percentual_comissao_improdutiva

    nova_improdutiva = models.VistoriaImprodutiva(
        agenda_id_original=db_agenda.id,
        cliente_id=db_agenda.imovel.cliente_id,
        imovel_id=db_agenda.imovel_id,
        imobiliaria_id=db_agenda.imovel.imobiliaria_id,
        data_marcacao=date.today(), # CORREÇÃO: Adiciona a data atual
        data_vistoria_original=db_agenda.data,
        horario_vistoria_original=db_agenda.horario,
        motivo_improdutividade=data.motivo,
        valor_cobranca=data.valor_cobranca,
        valor_para_vistoriador=valor_comissao_fixa,
        pago=False
    )
    db.add(nova_improdutiva)

    db_agenda.imovel_id = None
    db_agenda.tipo = "LIVRE"
    db_agenda.disponivel = True
    db_agenda.valor_final_vistoria = None
    db_agenda.valor_vistoriador = None
    db_agenda.observacao_privada = None
    db_agenda.observacao_vistoriador = None

    try:
        db.commit()
        db.refresh(nova_improdutiva)
        return {"message": "Vistoria marcada como improdutiva com sucesso. O horário original foi liberado.", "improdutiva_id": nova_improdutiva.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar a vistoria improdutiva: {str(e)}")


@router.put("/agenda/{agenda_id}/cancelar", response_model=schemas.AgendaDisplay, summary="Cancelar uma vistoria agendada")
def cancelar_vistoria(
    agenda_id: UUID,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    db_agenda.imovel_id = None
    db_agenda.tipo = "LIVRE"
    db_agenda.disponivel = True
    db_agenda.valor_final_vistoria = None
    db_agenda.valor_vistoriador = None
    db_agenda.observacao_privada = None
    db_agenda.observacao_vistoriador = None

    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.put("/agenda/{agenda_id}/reagendar", response_model=schemas.AgendaDisplay, summary="Reagendar uma vistoria para um novo horário")
def reagendar_vistoria(agenda_id: UUID, reagendamento: schemas.AgendaReagendar, db: Session = Depends(get_db)):
    db_agenda_origem = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    db_agenda_destino = db.query(models.Agenda).filter(models.Agenda.id == reagendamento.target_agenda_id).first()

    if not db_agenda_origem:
        raise HTTPException(status_code=404, detail="Agendamento original não encontrado.")
    if not db_agenda_destino:
        raise HTTPException(status_code=404, detail="Horário de destino não encontrado.")
    if not db_agenda_destino.disponivel:
        raise HTTPException(status_code=400, detail="O horário de destino não está disponível.")

    db_agenda_destino.imovel_id = db_agenda_origem.imovel_id
    db_agenda_destino.tipo = db_agenda_origem.tipo
    db_agenda_destino.observacao_privada = db_agenda_origem.observacao_privada
    db_agenda_destino.observacao_vistoriador = db_agenda_origem.observacao_vistoriador
    db_agenda_destino.valor_final_vistoria = db_agenda_origem.valor_final_vistoria
    db_agenda_destino.valor_vistoriador = db_agenda_origem.valor_vistoriador
    db_agenda_destino.disponivel = False

    db_agenda_origem.imovel_id = None
    db_agenda_origem.tipo = "LIVRE"
    db_agenda_origem.disponivel = True
    db_agenda_origem.observacao_privada = None
    db_agenda_origem.observacao_vistoriador = None
    db_agenda_origem.valor_final_vistoria = None
    db_agenda_origem.valor_vistoriador = None

    db.commit()
    db.refresh(db_agenda_destino)
    return db_agenda_destino

@router.put("/agenda/{agenda_id}/fechar", response_model=schemas.AgendaDisplay, summary="Fechar um horário livre na agenda")
def fechar_horario(
    agenda_id: UUID,
    data: schemas.AgendaFecharHorario,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).filter(
        models.Agenda.id == agenda_id,
        models.Agenda.disponivel == True,
        models.Agenda.tipo == 'LIVRE'
    ).first()
    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário não está livre ou não foi encontrado.")

    db_agenda.tipo = "FECHADO"
    db_agenda.disponivel = False
    db_agenda.observacao_privada = data.motivo # Reutilizando o campo de observação para o motivo
    
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

# =================================================================
# --- Gestão de Configurações ---
# =================================================================

@router.get("/configuracoes/", response_model=schemas.ConfiguracaoDisplay, summary="Obter configurações do sistema")
def get_configuracoes(db: Session = Depends(get_db)):
    config = db.query(models.Configuracao).first()
    if not config:
        config = models.Configuracao(percentual_comissao_improdutiva=30.0) # Valor padrão
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/configuracoes/", response_model=schemas.ConfiguracaoDisplay, summary="Atualizar configurações do sistema")
def update_configuracoes(config_update: schemas.ConfiguracaoUpdate, db: Session = Depends(get_db)):
    db_config = db.query(models.Configuracao).first()
    if not db_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configurações não encontradas.")
    update_data = config_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_config, key, value)
    db.commit()
    db.refresh(db_config)
    return db_config

# =================================================================
# --- Geração de Relatórios ---
# =================================================================

def _get_relatorio_imobiliaria_data(imobiliaria_id: UUID, mes: int, ano: int, db: Session) -> schemas.RelatorioImobiliaria:
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada.")

    vistorias_normais = db.query(models.Agenda).options(joinedload(models.Agenda.imovel)).join(models.Imovel).filter(
        models.Imovel.imobiliaria_id == imobiliaria_id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).order_by(models.Agenda.data.asc()).all() # ORDENAÇÃO ADICIONADA
    
    improdutivas = db.query(models.VistoriaImprodutiva).options(joinedload(models.VistoriaImprodutiva.imovel)).filter(
        models.VistoriaImprodutiva.imobiliaria_id == imobiliaria_id,
        extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
        extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes,
        models.VistoriaImprodutiva.is_deleted == False
    ).order_by(models.VistoriaImprodutiva.data_vistoria_original.asc()).all() # ORDENAÇÃO ADICIONADA

    vistorias_formatadas = [
        schemas.RelatorioVistoriaItem(
            data=v.data,
            cod_imovel=v.imovel.cod_imovel,
            endereco=v.imovel.endereco,
            tamanho=float(v.imovel.tamanho),
            tipo_mobilia=v.imovel.mobiliado,
            tipo_vistoria=v.tipo,
            valor=float(v.valor_final_vistoria or 0),
            comissao_vistoriador=float(v.valor_vistoriador or 0),
            observacao_privada=v.observacao_privada
        ) for v in vistorias_normais if v.imovel
    ]
    improdutivas_formatadas = [
        schemas.RelatorioImprodutivaItem(
            data_vistoria_original=i.data_vistoria_original,
            cod_imovel=i.imovel.cod_imovel if i.imovel else "N/A",
            motivo_improdutividade=i.motivo_improdutividade or "N/A",
            valor_cobrado=i.valor_cobranca or 0,
            comissao_vistoriador=i.valor_para_vistoriador or 0
        ) for i in improdutivas
    ]

    total_vistorias = sum(v.valor for v in vistorias_formatadas)
    total_improdutivas = sum(i.valor_cobrado for i in improdutivas_formatadas)

    return schemas.RelatorioImobiliaria(
        imobiliaria_nome=db_imobiliaria.nome,
        periodo=f"{mes:02d}/{ano}",
        vistorias=vistorias_formatadas,
        improdutivas=improdutivas_formatadas,
        total_vistorias=total_vistorias,
        total_improdutivas=total_improdutivas,
        total_geral=total_vistorias + total_improdutivas
    )

def _get_relatorio_vistoriador_data(vistoriador_id: UUID, mes: int, ano: int, db: Session) -> schemas.RelatorioVistoriador:
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == vistoriador_id).first()
    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado.")

    vistorias_normais = db.query(models.Agenda).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).options(joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)).order_by(models.Agenda.data.asc()).all() # ORDENAÇÃO ADICIONADA

    improdutivas = db.query(models.VistoriaImprodutiva).join(
        models.Agenda, models.VistoriaImprodutiva.agenda_id_original == models.Agenda.id
    ).options(joinedload(models.VistoriaImprodutiva.imovel)).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
        extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes,
        models.VistoriaImprodutiva.is_deleted == False
    ).order_by(models.VistoriaImprodutiva.data_vistoria_original.asc()).all() # ORDENAÇÃO ADICIONADA
    
    vistorias_por_imobiliaria = {}
    total_comissao_vistorias = Decimal(0)
    for v in vistorias_normais:
        if v.imovel and v.imovel.imobiliaria:
            imob_nome = v.imovel.imobiliaria.nome
            if imob_nome not in vistorias_por_imobiliaria:
                vistorias_por_imobiliaria[imob_nome] = []
            
            vistorias_por_imobiliaria[imob_nome].append(schemas.RelatorioVistoriaItem(
                data=v.data,
                cod_imovel=v.imovel.cod_imovel,
                endereco=v.imovel.endereco,
                tamanho=float(v.imovel.tamanho),
                tipo_mobilia=v.imovel.mobiliado,
                tipo_vistoria=v.tipo,
                valor=float(v.valor_final_vistoria or 0),
                comissao_vistoriador=float(v.valor_vistoriador or 0),
                observacao_privada=v.observacao_privada,
            ))
            total_comissao_vistorias += v.valor_vistoriador or 0

    improdutivas_formatadas = [
        schemas.RelatorioImprodutivaItem(
            data_vistoria_original=i.data_vistoria_original,
            cod_imovel=i.imovel.cod_imovel if i.imovel else "N/A",
            motivo_improdutividade=i.motivo_improdutividade or "N/A",
            valor_cobrado=i.valor_cobranca or 0,
            comissao_vistoriador=i.valor_para_vistoriador or 0
        ) for i in improdutivas
    ]
    total_comissao_improdutivas = sum(i.comissao_vistoriador for i in improdutivas_formatadas)

    return schemas.RelatorioVistoriador(
        vistoriador_nome=db_vistoriador.nome,
        periodo=f"{mes:02d}/{ano}",
        vistorias_por_imobiliaria=vistorias_por_imobiliaria,
        improdutivas=improdutivas_formatadas,
        total_comissao_vistorias=total_comissao_vistorias,
        total_comissao_improdutivas=total_comissao_improdutivas,
        total_geral_comissao=total_comissao_vistorias + Decimal(total_comissao_improdutivas)
    )

def _get_relatorio_geral_data(mes: int, ano: int, db: Session) -> List[schemas.RelatorioImobiliaria]:
    """
    NOVA VERSÃO: Retorna uma lista de relatórios detalhados, um para cada imobiliária.
    """
    imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).order_by(models.Imobiliaria.nome).all()
    
    relatorios_detalhados = []
    for imob in imobiliarias:
        # Reutiliza a função que já busca dados detalhados por imobiliária
        # Esta função AGORA retorna os dados ordenados internamente.
        report_data = _get_relatorio_imobiliaria_data(imob.id, mes, ano, db)
        relatorios_detalhados.append(report_data)
    
    # A lista principal (relatorios_detalhados) está ordenada pelo nome da imobiliária.
    # Cada item DENTRO dela (report_data.vistorias e report_data.improdutivas)
    # está ordenado pela data, graças às alterações na função _get_relatorio_imobiliaria_data.
    return relatorios_detalhados
        


# --- Funções Auxiliares para Geração de Arquivos ---
def _create_excel_report(data_sections: Dict[str, List[Dict]], file_title: str, value_column_name: str):
    wb = Workbook()
    ws = wb.active
    ws.title = "Relatorio"

    titulo_font = Font(bold=True, color="FFFFFF", size=14)
    titulo_fill = PatternFill("solid", fgColor="003366")
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="4F81BD")
    total_font = Font(bold=True)
    total_geral_font = Font(bold=True, size=12)
    alignment_style = Alignment(horizontal='center', vertical='center', wrap_text=True)
    currency_format = 'R$ #,##0.00'

    width_map = {
        "Cód. Imóvel": 15, "Data": 15, "Área(m2)": 15, "Valor": 15, "Comissão Vistoriador": 20,
        "Tipo de Mobília": 20, "Tipo Vistoria": 20,
        "Endereço": 40, "Observação Privada": 40, "Motivo": 40,
        "Imobiliária": 30, "Vistorias (Qtd)": 15, "Improdutivas (Qtd)": 15,
        "Valor Vistorias": 18, "Valor Improdutivas": 18, "Valor Total": 18
    }

    current_row = 1
    total_geral = 0.0

    # Main Title (Optional, can be added)
    # ws.cell(row=current_row, column=1, value=file_title) ...
    # current_row += 2

    for titulo, data_list in data_sections.items():
        if not data_list:
            continue

        headers = list(data_list[0].keys())
        num_cols = len(headers)

        # Section Title
        ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=num_cols)
        cell_titulo = ws.cell(row=current_row, column=1, value=titulo)
        cell_titulo.font = titulo_font
        cell_titulo.fill = titulo_fill
        cell_titulo.alignment = Alignment(horizontal='center', vertical='center')
        current_row += 2

        # Headers
        for c_idx, col_name in enumerate(headers, 1):
            cell = ws.cell(row=current_row, column=c_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = alignment_style
            col_letter = get_column_letter(c_idx)
            ws.column_dimensions[col_letter].width = width_map.get(col_name, 25) # default width
        current_row += 1

        # Data Rows
        section_total = 0.0
        for row_dict in data_list:
            # Need to ensure the order is correct
            row_values = [row_dict.get(h) for h in headers]
            ws.append(row_values)
            
            # Formatting and summing
            for c_idx, col_name in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=c_idx)
                cell.alignment = alignment_style

                # This is the crucial part for summing
                if col_name == value_column_name:
                    value = row_dict.get(col_name)
                    if isinstance(value, (int, float, Decimal)):
                        cell.number_format = currency_format
                        section_total += float(value)
                
                if isinstance(cell.value, (datetime, date)):
                    cell.number_format = 'DD/MM/YYYY'

            current_row += 1

        total_geral += section_total

        # Section Total
        label_col_idx = max(1, num_cols - 1)
        value_col_idx = num_cols
        
        total_label_cell = ws.cell(row=current_row, column=label_col_idx, value="Total da Categoria:")
        total_label_cell.font = total_font
        total_value_cell = ws.cell(row=current_row, column=value_col_idx, value=section_total)
        total_value_cell.font = total_font
        total_value_cell.number_format = currency_format
        current_row += 3

    # Grand Total
    # The condition `len(data_sections) > 1` is good
    if total_geral > 0 and len(data_sections) > 1:
        max_cols = max((len(list(d[0].keys())) for d in data_sections.values() if d), default=1)
        label_col_geral = max(1, max_cols - 1)
        value_col_geral = max_cols
        
        ws.cell(row=current_row, column=label_col_geral, value="VALOR TOTAL GERAL:").font = total_geral_font
        total_cell = ws.cell(row=current_row, column=value_col_geral, value=total_geral)
        total_cell.font = total_geral_font
        total_cell.number_format = currency_format

    virtual_workbook = io.BytesIO()
    wb.save(virtual_workbook)
    virtual_workbook.seek(0)
    return virtual_workbook


def _create_pdf_report(report_data: Union[schemas.RelatorioImobiliaria, schemas.RelatorioVistoriador, schemas.RelatorioGeral]):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter))
    elements = []
    styles = getSampleStyleSheet()
    
    if isinstance(report_data, schemas.RelatorioGeral):
        elements.append(Paragraph(f"Relatório Geral de Faturamento - {report_data.periodo}", styles['h1']))
        elements.append(Spacer(1, 12))
        data = [["Imobiliária", "Vistorias", "Improdutivas", "Valor Vistorias", "Valor Improdutivas"]]
        for item in report_data.data:
            data.append([item.imobiliaria_nome, item.total_vistorias, item.total_improdutivas, f"R$ {item.valor_total_vistorias:.2f}", f"R$ {item.valor_total_improdutivas:.2f}"])
        data.append(["TOTAIS", report_data.total_geral_vistorias, report_data.total_geral_improdutivas, f"R$ {report_data.valor_final_vistorias:.2f}", f"R$ {report_data.valor_final_improdutivas:.2f}"])
        t = Table(data)
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.grey), ('GRID', (0, 0), (-1, -1), 1, colors.black)]))
        elements.append(t)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer

# CORREÇÃO: Alterando os paths para corresponder ao uso do frontend
@router.get("/imobiliarias/{imobiliaria_id}/relatorio", response_model=schemas.RelatorioImobiliaria, summary="Gerar relatório mensal por imobiliária para visualização")
def get_imobiliaria_relatorio(imobiliaria_id: UUID, mes: int = Query(..., ge=1, le=12), ano: int = Query(..., ge=2020), db: Session = Depends(get_db)):
    """
    Retorna os dados do relatório de uma imobiliária específica em formato JSON.
    """
    return _get_relatorio_imobiliaria_data(imobiliaria_id, mes, ano, db)

@router.get("/vistoriadores/{vistoriador_id}/relatorio", response_model=schemas.RelatorioVistoriador, summary="Gerar relatório mensal por vistoriador para visualização")
def get_vistoriador_relatorio(vistoriador_id: UUID, mes: int = Query(..., ge=1, le=12), ano: int = Query(..., ge=2020), db: Session = Depends(get_db)):
    """
    Retorna os dados do relatório de um vistoriador específico em formato JSON.
    """
    return _get_relatorio_vistoriador_data(vistoriador_id, mes, ano, db)

@router.get("/relatorios/geral", response_model=List[schemas.RelatorioImobiliaria], summary="Gerar relatório geral detalhado para visualização")
def get_relatorio_geral_view(mes: int = Query(..., ge=1, le=12), ano: int = Query(..., ge=2020), db: Session = Depends(get_db)):
    """
    Retorna os dados do relatório geral de faturamento em formato JSON.
    """
    return _get_relatorio_geral_data(mes, ano, db)


@router.get("/relatorios/download", summary="Fazer download de relatórios consolidados")
def download_relatorio(
    mes: int = Query(..., ge=1, le=12),
    ano: int = Query(..., ge=2020),
    formato: str = Query(..., pattern="^(excel|pdf)$"),
    imobiliaria_id: Optional[UUID] = Query(None),
    vistoriador_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Endpoint unificado para download de relatórios.
    """
    data_for_excel = {}
    report_data = None
    filename_prefix = "relatorio"
    value_column_name = "Valor"

    if imobiliaria_id:
        report_data = _get_relatorio_imobiliaria_data(imobiliaria_id, mes, ano, db)
        filename_prefix = f"relatorio_imob_{report_data.imobiliaria_nome.replace(' ', '_')}"
        
        vistorias_list = [{
            "Data": v.data, "Cód. Imóvel": v.cod_imovel, "Endereço": v.endereco,
            "Área(m2)": v.tamanho, "Tipo de Mobília": v.tipo_mobilia,
            "Tipo Vistoria": v.tipo_vistoria, "Valor": v.valor,
            "Observação Privada": v.observacao_privada
        } for v in report_data.vistorias]
        
        improdutivas_list = [{
            "Data": i.data_vistoria_original, "Cód. Imóvel": i.cod_imovel,
            "Motivo": i.motivo_improdutividade, "Valor": i.valor_cobrado
        } for i in report_data.improdutivas]
        
        data_for_excel = {
            "Vistorias Agendadas": vistorias_list,
            "Vistorias Improdutivas": improdutivas_list
        }

    elif vistoriador_id:
        report_data = _get_relatorio_vistoriador_data(vistoriador_id, mes, ano, db)
        filename_prefix = f"relatorio_vist_{report_data.vistoriador_nome.replace(' ', '_')}"
        value_column_name = "Comissão Vistoriador"
        
        for imob, vistorias in report_data.vistorias_por_imobiliaria.items():
            data_for_excel[f"IMOBILIÁRIA: {imob.upper()}"] = [{
                "Data": v.data, "Cód. Imóvel": v.cod_imovel, "Endereço": v.endereco,
                "Tipo Vistoria": v.tipo_vistoria, "Comissão Vistoriador": v.comissao_vistoriador,
                "Observação Privada": v.observacao_privada
            } for v in vistorias]

        if report_data.improdutivas:
            data_for_excel["VISTORIAS IMPRODUTIVAS"] = [{
                "Data": i.data_vistoria_original, "Cód. Imóvel": i.cod_imovel,
                "Motivo": i.motivo_improdutividade, "Comissão Vistoriador": i.comissao_vistoriador
            } for i in report_data.improdutivas]

    else: # Relatório Geral
        list_of_reports = _get_relatorio_geral_data(mes, ano, db)
        filename_prefix = "relatorio_geral_detalhado"
        value_column_name = "Valor"
        
        data_for_excel = {}
        for report in list_of_reports:
            if report.vistorias:
                vistorias_list = [{
                    "Data": v.data, "Cód. Imóvel": v.cod_imovel, "Endereço": v.endereco,
                    "Área(m2)": v.tamanho, "Tipo de Mobília": v.tipo_mobilia,
                    "Tipo Vistoria": v.tipo_vistoria, "Valor": v.valor,
                    "Observação Privada": v.observacao_privada
                } for v in report.vistorias]
                data_for_excel[f"IMOBILIÁRIA: {report.imobiliaria_nome.upper()} - VISTORIAS"] = vistorias_list

            if report.improdutivas:
                improdutivas_list = [{
                    "Data": i.data_vistoria_original, "Cód. Imóvel": i.cod_imovel,
                    "Motivo": i.motivo_improdutividade, "Valor": i.valor_cobrado
                } for i in report.improdutivas]
                data_for_excel[f"IMOBILIÁRIA: {report.imobiliaria_nome.upper()} - IMPRODUTIVAS"] = improdutivas_list

    if not data_for_excel:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado para gerar o relatório.")

    filename = f"{filename_prefix}_{mes:02d}_{ano}.{'xlsx' if formato == 'excel' else 'pdf'}"
    
    if formato == "excel":
        file_stream = _create_excel_report(data_for_excel, filename_prefix, value_column_name)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else: # pdf
        file_stream = _create_pdf_report(report_data) # PDF continua com a lógica antiga por enquanto
        media_type = "application/pdf"

    headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
    return StreamingResponse(file_stream, media_type=media_type, headers=headers)

# =================================================================
# --- Relatório Mensal por E-mail ---
# =================================================================

@router.get("/valores_totais_email/{ano}/{mes}", status_code=status.HTTP_200_OK, summary="Calcula e envia o relatório de valores totais por e-mail")
def get_valores_totais_email(
    ano: int,
    mes: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Calcula os valores totais faturados por grupo de imobiliárias e as comissões
    totais por vistoriador para um determinado ano e mês, e envia um relatório por e-mail.
    """
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mês inválido. Forneça um valor entre 1 e 12.")

    # --- Cálculo por Grupo de Imobiliária ---
    grupos = db.query(models.GrupoImobiliaria).options(
        joinedload(models.GrupoImobiliaria.imobiliarias)
    ).filter(models.GrupoImobiliaria.is_deleted == False).all()

    report_grupos = {}
    for grupo in grupos:
        imobiliaria_ids = [imob.id for imob in grupo.imobiliarias if not imob.is_deleted]
        if not imobiliaria_ids:
            report_grupos[grupo.nome] = 0.0
            continue

        total_agenda = db.query(func.sum(models.Agenda.valor_final_vistoria)).join(models.Imovel).filter(
            models.Imovel.imobiliaria_id.in_(imobiliaria_ids),
            extract('year', models.Agenda.data) == ano,
            extract('month', models.Agenda.data) == mes
        ).scalar() or Decimal(0)

        total_improdutiva = db.query(func.sum(models.VistoriaImprodutiva.valor_cobranca)).filter(
            models.VistoriaImprodutiva.imobiliaria_id.in_(imobiliaria_ids),
            extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
            extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes
        ).scalar() or Decimal(0)

        report_grupos[grupo.nome] = float(total_agenda + total_improdutiva)

    # --- Cálculo por Vistoriador ---
    vistoriadores = db.query(models.Usuario).filter(
        models.Usuario.tipo == 'vistoriador', 
        models.Usuario.is_deleted == False
    ).all()

    report_vistoriadores = {}
    for vistoriador in vistoriadores:
        comissao_agenda = db.query(func.sum(models.Agenda.valor_vistoriador)).filter(
            models.Agenda.vistoriador_id == vistoriador.id,
            extract('year', models.Agenda.data) == ano,
            extract('month', models.Agenda.data) == mes
        ).scalar() or Decimal(0)

        comissao_improdutiva = db.query(func.sum(models.VistoriaImprodutiva.valor_para_vistoriador)).join(
            models.Agenda, models.VistoriaImprodutiva.agenda_id_original == models.Agenda.id
        ).filter(
            models.Agenda.vistoriador_id == vistoriador.id,
            extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
            extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes
        ).scalar() or Decimal(0)

        report_vistoriadores[vistoriador.nome] = float(comissao_agenda + comissao_improdutiva)

    # --- Montagem e Envio do E-mail ---
    meses_pt = {1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"}
    nome_mes = meses_pt.get(mes, "Mês Inválido")

    subject = f"Relatório Mensal de Ganhos - {nome_mes}/{ano}"

    # Formata os dados para o HTML
    grupos_html = "".join([f"<li><strong>{nome}:</strong> R$ {valor:,.2f}</li>" for nome, valor in report_grupos.items()])
    comissoes_html = "".join([f"<li><strong>{nome}:</strong> R$ {valor:,.2f}</li>" for nome, valor in report_vistoriadores.items()])

    html_content = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; }}
            h2 {{ color: #2E6B98; }}
            ul {{ list-style-type: none; padding-left: 0; }}
            li {{ margin-bottom: 8px; }}
            strong {{ color: #333; }}
        </style>
    </head>
    <body>
        <p>Boa tarde!</p>
        <p>Aqui está o relatório de ganhos totais do mês de <strong>{nome_mes} de {ano}</strong>.</p>
        
        <h2>📊 Grupos de Imobiliárias:</h2>
        <ul>
            {grupos_html}
        </ul>
        
        <h2>💼 Comissões de Vistoriadores:</h2>
        <ul>
            {comissoes_html}
        </ul>
        
        <p>Atenciosamente,<br>Sistema Engentoria.</p>
    </body>
    </html>
    """
    
    # Envia o e-mail em segundo plano
    background_tasks.add_task(_send_report_email, subject, html_content)
    
    return {"message": f"O relatório de {nome_mes}/{ano} está sendo processado e será enviado em breve para o e-mail configurado."}


@router.get("/agenda/{id_agendamento}/comentarios")
async def ver_comentarios(id_agendamento: str,
                          session: Session = Depends(get_db)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = (session.query(models.Agenda)
              .options(joinedload(models.Agenda.comentarios))
              .filter(models.Agenda.id == agendamento_id).first())
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    comentarios = sorted(agenda.comentarios, key=lambda d: d.created_at, reverse=False)

    return {
        "comentarios":[{
            "id": c.id,
            "conteudo": c.conteudo,
            "remetente": c.remetente,
            "created_at": c.created_at,
        } for c in comentarios]
    }

@router.post("/agenda/{id_agendamento}/comentario")
async def add_comentario(id_agendamento: str,
                         comentario: str,
                         session: Session = Depends(get_db)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = session.query(models.Agenda).filter(models.Agenda.id == agendamento_id).first()
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    new = models.ComentarioVistoria(agenda_id=agenda.id, conteudo=comentario, remetente="admin")
    try:
        session.add(new)
        session.commit()
        return
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao adicionar comentario: {e}")
        raise HTTPException(status_code=500, detail="Erro ao adicionar comentário")
    
@router.get("/agenda/{agendamento_id}/documentos")
async def ver_documentos_agendamento(agendamento_id: str,
                                     session: Session = Depends(get_db)):
    try:
        agenda_id = UUID(agendamento_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = (session.query(models.Agenda)
              .options(joinedload(models.Agenda.documentos))
              .filter(models.Agenda.id == agenda_id).first())
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
    
    docs = sorted(agenda.documentos, key=lambda d: d.created_at, reverse=True)

    return {
        "documentos":[{
            "id": d.id,
            "file_path": d.file_path,
            "link": gerar_url_assinada(bucket="documentos", file_path=d.file_path)
        }for d in docs]
    }

@router.post("/agenda/documento")
async def add_documento(agendamento_id: str = Form(...),
                        file: UploadFile = File(...),
                        session: Session = Depends(get_db)):
    try:
        agenda_id = UUID(agendamento_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = session.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    qtd = session.query(models.DocumentoAgenda.id).filter(models.DocumentoAgenda.agenda_id == agenda.id).count()
    config = session.query(models.Configuracao).first()

    if qtd >= config.max_arquivos:
        raise HTTPException(status_code=400, detail=f"Limite de {config.max_arquivos} arquivos atingido.")
    
    nome, extensao = os.path.splitext(file.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}-CODIGO-{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".png", ".jpeg", ".pdf"]:
            raise HTTPException(status_code=400, detail="Tipo de imagem não aceita")
    
    try:
        conteudo = await file.read()
        MAX_MB = 50

        if len(conteudo) > MAX_MB * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Imagem ultrapassa o tamanho máximo: 50mb")
        
        res = supabase.storage.from_("documentos").upload(nome_arquivo, 
                                                          conteudo,
                                                          {"content-type": file.content_type})
        if getattr(res, "error", None):
                logger.error(f"Erro no Supabase: {res.error}")
                raise HTTPException(status_code=400, detail="Erro ao enviar documento para o servidor")
        new = models.DocumentoAgenda(file_path=nome_arquivo, 
                                     agenda_id=agenda.id)
        session.add(new)
        session.commit()
        return
    except Exception as e:
         logger.error(f"Erro ao adicionar doc: {e}")
         session.rollback()
         raise HTTPException(status_code=500, detail="Erro no servidor ao adicionar documento")
    
@router.delete("/agenda/{doc_id}/documento")
async def deletar_doc(doc_id: str,
                      session: Session = Depends(get_db)):
    try:
        id_doc = UUID(doc_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    documento = session.query(models.DocumentoAgenda).filter(models.DocumentoAgenda.id == id_doc).first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    try:
        if deletar_arquivo_supabase(file_path=documento.file_path, bucket="documentos"):
            session.delete(documento)
            session.commit()
        else:
            raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")
        
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao deletar arquivo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")
    
@router.get("/mensal/{mes}/{ano}/{grupo_id}")
async def mensal_info(mes: int, ano: int, grupo_id: str,
                      session: Session = Depends(get_db)):
    try:
        id_grupo = UUID(grupo_id)
    except:
       raise HTTPException(status_code=400, detail="ID inválido")

    grupo = session.query(models.GrupoImobiliaria).filter(models.GrupoImobiliaria.id == id_grupo).first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo de imobiliária não encontrado")
    
    info = (session.query(models.InfoMensal)
            .options(joinedload(models.InfoMensal.messages),
                     joinedload(models.InfoMensal.documentos))
            .filter(models.InfoMensal.grupo_id == id_grupo, 
                    models.InfoMensal.month == mes, 
                    models.InfoMensal.year == ano).first())
    if not info:
        raise HTTPException(status_code=404, detail="Info não encontrada")
    
    mensagens = sorted(info.messages, key=lambda d: d.created_at, reverse=False)
    docs = sorted(info.documentos, key=lambda d: d.created_at, reverse=True)

    return {
        "id": info.id,
        "month": info.month,
        "year": info.year,
        "accepted": info.accepted,
        "updated_at": info.updated_at,
        "mensagens":[{
            "id": mensagem.id,
            "conteudo": mensagem.conteudo,
            "remetente": mensagem.remetente,
            "created_at": mensagem.created_at
        }for mensagem in mensagens],
        "documentos":[{
            "id": doc.id,
            "file_path": doc.file_path,
            "link": gerar_url_assinada(bucket="documentos", file_path=doc.file_path)
        }for doc in docs]
    }


@router.post("/mensal/{info_id}/mensagem")
async def enviar_msg_mensal(info_id: str,
                            mensagem: str,
                      session: Session = Depends(get_db)):
    try:
        id_info = UUID(info_id)
    except:
       raise HTTPException(status_code=400, detail="ID inválido")

    info = session.query(models.InfoMensal.id).filter(models.InfoMensal.id == id_info).first()
    if not info:
        raise HTTPException(status_code=404, detail="Info não encontrada")
    
    new = models.MensagemInfoMensal(info_id=info.id, conteudo=mensagem, remetente="admin")
    try:
        session.add(new)
        session.commit()
        return
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao enviar mensagem: {e}")
        raise HTTPException(status_code=500, detail="Erro ao enviar mensagem")

@router.post("/mensal/documento")
async def enviar_documento_mensal(id_info: str = Form(...),
                                  file: UploadFile = File(...),
                                  session: Session = Depends(get_db)):
    try:
        info_id = UUID(id_info)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    info = session.query(models.InfoMensal).filter(models.InfoMensal.id == info_id).first()
    if not info:
        raise HTTPException(status_code=404, detail="Info não encontrada")
    
    config = session.query(models.Configuracao).first()
    docs = session.query(models.DocumentosInfoMensal).filter(models.DocumentosInfoMensal.info_id == info.id).count()
    if docs <= config.max_arquivos:
        raise HTTPException(status_code=400, detail="Limite de documentos excedido")
    
    nome, extensao = os.path.splitext(file.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}-CODIGO-{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".png", ".jpeg", ".pdf"]:
            raise HTTPException(status_code=400, detail="Tipo de imagem não aceita")
    
    try:
        conteudo = await file.read()
        MAX_MB = 50

        if len(conteudo) > MAX_MB * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Imagem ultrapassa o tamanho máximo: 50mb")
        
        res = supabase.storage.from_("documentos").upload(nome_arquivo, 
                                                          conteudo,
                                                          {"content-type": file.content_type})
        if getattr(res, "error", None):
                logger.error(f"Erro no Supabase: {res.error}")
                raise HTTPException(status_code=400, detail="Erro ao enviar documento para o servidor")
        new = models.DocumentosInfoMensal(info_id=info.id, file_path=nome_arquivo)
        session.add(new)
        session.commit()
        return
    except Exception as e:
         logger.error(f"Erro ao adicionar imagem: {e}")
         session.rollback()
         raise HTTPException(status_code=500, detail="Erro no servidor ao adicionar imagem")
    
@router.delete("/deletar_doc_info/{id_doc}")
async def deletar_doc_info(id_doc: str, 
                            session: Session = Depends(get_db)):
    try:
        doc_id = UUID(id_doc)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    doc = (session.query(models.DocumentosInfoMensal)
           .join(models.DocumentosInfoMensal.info_mensal)
           .filter(models.DocumentosInfoMensal.id == doc_id)
            .first())
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    
    try:
        if deletar_arquivo_supabase(file_path=doc.file_path, bucket="documentos"):
            session.delete(doc)
            session.commit()
        else:
            raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")
        
    except Exception as e:
        session.rollback()
        logger.error(f"Erro ao deletar arquivo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")
    

@router.get("/grupo/grupos")
async def listar_grupos_imobiliaria(session: Session = Depends(get_db)):
    grupos = session.query(models.GrupoImobiliaria).all()
    if not grupos:
        return {
            "grupos": []
        }
    
    return {
        "grupos": [{
            "id": grupo.id,
            "nome": grupo.nome
        }for grupo in grupos]
    }

@router.get("/grupo/{id_grupo}")
async def detalhes_grupo(id_grupo: str,
                         session: Session = Depends(get_db)):
    try:
        grupo_id = UUID(id_grupo)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    grupo = (session.query(models.GrupoImobiliaria)
             .options(joinedload(models.GrupoImobiliaria.imobiliarias))
             .filter(models.GrupoImobiliaria.id == grupo_id)
             .first())
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    
    return {
        "detalhes": {
            "nome": grupo.nome,
            "email": grupo.email,
            "created_at": grupo.created_at,
            "updated_at": grupo.updated_at
        },
        "imobiliarias": [{
            "id": imobiliaria.id,
            "nome": imobiliaria.nome,
            "valor_sem_mobilia": imobiliaria.valor_sem_mobilia,
            "valor_semi_mobiliado": imobiliaria.valor_semi_mobiliado,
            "valor_mobiliado": imobiliaria.valor_mobiliado,
            "created_at": imobiliaria.created_at,
            "updated_at": imobiliaria.updated_at,
        }for imobiliaria in grupo.imobiliarias]
    }