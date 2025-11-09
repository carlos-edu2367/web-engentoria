import io
import requests
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session, joinedload

# --- Importações do ReportLab (Gerador de PDF) ---
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.colors import Color, HexColor # Adicionando HexColor

from .. import models
from ..supabase_client import gerar_url_assinada
from ..config import get_db




router = APIRouter()

# Texto padrão para as informações gerais
TEXTO_INFORMACOES_GERAIS = """
O imóvel é vistoriado por completo tanto as áreas internas como externas. A vistoria, nas áreas internas são feitas por dependências. Em cada dependência são analisados os seguintes itens.
<br/><br/>
2. Piso – Conservação, manchas, rachaduras (Peças quebradas ou faltando no caso de cerâmicas, tacos, ou revestimentos semelhantes).
<br/>
3. Parede - Conservação, pintura, trincas, infiltrações, furos (peças quebradas ou faltando no caso de azulejos ou revestimentos semelhantes).
<br/>
4. Teto – Conservação, pintura, trincas, infiltrações, furos e outros.
<br/>
5. Porta e portal – Estado geral, funcionamento, fechaduras e outros.
<br/>
6. Janela – Conservação, pintura, vidros, grades, funcionamento.
<br/>
7. Interruptor/ tomada / luminária – Funcionamento, conservação, marca e outros.
<br/>
8. Louça/Metais/etc – Conservação de pias, lavatórios, bacias sanitárias, torneiras e outros.
"""

def _draw_footer(canvas, doc):
    """
    Função interna para desenhar o rodapé (MODERNIZADO) em cada página.
    """
    canvas.saveState()
    
    # --- Cor Principal ---
    ENGENTORIA_GREEN = HexColor("#059669")
    
    # --- Linha verde no topo do rodapé ---
    canvas.setStrokeColor(ENGENTORIA_GREEN)
    canvas.setLineWidth(0.5)
    line_y = doc.bottomMargin
    canvas.line(doc.leftMargin, line_y, doc.width + doc.leftMargin, line_y)

    # Estilos de fonte
    canvas.setFont('Helvetica', 9)
    
    # Define o local
    local = "Goiânia"
    
    # Formata a data
    try:
        data_atual = datetime.now().strftime(f"{local}, %-d de %B de %Y.")
    except ValueError:
        # Fallback para Windows
        data_atual = datetime.now().strftime(f"{local}, %d de %B de %Y.")
        
    generated_by = "Este laudo foi gerado pelo aplicativo Engentoria."
    
    # Coordenadas do rodapé (a partir da borda inferior esquerda)
    text_y = doc.bottomMargin - 0.5 * cm
    
    # Data à esquerda (em cinza)
    canvas.setFillColor(colors.grey)
    canvas.drawString(doc.leftMargin, text_y, data_atual)
    
    # "Gerado por" à direita (em verde)
    canvas.setFillColor(ENGENTORIA_GREEN)
    canvas.drawRightString(doc.width + doc.leftMargin, text_y, generated_by)
    
    canvas.restoreState()


