# backend/ia/pdf_nao_conformidades.py
"""
Geração do PDF do Laudo de Não Conformidades (reportlab), no mesmo estilo
visual do laudo de vistoria (`routes/laudo_pdf_routes.py`).
Recebe um dicionário simples para não depender do banco.
"""

import io
from collections import OrderedDict
from datetime import date, datetime
from typing import List
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle

AVISO_IA = "Gerado com o auxílio de Inteligência Artificial."

ENGENTORIA_GREEN = HexColor("#059669")
DARK_TEXT = HexColor("#262626")
GREY_TEXT = HexColor("#525252")
BORDER_COLOR = HexColor("#E5E5E5")
HEADER_BG = HexColor("#ECFDF5")

CORES_GRAVIDADE = {
    "CRITICA": HexColor("#B91C1C"),
    "ALTA": HexColor("#EA580C"),
    "MEDIA": HexColor("#CA8A04"),
    "BAIXA": HexColor("#2563EB"),
}
ROTULO_GRAVIDADE = {"CRITICA": "Crítica", "ALTA": "Alta", "MEDIA": "Média", "BAIXA": "Baixa"}
ROTULO_CATEGORIA = {
    "HIDRAULICA": "Hidráulica",
    "ELETRICA": "Elétrica",
    "ESQUADRIAS": "Portas e janelas",
    "GAS": "Gás",
    "SEGURANCA_ESTRUTURA": "Segurança / estrutura",
    "EQUIPAMENTOS": "Equipamentos",
    "OUTROS": "Outros",
}

TEXTO_OBJETIVO = (
    "Este documento relaciona os itens do laudo de vistoria de entrada que apresentam "
    "problemas de funcionamento ou que podem atrapalhar o uso do imóvel pelo inquilino. "
    "Aspectos estéticos e de desgaste natural não são listados aqui e constam no laudo de entrada."
)


def _rodape(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(ENGENTORIA_GREEN)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, doc.bottomMargin, doc.width + doc.leftMargin, doc.bottomMargin)
    y = doc.bottomMargin - 0.5 * cm
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREY_TEXT)
    canvas.drawString(doc.leftMargin, y, AVISO_IA)
    canvas.setFillColor(ENGENTORIA_GREEN)
    canvas.drawRightString(doc.width + doc.leftMargin, y, f"Engentoria · Página {doc.page}")
    canvas.restoreState()


def _fmt_data(valor) -> str:
    if isinstance(valor, (date, datetime)):
        return valor.strftime("%d/%m/%Y")
    return str(valor or "-")


def _p(texto, estilo) -> Paragraph:
    return Paragraph(escape(str(texto or "")), estilo)


def _p_gravidade(gravidade: str, estilo_base: ParagraphStyle) -> Paragraph:
    """Célula com o rótulo da gravidade na cor correspondente."""
    estilo = ParagraphStyle(f"{estilo_base.name}_{gravidade}", parent=estilo_base,
                            fontName="Helvetica-Bold", textColor=CORES_GRAVIDADE.get(gravidade, DARK_TEXT))
    return _p(ROTULO_GRAVIDADE.get(gravidade, gravidade), estilo)


