from fastapi import APIRouter, Depends, Query, HTTPException, status, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, case, or_
from typing import List, Optional
from datetime import date, timedelta, datetime
from dateutil.relativedelta import relativedelta
import io
from pydantic import BaseModel

# Imports para geração de relatórios
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

import uuid, os, logging
from ..supabase_client import supabase, gerar_url_assinada, deletar_arquivo_supabase
from uuid import UUID

from .. import models, schemas, auth
from ..config import get_db
from ..ia.servico import qtd_nao_conformidades_por_laudo
import unicodedata, re

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/imobiliaria",
    tags=["Painel da Imobiliária"],
    dependencies=[Depends(auth.get_current_active_imobiliaria_group)]
)

class LaudoAprovadoItem(BaseModel):
    id: UUID
    created_at: datetime
    cod_imovel: str
    endereco: str
    aprovado: bool
    file_path: Optional[str] = None
    # None = laudo de não conformidades indisponível; 0+ = disponível com N não conformidades
    qtd_nao_conformidades: Optional[int] = None
    
    class Config:
        from_attributes = True # Compatibilidade com Pydantic v2 (ou orm_mode=True para v1)

class LaudoAprovadoResponse(BaseModel):
    laudos: List[LaudoAprovadoItem]
    total: int

# --- Funções Auxiliares ---
def get_imobiliaria_ids_from_group(current_user: models.GrupoImobiliaria):
    """Obtém os IDs de todas as imobiliárias associadas ao grupo logado."""
    imobiliaria_ids = [imob.id for imob in current_user.imobiliarias]
    if not imobiliaria_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma imobiliária associada a este grupo.")
    return imobiliaria_ids

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

def get_report_data(mes: int, ano: int, db: Session, current_user: models.GrupoImobiliaria):
    """
    Busca e formata os dados para o relatório mensal de uma ou mais imobiliárias de um grupo,
    e retorna também o resumo total do grupo.
    """

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


def verify_and_create_infos(session: Session, current_user: models.GrupoImobiliaria):
    mes_atual = datetime.now().month
    ano_atual = datetime.now().year

    if mes_atual==1:
        mes_analisado = 12
        ano_analisado = ano_atual-1
    else:
        mes_analisado = mes_atual-1
        ano_analisado = ano_atual

    info = (
        session.query(models.InfoMensal)
        .filter(
            models.InfoMensal.grupo_id == current_user.id,
            models.InfoMensal.month == mes_analisado,
            models.InfoMensal.year == ano_analisado
        )
        .first()
    )

    if info:
        return
        
    new = models.InfoMensal(grupo_id=current_user.id,
                            month=mes_analisado,
                            year=ano_analisado)
    try:
        session.add(new)
        session.commit()
        return
    except Exception as e:
        raise RuntimeError(e)

# --- Endpoints da API ---
@router.get("/agenda", response_model=List[schemas.AgendaDisplay])
def read_imobiliaria_agenda(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    imobiliaria_ids = get_imobiliaria_ids_from_group(current_user)
    query = db.query(models.Agenda).join(models.Imovel).filter(
        models.Imovel.imobiliaria_id.in_(imobiliaria_ids),
        models.Agenda.is_deleted == False,
        models.Agenda.data.between(start_date, end_date),
        models.Agenda.imovel_id != None,
        models.Agenda.tipo != "FECHADO"
    )
    query = query.options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.cliente),
        joinedload(models.Agenda.vistoriador)
    )
    vistorias = query.order_by(models.Agenda.data, models.Agenda.horario).all()
    
    return vistorias

