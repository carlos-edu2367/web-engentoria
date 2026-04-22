# backend/routes/admin_panel_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, extract, func, or_, case
from typing import List, Dict, Union
from uuid import UUID
from datetime import date, timedelta, datetime
from decimal import Decimal
from dateutil.relativedelta import relativedelta
from typing import Optional
import io
import google.generativeai as genai
import os
from dotenv import load_dotenv
import logging, os, uuid, unicodedata, re
from reportlab.lib.units import inch
import base64
from pydantic import BaseModel, EmailStr


from ..supabase_client import deletar_arquivo_supabase, supabase, gerar_url_assinada

load_dotenv()
from .. import models, schemas, auth

# Imports para geração de relatórios
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.workbook import Workbook

from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle # <-- NOVO: ParagraphStyle
from reportlab.lib.enums import TA_LEFT # <-- NOVO: TA_LEFT para alinhamento

# Imports para envio de e-mail
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


# Importa a função para obter a sessão do banco e a função de hash de senha
from ..config import get_db, settings
from ..auth import get_password_hash, get_current_admin_user
from ..email_utils import send_email

# Cria um novo roteador para o painel de administração
# Todas as rotas aqui serão protegidas pela dependência 'get_current_admin_user'
router = APIRouter(
    prefix="/admin-panel",
    tags=["Painel de Administração"],
    dependencies=[Depends(get_current_admin_user)]
)
class EnvioRelatorioEmailSchema(BaseModel):
    emails: List[EmailStr]


# Configura o logger
logger = logging.getLogger(__name__)