def gerar_pdf_laudo(laudo: models.Laudo, nome_cliente: str) -> io.BytesIO:
    """
    Gera o arquivo PDF em memória com base nos dados do laudo.
    (Versão com Estilo Moderno/Verde)
    """
    buffer = io.BytesIO()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=2*cm,
        bottomMargin=2*cm # Aumentado para dar espaço ao novo rodapé
    )
    
    # --- Cores da Identidade Visual ---
    ENGENTORIA_GREEN = HexColor("#059669") # Verde principal (escuro, profissional)
    DARK_TEXT = HexColor("#262626")      # Texto principal (quase preto)
    GREY_TEXT = HexColor("#525252")       # Texto secundário (cinza escuro)
    BORDER_COLOR = HexColor("#E5E5E5")    # Cor da borda
    
    # --- Estilos de Parágrafo ---
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='LaudoTitle',
        fontName='Helvetica-Bold', # Fonte em negrito
        fontSize=20,
        alignment=TA_CENTER,
        spaceAfter=0.5*cm,
        textColor=ENGENTORIA_GREEN # Cor verde
    ))
    
    # Novo estilo para o subtítulo (descrição do laudo)
    styles.add(ParagraphStyle(
        name='LaudoSubtitle',
        fontName='Helvetica',
        fontSize=12,
        alignment=TA_CENTER,
        spaceAfter=1*cm,
        textColor=GREY_TEXT
    ))

    styles.add(ParagraphStyle(
        name='HeaderInfo',
        fontName='Helvetica',
        fontSize=10,
        alignment=TA_LEFT,
        spaceAfter=3,
        leading=14,
        textColor=DARK_TEXT
    ))

    styles.add(ParagraphStyle(
        name='LaudoHeading1',
        fontName='Helvetica-Bold', # Negrito
        fontSize=14,
        spaceBefore=1*cm,      # Mais espaço antes
        spaceAfter=0.5*cm,     # Espaço depois
        textColor=ENGENTORIA_GREEN, # Cor verde
        borderBottomWidth=1,         # Linha inferior
        borderBottomColor=ENGENTORIA_GREEN, # Cor da linha
        paddingBottom=3              # Espaço entre texto e linha
    ))

    styles.add(ParagraphStyle(
        name='LaudoHeading2',
        fontName='Helvetica-Bold', # Negrito
        fontSize=12,
        spaceBefore=0.8*cm,
        spaceAfter=0.5*cm,
        textColor=DARK_TEXT,       # Cor escura
        borderBottomWidth=0.5,
        borderBottomColor=BORDER_COLOR, # Borda cinza sutil
        paddingBottom=2
    ))

    styles.add(ParagraphStyle(
        name='LaudoHeading3',
        fontName='Helvetica-Bold', # Negrito
        fontSize=10,
        spaceBefore=6,
        spaceAfter=4,
        textColor=GREY_TEXT # Cinza
    ))

    styles.add(ParagraphStyle(
        name='Body',
        fontName='Helvetica',
        fontSize=10,
        alignment=TA_LEFT,
        leading=14, # Espaçamento entre linhas
        textColor=DARK_TEXT
    ))

    styles.add(ParagraphStyle(
        name='ListItem',
        fontName='Helvetica',
        fontSize=10,
        alignment=TA_LEFT,
        leading=14,
        leftIndent=0.5*cm,
        spaceAfter=4, # Mais espaço entre itens
        textColor=DARK_TEXT,
        bulletIndent=0,
        bulletFontName='Helvetica',
        bulletText='•' # Define o bullet explicitamente
    ))

    # --- Conteúdo do PDF ---
    story = []

    # --- Título ---
    story.append(Paragraph("LAUDO DE VISTORIA TÉCNICA", styles['LaudoTitle']))
    # Adiciona subtítulo
    story.append(Paragraph(f"Vistoria de {laudo.agenda.tipo} do Imóvel Cód. {laudo.imovel.cod_imovel}", styles['LaudoSubtitle']))

    # --- Cabeçalho de Informações (com Tabela para Alinhamento) ---
    data_agenda_formatada = laudo.agenda.data.strftime('%d/%m/%Y')
    
    # Dados em pares (label, valor)
    header_data = [
        [Paragraph("<b>Cliente:</b>", styles['HeaderInfo']), Paragraph(nome_cliente, styles['HeaderInfo'])],
        [Paragraph("<b>Endereço:</b>", styles['HeaderInfo']), Paragraph(laudo.imovel.endereco, styles['HeaderInfo'])],
        [Paragraph("<b>Imobiliária:</b>", styles['HeaderInfo']), Paragraph(laudo.imobiliaria.nome, styles['HeaderInfo'])],
        [Paragraph("<b>Data Vistoria:</b>", styles['HeaderInfo']), Paragraph(data_agenda_formatada, styles['HeaderInfo'])],
        [Paragraph("<b>Vistoriador:</b>", styles['HeaderInfo']), Paragraph(laudo.vistoriador.nome, styles['HeaderInfo'])],
    ]
    
    # Criar a tabela de cabeçalho
    header_table = Table(header_data, colWidths=[3*cm, 13*cm]) # 3cm para label, 13cm para valor
    
    # Estilo da tabela (sem bordas, alinhado)
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2), # Espaço entre linhas da tabela
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    
    story.append(header_table)

    # --- Informações Gerais ---
    story.append(Paragraph("1. INFORMAÇÕES GERAIS", styles['LaudoHeading1']))
    story.append(Paragraph(TEXTO_INFORMACOES_GERAIS, styles['Body']))
    
    # --- Itens Vistoriados ---
    story.append(Paragraph("2. ITENS VISTORIADOS", styles['LaudoHeading1']))
    
    # Ordena as categorias
    categorias_sorted = sorted(laudo.categorias, key=lambda d: d.created_at, reverse=False)

    for categoria in categorias_sorted:
        story.append(Paragraph(categoria.titulo, styles['LaudoHeading2']))

        # Ordena os itens
        itens_sorted = sorted(categoria.itens, key=lambda d: d.created_at, reverse=False)
        
        if not itens_sorted:
            story.append(Paragraph("<i>(Nenhum item cadastrado para esta categoria)</i>", styles['ListItem']))
        else:
            for item in itens_sorted:
                story.append(Paragraph(item.descricao, styles['ListItem']))
        
        story.append(Spacer(1, 0.5*cm))

        # --- Adiciona as fotos (Layout em 2 Colunas) ---
        if categoria.imagens:
            story.append(Paragraph("Fotos da Categoria:", styles['LaudoHeading3']))
            story.append(Spacer(1, 0.2*cm))
            
            image_list = []
            for imagem in categoria.imagens:
                # Gerar a URL assinada
                url = gerar_url_assinada(bucket="imagens", file_path=imagem.file_path)
                
                try:
                    # Baixar a imagem
                    response = requests.get(url, timeout=10)
                    response.raise_for_status() # Lança erro se a requisição falhar
                    
                    img_data = io.BytesIO(response.content)
                    
                    # Adiciona a imagem, com 8.5cm (para caber 2 por linha)
                    img = Image(img_data, width=8.5*cm, height=6*cm, kind='proportional')
                    image_list.append(img)
                
                except requests.exceptions.RequestException as e:
                    print(f"Erro ao baixar imagem {url}: {e}")
                    image_list.append(Paragraph(f"[Erro ao carregar imagem: {imagem.file_path}]", styles['Body']))
            
            # Montar a tabela 2xN
            if image_list:
                # Agrupa imagens em pares
                paired_images = [image_list[i:i + 2] for i in range(0, len(image_list), 2)]
                
                # Garante que a última linha tenha 2 elementos
                if paired_images and len(paired_images[-1]) == 1:
                    paired_images[-1].append(Spacer(0,0)) # Adiciona um spacer vazio

                image_table = Table(paired_images, colWidths=[9*cm, 9*cm]) # 9cm por coluna
                image_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (0, -1), 0),
                    ('RIGHTPADDING', (0, 0), (0, -1), 0.5*cm), # Espaço entre colunas
                    ('LEFTPADDING', (1, 0), (1, -1), 0.5*cm),
                    ('RIGHTPADDING', (1, 0), (1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0.5*cm), # Espaço entre linhas de imagem
                ]))
                story.append(image_table)
                story.append(Spacer(1, 0.5*cm))
        
        story.append(PageBreak()) # Quebra de página após cada categoria

    # --- Constrói o PDF ---
    # Ajusta o locale para português para o nome do mês
    try:
        import locale
        # Tenta setar o locale para Português do Brasil
        locale.setlocale(locale.LC_TIME, 'pt_BR.UTF-8')
    except locale.Error:
        print("Locale 'pt_BR.UTF-8' não encontrado. Usando locale padrão.")
        try:
            locale.setlocale(locale.LC_TIME, 'Portuguese_Brazil.1252') # Windows
        except locale.Error:
             print("Locale 'Portuguese_Brazil.1252' (Windows) não encontrado. O mês pode ficar em inglês.")
    
    # Usa a função de rodapé
    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)

    buffer.seek(0)
    return buffer


