from fastapi import APIRouter, Depends, Query, HTTPException, status, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, case
from typing import List, Optional
from datetime import date, timedelta, datetime
from dateutil.relativedelta import relativedelta
import io

# Imports para geração de relatórios
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import uuid, os, logging
from ..supabase_client import supabase, gerar_url_assinada, deletar_arquivo_supabase
from uuid import UUID

from .. import models, schemas, auth
from ..config import get_db
import unicodedata, re

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/imobiliaria",
    tags=["Painel da Imobiliária"],
    dependencies=[Depends(auth.get_current_active_imobiliaria_group)]
)

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
        models.Agenda.imovel_id != None
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
    imobiliaria_ids = get_imobiliaria_ids_from_group(current_user)
    today = date.today()
    start_current_30d = today - timedelta(days=29)
    start_previous_30d = start_current_30d - timedelta(days=30)
    end_previous_30d = start_current_30d - timedelta(days=1)
    
    def get_stats_for_period(start, end):
        vistorias = db.query(func.count(models.Agenda.id)).join(models.Imovel).filter(models.Imovel.imobiliaria_id.in_(imobiliaria_ids), models.Agenda.data.between(start, end), models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])).scalar() or 0
        improdutivas = db.query(func.count(models.VistoriaImprodutiva.id)).filter(models.VistoriaImprodutiva.imobiliaria_id.in_(imobiliaria_ids), models.VistoriaImprodutiva.data_vistoria_original.between(start, end)).scalar() or 0
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