def gerar_pdf_nao_conformidades(dados: dict) -> io.BytesIO:
    """
    dados = {
      "codigo_imovel", "endereco", "imobiliaria", "vistoriador", "data_vistoria",
      "itens": [{"tipo", "ambiente", "item", "descricao", "categoria", "gravidade"}, ...]
    }
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1.5 * cm, leftMargin=1.5 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm,
                            title="Laudo de Não Conformidades", author="Engentoria")

    styles = getSampleStyleSheet()
    s_titulo = ParagraphStyle("NCTitulo", fontName="Helvetica-Bold", fontSize=18, alignment=TA_CENTER,
                              spaceAfter=0.3 * cm, textColor=ENGENTORIA_GREEN)
    s_sub = ParagraphStyle("NCSub", fontName="Helvetica", fontSize=11, alignment=TA_CENTER,
                           spaceAfter=0.6 * cm, textColor=GREY_TEXT)
    s_info = ParagraphStyle("NCInfo", fontName="Helvetica", fontSize=10, leading=14, textColor=DARK_TEXT)
    # keepWithNext: título nunca fica sozinho no pé da página
    s_h1 = ParagraphStyle("NCH1", fontName="Helvetica-Bold", fontSize=13, spaceBefore=0.7 * cm,
                          spaceAfter=0.3 * cm, textColor=ENGENTORIA_GREEN, keepWithNext=1)
    s_h2 = ParagraphStyle("NCH2", fontName="Helvetica-Bold", fontSize=11, spaceBefore=0.4 * cm,
                          spaceAfter=0.2 * cm, textColor=DARK_TEXT, keepWithNext=1)
    s_body = ParagraphStyle("NCBody", parent=styles["Normal"], fontName="Helvetica", fontSize=10,
                            leading=14, alignment=TA_LEFT, textColor=DARK_TEXT)
    s_cel = ParagraphStyle("NCCel", fontName="Helvetica", fontSize=9, leading=12, textColor=DARK_TEXT)
    s_cel_head = ParagraphStyle("NCCelHead", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=DARK_TEXT)
    s_aviso = ParagraphStyle("NCAviso", fontName="Helvetica-Oblique", fontSize=9, alignment=TA_CENTER,
                             textColor=GREY_TEXT, spaceBefore=0.2 * cm)

    itens: List[dict] = dados.get("itens") or []
    ncs = [i for i in itens if i.get("tipo") == "NAO_CONFORMIDADE"]
    nao_verificados = [i for i in itens if i.get("tipo") == "NAO_VERIFICADO"]

    story = [
        _p("LAUDO DE NÃO CONFORMIDADES", s_titulo),
        _p(f"Vistoria de Entrada do Imóvel Cód. {dados.get('codigo_imovel') or '-'}", s_sub),
    ]

    cabecalho = [
        [_p("Endereço:", s_cel_head), _p(dados.get("endereco"), s_info)],
        [_p("Imobiliária:", s_cel_head), _p(dados.get("imobiliaria"), s_info)],
        [_p("Data da vistoria:", s_cel_head), _p(_fmt_data(dados.get("data_vistoria")), s_info)],
        [_p("Vistoriador:", s_cel_head), _p(dados.get("vistoriador"), s_info)],
    ]
    t = Table(cabecalho, colWidths=[3.5 * cm, 14.5 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [t, _p(AVISO_IA, s_aviso)]

    story += [_p("1. OBJETIVO", s_h1), _p(TEXTO_OBJETIVO, s_body)]

    # --- Resumo ---
    story.append(_p("2. RESUMO", s_h1))
    if ncs:
        contagem = [[_p("Gravidade", s_cel_head), _p("Quantidade", s_cel_head)]]
        estilos = [
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ]
        for gravidade in ("CRITICA", "ALTA", "MEDIA", "BAIXA"):
            qtd = sum(1 for i in ncs if i.get("gravidade") == gravidade)
            contagem.append([_p_gravidade(gravidade, s_cel), _p(str(qtd), s_cel)])
        contagem.append([_p("Total", s_cel_head), _p(str(len(ncs)), s_cel_head)])
        tr = Table(contagem, colWidths=[5 * cm, 3 * cm], hAlign="LEFT")
        tr.setStyle(TableStyle(estilos))
        story.append(tr)
    else:
        story.append(_p("Nenhuma não conformidade funcional foi identificada no laudo de entrada.", s_body))

    # --- Não conformidades por ambiente ---
    if ncs:
        story.append(_p("3. NÃO CONFORMIDADES POR AMBIENTE", s_h1))
        story += _tabelas_por_ambiente(ncs, s_h2, s_cel, s_cel_head, com_gravidade=True)

    if nao_verificados:
        numero = 4 if ncs else 3
        s_intro = ParagraphStyle("NCIntro", parent=s_body, keepWithNext=1, spaceAfter=0.2 * cm)
        story.append(_p(f"{numero}. ITENS NÃO VERIFICADOS NA VISTORIA", s_h1))
        story.append(_p("Itens que não puderam ser testados no momento da vistoria (por exemplo, por falta de energia ou água).", s_intro))
        story += _tabelas_por_ambiente(nao_verificados, s_h2, s_cel, s_cel_head, com_gravidade=False)

    doc.build(story, onFirstPage=_rodape, onLaterPages=_rodape)
    buffer.seek(0)
    return buffer


def _tabelas_por_ambiente(itens, s_h2, s_cel, s_cel_head, com_gravidade: bool):
    grupos: "OrderedDict[str, list]" = OrderedDict()
    for item in itens:
        grupos.setdefault(item.get("ambiente") or "Não informado", []).append(item)

    elementos = []
    for ambiente, lista in grupos.items():
        cabecalho = [_p("Item", s_cel_head), _p("Problema", s_cel_head), _p("Categoria", s_cel_head)]
        larguras = [4.2 * cm, 11 * cm, 2.8 * cm]  # largura útil da página: 18 cm
        if com_gravidade:
            cabecalho.append(_p("Gravidade", s_cel_head))
            larguras = [3.8 * cm, 9.2 * cm, 2.8 * cm, 2.2 * cm]
        linhas = [cabecalho]
        estilos = [
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        for item in lista:
            linha = [
                _p(item.get("item"), s_cel),
                _p(item.get("descricao"), s_cel),
                _p(ROTULO_CATEGORIA.get(item.get("categoria"), item.get("categoria")), s_cel),
            ]
            if com_gravidade:
                linha.append(_p_gravidade(item.get("gravidade"), s_cel))
            linhas.append(linha)
        tabela = Table(linhas, colWidths=larguras, repeatRows=1)
        tabela.setStyle(TableStyle(estilos))
        elementos += [_p(ambiente, s_h2), tabela]
    return elementos