@router.get("/dashboard-stats", response_model=schemas.DashboardStatsImobiliaria)
def get_dashboard_stats(db: Session = Depends(get_db), current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    # Correção: Usar o mesmo filtro do relatório, pegando apenas imobiliárias NÃO deletadas.
    # Antes usava 'get_imobiliaria_ids_from_group' que pegava todas da relação, inclusive deletadas se não houvesse filtro.
    imobiliarias_do_grupo = db.query(models.Imobiliaria).filter(
        models.Imobiliaria.grupo_id == current_user.id,
        models.Imobiliaria.is_deleted == False
    ).all()
    imobiliaria_ids = [imob.id for imob in imobiliarias_do_grupo]

    today = date.today()
    start_current_30d = today - timedelta(days=29)
    start_previous_30d = start_current_30d - timedelta(days=30)
    end_previous_30d = start_current_30d - timedelta(days=1)
    
    def get_stats_for_period(start, end):
        vistorias = db.query(func.count(models.Agenda.id)).join(models.Imovel).filter(
            models.Imovel.imobiliaria_id.in_(imobiliaria_ids),
            models.Agenda.data.between(start, end),
            models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
        ).scalar() or 0
        
        # Correção: Adicionado filtro is_deleted == False para improdutivas, seguindo o relatório
        improdutivas = db.query(func.count(models.VistoriaImprodutiva.id)).filter(
            models.VistoriaImprodutiva.imobiliaria_id.in_(imobiliaria_ids),
            models.VistoriaImprodutiva.data_vistoria_original.between(start, end),
            models.VistoriaImprodutiva.is_deleted == False 
        ).scalar() or 0
        return vistorias, improdutivas

    vistorias_current_30d, improdutivas_current_30d = get_stats_for_period(start_current_30d, today)
    vistorias_previous_30d, improdutivas_previous_30d = get_stats_for_period(start_previous_30d, end_previous_30d)
    
    def calculate_change(current, previous):
        if previous == 0: return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    start_of_month = today.replace(day=1)
    vistorias_mes_atual, improdutivas_mes_atual = get_stats_for_period(start_of_month, today)
    
    six_months_ago = today.replace(day=1) - relativedelta(months=5)
    monthly_data = db.query(extract('year', models.Agenda.data).label('year'), extract('month', models.Agenda.data).label('month'), func.count(models.Agenda.id).label('count')).join(models.Imovel).filter(models.Imovel.imobiliaria_id.in_(imobiliaria_ids), models.Agenda.data >= six_months_ago, models.Agenda.data < today.replace(day=1) + relativedelta(months=1), models.Agenda.tipo != 'LIVRE').group_by('year', 'month').order_by('year', 'month').all()
    
    month_map = {1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun", 7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"}
    monthly_breakdown = {f"{month_map[row.month]}/{str(int(row.year))[-2:]}": row.count for row in monthly_data}
    
    projecao = 0
    if len(monthly_data) > 1:
        n, x, y = len(monthly_data), list(range(len(monthly_data))), [row.count for row in monthly_data]
        sum_x, sum_y, sum_xy, sum_x2 = sum(x), sum(y), sum(xi * yi for xi, yi in zip(x, y)), sum(xi**2 for xi in x)
        denominator = (n * sum_x2 - sum_x**2)
        if denominator > 0:
            slope = (n * sum_xy - sum_x * sum_y) / denominator
            intercept = (sum_y - slope * sum_x) / n
            projecao = max(0, int(slope * n + intercept))
    elif monthly_data: projecao = monthly_data[0].count

    try:
        verify_and_create_infos(session=db, current_user=current_user)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao criar infos")

    return schemas.DashboardStatsImobiliaria(
        vistorias_30d=schemas.StatsItem(total=vistorias_current_30d, change=calculate_change(vistorias_current_30d, vistorias_previous_30d)),
        improdutivas_30d=schemas.StatsItem(total=improdutivas_current_30d, change=calculate_change(improdutivas_current_30d, improdutivas_previous_30d)),
        vistorias_mes_atual=vistorias_mes_atual, improdutivas_mes_atual=improdutivas_mes_atual, projecao_proximo_mes=projecao, monthly_breakdown=monthly_breakdown)

@router.get("/relatorio-mensal")
def get_monthly_report(mes: int = Query(..., ge=1, le=12), ano: int = Query(..., ge=2020), db: Session = Depends(get_db), current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    return get_report_data(mes, ano, db, current_user)

# --- Funções para Download de Relatórios ---

def create_excel_report(report_data: List): # Removido 'schemas.RelatorioMensal' para ser genérico se 'schemas' não estiver disponível
    """
    Gera um relatório Excel (BytesIO) a partir dos dados do relatório mensal.
    
    Melhorias:
    - Quebra de linha automática (wrap_text=True) em células de dados.
    - Alinhamento vertical superior para melhor leitura de texto quebrado.
    - Cores de linha alternadas (banding) para facilitar a leitura.
    - Estilo de borda fina em todas as células de dados.
    - Cabeçalhos de tabela com preenchimento azul (corrigido).
    - Formatação de data e moeda explícita.
    - Linha de "Total Geral" com uma borda superior para destaque.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Relatório Mensal"

    # --- Definição de Estilos ---
    title_font = Font(name='Calibri', size=16, bold=True, color="FFFFFF")
    header_font = Font(name='Calibri', size=12, bold=True, color="FFFFFF")
    data_font = Font(name='Calibri', size=11)
    total_font = Font(name='Calibri', size=12, bold=True)
    
    header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
    even_row_fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
    
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left_top_wrap_align = Alignment(horizontal='left', vertical='top', wrap_text=True)
    right_align = Alignment(horizontal='right', vertical='center')
    
    thin_border_side = Side(style='thin', color="D4D4D4")
    thin_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    total_top_border = Border(top=Side(style='medium', color='000000'))

    currency_format = "R$ #,##0.00"
    date_format = "dd/mm/yyyy"
    
    row_cursor = 1
    for report in report_data:
        # --- Título Principal do Relatório ---
        ws.merge_cells(start_row=row_cursor, start_column=1, end_row=row_cursor, end_column=7)
        title_cell = ws.cell(row=row_cursor, column=1, value=f"Relatório de Vistorias - {report.imobiliaria_nome} ({report.mes_ano})")
        title_cell.font = title_font
        title_cell.fill = header_fill
        title_cell.alignment = center_align
        row_cursor += 2

        # --- Tabela: Vistorias Agendadas ---
        ws.merge_cells(start_row=row_cursor, start_column=1, end_row=row_cursor, end_column=7)
        sub_title_agendadas = ws.cell(row=row_cursor, column=1, value="Vistorias Agendadas")
        sub_title_agendadas.font = header_font
        sub_title_agendadas.fill = header_fill
        sub_title_agendadas.alignment = center_align
        row_cursor += 1
        
        headers_agendadas = ["Data", "Cód. Imóvel", "Endereço", "Tamanho", "Mobília", "Tipo Vistoria", "Valor"]
        header_start_row = row_cursor
        for col, header in enumerate(headers_agendadas, 1):
            cell = ws.cell(row=row_cursor, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center_align
            cell.border = thin_border
        
        data_start_row = row_cursor + 1
        for i, vistoria in enumerate(report.vistorias_agendadas):
            row_cursor += 1
            is_even_row = i % 2 == 1 # 0-indexed, so 1 is the second row
            row_fill = even_row_fill if is_even_row else None
            
            row_data = [
                (vistoria.data, date_format, center_align),
                (vistoria.cod_imovel, None, center_align),
                (vistoria.endereco, None, left_top_wrap_align),
                (f"{vistoria.tamanho} m²", None, center_align),
                (vistoria.mobiliado.replace('_', ' ').title(), None, center_align),
                (vistoria.tipo, None, center_align),
                (vistoria.valor, currency_format, right_align),
            ]
            
            for col, (value, num_format, align) in enumerate(row_data, 1):
                cell = ws.cell(row=row_cursor, column=col, value=value)
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = align
                if num_format:
                    cell.number_format = num_format
                if row_fill:
                    cell.fill = row_fill
        
        row_cursor += 2

        # --- Tabela: Vistorias Improdutivas ---
        ws.merge_cells(start_row=row_cursor, start_column=1, end_row=row_cursor, end_column=4)
        sub_title_improdutivas = ws.cell(row=row_cursor, column=1, value="Vistorias Improdutivas")
        sub_title_improdutivas.font = header_font
        sub_title_improdutivas.fill = header_fill
        sub_title_improdutivas.alignment = center_align
        row_cursor += 1
        
        headers_improdutivas = ["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"]
        for col, header in enumerate(headers_improdutivas, 1):
            cell = ws.cell(row=row_cursor, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center_align
            cell.border = thin_border
        
        data_start_row = row_cursor + 1
        for i, vistoria in enumerate(report.vistorias_improdutivas):
            row_cursor += 1
            is_even_row = i % 2 == 1
            row_fill = even_row_fill if is_even_row else None
            
            row_data = [
                (vistoria.data_vistoria_original, date_format, center_align),
                (vistoria.cod_imovel, None, center_align),
                (vistoria.motivo_improdutividade, None, left_top_wrap_align),
                (vistoria.valor_cobranca, currency_format, right_align),
            ]
            
            for col, (value, num_format, align) in enumerate(row_data, 1):
                cell = ws.cell(row=row_cursor, column=col, value=value)
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = align
                if num_format:
                    cell.number_format = num_format
                if row_fill:
                    cell.fill = row_fill

        row_cursor += 2
        
        # --- Bloco de Totais ---
        total_rows = [
            ("Total Vistorias:", report.valor_vistorias),
            ("Total Improdutivas:", report.valor_improdutivas),
            ("TOTAL GERAL:", report.valor_total),
        ]
        
        for i, (label, value) in enumerate(total_rows):
            is_total_geral = (i == len(total_rows) - 1)
            
            label_cell = ws.cell(row=row_cursor, column=6, value=label)
            label_cell.font = total_font
            label_cell.alignment = right_align
            
            value_cell = ws.cell(row=row_cursor, column=7, value=value)
            value_cell.font = total_font
            value_cell.number_format = currency_format
            value_cell.alignment = right_align

            if is_total_geral:
                label_cell.border = total_top_border
                value_cell.border = total_top_border

            row_cursor += 1
            
        row_cursor += 3 # Espaço antes do próximo relatório

    # --- Ajuste Final das Colunas ---
    ws.column_dimensions['A'].width = 12 # Data
    ws.column_dimensions['B'].width = 12 # Cód. Imóvel
    ws.column_dimensions['C'].width = 45 # Endereço / Motivo
    ws.column_dimensions['D'].width = 15 # Tamanho / Valor Cobrado
    ws.column_dimensions['E'].width = 15 # Mobília
    ws.column_dimensions['F'].width = 15 # Tipo Vistoria
    ws.column_dimensions['G'].width = 15 # Valor
    
    # --- Salvar e Retornar ---
    virtual_workbook = io.BytesIO()
    wb.save(virtual_workbook)
    virtual_workbook.seek(0)
    return virtual_workbook

def create_pdf_report(report_data: List): # Removido 'schemas.RelatorioMensal' para ser genérico
    """
    Gera um relatório PDF (BytesIO) a partir dos dados do relatório mensal.
    
    Melhorias:
    - Estilos de título (H1, H2) personalizados com a cor do tema.
    - Cores de linha alternadas (banding) nas tabelas.
    - Grade da tabela com cor mais suave (cinza) em vez de preto.
    - Alinhamento à esquerda para colunas de texto longo (Endereço, Motivo)
    - Alinhamento centralizado ou à direita para outros dados.
    - Estilo de tabela de total com linha superior na linha "TOTAL GERAL".
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter),
                            leftMargin=36, rightMargin=36,
                            topMargin=36, bottomMargin=36)
    
    styles = getSampleStyleSheet()
    
    # --- Definição de Estilos Personalizados ---
    styles.add(ParagraphStyle(
        name='CustomH1',
        parent=styles['h1'],
        alignment=TA_CENTER,
        fontSize=18,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor("#3B82F6"),
        spaceAfter=12
    ))
    
    styles.add(ParagraphStyle(
        name='CustomH2',
        parent=styles['h2'],
        fontSize=14,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor("#2C5282"), # Um azul mais escuro
        spaceAfter=6
    ))

    # Estilo para o texto dentro das células (quebra de linha)
    data_para_style = ParagraphStyle(
        name='DataPara',
        parent=styles['Normal'],
        alignment=TA_LEFT,
        fontSize=9
    )
    
    # Estilo para dados numéricos ou curtos
    data_style = ParagraphStyle(
        name='Data',
        parent=styles['Normal'],
        alignment=TA_CENTER,
        fontSize=9
    )

    # Função helper para formatar moeda
    def format_currency(value):
        return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    elements = []

    for report in report_data:
        elements.append(Paragraph(f"Relatório de Vistorias - {report.imobiliaria_nome} ({report.mes_ano})", styles['CustomH1']))
        elements.append(Spacer(1, 12))

        # --- Tabela: Vistorias Agendadas ---
        elements.append(Paragraph("Vistorias Agendadas", styles['CustomH2']))
        
        agendadas_data = [
            ["Data", "Cód.", "Endereço", "Tam.", "Mobília", "Tipo", "Valor"] # Cabeçalho
        ]
        
        for v in report.vistorias_agendadas:
            agendadas_data.append([
                v.data.strftime("%d/%m/%Y"),
                v.cod_imovel,
                Paragraph(v.endereco, data_para_style),
                f"{v.tamanho} m²",
                v.mobiliado.replace('_', ' '),
                v.tipo,
                format_currency(v.valor)
            ])
        
        table_agendadas = Table(agendadas_data, colWidths=[55, 50, 250, 50, 80, 80, 70])
        
        # Comandos de estilo para a tabela
        style_commands = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#3B82F6")),
            ('TEXTCOLOR',(0,0),(-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,0), 'CENTER'), # Alinhamento do Cabeçalho
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('BOTTOMPADDING', (0,0), (-1,0), 8), # Padding cabeçalho
            ('GRID', (0,0), (-1,-1), 1, colors.HexColor("#D4D4D4")), # Grade suave
            
            # Alinhamento de dados
            ('ALIGN', (0,1), (1,-1), 'CENTER'), # Data, Cód
            ('ALIGN', (2,1), (2,-1), 'LEFT'),   # Endereço (Paragraph já é Left)
            ('ALIGN', (3,1), (5,-1), 'CENTER'), # Tam, Mobília, Tipo
            ('ALIGN', (6,1), (6,-1), 'RIGHT'),  # Valor
        ]
        
        # Adiciona cores de linha alternadas
        for i, row in enumerate(agendadas_data[1:], 1): # Começa do 1 (linha de dados)
            if i % 2 == 0:
                style_commands.append(('BACKGROUND', (0,i), (-1,i), colors.HexColor("#F3F4F6")))
        
        table_agendadas.setStyle(TableStyle(style_commands))
        elements.append(table_agendadas)
        elements.append(Spacer(1, 24))

        # --- Tabela: Vistorias Improdutivas ---
        elements.append(Paragraph("Vistorias Improdutivas", styles['CustomH2']))
        
        improdutivas_data = [
            ["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"] # Cabeçalho
        ]
        
        for v in report.vistorias_improdutivas:
            improdutivas_data.append([
                v.data_vistoria_original.strftime("%d/%m/%Y"),
                v.cod_imovel,
                Paragraph(v.motivo_improdutividade, data_para_style),
                format_currency(v.valor_cobranca)
            ])
        
        table_improdutivas = Table(improdutivas_data, colWidths=[80, 80, 450, 100])
        
        style_commands_improd = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#3B82F6")),
            ('TEXTCOLOR',(0,0),(-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,0), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('BOTTOMPADDING', (0,0), (-1,0), 8),
            ('GRID', (0,0), (-1,-1), 1, colors.HexColor("#D4D4D4")),

            # Alinhamento de dados
            ('ALIGN', (0,1), (1,-1), 'CENTER'), # Data, Cód
            ('ALIGN', (2,1), (2,-1), 'LEFT'),   # Motivo
            ('ALIGN', (3,1), (3,-1), 'RIGHT'),  # Valor
        ]

        # Adiciona cores de linha alternadas
        for i, row in enumerate(improdutivas_data[1:], 1):
            if i % 2 == 0:
                style_commands_improd.append(('BACKGROUND', (0,i), (-1,i), colors.HexColor("#F3F4F6")))

        table_improdutivas.setStyle(TableStyle(style_commands_improd))
        elements.append(table_improdutivas)
        elements.append(Spacer(1, 24))

        # --- Tabela de Totais ---
        total_data = [
            ["Total Vistorias:", format_currency(report.valor_vistorias)],
            ["Total Improdutivas:", format_currency(report.valor_improdutivas)],
            ["TOTAL GERAL:", format_currency(report.valor_total)]
        ]
        
        table_total = Table(total_data, colWidths=[120, 100])
        table_total.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 10),
            
            # Estilo específico para "TOTAL GERAL"
            ('FONTNAME', (0,2), (1,2), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,2), (1,2), colors.red),
            ('LINEABOVE', (0,2), (1,2), 1, colors.black), # Linha acima do total
            ('TOPPADDING', (0,2), (1,2), 6),
        ]))
        
        # Alinha a tabela de total à direita da página
        table_total.hAlign = 'RIGHT'
        elements.append(table_total)
        elements.append(Spacer(1, 48))

    doc.build(elements)
    buffer.seek(0)
    return buffer