def _send_report_email_task(
    db: Session,
    info_id: UUID,
    grupo_id: UUID,
    mes: int,
    ano: int,
    recipient_emails: list[str]
):
    """
    Tarefa em background para gerar e enviar o relatório por e-mail.
    """
    logger.info(f"Iniciando envio de relatório (Mailgun) | InfoMensal ID: {info_id}")

    try:
        # 1. Buscar dados do relatório
        report_data_full = get_report_data(
            mes=mes,
            ano=ano,
            db=db,
            id_grupo=grupo_id
        )
        report_list = report_data_full.get("relatorios")

        if not report_list:
            logger.warning(
                f"Nenhum relatório encontrado | InfoMensal ID: {info_id}"
            )
            return

        # 2. Gerar PDF em memória
        pdf_stream = _create_pdf_report(report_list)
        pdf_content = pdf_stream.read()
        pdf_stream.close()

        # 3. Nome do grupo
        grupo = (
            db.query(models.GrupoImobiliaria)
            .filter(models.GrupoImobiliaria.id == grupo_id)
            .first()
        )
        nome_grupo = grupo.nome if grupo else f"Grupo {grupo_id}"

        assunto = f"Relatório de Vistorias - {nome_grupo} - {mes:02d}/{ano}"
        nome_arquivo = (
            f"relatorio_{nome_grupo.lower().replace(' ', '_')}_{mes:02d}_{ano}.pdf"
        )

        # 4. HTML do e-mail
        html = f"""
        <!DOCTYPE html>
        <html lang="pt-BR">
        <body style="margin:0;padding:0;background:#0f172a;font-family:Arial;color:#e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding:40px 0;">
                        <table width="600" style="background:#020617;border-radius:12px;">
                            <tr>
                                <td style="
                                    background:linear-gradient(135deg,#22d3ee,#22c55e);
                                    padding:20px;
                                    text-align:center;
                                    font-weight:bold;
                                    color:#022c22;
                                    font-size:20px;
                                ">
                                    Engentoria
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:28px;">
                                    <p>Olá,</p>

                                    <p style="line-height:1.6;">
                                        Segue em anexo o <strong>relatório de vistorias</strong>
                                        do grupo <strong>{nome_grupo}</strong>,
                                        referente ao período <strong>{mes:02d}/{ano}</strong>.
                                    </p>

                                    <p style="line-height:1.6;">
                                        Este relatório foi aprovado e enviado pelo painel administrativo.
                                    </p>

                                    <p style="margin-top:32px;">
                                        Atenciosamente,<br>
                                        <strong>Equipe Engentoria</strong>
                                    </p>
                                </td>
                            </tr>

                            <tr>
                                <td style="
                                    padding:16px;
                                    text-align:center;
                                    font-size:12px;
                                    color:#64748b;
                                ">
                                    © Engentoria • Relatório automático
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

        # 5. Enviar e-mail com anexo
        send_email(
            to=recipient_emails,
            subject=assunto,
            html=html,
            cc=["engentoria@outlook.com"],
            attachments=[
                (nome_arquivo, pdf_content, "application/pdf")
            ]
        )

        logger.info(
            f"Relatório enviado com sucesso | InfoMensal ID: {info_id}"
        )

    except Exception as e:
        logger.error(
            f"Falha ao enviar relatório | InfoMensal ID: {info_id} | Erro: {str(e)}",
            exc_info=True
        )



def get_report_data(mes: int, ano: int, db: Session, id_grupo: UUID):
    """
    Busca e formata os dados para o relatório mensal de uma ou mais imobiliárias de um grupo,
    e retorna também o resumo total do grupo.
    """
    current_user = db.query(models.GrupoImobiliaria).filter(models.GrupoImobiliaria.id == id_grupo).first()

    imobiliarias_do_grupo = db.query(models.Imobiliaria).filter(
        models.Imobiliaria.grupo_id == current_user.id,
        models.Imobiliaria.is_deleted == False
    ).all()

    relatorios = []
    
    # ✅ acumuladores gerais do grupo
    total_vistorias_grupo = 0
    total_improdutivas_grupo = 0
    soma_valor_vistorias_grupo = 0.0
    soma_valor_improdutivas_grupo = 0.0

    for imob in imobiliarias_do_grupo:
        vistorias_normais = db.query(models.Agenda).join(models.Imovel).filter(
            models.Imovel.imobiliaria_id == imob.id,
            extract('year', models.Agenda.data) == ano,
            extract('month', models.Agenda.data) == mes,
            models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
        ).options(joinedload(models.Agenda.imovel)).order_by(
            case((models.Agenda.tipo == 'ENTRADA', 1), else_=2),
            models.Agenda.data.asc()
        ).all()

        vistorias_improdutivas = db.query(models.VistoriaImprodutiva).options(
            joinedload(models.VistoriaImprodutiva.imovel)
        ).filter(
            models.VistoriaImprodutiva.imobiliaria_id == imob.id,
            extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
            extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes,
            models.VistoriaImprodutiva.is_deleted == False
        ).order_by(models.VistoriaImprodutiva.data_vistoria_original.asc()).all()

        valor_vistorias = sum(float(v.valor_final_vistoria or 0) for v in vistorias_normais)
        valor_improdutivas = sum(float(vi.valor_cobranca or 0) for vi in vistorias_improdutivas)

        total_vistorias_grupo += len(vistorias_normais)
        total_improdutivas_grupo += len(vistorias_improdutivas)
        soma_valor_vistorias_grupo += valor_vistorias
        soma_valor_improdutivas_grupo += valor_improdutivas

        vistorias_agendadas_schema = [
            schemas.VistoriaAgendadaRelatorio.model_validate({
                "id": v.id, "data": v.data, "horario": v.horario, "tipo": v.tipo,
                "cod_imovel": v.imovel.cod_imovel, "endereco": v.imovel.endereco,
                "tamanho": float(v.imovel.tamanho), "mobiliado": v.imovel.mobiliado,
                "valor": float(v.valor_final_vistoria or 0)
            })
            for v in vistorias_normais if v.imovel
        ]

        vistorias_improdutivas_schema = [
            schemas.VistoriaImprodutivaRelatorio.model_validate({
                "id": vi.id,
                "data_vistoria_original": vi.data_vistoria_original,
                "cod_imovel": vi.imovel.cod_imovel if vi.imovel else "N/A",
                "motivo_improdutividade": vi.motivo_improdutividade or "Motivo não especificado",
                "valor_cobranca": float(vi.valor_cobranca or 0)
            })
            for vi in vistorias_improdutivas
        ]

        relatorios.append(schemas.RelatorioMensal(
            mes_ano=f"{datetime(ano, mes, 1).strftime('%B').capitalize()}/{ano}",
            imobiliaria_nome=imob.nome,
            total_vistorias=len(vistorias_normais),
            total_improdutivas=len(vistorias_improdutivas),
            valor_vistorias=valor_vistorias,
            valor_improdutivas=valor_improdutivas,
            valor_total=valor_vistorias + valor_improdutivas,
            vistorias_agendadas=vistorias_agendadas_schema,
            vistorias_improdutivas=vistorias_improdutivas_schema
        ))

    # ✅ resumo geral do grupo
    resumo_geral = {
        "total_vistorias_grupo": total_vistorias_grupo,
        "total_improdutivas_grupo": total_improdutivas_grupo,
        "valor_vistorias_grupo": soma_valor_vistorias_grupo,
        "valor_improdutivas_grupo": soma_valor_improdutivas_grupo,
        "valor_total_grupo": soma_valor_vistorias_grupo + soma_valor_improdutivas_grupo
    }

    return {
        "relatorios": relatorios,
        "resumo_geral": resumo_geral
    }

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
    tamanho = float(tamanho or 0)
    
    # Tratamento de string para garantir match correto
    mobiliado_str = str(mobiliado).lower() if mobiliado else "sem_mobilia"

    if mobiliado_str == "mobiliado":
        valor_m2 = imobiliaria.valor_mobiliado
    elif mobiliado_str == "semi_mobiliado":
        valor_m2 = imobiliaria.valor_semi_mobiliado
    else: # sem_mobilia ou outros
        valor_m2 = imobiliaria.valor_sem_mobilia
    
    return round(tamanho * float(valor_m2 or 0), 2)

def _calculate_valor_final_vistoria(
    imovel: models.Imovel, 
    imobiliaria: models.Imobiliaria, 
    tipo_vistoria: str,
    valor_base_externo: float = 0.0
) -> float:
    """
    Calcula o valor FINAL (cobrado) da vistoria.
    CORREÇÃO: Prioriza o 'valor_base_externo' se o imovel.valor estiver zerado.
    """
    valor_base_calculado = 0.0
    valor_minimo_imob = float(imobiliaria.valor_minimo or 0)
    valor_minimo_aplicavel = 0.0

    # Prioriza o valor recém calculado da tabela de preços (respeita mobiliado atual),
    # usando o valor armazenado no imóvel apenas como último recurso.
    valor_base_imovel = valor_base_externo if valor_base_externo > 0 else float(imovel.valor or 0)

    # --- REGRAS DE TIPO ---
    if tipo_vistoria == 'ENTRADA':
        # Entrada usa o valor cadastrado da imobiliária por m² conforme mobília do imóvel
        valor_base_calculado = valor_base_imovel
        valor_minimo_aplicavel = 50.00

    elif tipo_vistoria == 'AVERIGUACAO':
        valor_base_calculado = 65.00
        valor_minimo_aplicavel = valor_minimo_imob
    
    elif tipo_vistoria in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        # 50% do valor base do imóvel
        valor_base_calculado = valor_base_imovel * 0.5
        valor_minimo_aplicavel = valor_minimo_imob * 0.5
    
    else: 
        # SAIDA, etc. (Valor Cheio do imóvel)
        valor_base_calculado = valor_base_imovel
        valor_minimo_aplicavel = valor_minimo_imob

    # Aplica o mínimo
    valor_final = max(valor_base_calculado, valor_minimo_aplicavel)
    
    return round(valor_final, 2)

def _calculate_valor_comissao_vistoriador(
    tamanho_m2: float, 
    mobiliado_status: str, 
    tipo_vistoria_agenda: str,
    vistoriador: models.Usuario
) -> float:
    """
    Calcula a COMISSÃO do vistoriador.
    """
    tamanho_m2 = float(tamanho_m2 or 0)
    mobiliado_status = str(mobiliado_status).lower() if mobiliado_status else "sem_mobilia"
    
    if tipo_vistoria_agenda == 'AVERIGUACAO':
        return 65.00

    valor_base = 0.0
    
    # Define se usa tabela de ENTRADA ou SAIDA
    usa_regras_entrada = False
    if tipo_vistoria_agenda == 'ENTRADA':
        usa_regras_entrada = True
    elif vistoriador and vistoriador.preco_unico == True:
        # Vistoriador antigo recebe sempre pela tabela de ENTRADA
        usa_regras_entrada = True
         
    if usa_regras_entrada:
        # --- TABELA ENTRADA ---
        # Mobiliado: R$ 1,25/m² | Sem mobília / Semi-mobiliado: R$ 1,00/m²
        if mobiliado_status == 'mobiliado':
            valor_base = tamanho_m2 * 1.25
        else:  # sem_mobilia ou semi_mobiliado
            valor_base = tamanho_m2 * 1.00
    else:
        # --- TABELA SAÍDA ---
        if mobiliado_status == 'mobiliado':
            if tamanho_m2 < 50: valor_base = 65.00
            elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.25
            elif 100 <= tamanho_m2 <= 140: valor_base = 125.00
            else: valor_base = tamanho_m2 * 0.90
        else: # sem ou semi
            if tamanho_m2 < 50: valor_base = 50.00
            elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.00
            elif 100 <= tamanho_m2 <= 135: valor_base = 100.00
            else: valor_base = tamanho_m2 * 0.75

    # Regras de redução para conferência/complemento
    valor_final = valor_base
    if tipo_vistoria_agenda in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        valor_final = valor_base * 0.5
        if valor_final < 45.00:
            valor_final = 45.00
    else:
        # Piso mínimo geral para vistorias completas
        if valor_final < 50.00:
            valor_final = 50.00
        
    return round(valor_final, 2)

def calcular_valores_vistoria(
    imovel: models.Imovel, 
    imobiliaria: models.Imobiliaria, 
    tipo_vistoria: str, 
    vistoriador: models.Usuario
) -> dict:
    """
    Orquestrador de cálculo.
    Garante que se o imóvel não tiver valor base, ele é calculado aqui e passado adiante.
    """
    try:
        tamanho = float(imovel.tamanho or 0)
        mobilia = str(imovel.mobiliado).lower() if imovel.mobiliado else "sem_mobilia"
        
        # 1. Calcula o valor BASE de referência (Tabela Imobiliária)
        # Fundamental para imóveis novos que ainda tem imovel.valor = 0
        valor_base_ref = _calculate_valor_base_imovel(imobiliaria, tamanho, mobilia)
        
        # 2. Calcula o valor FINAL (Cobrança)
        # Passamos o valor_base_ref para usar caso o imovel.valor esteja zerado
        valor_final_vistoria = _calculate_valor_final_vistoria(
            imovel, imobiliaria, tipo_vistoria, valor_base_externo=valor_base_ref
        )
        
        # 3. Calcula a comissão do vistoriador
        valor_vistoriador = _calculate_valor_comissao_vistoriador(
            tamanho, mobilia, tipo_vistoria, vistoriador
        )
        
        return {
            "valor_final_vistoria": valor_final_vistoria,
            "valor_vistoriador": valor_vistoriador,
            "valor_base_ref": valor_base_ref
        }
    except Exception as e:
        print(f"Erro ao calcular valores da vistoria: {e}")
        # Retorna valores seguros em caso de erro crítico para não travar a API
        return {
            "valor_final_vistoria": 0.0, 
            "valor_vistoriador": 0.0, 
            "valor_base_ref": 0.0
        }

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

@router.get("/solicitacoes-pendentes", response_model=List[schemas.SolicitacaoAgendamentoDisplay], summary="Lista todas as solicitações pendentes para o Admin agendar")
def get_solicitacoes_pendentes(db: Session = Depends(get_db)):
    """
    Busca todas as solicitações marcadas como PENDENTE_ADMIN.
    Essas são as solicitações enviadas diretamente pela imobiliária para o sistema.
    """
    solicitacoes = db.query(models.SolicitacaoAgendamento).options(
        joinedload(models.SolicitacaoAgendamento.cliente),
        joinedload(models.SolicitacaoAgendamento.imovel),
        joinedload(models.SolicitacaoAgendamento.imobiliaria),
        joinedload(models.SolicitacaoAgendamento.anexos)
    ).filter(
        models.SolicitacaoAgendamento.status == "PENDENTE_ADMIN"
    ).order_by(models.SolicitacaoAgendamento.created_at.asc()).all()
    
    for sol in solicitacoes:
        for anexo in sol.anexos:
            anexo.link = gerar_url_assinada(bucket="documentos", file_path=anexo.file_path)

    return solicitacoes

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

@router.post("/agenda/gerar", summary="Regerar agenda: Limpa livres e recria com base nos horários fixos")
def generate_agenda(
    semanas: int = 8,
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_admin_user)
):
    """
    Regenera a agenda para as próximas semanas.
    1. Remove solicitações e documentos vinculados a horários 'LIVRE'.
    2. Remove todos os horários 'LIVRE' futuros no período estipulado.
    3. Recria os horários baseando-se na lista atual de HorarioFixo.
    """
    today = date.today()
    days_to_generate = 7 * semanas
    end_date = today + timedelta(days=days_to_generate)

    try:
        # Critério base dos slots LIVRES futuros
        criteria_agenda_livre = and_(
            models.Agenda.data >= today,
            models.Agenda.data < end_date,
            models.Agenda.tipo == "LIVRE",
            models.Agenda.disponivel == True
        )

        # Subquery com os IDs das agendas que serão removidas
        agenda_ids_subquery = (
            db.query(models.Agenda.id)
            .filter(criteria_agenda_livre)
            .subquery()
        )

        # 1. Remove SOLICITAÇÕES vinculadas às agendas LIVRES
        db.query(models.SolicitacaoAgendamento).filter(
            models.SolicitacaoAgendamento.agenda_id.in_(agenda_ids_subquery)
        ).delete(synchronize_session=False)

        # 2. Remove DOCUMENTOS vinculados às agendas LIVRES
        db.query(models.DocumentoAgenda).filter(
            models.DocumentoAgenda.agenda_id.in_(agenda_ids_subquery)
        ).delete(synchronize_session=False)

        # 3. Remove as agendas LIVRES
        deleted_count = db.query(models.Agenda).filter(
            criteria_agenda_livre
        ).delete(synchronize_session=False)

        # 4. Busca horários fixos ativos
        horarios_fixos = (
            db.query(models.HorarioFixo)
            .filter(models.HorarioFixo.is_deleted == False)
            .all()
        )

        if not horarios_fixos:
            db.commit()
            return {
                "message": f"Agenda limpa. {deleted_count} horários livres antigos foram removidos."
            }

        novos_agendamentos = 0

        # 5. Recriação da agenda
        for i in range(days_to_generate):
            current_date = today + timedelta(days=i)
            dia_semana_str = str(current_date.weekday())

            for hf in horarios_fixos:
                if str(hf.dia_semana) == dia_semana_str:
                    existe = db.query(models.Agenda).filter(
                        models.Agenda.vistoriador_id == hf.vistoriador_id,
                        models.Agenda.data == current_date,
                        models.Agenda.horario == hf.horario
                    ).first()

                    if not existe:
                        db.add(models.Agenda(
                            vistoriador_id=hf.vistoriador_id,
                            data=current_date,
                            horario=hf.horario,
                            disponivel=True,
                            tipo="LIVRE"
                        ))
                        novos_agendamentos += 1

        db.commit()
        return {
            "message": (
                f"Regeneração concluída. "
                f"{deleted_count} horários livres removidos. "
                f"{novos_agendamentos} novos horários gerados."
            )
        }

    except Exception as e:
        db.rollback()
        logging.exception("Erro ao gerar agenda")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocorreu um erro ao gerar a agenda: {str(e)}"
        )
   
# =================================================================
# --- Gestão de Vistorias ---
# =================================================================

@router.post("/agenda/agendar", response_model=schemas.AgendaDisplay, summary="Agendar uma nova vistoria")
def schedule_vistoria(agendamento: schemas.AgendaCreate, db: Session = Depends(get_db)):
    # ATUALIZAÇÃO: Adicionado joinedload(models.Imovel.imobiliaria)
    db_imovel = db.query(models.Imovel).options(
        joinedload(models.Imovel.imobiliaria)
    ).filter(
        models.Imovel.id == agendamento.imovel_id,
        models.Imovel.imobiliaria_id == agendamento.imobiliaria_id,
        models.Imovel.is_deleted == False
    ).first()
    
    if not db_imovel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado ou não pertence à imobiliária informada.")
    
    if not db_imovel.imobiliaria:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária associada ao imóvel não encontrada.")

    db_agenda_1 = db.query(models.Agenda).filter(
        models.Agenda.id == agendamento.horario_id,
        models.Agenda.disponivel == True
    ).first()

    if not db_agenda_1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário selecionado não está livre ou não existe.")
    
    # --- MODIFICAÇÃO INICIA AQUI ---
    # Precisamos buscar o vistoriador para a nova regra de cálculo de comissão
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == db_agenda_1.vistoriador_id).first()
    if not db_vistoriador:
        # Isso não deve acontecer se o db_agenda_1 existir e tiver um vistoriador_id válido
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador associado ao horário não encontrado.")
    # --- MODIFICAÇÃO TERMINA AQUI ---

    # Usa o orquestrador central de cálculo para garantir que o valor_base_ref
    # seja calculado a partir da tabela de preços da imobiliária (respeitando mobiliado)
    # e passado como fallback para _calculate_valor_final_vistoria.
    valores_calculados = calcular_valores_vistoria(
        db_imovel, db_imovel.imobiliaria, agendamento.tipo.value, db_vistoriador
    )
    valor_final = valores_calculados["valor_final_vistoria"]
    valor_comissao = valores_calculados["valor_vistoriador"]

    # Garante que o imovel.valor esteja atualizado para futuros agendamentos
    if not db_imovel.valor or float(db_imovel.valor) == 0.0:
        db_imovel.valor = valores_calculados["valor_base_ref"]

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
            
        db_agenda_2.tipo = "FECHADO"
        db_agenda_2.disponivel = False
        db_agenda_2.valor_final_vistoria = 0
        db_agenda_2.valor_vistoriador = 0

    # Atualiza o horário principal (ou único)
    db_agenda_1.imovel_id = agendamento.imovel_id
    db_agenda_1.tipo = agendamento.tipo.value
    db_agenda_1.disponivel = False
    db_agenda_1.valor_final_vistoria = valor_final if valor_final is not None else 0
    db_agenda_1.valor_vistoriador = valor_comissao if valor_comissao is not None else 0
    db_agenda_1.observacao_vistoriador = agendamento.observacao_vistoriador

    if agendamento.solicitacao_id:
        solicitacao = db.query(models.SolicitacaoAgendamento).options(
            joinedload(models.SolicitacaoAgendamento.anexos)
        ).filter(models.SolicitacaoAgendamento.id == agendamento.solicitacao_id).first()
        
        if solicitacao:
            solicitacao.status = "AGENDADO"
            solicitacao.agenda_id = db_agenda_1.id
            
            for anexo in solicitacao.anexos:
                novo_doc = models.DocumentoAgenda(
                    file_path=anexo.file_path,
                    agenda_id=db_agenda_1.id
                )
                db.add(novo_doc)

    db.commit()
    db.refresh(db_agenda_1)
    return db_agenda_1

@router.put("/agenda/{agenda_id}", response_model=schemas.AgendaDisplay, summary="Atualiza os detalhes de uma vistoria")
def update_vistoria(
    agenda_id: UUID,
    update_data: schemas.AgendaUpdate,
    db: Session = Depends(get_db)
):
    # --- MODIFICAÇÃO INICIA AQUI ---
    # Precisamos carregar o vistoriador (joinedload) para a nova regra de cálculo
    db_agenda = db.query(models.Agenda).options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria),
        joinedload(models.Agenda.vistoriador) # <-- Novo joinedload
    ).filter(models.Agenda.id == agenda_id).first()
    # --- MODIFICAÇÃO TERMINA AQUI ---

    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    if not db_agenda.imovel:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este agendamento não está vinculado a um imóvel.")

    if not db_agenda.imovel.imobiliaria:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária associada ao imóvel não foi carregada.")

    # --- MODIFICAÇÃO INICIA AQUI ---
    # Validação para garantir que o vistoriador foi carregado
    if not db_agenda.vistoriador:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador associado à agenda não foi carregado.")
    # --- MODIFICAÇÃO TERMINA AQUI ---

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
        # Cálculo do valor base do imóvel (não muda)
        db_agenda.imovel.valor = _calculate_valor_base_imovel(db_agenda.imovel.imobiliaria, db_agenda.imovel.tamanho, db_agenda.imovel.mobiliado)
        
        # ATUALIZAÇÃO: Passa o objeto 'db_agenda.imovel.imobiliaria' para a função de cálculo
        db_agenda.valor_final_vistoria = _calculate_valor_final_vistoria(db_agenda.imovel, db_agenda.imovel.imobiliaria, db_agenda.tipo)
        
        # --- MODIFICAÇÃO INICIA AQUI ---
        # Cálculo da comissão (agora passa o vistoriador)
        db_agenda.valor_vistoriador = _calculate_valor_comissao_vistoriador(
            db_agenda.imovel.tamanho, 
            db_agenda.imovel.mobiliado, 
            db_agenda.tipo,
            db_agenda.vistoriador # <-- Novo parâmetro
        )
        # --- MODIFICAÇÃO TERMINA AQUI ---
    else:
        # Lógica para atualização manual de valores (não muda)
        if "valor_final_vistoria" in update_payload:
            db_agenda.valor_final_vistoria = Decimal(str(update_payload["valor_final_vistoria"]))
        if "valor_vistoriador" in update_payload:
            db_agenda.valor_vistoriador = Decimal(str(update_payload["valor_vistoriador"]))

    if "observacao_privada" in update_payload:
        db_agenda.observacao_privada = update_payload["observacao_privada"]
    
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

@router.put("/agenda/{agenda_id}/fechar", response_model=schemas.AgendaDisplay, summary="Fechar ou reabrir um horário da agenda")
def fechar_ou_reabrir_horario(
    agenda_id: UUID,
    data: schemas.AgendaFecharHorario,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).filter(
        models.Agenda.id == agenda_id
    ).first()

    if not db_agenda:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Horário não encontrado."
        )

    # 🚫 Se está agendado, não pode mudar manualmente
    if db_agenda.tipo not in ["LIVRE", "FECHADO"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esse horário está agendado e não pode ser alterado manualmente."
        )

    # ✅ Fechar horário LIVRE -> FECHADO
    if data.fechar:
        if not (db_agenda.disponivel and db_agenda.tipo == "LIVRE"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esse horário não está livre para ser fechado."
            )

        db_agenda.tipo = "FECHADO"
        db_agenda.disponivel = False
        db_agenda.observacao_privada = data.motivo

    # ✅ Reabrir horário FECHADO -> LIVRE
    else:
        if not (not db_agenda.disponivel and db_agenda.tipo == "FECHADO"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esse horário não está fechado para ser reaberto."
            )

        db_agenda.tipo = "LIVRE"
        db_agenda.disponivel = True
        db_agenda.observacao_privada = None

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


def _create_pdf_report(
    report_data: Union[
        schemas.RelatorioImobiliaria,
        schemas.RelatorioVistoriador,
        schemas.RelatorioGeral,
        List[schemas.RelatorioImobiliaria], 
        List[schemas.RelatorioMensal] 
    ]
):
    """
    Cria um relatório PDF a partir dos dados fornecidos.
    Esta função agora lida com múltiplos tipos de dados.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter),
                            rightMargin=inch/2, leftMargin=inch/2,
                            topMargin=inch/2, bottomMargin=inch/2)
    elements = []
    styles = getSampleStyleSheet()

    # NOVO: Estilo de Parágrafo para células de dados (garante alinhamento e quebra)
    # Vamos usar o 'styles['Normal']' como base, que já é alinhado à esquerda.
    cell_style_normal = styles['Normal']
    
    # NOVO: Estilo de Parágrafo para células de Total (para substituir o FONTNAME)
    cell_style_total = ParagraphStyle(
        name='CellTotal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        alignment=TA_LEFT
    )
    # NOVO: Estilo para Totais de Bloco (Negrito)
    cell_style_block_total_label = ParagraphStyle(
        name='BlockTotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        alignment=TA_LEFT
    )
    cell_style_block_total_value = ParagraphStyle(
        name='BlockTotalValue',
        parent=styles['Normal'],
        # Apenas o rótulo é negrito nos seus blocos de totais, exceto o TOTAL GERAL
        fontName='Helvetica', 
        alignment=TA_LEFT
    )
    cell_style_block_total_geral = ParagraphStyle(
        name='BlockTotalGeral',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        alignment=TA_LEFT
    )


    # Estilos de Tabela
    header_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#4F81BD")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke), 
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ])
    
    body_style = TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        # ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'), # REMOVIDO: O Paragraph controla
        # ('ALIGN', (0, 0), (-1, -1), 'LEFT'), # REMOVIDO: O Paragraph controla
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), # VALIGN 'MIDDLE' é bom manter
    ])


    # --- CASO 1: Relatório de Imobiliária Específica ---
    if isinstance(report_data, schemas.RelatorioImobiliaria):
        elements.append(Paragraph(f"Relatório: {report_data.imobiliaria_nome}", styles['h1']))
        elements.append(Paragraph(f"Período: {report_data.periodo}", styles['h2']))
        elements.append(Spacer(1, 0.25*inch))
        
        # Bloco de Totais (ALTERADO para usar Paragraph)
        total_data = [
            [Paragraph("Total Vistorias", cell_style_block_total_label), Paragraph(f"R$ {report_data.total_vistorias:.2f}", cell_style_block_total_value)],
            [Paragraph("Total Improdutivas", cell_style_block_total_label), Paragraph(f"R$ {report_data.total_improdutivas:.2f}", cell_style_block_total_value)],
            [Paragraph("TOTAL GERAL", cell_style_block_total_geral), Paragraph(f"R$ {report_data.total_geral:.2f}", cell_style_block_total_geral)],
        ]
        t_totais = Table(total_data, colWidths=[2*inch, 2*inch])
        t_totais.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            # ('FONTNAME', ...), # REMOVIDO: Controlado pelo ParagraphStyle
            ('BACKGROUND', (0, 2), (-1, 2), colors.lightgrey),
        ]))
        elements.append(t_totais)
        elements.append(Spacer(1, 0.25*inch))

        # Tabela de Vistorias (ALTERADO para usar Paragraph em todas as células)
        if report_data.vistorias:
            elements.append(Paragraph("Vistorias Realizadas", styles['h3']))
            # CORREÇÃO: Cabeçalho ajustado conforme solicitado
            vistorias_data = [["Data", "Cód. Imóvel", "Endereço", "Tamanho", "Tipo de Mobília", "Tipo de Vistoria", "Valor Cobrado"]]
            for v in report_data.vistorias:
                # CORREÇÃO: Colunas ajustadas conforme solicitado
                vistorias_data.append([
                    Paragraph(v.data.strftime('%d/%m/%Y'), cell_style_normal),
                    Paragraph(str(v.cod_imovel), cell_style_normal),
                    Paragraph(v.endereco, cell_style_normal),
                    Paragraph(f"{v.tamanho} m²", cell_style_normal),
                    Paragraph(str(v.tipo_mobilia), cell_style_normal),
                    Paragraph(str(v.tipo_vistoria), cell_style_normal),
                    Paragraph(f"R$ {v.valor:.2f}", cell_style_normal)
                ])
            
            # CORREÇÃO: Ajuste nas larguras das colunas para 7 colunas
            t_vistorias = Table(vistorias_data, colWidths=[60, 70, 260, 60, 100, 100, 100])
            t_vistorias.setStyle(header_style)
            t_vistorias.setStyle(body_style)
            elements.append(t_vistorias)
            elements.append(Spacer(1, 0.2*inch))

        # Tabela de Improdutivas (ALTERADO para usar Paragraph)
        if report_data.improdutivas:
            elements.append(Paragraph("Vistorias Improdutivas", styles['h3']))
            improd_data = [["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"]]
            for i in report_data.improdutivas:
                improd_data.append([
                    Paragraph(i.data_vistoria_original.strftime('%d/%m/%Y'), cell_style_normal),
                    Paragraph(str(i.cod_imovel or "N/A"), cell_style_normal),
                    Paragraph(i.motivo_improdutividade, cell_style_normal),
                    Paragraph(f"R$ {i.valor_cobrado:.2f}", cell_style_normal)
                ])
            
            t_improd = Table(improd_data, colWidths=[70, 70, 460, 80])
            t_improd.setStyle(header_style)
            t_improd.setStyle(body_style)
            elements.append(t_improd)

    # --- CASO 2: Relatório de Vistoriador Específico ---
    # (Esta seção não foi alterada, pois lida com "Comissão", não "Valor Cobrado")
    elif isinstance(report_data, schemas.RelatorioVistoriador):
        elements.append(Paragraph(f"Relatório de Comissão: {report_data.vistoriador_nome}", styles['h1']))
        elements.append(Paragraph(f"Período: {report_data.periodo}", styles['h2']))
        elements.append(Spacer(1, 0.25*inch))

        # Bloco de Totais (ALTERADO para usar Paragraph)
        total_data = [
            [Paragraph("Comissão Vistorias", cell_style_block_total_label), Paragraph(f"R$ {report_data.total_comissao_vistorias:.2f}", cell_style_block_total_value)],
            [Paragraph("Comissão Improdutivas", cell_style_block_total_label), Paragraph(f"R$ {report_data.total_comissao_improdutivas:.2f}", cell_style_block_total_value)],
            [Paragraph("TOTAL GERAL", cell_style_block_total_geral), Paragraph(f"R$ {report_data.total_geral_comissao:.2f}", cell_style_block_total_geral)],
        ]
        t_totais = Table(total_data, colWidths=[2*inch, 2*inch])
        t_totais.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            # ('FONTNAME', ...), # REMOVIDO
            ('BACKGROUND', (0, 2), (-1, 2), colors.lightgrey),
        ]))
        elements.append(t_totais)
        elements.append(Spacer(1, 0.25*inch))
        
        # Tabelas de Vistorias por Imobiliária (ALTERADO para usar Paragraph)
        for imob_nome, vistorias in report_data.vistorias_por_imobiliaria.items():
            elements.append(Paragraph(f"Imobiliária: {imob_nome}", styles['h3']))
            vistorias_data = [["Data", "Cód. Imóvel", "Tipo", "Obs. Vistoriador", "Comissão"]]
            for v in vistorias:
                vistorias_data.append([
                    Paragraph(v.data.strftime('%d/%m/%Y'), cell_style_normal),
                    Paragraph(str(v.cod_imovel), cell_style_normal),
                    Paragraph(str(v.tipo_vistoria), cell_style_normal),
                    Paragraph(v.observacao_privada or '---', cell_style_normal),
                    Paragraph(f"R$ {v.comissao_vistoriador:.2f}", cell_style_normal)
                ])
            
            t_vistorias = Table(vistorias_data, colWidths=[70, 70, 80, 400, 80])
            t_vistorias.setStyle(header_style)
            t_vistorias.setStyle(body_style)
            elements.append(t_vistorias)
            elements.append(Spacer(1, 0.2*inch))

        # Tabela de Improdutivas (ALTERADO para usar Paragraph)
        if report_data.improdutivas:
            elements.append(Paragraph("Comissão Improdutivas", styles['h3']))
            improd_data = [["Data", "Motivo", "Comissão"]]
            for i in report_data.improdutivas:
                improd_data.append([
                    Paragraph(i.data_vistoria_original.strftime('%d/%m/%Y'), cell_style_normal),
                    Paragraph(i.motivo_improdutividade, cell_style_normal),
                    Paragraph(f"R$ {i.comissao_vistoriador:.2f}", cell_style_normal)
                ])
            
            t_improd = Table(improd_data, colWidths=[70, 550, 80])
            t_improd.setStyle(header_style)
            t_improd.setStyle(body_style)
            elements.append(t_improd)

    # --- NOVO CASO: Relatório Mensal ---
    elif isinstance(report_data, list) and report_data and isinstance(report_data[0], schemas.RelatorioMensal):
        elements.append(Paragraph("Relatório Mensal de Vistorias", styles['h1']))
        if report_data:
             elements.append(Paragraph(f"Período: {report_data[0].mes_ano}", styles['h2']))

        for rel_mensal in report_data:
            elements.append(Spacer(1, 0.25*inch))
            elements.append(Paragraph(f"Imobiliária: {rel_mensal.imobiliaria_nome}", styles['h2']))
            elements.append(Spacer(1, 0.2*inch))

            # Bloco de Totais (ALTERADO para usar Paragraph)
            total_data = [
                [Paragraph("Total Vistorias", cell_style_block_total_label), Paragraph(f"R$ {rel_mensal.valor_vistorias:.2f}", cell_style_block_total_value)],
                [Paragraph("Total Improdutivas", cell_style_block_total_label), Paragraph(f"R$ {rel_mensal.valor_improdutivas:.2f}", cell_style_block_total_value)],
                [Paragraph("TOTAL GERAL", cell_style_block_total_geral), Paragraph(f"R$ {rel_mensal.valor_total:.2f}", cell_style_block_total_geral)],
            ]
            t_totais = Table(total_data, colWidths=[2*inch, 2*inch])
            t_totais.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                # ('FONTNAME', ...), # REMOVIDO
                ('BACKGROUND', (0, 2), (-1, 2), colors.lightgrey),
            ]))
            elements.append(t_totais)
            elements.append(Spacer(1, 0.2*inch))
            
            # Tabela de Vistorias Agendadas (ALTERADO para usar Paragraph)
            if rel_mensal.vistorias_agendadas:
                elements.append(Paragraph("Vistorias Realizadas", styles['h3']))
                # CORREÇÃO: Cabeçalho ajustado conforme solicitado
                vistorias_data = [["Data", "Cód. Imóvel", "Endereço", "Tamanho", "Tipo de Mobília", "Tipo de Vistoria", "Valor Cobrado"]]
                for v in rel_mensal.vistorias_agendadas:
                    # CORREÇÃO: Colunas ajustadas conforme solicitado
                    vistorias_data.append([
                        Paragraph(v.data.strftime('%d/%m/%Y'), cell_style_normal),
                        Paragraph(str(v.cod_imovel), cell_style_normal),
                        Paragraph(v.endereco, cell_style_normal),
                        Paragraph(f"{v.tamanho} m²", cell_style_normal), # <-- ADICIONADO
                        Paragraph(str(v.mobiliado), cell_style_normal),
                        Paragraph(str(v.tipo), cell_style_normal),
                        Paragraph(f"R$ {v.valor:.2f}", cell_style_normal),
                    ])
                # CORREÇÃO: Ajuste nas larguras das colunas para 7 colunas
                t_vistorias = Table(vistorias_data, colWidths=[60, 70, 260, 60, 100, 100, 100])
                t_vistorias.setStyle(header_style)
                t_vistorias.setStyle(body_style)
                elements.append(t_vistorias)
                elements.append(Spacer(1, 0.2*inch))

            # Tabela de Improdutivas (ALTERADO para usar Paragraph)
            if rel_mensal.vistorias_improdutivas:
                elements.append(Paragraph("Vistorias Improdutivas", styles['h3']))
                improd_data = [["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"]]
                for i in rel_mensal.vistorias_improdutivas:
                    improd_data.append([
                        Paragraph(i.data_vistoria_original.strftime('%d/%m/%Y'), cell_style_normal),
                        Paragraph(str(i.cod_imovel or "N/A"), cell_style_normal),
                        Paragraph(i.motivo_improdutividade, cell_style_normal),
                        Paragraph(f"R$ {i.valor_cobranca:.2f}", cell_style_normal)
                    ])
                t_improd = Table(improd_data, colWidths=[70, 70, 460, 80])
                t_improd.setStyle(header_style)
                t_improd.setStyle(body_style)
                elements.append(t_improd)
            
            elements.append(PageBreak())

    # --- CASO 3: Relatório Geral (Detalhado) ---
    elif isinstance(report_data, list):
        elements.append(Paragraph("Relatório Geral Detalhado por Imobiliária", styles['h1']))
        if report_data:
             # Assumindo que todos os relatórios na lista são do mesmo período
             elements.append(Paragraph(f"Período: {report_data[0].periodo}", styles['h2']))

        for rel_imob in report_data:
            elements.append(Spacer(1, 0.25*inch))
            elements.append(Paragraph(f"Imobiliária: {rel_imob.imobiliaria_nome}", styles['h2']))
            elements.append(Spacer(1, 0.2*inch))

            # Bloco de Totais (ALTERADO para usar Paragraph)
            total_data = [
                [Paragraph("Total Vistorias", cell_style_block_total_label), Paragraph(f"R$ {rel_imob.total_vistorias:.2f}", cell_style_block_total_value)],
                [Paragraph("Total Improdutivas", cell_style_block_total_label), Paragraph(f"R$ {rel_imob.total_improdutivas:.2f}", cell_style_block_total_value)],
                [Paragraph("TOTAL GERAL", cell_style_block_total_geral), Paragraph(f"R$ {rel_imob.total_geral:.2f}", cell_style_block_total_geral)],
            ]
            t_totais = Table(total_data, colWidths=[2*inch, 2*inch])
            t_totais.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                # ('FONTNAME', ...), # REMOVIDO
                ('BACKGROUND', (0, 2), (-1, 2), colors.lightgrey),
            ]))
            elements.append(t_totais)
            elements.append(Spacer(1, 0.2*inch))
            
            # Tabela de Vistorias (ALTERADO para usar Paragraph)
            if rel_imob.vistorias:
                elements.append(Paragraph("Vistorias Realizadas", styles['h3']))
                # CORREÇÃO: Cabeçalho ajustado conforme solicitado
                vistorias_data = [["Data", "Cód. Imóvel", "Endereço", "Tamanho", "Tipo de Mobília", "Tipo de Vistoria", "Valor Cobrado"]]
                for v in rel_imob.vistorias:
                    # CORREÇÃO: Colunas ajustadas conforme solicitado
                    vistorias_data.append([
                        Paragraph(v.data.strftime('%d/%m/%Y'), cell_style_normal),
                        Paragraph(str(v.cod_imovel), cell_style_normal),
                        Paragraph(v.endereco, cell_style_normal),
                        Paragraph(f"{v.tamanho} m²", cell_style_normal), # <-- ADICIONADO
                        Paragraph(str(v.tipo_mobilia), cell_style_normal), # <-- ADICIONADO
                        Paragraph(str(v.tipo_vistoria), cell_style_normal),
                        Paragraph(f"R$ {v.valor:.2f}", cell_style_normal),
                    ])
                # CORREÇÃO: Ajuste nas larguras das colunas para 7 colunas
                t_vistorias = Table(vistorias_data, colWidths=[60, 70, 260, 60, 100, 100, 100])
                t_vistorias.setStyle(header_style)
                t_vistorias.setStyle(body_style)
                elements.append(t_vistorias)
                elements.append(Spacer(1, 0.2*inch))

            # Tabela de Improdutivas (ALTERADO para usar Paragraph)
            if rel_imob.improdutivas:
                elements.append(Paragraph("Vistorias Improdutivas", styles['h3']))
                improd_data = [["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"]]
                for i in rel_imob.improdutivas:
                    improd_data.append([
                        Paragraph(i.data_vistoria_original.strftime('%d/%m/%Y'), cell_style_normal),
                        Paragraph(str(i.cod_imovel or "N/A"), cell_style_normal),
                        Paragraph(i.motivo_improdutividade, cell_style_normal),
                        Paragraph(f"R$ {i.valor_cobrado:.2f}", cell_style_normal)
                    ])
                t_improd = Table(improd_data, colWidths=[70, 70, 460, 80])
                t_improd.setStyle(header_style)
                t_improd.setStyle(body_style)
                elements.append(t_improd)
            
            elements.append(PageBreak()) 


    # --- CASO 4: Relatório Geral (Resumo) ---
    elif isinstance(report_data, schemas.RelatorioGeral):
        elements.append(Paragraph(f"Relatório Geral de Faturamento - {report_data.periodo}", styles['h1']))
        elements.append(Spacer(1, 12))
        data = [["Imobiliária", "Vistorias (Qtd)", "Improdutivas (Qtd)", "Valor Vistorias", "Valor Improdutivas"]]
        
        # ALTERADO para usar Paragraph
        for item in report_data.data:
            data.append([
                Paragraph(str(item.imobiliaria_nome), cell_style_normal),
                Paragraph(str(item.total_vistorias), cell_style_normal),
                Paragraph(str(item.total_improdutivas), cell_style_normal),
                Paragraph(f"R$ {item.valor_total_vistorias:.2f}", cell_style_normal),
                Paragraph(f"R$ {item.valor_total_improdutivas:.2f}", cell_style_normal)
            ])
        
        # Linha de Totais (ALTERADO para usar Paragraph com estilo 'total')
        data.append([
            Paragraph("TOTAIS", cell_style_total), 
            Paragraph(str(report_data.total_geral_vistorias), cell_style_total), 
            Paragraph(str(report_data.total_geral_improdutivas), cell_style_total), 
            Paragraph(f"R$ {report_data.valor_final_vistorias:.2f}", cell_style_total), 
            Paragraph(f"R$ {report_data.valor_final_improdutivas:.2f}", cell_style_total)
        ])
        
        t = Table(data, colWidths=[200, 100, 100, 100, 100])
        t.setStyle(header_style)
        t.setStyle(body_style)
        
        # Estilo para a linha de total (REMOVIDO FONTNAME)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
            # ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'), # REMOVIDO
        ]))
        elements.append(t)

    # --- Fallback ---
    if not elements:
        elements.append(Paragraph("Erro: Não foi possível gerar o conteúdo para este relatório em PDF.", styles['Normal']))
        elements.append(Paragraph("Tipo de dado recebido não foi reconhecido.", styles['Normal']))

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
        
        # --- CORREÇÃO ---
        # A linha abaixo estava faltando. Ela atribui os dados 
        # (List[schemas.RelatorioImobiliaria]) à variável que 
        # a função de PDF espera.
        report_data = list_of_reports

    if not data_for_excel:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado para gerar o relatório.")

    # filename = f"{filename_prefix}_{mes:02d}_{ano}.{'xlsx' if formato == 'excel' else 'pdf'}"
    # Vamos mover a linha acima para dentro dos blocos lógicos
    
    if formato == "excel":
        filename = f"{filename_prefix}_{mes:02d}_{ano}.xlsx" # Define o nome para Excel
        file_stream = _create_excel_report(data_for_excel, filename_prefix, value_column_name)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else: # pdf
        filename = f"{filename_prefix}_{mes:02d}_{ano}.pdf" # Define o nome para PDF
        
        logger.info(f"Gerando PDF para: {filename}") # Log agora mostra o .pdf
        
        file_stream = _create_pdf_report(report_data) 
        media_type = "application/pdf"

    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Access-Control-Expose-Headers': 'Content-Disposition'
    }
    return StreamingResponse(file_stream, media_type=media_type, headers=headers)