@router.get("/laudo/{id_laudo}/pdf")
async def gerar_laudo_pdf(
    id_laudo: str,
    nome_cliente: str = Query(..., description="Nome do cliente para constar no laudo"),
    session: Session = Depends(get_db)
):
    """
    Gera e retorna o laudo de vistoria completo em formato PDF.
    Esta é uma rota pública e não requer autenticação.
    """
    try:
        laudo_id = UUID(id_laudo)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID do laudo inválido")

    # Esta query é crucial. Ela deve carregar TUDO que o PDF precisa
    # de uma só vez para evitar queries N+1.
    laudo = (session.query(models.Laudo)
             .options(
                 # Carrega relacionamentos diretos do Laudo
                 joinedload(models.Laudo.imovel),
                 joinedload(models.Laudo.agenda),
                 joinedload(models.Laudo.vistoriador),
                 joinedload(models.Laudo.imobiliaria),
                 
                 # Carrega as categorias...
                 joinedload(models.Laudo.categorias)
                    # ...e para cada categoria, carrega seus itens
                    .subqueryload(models.CategoriaLaudo.itens),
                 
                 # Carrega as categorias novamente (necessário para outro subload)...
                 joinedload(models.Laudo.categorias)
                    # ...e para cada categoria, carrega suas imagens
                    .subqueryload(models.CategoriaLaudo.imagens)
             )
             .filter(models.Laudo.id == laudo_id)
             .first())

    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado") # Corrigido 44 para 404

    # A geração do PDF (com download de imagens) é uma operação de I/O
    # que pode bloquear. Usamos run_in_threadpool para executá-la
    # em uma thread separada, liberando o loop de eventos principal.
    try:
        pdf_buffer = await run_in_threadpool(gerar_pdf_laudo, laudo, nome_cliente)
    except Exception as e:
        print(f"Erro ao gerar PDF: {e}")
        # Erro comum é a URL da imagem não ser acessível
        if isinstance(e, requests.exceptions.RequestException):
             raise HTTPException(status_code=500, detail=f"Erro ao buscar recurso de imagem: {e.args[0]}")
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar o PDF: {e}")

    # Define o nome do arquivo para download
    file_name = f"laudo_vistoria_{laudo.imovel.cod_imovel}_{id_laudo[:8]}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={file_name}"
        }
    )