@router.get("/relatorio-download")
def download_monthly_report(
    mes: int = Query(..., ge=1, le=12),
    ano: int = Query(..., ge=2020),
    formato: str = Query(..., pattern="^(excel|pdf)$"),
    db: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)
):
    # report_data agora é o dicionário completo retornado pela função
    full_report_data = get_report_data(mes, ano, db, current_user)
    
    # Extraímos a LISTA de relatórios, que é o que as funções de exportação esperam
    report_list = full_report_data.get("relatorios")

    if not report_list:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado para gerar o relatório.")

    # --- CORREÇÃO DE SANITIZAÇÃO ---
    nome_user = current_user.nome.strip()
    # 1. Cria o nome base
    base_filename = f"relatorio_{nome_user}_{mes}_{ano}"
    
    # 2. Sanitiza o nome base (removendo acentos e caracteres especiais, exceto _ e -)
    nome_sanitizado = unicodedata.normalize('NFD', base_filename)
    nome_sanitizado = ''.join(c for c in nome_sanitizado if unicodedata.category(c) != 'Mn')
    nome_sanitizado = nome_sanitizado.replace(" ", "_")
    # Remove qualquer coisa que não seja letra, número, _ ou - (garantindo que não haja '.')
    nome_sanitizado = re.sub(r"[^a-zA-Z0-9_-]", "", nome_sanitizado)
    # Remove _ ou - duplicados
    nome_sanitizado = re.sub(r"[_.-]+", "_", nome_sanitizado)
    nome_sanitizado = nome_sanitizado.rstrip('_-')

    
    if formato == "excel":
        file_stream = create_excel_report(report_list)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{nome_sanitizado}.xlsx" # 3. Adiciona a extensão limpa
    else: # pdf
        file_stream = create_pdf_report(report_list)
        media_type = "application/pdf"
        filename = f"{nome_sanitizado}.pdf" # 3. Adiciona a extensão limpa

    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Access-Control-Expose-Headers': 'Content-Disposition'
    }
    
    return StreamingResponse(file_stream, media_type=media_type, headers=headers)