# =================================================================
# --- Relatório Mensal por E-mail ---
# =================================================================

def _send_valores_totais_email(
    subject: str,
    html: str,
    recipients: list[str],
):
    try:
        send_email(
            to=recipients,
            subject=subject,
            html=html,
            cc=["engentoria@outlook.com"]
        )
        logger.info("Relatório mensal de ganhos enviado com sucesso.")
    except Exception as e:
        logger.error(
            f"Erro ao enviar relatório mensal de ganhos: {str(e)}",
            exc_info=True
        )


@router.get("/valores_totais_email/{ano}/{mes}", status_code=status.HTTP_200_OK, summary="Calcula e envia o relatório de valores totais por e-mail")
def get_valores_totais_email(
    ano: int,
    mes: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Calcula os valores totais faturados por grupo de imobiliárias e
    as comissões por vistoriador, e envia um relatório por e-mail.
    """
    if not (1 <= mes <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mês inválido. Forneça um valor entre 1 e 12."
        )

    # --- Cálculo por Grupo ---
    grupos = (
        db.query(models.GrupoImobiliaria)
        .options(joinedload(models.GrupoImobiliaria.imobiliarias))
        .filter(models.GrupoImobiliaria.is_deleted == False)
        .all()
    )

    report_grupos = {}
    for grupo in grupos:
        imobiliaria_ids = [
            imob.id for imob in grupo.imobiliarias if not imob.is_deleted
        ]

        if not imobiliaria_ids:
            report_grupos[grupo.nome] = 0.0
            continue

        total_agenda = (
            db.query(func.sum(models.Agenda.valor_final_vistoria))
            .join(models.Imovel)
            .filter(
                models.Imovel.imobiliaria_id.in_(imobiliaria_ids),
                extract("year", models.Agenda.data) == ano,
                extract("month", models.Agenda.data) == mes
            )
            .scalar()
            or Decimal(0)
        )

        total_improdutiva = (
            db.query(func.sum(models.VistoriaImprodutiva.valor_cobranca))
            .filter(
                models.VistoriaImprodutiva.imobiliaria_id.in_(imobiliaria_ids),
                extract("year", models.VistoriaImprodutiva.data_vistoria_original) == ano,
                extract("month", models.VistoriaImprodutiva.data_vistoria_original) == mes
            )
            .scalar()
            or Decimal(0)
        )

        report_grupos[grupo.nome] = float(total_agenda + total_improdutiva)

    # --- Cálculo por Vistoriador ---
    vistoriadores = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.tipo == "vistoriador",
            models.Usuario.is_deleted == False
        )
        .all()
    )

    report_vistoriadores = {}
    for vistoriador in vistoriadores:
        comissao_agenda = (
            db.query(func.sum(models.Agenda.valor_vistoriador))
            .filter(
                models.Agenda.vistoriador_id == vistoriador.id,
                extract("year", models.Agenda.data) == ano,
                extract("month", models.Agenda.data) == mes
            )
            .scalar()
            or Decimal(0)
        )

        comissao_improdutiva = (
            db.query(func.sum(models.VistoriaImprodutiva.valor_para_vistoriador))
            .join(
                models.Agenda,
                models.VistoriaImprodutiva.agenda_id_original == models.Agenda.id
            )
            .filter(
                models.Agenda.vistoriador_id == vistoriador.id,
                extract("year", models.VistoriaImprodutiva.data_vistoria_original) == ano,
                extract("month", models.VistoriaImprodutiva.data_vistoria_original) == mes
            )
            .scalar()
            or Decimal(0)
        )

        report_vistoriadores[vistoriador.nome] = float(
            comissao_agenda + comissao_improdutiva
        )

    # --- Montagem do E-mail ---
    meses_pt = {
        1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
        5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
        9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
    }
    nome_mes = meses_pt[mes]

    subject = f"Relatório Mensal de Ganhos - {nome_mes}/{ano}"

    grupos_html = "".join(
        f"<tr><td>{nome}</td><td>R$ {valor:,.2f}</td></tr>"
        for nome, valor in report_grupos.items()
    )

    vistoriadores_html = "".join(
        f"<tr><td>{nome}</td><td>R$ {valor:,.2f}</td></tr>"
        for nome, valor in report_vistoriadores.items()
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <body style="margin:0;padding:0;background:#0f172a;font-family:Arial;color:#e5e7eb;">
        <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td align="center" style="padding:40px 0;">
                    <table width="650" style="background:#020617;border-radius:12px;">
                        <tr>
                            <td style="
                                background:linear-gradient(135deg,#22d3ee,#22c55e);
                                padding:20px;
                                text-align:center;
                                font-weight:bold;
                                color:#022c22;
                                font-size:20px;
                            ">
                                Relatório Mensal – {nome_mes}/{ano}
                            </td>
                        </tr>

                        <tr>
                            <td style="padding:28px;">
                                <h3>📊 Grupos de Imobiliárias</h3>
                                <table width="100%" style="margin-bottom:24px;">
                                    {grupos_html}
                                </table>

                                <h3>💼 Comissões de Vistoriadores</h3>
                                <table width="100%">
                                    {vistoriadores_html}
                                </table>

                                <p style="margin-top:32px;">
                                    Atenciosamente,<br>
                                    <strong>Sistema Engentoria</strong>
                                </p>
                            </td>
                        </tr>

                        <tr>
                            <td style="
                                padding:16px;
                                text-align:center;
                                font-size:12px;
                                color:#64748b;
                            ">
                                © Engentoria • Relatório automático
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    # --- Envio em background ---
    recipients = settings.RELATORIO_EMAIL_RECIPIENTS  # lista de e-mails

    background_tasks.add_task(
        _send_valores_totais_email,
        subject,
        html,
        recipients
    )

    return {
        "message": (
            f"O relatório de {nome_mes}/{ano} está sendo processado "
            "e será enviado por e-mail."
        )
    }


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
    nome_arquivo = sanitize_filename(nome)

    extensao = extensao.strip().lower()

    extensoes_permitidas = {
        ".jpg",
        ".png",
        ".jpeg",
        ".pdf",
        ".docx",
        ".zip",
        ".rar"
    }

    if extensao not in extensoes_permitidas:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não aceito: {extensao}"
        )
    
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

    dados = get_report_data(mes=info.month, ano=info.year, db=session, id_grupo=grupo.id)
    total = dados["resumo_geral"].get("valor_total_grupo", 0)


    return {
        "id": info.id,
        "month": info.month,
        "year": info.year,
        "accepted": info.accepted,
        "total": total,
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
    if docs >= config.max_arquivos:
        raise HTTPException(status_code=400, detail="Limite de documentos excedido")
    
    nome, extensao = os.path.splitext(file.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}-CODIGO-{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".png", ".jpeg", ".pdf", ".docx", ".zip"]:
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


@router.get("/laudos/pendentes")
async def listar_laudos_pendentes(session: Session = Depends(get_db)):
    laudos = (session.query(models.Laudo)
              .options(joinedload(models.Laudo.imovel),
                       joinedload(models.Laudo.imobiliaria))
              .filter(models.Laudo.aprovado == False,
                      models.Laudo.finalizado == True)
              .order_by(models.Laudo.created_at.desc())
              .all())
    if not laudos:
        return {
            "laudos":[]
        }
    
    return {
        "laudos": [{
            "id": laudo.id,
            "created_at": laudo.created_at,
            "finalizado": laudo.finalizado,
            "aprovado": laudo.aprovado,
            "cod_imovel": laudo.imovel.cod_imovel,
            "imobiliaria": laudo.imobiliaria.nome
        }for laudo in laudos]
    }

@router.get("/laudo/{id_laudo}")
async def visualizar_laudo(id_laudo: str,
                           session: Session = Depends(get_db)):
    try:
        laudo_id = UUID(id_laudo)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .options(joinedload(models.Laudo.categorias),
                      joinedload(models.Laudo.vistoriador),
                      joinedload(models.Laudo.imovel),
                      joinedload(models.Laudo.imobiliaria))
             .filter(models.Laudo.id == laudo_id,
                     models.Laudo.finalizado == True)
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    categorias = sorted(laudo.categorias, key=lambda d: d.created_at, reverse=True)

    return {
        "id": laudo.id,
        "created_at": laudo.created_at,
        "nome_vistoriador": laudo.vistoriador.nome,
        "nome_imobiliaria": laudo.imobiliaria.nome,
        "codigo_imovel": laudo.imovel.cod_imovel,
        "finalizado": laudo.finalizado,
        "aprovado": laudo.aprovado,
        "obs": laudo.obs_adm,
        "documento": gerar_url_assinada(bucket="documentos", file_path=laudo.file_path),
        "categorias": [{
            "id": c.id,
            "titulo": c.titulo,
            "created_at": c.created_at
        }for c in categorias]
    }

@router.put("/laudo/status")
async def atualizar_status(data: schemas.LaudoStatus,
                           session: Session = Depends(get_db)):
    try:
        laudo_id = UUID(data.laudo_id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .filter(models.Laudo.id == laudo_id,
                     models.Laudo.finalizado == True)
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    laudo.aprovado = data.aprovado
    if data.aprovado == False:
        laudo.obs_adm = data.obs
        laudo.finalizado = False

    try:
        session.commit()
        return
    except Exception as e:
        logger.error(f"Erro ao atualizar status: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail="Erro ao atualizar status")
    
@router.get("/laudos/categoria/{id_categoria}")
async def ver_categoria(id_categoria: str,
                        session: Session = Depends(get_db)):
    try:
        categoria_id = UUID(id_categoria)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    categoria = (session.query(models.CategoriaLaudo)
                 .options(joinedload(models.CategoriaLaudo.laudo),
                          joinedload(models.CategoriaLaudo.imagens),
                          joinedload(models.CategoriaLaudo.itens))
                 .filter(models.CategoriaLaudo.id == categoria_id).first())
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    if not categoria.laudo.finalizado:
        raise HTTPException(status_code=400, detail="Laudo ainda não finalizado.")
    
    itens = sorted(categoria.itens, key=lambda d: d.created_at, reverse=True)
    imagens = categoria.imagens

    return {
        "id": categoria.id,
        "titulo": categoria.titulo,
        "created_at": categoria.created_at,
        "itens": [{
            "id": i.id,
            "descricao": i.descricao,
            "created_at": i.created_at
        }for i in itens],
        "imagens": [{
            "id": i.id,
            "file_path": i.file_path,
            "link": gerar_url_assinada(bucket="imagens", file_path=i.file_path)
        }for i in imagens]
    }

@router.get("/laudos/agendamento/{id_agendamento}")
async def ver_laudo_agendamento(id_agendamento: str,
                                session: Session = Depends(get_db)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .options(joinedload(models.Laudo.categorias))
             .filter(models.Laudo.agenda_id == agendamento_id,
                     models.Laudo.finalizado == True).first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    categorias = sorted(laudo.categorias, key=lambda d: d.created_at, reverse=True)
    
    return {
        "id": laudo.id,
        "created_at": laudo.created_at,
        "nome_vistoriador": laudo.vistoriador.nome,
        "nome_imobiliaria": laudo.imobiliaria.nome,
        "codigo_imovel": laudo.imovel.cod_imovel,
        "finalizado": laudo.finalizado,
        "aprovado": laudo.aprovado,
        "documento": gerar_url_assinada(bucket="documentos", file_path=laudo.file_path),
        "categorias": [{
            "id": c.id,
            "titulo": c.titulo,
            "created_at": c.created_at
        }for c in categorias]
    }

@router.post("/mensal/{info_id}/enviar-relatorio", status_code=status.HTTP_202_ACCEPTED)
async def enviar_relatorio_mensal_email(
    info_id: str,
    data: EnvioRelatorioEmailSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Envia o relatório mensal aceito (InfoMensal) por e-mail
    para os destinatários especificados.
    """
    try:
        info_uuid = UUID(info_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="ID da InfoMensal inválido."
        )

    # 1. Buscar InfoMensal
    info = (
        db.query(models.InfoMensal)
        .filter(models.InfoMensal.id == info_uuid)
        .first()
    )

    if not info:
        raise HTTPException(
            status_code=404,
            detail="InfoMensal não encontrada."
        )

    # 2. Regra de negócio CRÍTICA
    if info.accepted is not True:
        raise HTTPException(
            status_code=400,
            detail="Este relatório ainda não foi aceito pela imobiliária. O envio não é permitido."
        )

    # 3. Dispara a task em background (Mailgun)
    background_tasks.add_task(
        _send_report_email_task,
        db=db,
        info_id=info.id,
        grupo_id=info.grupo_id,
        mes=info.month,
        ano=info.year,
        recipient_emails=[str(email) for email in data.emails]
    )

    # 4. Retorno imediato
    return {
        "message": (
            "Envio do relatório foi agendado com sucesso. "
            "Os e-mails serão enviados em segundo plano."
        )
    }
# =================================================================
# --- Gestão de Vistorias Improdutivas (Admin) ---
# =================================================================

@router.get("/improdutivas/", response_model=List[schemas.VistoriaImprodutivaDetalhes], summary="Listar todas as vistorias improdutivas")
def listar_improdutivas(
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db)
):
    """
    Lista as vistorias improdutivas ordenadas da mais recente para a mais antiga.
    """
    improdutivas = db.query(models.VistoriaImprodutiva).options(
        joinedload(models.VistoriaImprodutiva.imovel),
        joinedload(models.VistoriaImprodutiva.imobiliaria)
    ).filter(
        models.VistoriaImprodutiva.is_deleted == False
    ).order_by(
        models.VistoriaImprodutiva.data_vistoria_original.desc(),
        models.VistoriaImprodutiva.created_at.desc()
    ).offset(skip).limit(limit).all()

    # Formatação manual para garantir o mapeamento correto dos campos relacionados
    resultado = []
    for imp in improdutivas:
        resultado.append(schemas.VistoriaImprodutivaDetalhes(
            id=imp.id,
            data_vistoria_original=imp.data_vistoria_original,
            cod_imovel=imp.imovel.cod_imovel if imp.imovel else "N/A",
            endereco=imp.imovel.endereco if imp.imovel else "Endereço não disponível",
            imobiliaria_nome=imp.imobiliaria.nome if imp.imobiliaria else "N/A",
            motivo_improdutividade=imp.motivo_improdutividade,
            valor_cobranca=float(imp.valor_cobranca or 0),
            valor_para_vistoriador=float(imp.valor_para_vistoriador or 0)
        ))
        
    return resultado