def create_excel_report(report_data: List[schemas.RelatorioMensal]):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Relatório Mensal"

    title_font = Font(name='Calibri', size=16, bold=True, color="FFFFFF")
    header_font = Font(name='Calibri', size=12, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
    total_font = Font(name='Calibri', size=12, bold=True)
    currency_format = "R$ #,##0.00"
    
    row_cursor = 1
    for report in report_data:
        ws.merge_cells(start_row=row_cursor, start_column=1, end_row=row_cursor, end_column=7)
        title_cell = ws.cell(row=row_cursor, column=1, value=f"Relatório de Vistorias - {report.imobiliaria_nome} ({report.mes_ano})")
        title_cell.font = title_font
        title_cell.fill = header_fill
        title_cell.alignment = Alignment(horizontal='center')
        row_cursor += 2

        ws.cell(row=row_cursor, column=1, value="Vistorias Agendadas").font = header_font
        row_cursor += 1
        headers_agendadas = ["Data", "Cód. Imóvel", "Endereço", "Tamanho", "Mobília", "Tipo Vistoria", "Valor"]
        for col, header in enumerate(headers_agendadas, 1):
            ws.cell(row=row_cursor, column=col, value=header).font = header_font
        
        for vistoria in report.vistorias_agendadas:
            row_cursor += 1
            ws.cell(row=row_cursor, column=1, value=vistoria.data.strftime("%d/%m/%Y"))
            ws.cell(row=row_cursor, column=2, value=vistoria.cod_imovel)
            ws.cell(row=row_cursor, column=3, value=vistoria.endereco)
            ws.cell(row=row_cursor, column=4, value=f"{vistoria.tamanho} m²")
            ws.cell(row=row_cursor, column=5, value=vistoria.mobiliado.replace('_', ' ').title())
            ws.cell(row=row_cursor, column=6, value=vistoria.tipo)
            ws.cell(row=row_cursor, column=7, value=vistoria.valor).number_format = currency_format
        row_cursor += 2

        ws.cell(row=row_cursor, column=1, value="Vistorias Improdutivas").font = header_font
        row_cursor += 1
        headers_improdutivas = ["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"]
        for col, header in enumerate(headers_improdutivas, 1):
            ws.cell(row=row_cursor, column=col, value=header).font = header_font
        
        for vistoria in report.vistorias_improdutivas:
            row_cursor += 1
            ws.cell(row=row_cursor, column=1, value=vistoria.data_vistoria_original.strftime("%d/%m/%Y"))
            ws.cell(row=row_cursor, column=2, value=vistoria.cod_imovel)
            ws.cell(row=row_cursor, column=3, value=vistoria.motivo_improdutividade)
            ws.cell(row=row_cursor, column=4, value=vistoria.valor_cobranca).number_format = currency_format
        row_cursor += 2
        
        ws.cell(row=row_cursor, column=6, value="Total Vistorias:").font = total_font
        ws.cell(row=row_cursor, column=7, value=report.valor_vistorias).number_format = currency_format
        row_cursor += 1
        ws.cell(row=row_cursor, column=6, value="Total Improdutivas:").font = total_font
        ws.cell(row=row_cursor, column=7, value=report.valor_improdutivas).number_format = currency_format
        row_cursor += 1
        ws.cell(row=row_cursor, column=6, value="TOTAL GERAL:").font = total_font
        ws.cell(row=row_cursor, column=7, value=report.valor_total).number_format = currency_format
        row_cursor += 3

    for col_letter in ['A', 'B', 'D', 'E', 'F', 'G']: ws.column_dimensions[col_letter].width = 15
    ws.column_dimensions['C'].width = 40
    
    virtual_workbook = io.BytesIO()
    wb.save(virtual_workbook)
    virtual_workbook.seek(0)
    return virtual_workbook

def create_pdf_report(report_data: List[schemas.RelatorioMensal]):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter))
    styles = getSampleStyleSheet()
    elements = []

    for report in report_data:
        elements.append(Paragraph(f"Relatório de Vistorias - {report.imobiliaria_nome} ({report.mes_ano})", styles['h1']))
        elements.append(Spacer(1, 12))

        elements.append(Paragraph("Vistorias Agendadas", styles['h2']))
        agendadas_data = [["Data", "Cód.", "Endereço", "Tam.", "Mobília", "Tipo", "Valor"]]
        for v in report.vistorias_agendadas:
            agendadas_data.append([v.data.strftime("%d/%m/%Y"), v.cod_imovel, Paragraph(v.endereco, styles['Normal']), f"{v.tamanho} m²", v.mobiliado.replace('_', ' '), v.tipo, f"R$ {v.valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")])
        
        table_agendadas = Table(agendadas_data, colWidths=[55, 50, 250, 50, 80, 80, 70])
        table_agendadas.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#3B82F6")),
            ('TEXTCOLOR',(0,0),(-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 12),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#F3F4F6")),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table_agendadas)
        elements.append(Spacer(1, 24))

        elements.append(Paragraph("Vistorias Improdutivas", styles['h2']))
        improdutivas_data = [["Data", "Cód. Imóvel", "Motivo", "Valor Cobrado"]]
        for v in report.vistorias_improdutivas:
            improdutivas_data.append([v.data_vistoria_original.strftime("%d/%m/%Y"), v.cod_imovel, Paragraph(v.motivo_improdutividade, styles['Normal']), f"R$ {v.valor_cobranca:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")])
        
        table_improdutivas = Table(improdutivas_data, colWidths=[80, 80, 450, 100])
        table_improdutivas.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#3B82F6")),
            ('TEXTCOLOR',(0,0),(-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 12),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#F3F4F6")),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table_improdutivas)
        elements.append(Spacer(1, 24))

        total_data = [
            ["Total Vistorias:", f"R$ {report.valor_vistorias:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")],
            ["Total Improdutivas:", f"R$ {report.valor_improdutivas:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")],
            ["TOTAL GERAL:", f"R$ {report.valor_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")]
        ]
        table_total = Table(total_data, colWidths=[120, 100])
        table_total.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
            ('FONTNAME', (0,2), (1,2), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,2), (1,2), colors.red),
        ]))
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
    report_data = get_report_data(mes, ano, db, current_user)
    if not report_data:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado para gerar o relatório.")

    nome_user = current_user.nome.strip()
    filename = f"relatorio_{nome_user.replace(' ', '_')}_{mes}_{ano}"
    
    if formato == "excel":
        file_stream = create_excel_report(report_data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename += ".xlsx"
    else: # pdf
        file_stream = create_pdf_report(report_data)
        media_type = "application/pdf"
        filename += ".pdf"

    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
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