@router.post("/adicionar_documento_agendamento")
async def add_documento_agendamento(id_agendamento: str = Form(...),
                                    file: UploadFile = File(...),
                                    session: Session = Depends(get_db),
                                    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agendamento = session.query(models.Agenda).filter(models.Agenda.id == agendamento_id).first()
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    config = session.query(models.Configuracao).first()
    qtd_documentos = session.query(models.DocumentoAgenda).filter(models.DocumentoAgenda.agenda_id == agendamento.id).count()
    if qtd_documentos >= config.max_arquivos:
         raise HTTPException(status_code=400, detail="Limite de documentos atingido")
    
    nome, extensao = os.path.splitext(file.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}-CODIGO-{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".png", ".jpeg", ".pdf", ".docx"]:
            raise HTTPException(status_code=400, detail="Tipo de imagem não aceita")
    
    try:
        conteudo = await file.read()
        MAX_MB = 100

        if len(conteudo) > MAX_MB * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Imagem ultrapassa o tamanho máximo: 100mb")
        
        res = supabase.storage.from_("documentos").upload(nome_arquivo, 
                                                          conteudo,
                                                          {"content-type": file.content_type})
        if getattr(res, "error", None):
                logger.error(f"Erro no Supabase: {res.error}")
                raise HTTPException(status_code=400, detail="Erro ao enviar documento para o servidor")
        new = models.DocumentoAgenda(file_path=nome_arquivo, 
                                     agenda_id=agendamento.id,
                                     grupo_id=current_user.id)
        session.add(new)
        session.commit()
        return
    except Exception as e:
         logger.error(f"Erro ao adicionar imagem: {e}")
         session.rollback()
         raise HTTPException(status_code=500, detail="Erro no servidor ao adicionar imagem")
    
@router.get("/listar_documentos_agenda/{id_agendamento}")
async def listar_documentos_agenda(id_agendamento: str, 
                                   session: Session = Depends(get_db),
                                    current_user: models.Usuario = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        agendamento_id = UUID(id_agendamento)
    except:
         raise HTTPException(status_code=400, detail="ID inválido")
    
    agendamento = (session.query(models.Agenda)
                   .options(joinedload(models.Agenda.documentos))
                   .filter(models.Agenda.id == agendamento_id).first())
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    docs = sorted(agendamento.documentos, key=lambda d: d.created_at, reverse=True)

    
    return {
        "documentos":[{
             "id": documento.id,
             "nome": documento.file_path,
             "link": gerar_url_assinada(bucket="documentos", 
                                        file_path=documento.file_path)
        }for documento in docs]
    }


@router.delete("/deletar_documento/{id_documento}")
async def deletar_documento(id_documento: str, 
                            session: Session = Depends(get_db),
                            current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
     
    try:
        documento_id = UUID(id_documento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    documento = session.query(models.DocumentoAgenda).filter(models.DocumentoAgenda.id == documento_id).first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    
    if not documento.grupo_id or documento.grupo_id != current_user.id:
        raise HTTPException(status_code=403, detail="Usuário não autorizado")
    
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


@router.get("/status_info_mensal/{mes}/{ano}")
async def status_info_mensal(mes: int, ano: int,
                            session: Session = Depends(get_db),
                            current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    
    info = (session.query(models.InfoMensal)
            .options(joinedload(models.InfoMensal.messages),
                     joinedload(models.InfoMensal.documentos))
            .filter(models.InfoMensal.grupo_id == current_user.id, 
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


@router.post("/adicionar_documento_info")
async def add_doc_info(id_info: str = Form(...),
                        file: UploadFile = File(...),
                        session: Session = Depends(get_db),
                        current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        info_id = UUID(id_info)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    info = session.query(models.InfoMensal).filter(models.InfoMensal.grupo_id == current_user.id, models.InfoMensal.id == info_id).first()
    if not info:
        raise HTTPException(status_code=404, detail="Info não encontrada")
    
    config = session.query(models.Configuracao).first()
    docs = session.query(models.DocumentosInfoMensal).filter(models.DocumentosInfoMensal.info_id == info.id).count()
    if docs >= config.max_arquivos:
        raise HTTPException(status_code=400, detail="Limite de documentos excedido")
    
    nome, extensao = os.path.splitext(file.filename)
    nome = sanitize_filename(nome)
    nome_arquivo = f"{nome}-CODIGO-{uuid.uuid4()}{extensao}"

    if not extensao.lower() in [".jpg", ".png", ".jpeg", ".pdf", ".docx"]:
            raise HTTPException(status_code=400, detail="Tipo de imagem não aceita")
    
    try:
        conteudo = await file.read()
        MAX_MB = 100

        if len(conteudo) > MAX_MB * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Imagem ultrapassa o tamanho máximo: 100mb")
        
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
    

@router.delete("/deletar_imagem_info/{id_doc}")
async def deletar_imagem_info(id_doc: str, 
                            session: Session = Depends(get_db),
                            current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        doc_id = UUID(id_doc)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    doc = (session.query(models.DocumentosInfoMensal)
           .join(models.DocumentosInfoMensal.info_mensal)
           .filter(models.DocumentosInfoMensal.id == doc_id,
                   models.InfoMensal.grupo_id == current_user.id)
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
    
@router.post("/enviar_mensagem_info/{id_info}")
async def enviar_mensagem_info(id_info: str, mensagem: str,
                            session: Session = Depends(get_db),
                            current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        info_id = UUID(id_info)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    info = session.query(models.InfoMensal).filter(models.InfoMensal.id == info_id,
                                                   models.InfoMensal.grupo_id == current_user.id).first()
    if not info:
        raise HTTPException(status_code=404, detail="Info não encontrada")
    
    new = models.MensagemInfoMensal(info_id=info.id, conteudo=mensagem, remetente="imobiliaria")
    try:
        session.add(new)
        session.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao enviar mensagem")
    
@router.put("/aceitar_recusar_info/{id_info}")
async def aceitar_recusar_info(
    id_info: str, 
    aceito: bool,
    session: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)
):
    try:
        info_id = UUID(id_info)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    info = (
        session.query(models.InfoMensal)
        .filter(models.InfoMensal.id == info_id,
                models.InfoMensal.grupo_id == current_user.id)
        .first()
    )

    if not info:
        raise HTTPException(status_code=404, detail="Info não encontrada")
    
    if info.accepted == True:
        raise HTTPException(status_code=400, detail="Info já foi aceita")
    
    if aceito:
        dados = get_report_data(mes=info.month, ano=info.year, db=session, current_user=current_user)
        total = dados["resumo_geral"].get("valor_total_grupo", 0)
        info.accepted = True
        info.total = total
    else:
        info.accepted = False
    
    try:
        session.commit()
        return {"status": "ok", "accepted": info.accepted, "total": info.total}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao atualizar status")
    
@router.post("/adicionar_comentario_mural/{id_agenda}")
async def adc_comentario_mural( id_agenda: str, comentario: str,
                                session: Session = Depends(get_db),
                                current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        agenda_id = UUID(id_agenda)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = (session.query(models.Agenda)
              .filter(models.Agenda.id == agenda_id).first())
    if not agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    new = models.ComentarioVistoria(agenda_id=agenda.id, conteudo=comentario, remetente="imobiliaria")
    try:
        session.add(new)
        session.commit()
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erro ao adicionar comentário")
    

@router.get("/ver_comentarios/{id_agendamento}")
async def ver_comentarios(  id_agendamento: str,
                            session: Session = Depends(get_db),
                            current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        agenda_id = UUID(id_agendamento)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    agenda = (session.query(models.Agenda)
              .options(joinedload(models.Agenda.comentarios))
              .filter(models.Agenda.id == agenda_id).first())
    if not agenda:
        raise HTTPException(status_code=404, detail="Agenda não encontrada")
    
    comentarios = sorted(agenda.comentarios, key=lambda d: d.created_at, reverse=False)

    return {
        "comentarios":[{
            "id": c.id,
            "conteudo": c.conteudo,
            "remetente": c.remetente,
            "created_at": c.created_at,
        } for c in comentarios]
    }

@router.get("/agenda/{id_agenda}/laudo")
async def ver_status_laudo(id_agenda: str,
                           session: Session = Depends(get_db),
                           user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    
    try:
        agenda_id = UUID(id_agenda)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .filter(models.Laudo.agenda_id == agenda_id,
                     models.Laudo.imobiliaria_id.in_(get_imobiliaria_ids_from_group(user)))
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Nenhum laudo encontrado")
    
    return {
        "id": laudo.id,
        "finalizado": laudo.finalizado,
        "aprovado": laudo.aprovado
    }

@router.get("/laudo/{id_laudo}")
async def ver_laudo(id_laudo: str,
                    session: Session = Depends(get_db),
                    user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        laudo_id = UUID(id_laudo)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    laudo = (session.query(models.Laudo)
             .options(joinedload(models.Laudo.categorias))
             .filter(models.Laudo.id == laudo_id,
                     models.Laudo.imobiliaria_id.in_(get_imobiliaria_ids_from_group(user)))
             .first())
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    if laudo.aprovado != True:
        raise HTTPException(status_code=400, detail="Aguarde a aprovação do laudo")
    
    categorias = sorted(laudo.categorias, key=lambda d: d.created_at, reverse=False)

    return {
        "id": laudo.id,
        "finalizado": laudo.finalizado,
        "aprovado": laudo.aprovado,
        "codigo_imovel": laudo.imovel.cod_imovel,
        "endereco": laudo.imovel.endereco,
        "data_agendada": laudo.agenda.data,
        "documento": gerar_url_assinada(bucket="documentos", file_path=laudo.file_path),
        "categorias": [{
            "id": c.id,
            "titulo": c.titulo
        }for c in categorias]
    }

@router.get("/categoria/{id_categoria}")
async def ver_categoria(id_categoria: str,
                    session: Session = Depends(get_db),
                    user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)):
    try:
        categoria_id = UUID(id_categoria)
    except:
        raise HTTPException(status_code=400, detail="ID inválido")
    
    categoria = (session.query(models.CategoriaLaudo)
                 .join(models.CategoriaLaudo.laudo)
                 .options(joinedload(models.CategoriaLaudo.imagens),
                          joinedload(models.CategoriaLaudo.itens))
                 .filter(models.CategoriaLaudo.id == categoria_id,
                         models.Laudo.imobiliaria_id.in_(get_imobiliaria_ids_from_group(user)))
                 .first())
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    if categoria.laudo.aprovado != True:
        raise HTTPException(status_code=400, detail="Aguarde a aprovação do laudo")
    
    itens = sorted(categoria.itens, key=lambda d: d.created_at, reverse=False)
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


@router.get("/laudos", response_model=LaudoAprovadoResponse)
async def listar_laudos_aprovados(
    search: Optional[str] = Query(None, description="Buscar por código do imóvel ou endereço"),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    session: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)
):
    """
    Lista os laudos aprovados para as imobiliárias do grupo,
    com suporte para pesquisa e paginação.
    """
    # 1. Obter IDs das imobiliárias do grupo
    imobiliaria_ids = get_imobiliaria_ids_from_group(current_user)

    # 2. Construir a query base com as regras de segurança
    base_query = (
        session.query(models.Laudo)
        .join(models.Imovel, models.Laudo.imovel_id == models.Imovel.id)
        .options(joinedload(models.Laudo.imovel)) # Carrega dados do imóvel
        .filter(
            models.Laudo.aprovado == True, # Regra 1: Somente aprovados
            models.Laudo.imobiliaria_id.in_(imobiliaria_ids) # Regra 2: Somente do grupo
        )
    )

    # 3. Aplicar filtro de pesquisa, se houver
    if search:
        search_term = f"%{search}%"
        base_query = base_query.filter(
            or_(
                models.Imovel.cod_imovel.ilike(search_term),
                models.Imovel.endereco.ilike(search_term)
            )
        )

    # 4. Obter o total de registros (para paginação)
    # Usamos uma subquery para eficiência
    total = base_query.with_entities(func.count(models.Laudo.id)).scalar()

    # 5. Obter os laudos paginados e ordenados
    laudos = (
        base_query
        .order_by(models.Laudo.created_at.desc()) # Ordenação decrescente
        .offset(skip)
        .limit(limit)
        .all()
    )

    # 6. Formatar a resposta
    # O Pydantic (com Config.from_attributes) pode fazer isso automaticamente
    # se o response_model estiver bem definido e os laudos tiverem o .imovel carregado.
    
    # Mapeamento manual para garantir que o schema seja satisfeito
    # (Embora `LaudoAprovadoItem.from_orm(laudo)` devesse funcionar,
    # precisamos acessar laudo.imovel.*)
    
    qtd_nc = qtd_nao_conformidades_por_laudo(session, [laudo.id for laudo in laudos])

    response_items = []
    for laudo in laudos:
        if laudo.imovel: # Garante que o imóvel foi carregado
            response_items.append(
                LaudoAprovadoItem(
                    id=laudo.id,
                    created_at=laudo.created_at,
                    cod_imovel=laudo.imovel.cod_imovel,
                    endereco=laudo.imovel.endereco,
                    aprovado=laudo.aprovado,
                    file_path=laudo.file_path,
                    qtd_nao_conformidades=qtd_nc.get(laudo.id)
                )
            )

    return LaudoAprovadoResponse(laudos=response_items, total=total)


@router.get("/imoveis", response_model=List[schemas.ImovelDisplay])
def search_imoveis(
    search: str = "",
    db: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)
):
    """Busca imóveis pertencentes ao grupo por código ou endereço."""
    if len(search) < 3:
        return []
    
    # Filtra apenas imóveis das imobiliárias deste grupo
    imob_ids = [i.id for i in current_user.imobiliarias]
    
    if not imob_ids:
        return []

    return db.query(models.Imovel).filter(
        models.Imovel.imobiliaria_id.in_(imob_ids),
        or_(models.Imovel.cod_imovel.ilike(f"%{search}%"), models.Imovel.endereco.ilike(f"%{search}%")),
        models.Imovel.is_deleted == False
    ).limit(20).all()

@router.get("/sub-imobiliarias", response_model=List[schemas.ImobiliariaDisplay])
def get_sub_imobiliarias(
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)
):
    """Retorna a lista de imobiliárias vinculadas ao grupo logado."""
    return current_user.imobiliarias

@router.get("/clientes", response_model=List[schemas.ClienteDisplay])
def search_clientes(
    search: str = "",
    db: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group)
):
    """Busca clientes por nome ou email (para autocomplete)."""
    if len(search) < 3:
        return []
    
    # Busca global de clientes ativos para facilitar o vínculo
    return db.query(models.Cliente).filter(
        or_(models.Cliente.nome.ilike(f"%{search}%"), models.Cliente.email.ilike(f"%{search}%")),
        models.Cliente.is_deleted == False
    ).limit(10).all()


# =================================================================
# --- Gestão de Clientes do Grupo (edição multi-tenant) ---
# =================================================================

def _query_clientes_do_grupo(db: Session, grupo_id):
    """
    Query base dos clientes que pertencem ao grupo logado.

    Um cliente pertence ao grupo quando possui ao menos um imóvel (não deletado)
    em uma imobiliária do grupo. Mesmo padrão de isolamento usado em
    agendamento_externo_routes.get_clientes_agendamento.
    """
    return (
        db.query(models.Cliente)
        .join(models.Imovel, models.Imovel.cliente_id == models.Cliente.id)
        .join(models.Imobiliaria, models.Imovel.imobiliaria_id == models.Imobiliaria.id)
        .filter(
            models.Cliente.is_deleted == False,
            models.Imovel.is_deleted == False,
            models.Imobiliaria.grupo_id == grupo_id,
        )
        .distinct()
    )


@router.put("/clientes/{cliente_id}", response_model=schemas.ClienteDisplay)
def atualizar_cliente(
    cliente_id: str,
    dados: schemas.ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: models.GrupoImobiliaria = Depends(auth.get_current_active_imobiliaria_group),
):
    """
    Atualiza os dados de contato (nome, e-mail, telefone) de um cliente do grupo.

    O grupo só pode editar clientes que lhe pertencem (regra multi-tenant). Caso o
    cliente não exista ou não pertença ao grupo, responde 404 para não vazar a
    existência de clientes de outros tenants.
    """
    try:
        cliente_uuid = UUID(cliente_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID inválido")

    # Garante o isolamento: busca o cliente já restrito aos clientes do grupo.
    cliente = (
        _query_clientes_do_grupo(db, current_user.id)
        .filter(models.Cliente.id == cliente_uuid)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")

    # Impede colisão de e-mail com outro cliente ativo.
    if dados.email != cliente.email:
        email_em_uso = (
            db.query(models.Cliente)
            .filter(
                models.Cliente.email == dados.email,
                models.Cliente.id != cliente.id,
                models.Cliente.is_deleted == False,
            )
            .first()
        )
        if email_em_uso:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Já existe um cliente com o e-mail {dados.email}.",
            )

    cliente.nome = dados.nome
    cliente.email = dados.email
    cliente.telefone1 = dados.telefone1
    cliente.telefone2 = dados.telefone2

    try:
        db.commit()
        db.refresh(cliente)
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao atualizar cliente {cliente_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar cliente")

    return cliente