@router.put("/improdutivas/{improdutiva_id}", response_model=schemas.VistoriaImprodutivaDetalhes, summary="Atualizar vistoria improdutiva (Preço/Motivo)")
def update_improdutiva(
    improdutiva_id: UUID, 
    update_data: schemas.VistoriaImprodutivaUpdate, 
    db: Session = Depends(get_db)
):
    """
    Permite ao admin atualizar o valor de cobrança, valor do vistoriador ou motivo de uma improdutiva.
    """
    db_improdutiva = db.query(models.VistoriaImprodutiva).options(
        joinedload(models.VistoriaImprodutiva.imovel),
        joinedload(models.VistoriaImprodutiva.imobiliaria)
    ).filter(
        models.VistoriaImprodutiva.id == improdutiva_id,
        models.VistoriaImprodutiva.is_deleted == False
    ).first()

    if not db_improdutiva:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoria Improdutiva não encontrada.")

    payload = update_data.model_dump(exclude_unset=True)

    if "valor_cobranca" in payload:
        db_improdutiva.valor_cobranca = payload["valor_cobranca"]
    
    if "motivo_improdutividade" in payload:
        db_improdutiva.motivo_improdutividade = payload["motivo_improdutividade"]

    if "valor_para_vistoriador" in payload:
        db_improdutiva.valor_para_vistoriador = payload["valor_para_vistoriador"]

    try:
        db.commit()
        db.refresh(db_improdutiva)
        
        # Retorna formatado
        return schemas.VistoriaImprodutivaDetalhes(
            id=db_improdutiva.id,
            data_vistoria_original=db_improdutiva.data_vistoria_original,
            cod_imovel=db_improdutiva.imovel.cod_imovel if db_improdutiva.imovel else "N/A",
            endereco=db_improdutiva.imovel.endereco if db_improdutiva.imovel else "N/A",
            imobiliaria_nome=db_improdutiva.imobiliaria.nome if db_improdutiva.imobiliaria else "N/A",
            motivo_improdutividade=db_improdutiva.motivo_improdutividade,
            valor_cobranca=float(db_improdutiva.valor_cobranca or 0),
            valor_para_vistoriador=float(db_improdutiva.valor_para_vistoriador or 0)
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao atualizar improdutiva {improdutiva_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao atualizar vistoria improdutiva.")

@router.get("/dashboard/analise-ia", summary="Analise de agenda dos próximos 3 dias com IA")
def analyze_schedule_with_ai(db: Session = Depends(get_db)):
    """
    Levanta a agenda dos próximos 3 dias, aplica regras de negócio e solicita
    ao Gemini uma análise crítica operacional.
    """
    
    # 1. Configuração da API do Gemini
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada no ambiente.")
    
    genai.configure(api_key=api_key)
    
    # Tenta usar o modelo solicitado, com fallback para versões estáveis caso a preview não exista
    model_name = "gemini-3-flash-preview"
    # Nota: Se o modelo 'gemini-3...' não estiver disponível publicamente, 
    # a biblioteca pode lançar erro. Recomenda-se usar 'gemini-2.0-flash-exp' ou 'gemini-1.5-flash'.
    
    try:
        model = genai.GenerativeModel(model_name)
    except Exception:
        # Fallback silencioso para garantir funcionamento se o nome do modelo mudar
        model = genai.GenerativeModel("gemini-1.5-flash")

    # 2. Levantamento de Dados (Próximos 3 dias)
    today = date.today()
    end_date = today + timedelta(days=3)

    agendamentos = db.query(models.Agenda).options(
        joinedload(models.Agenda.imovel),
        joinedload(models.Agenda.vistoriador)
    ).filter(
        models.Agenda.data >= today,
        models.Agenda.data <= end_date,
        models.Agenda.tipo.notin_(['LIVRE', 'FECHADO']), # Apenas vistorias reais
        models.Agenda.is_deleted == False
    ).order_by(models.Agenda.data, models.Agenda.horario).all()

    if not agendamentos:
        return {"message": "A agenda está vazia para os próximos 3 dias. Nenhuma análise necessária."}

    # 3. Formatação dos Dados para o Prompt
    dados_agenda = []
    for ag in agendamentos:
        imovel_info = "N/A"
        tamanho = "N/A"
        mobilia = "N/A"
        endereco = "N/A"
        cod_imovel = "N/A"

        if ag.imovel:
            tamanho = float(ag.imovel.tamanho)
            mobilia = ag.imovel.mobiliado
            endereco = ag.imovel.endereco
            cod_imovel = ag.imovel.cod_imovel
            imovel_info = f"Cód: {cod_imovel} | Tamanho: {tamanho}m² | Mobília: {mobilia} | End: {endereco}"
        
        vistoriador_nome = ag.vistoriador.nome if ag.vistoriador else "Desconhecido"
        
        linha = (
            f"- Data: {ag.data.strftime('%d/%m/%Y')} | Horário: {ag.horario} | "
            f"Vistoriador: {vistoriador_nome} | Tipo: {ag.tipo} | {imovel_info}"
        )
        dados_agenda.append(linha)
    
    texto_agenda = "\n".join(dados_agenda)

    # 4. Definição das Regras e Prompt
    prompt = f"""
    Você é um gerente operacional experiente de uma empresa de vistorias imobiliárias.
    Analise a agenda dos próximos 3 dias abaixo e identifique possíveis problemas logísticos ou quebra de regras.

    DADOS DA AGENDA:
    {texto_agenda}

    REGRAS DE NEGÓCIO:
    1. Regra de Horário Duplo: Vistorias do tipo 'ENTRADA' ou 'SAIDA' em imóveis com tamanho >= 100m² OU que sejam 'mobiliado' são complexas e demoradas. Idealmente, elas não devem ter outra vistoria agendada imediatamente na sequência para o mesmo vistoriador sem uma folga, ou devem ocupar dois horários.
    2. Logística: Verifique se o mesmo vistoriador tem vistorias em endereços diferentes em horários muito próximos (ex: 09:00 e 10:00), o que pode causar atrasos.
    3. Carga de Trabalho: Identifique se algum vistoriador está sobrecarregado no mesmo dia (muitas vistorias grandes).

    INSTRUÇÃO DE RESPOSTA:
    - Retorne APENAS a mensagem final para o usuário (gestor).
    - Se houver problemas críticos, seja direto e cite os códigos dos imóveis e vistoriadores. Ex: "Atenção: O vistoriador X tem uma sequência inviável no dia Y..."
    - Se estiver tudo aparentemente bem, diga: "A agenda dos próximos 3 dias parece equilibrada, sem conflitos críticos detectados."
    - Não use formatação markdown excessiva, apenas texto corrido.
    """

    # 5. Envio para o Gemini
    try:
        response = model.generate_content(prompt)
        mensagem_analise = response.text.strip()
    except Exception as e:
        logger.error(f"Erro ao consultar Gemini: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro ao processar análise inteligente.")

    return {"message": mensagem_analise}

@router.post("/improdutivas/{improdutiva_id}/reverter", response_model=schemas.AgendaDisplay, summary="Reverter Vistoria Improdutiva para a Agenda")
def reverter_improdutiva(
    improdutiva_id: UUID,
    payload: schemas.ReverterImprodutiva,
    db: Session = Depends(get_db)
):
    """
    Remove o status de improdutiva (soft delete) e volta o imóvel para o horário original na agenda.
    Recalcula os valores de cobrança e comissão baseados no tipo de vistoria informado.
    """
    # 1. Buscar a improdutiva
    db_improdutiva = db.query(models.VistoriaImprodutiva).filter(
        models.VistoriaImprodutiva.id == improdutiva_id,
        models.VistoriaImprodutiva.is_deleted == False
    ).first()

    if not db_improdutiva:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoria Improdutiva não encontrada.")

    # 2. Buscar a agenda original
    db_agenda = db.query(models.Agenda).filter(
        models.Agenda.id == db_improdutiva.agenda_id_original
    ).first()

    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário original da agenda não encontrado.")

    if not db_agenda.disponivel:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="O horário original na agenda já foi ocupado por outra vistoria. Não é possível reverter diretamente."
        )

    # 3. Buscar Imóvel, Imobiliária e Vistoriador para cálculos
    db_imovel = db.query(models.Imovel).options(
        joinedload(models.Imovel.imobiliaria)
    ).filter(models.Imovel.id == db_improdutiva.imovel_id).first()

    db_vistoriador = db.query(models.Usuario).filter(
        models.Usuario.id == db_agenda.vistoriador_id
    ).first()

    if not db_imovel or not db_imovel.imobiliaria:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Imóvel ou Imobiliária não encontrados para recalcular os valores da vistoria."
        )

    # 4. Refazer os cálculos financeiros (utilizando as funções auxiliares já existentes)
    valor_base_ref = _calculate_valor_base_imovel(db_imovel.imobiliaria, db_imovel.tamanho, db_imovel.mobiliado)
    valor_final = _calculate_valor_final_vistoria(db_imovel, db_imovel.imobiliaria, payload.tipo_vistoria.value, valor_base_externo=valor_base_ref)
    valor_comissao = _calculate_valor_comissao_vistoriador(db_imovel.tamanho, db_imovel.mobiliado, payload.tipo_vistoria.value, db_vistoriador)

    # 5. Atualizar a Agenda (Ocupando o horário novamente)
    db_agenda.imovel_id = db_improdutiva.imovel_id
    db_agenda.tipo = payload.tipo_vistoria.value
    db_agenda.disponivel = False
    db_agenda.valor_final_vistoria = valor_final
    db_agenda.valor_vistoriador = valor_comissao
    db_agenda.observacao_privada = payload.observacao

    # 6. Deletar a Improdutiva (Soft delete para manter histórico se necessário)
    db_improdutiva.is_deleted = True

    try:
        db.commit()
        db.refresh(db_agenda)
        return db_agenda
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao tentar reverter a vistoria: {str(e)}"
        )


@router.post("/agenda/{agenda_id}/recalcular-valores", response_model=schemas.AgendaDisplay, summary="Recalcular valores financeiros de um agendamento")
def recalcular_valores_agenda(
    agenda_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Recalcula valor_final_vistoria e valor_vistoriador para um agendamento existente
    usando as tabelas de preço atuais da imobiliária e do vistoriador."""
    db_agenda = db.query(models.Agenda).options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
    ).filter(models.Agenda.id == agenda_id).first()

    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    if db_agenda.tipo in ("LIVRE", "FECHADO"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível recalcular valores para horários livres ou fechados."
        )

    if not db_agenda.imovel or not db_agenda.imovel.imobiliaria:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imóvel ou imobiliária não encontrados para este agendamento."
        )

    db_vistoriador = db.query(models.Usuario).filter(
        models.Usuario.id == db_agenda.vistoriador_id
    ).first()

    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador do agendamento não encontrado.")

    valores = calcular_valores_vistoria(
        db_agenda.imovel, db_agenda.imovel.imobiliaria, db_agenda.tipo, db_vistoriador
    )

    db_agenda.valor_final_vistoria = valores["valor_final_vistoria"]
    db_agenda.valor_vistoriador = valores["valor_vistoriador"]

    try:
        db.commit()
        db.refresh(db_agenda)
        return db_agenda
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao salvar os valores recalculados: {str(e)}"
        )
