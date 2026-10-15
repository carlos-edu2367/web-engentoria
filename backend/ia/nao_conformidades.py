# backend/ia/nao_conformidades.py
"""
Núcleo da análise de não conformidades (sem banco de dados).

Recebe o laudo de ENTRADA já convertido em blocos de texto, consulta o LLM por
partes e devolve uma lista consolidada de itens. A saída do modelo nunca é tida
como verdade: cada item precisa citar o trecho do laudo que o originou e essa
citação é conferida aqui (`evidencia_validada`).
"""

import json
import re
import logging
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import List

from pydantic import BaseModel, ValidationError

from .extracao import Bloco, mascarar_dados_pessoais
from .providers import ProviderIA, ErroProviderIA

logger = logging.getLogger(__name__)

PROMPT_VERSAO = "nc-v1"
MAX_CHARS_POR_PARTE = 60_000   # ~15k tokens por chamada
MAX_PARTES = 12                # limite de custo/tempo por laudo

TIPOS = ("NAO_CONFORMIDADE", "NAO_VERIFICADO")
CATEGORIAS = ("HIDRAULICA", "ELETRICA", "ESQUADRIAS", "GAS", "SEGURANCA_ESTRUTURA", "EQUIPAMENTOS", "OUTROS")
GRAVIDADES = ("CRITICA", "ALTA", "MEDIA", "BAIXA")
_PESO_GRAVIDADE = {g: i for i, g in enumerate(GRAVIDADES)}

_SCHEMA_ITEM = {
    "type": "object",
    "properties": {
        "ambiente": {"type": "string"},
        "item": {"type": "string"},
        "descricao": {"type": "string"},
        "categoria": {"type": "string", "enum": list(CATEGORIAS)},
        "gravidade": {"type": "string", "enum": list(GRAVIDADES)},
        "trecho_origem": {"type": "string"},
    },
    "required": ["ambiente", "item", "descricao", "categoria", "gravidade", "trecho_origem"],
    "additionalProperties": False,
}

SCHEMA_RESPOSTA = {
    "type": "object",
    "properties": {
        "nao_conformidades": {"type": "array", "items": _SCHEMA_ITEM},
        "nao_verificados": {"type": "array", "items": _SCHEMA_ITEM},
    },
    "required": ["nao_conformidades", "nao_verificados"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Você é um perito em vistorias imobiliárias para locação residencial no Brasil.
Você recebe o texto de um LAUDO DE VISTORIA DE ENTRADA e deve identificar as NÃO CONFORMIDADES:
problemas que atrapalham o inquilino a usar o imóvel normalmente.

INCLUA como não conformidade (exemplos, não é lista fechada):
- Hidráulica: vazamento, infiltração ou umidade ativa, sifão solto/danificado/vazando, torneira pingando ou sem funcionamento, registro travado, descarga ou caixa acoplada que não aciona, vaso sanitário trincado/solto, ralo ou pia entupidos, chuveiro sem funcionamento, falta de água.
- Elétrica: tomada, interruptor ou luminária sem funcionamento, lâmpada queimada, fiação exposta, espelho de tomada quebrado expondo fios, disjuntor desarmando, falta de energia em cômodo.
- Esquadrias: porta ou janela que não abre, não fecha ou não tranca, fechadura com defeito, chave ausente, vidro trincado ou quebrado, trilho/roldana danificados impedindo o uso, puxador ou maçaneta solta/ausente.
- Gás: vazamento, cheiro de gás, mangueira ou registro com defeito.
- Segurança/estrutura: guarda-corpo ou corrimão solto, trinca estrutural, telha quebrada com goteira, peça solta com risco de queda.
- Equipamentos fixos do imóvel: interfone, campainha, portão eletrônico, aquecedor, ar-condicionado instalado, coifa, armário embutido com porta/gaveta sem funcionar.

NÃO INCLUA (são estéticos ou desgaste natural e já constam no laudo de entrada):
- riscos, arranhões, manchas, sujeira, marcas, desbotamento, diferença de tonalidade;
- pintura desgastada, descascando ou com retoques, pequenos furos de bucha/prego;
- desgaste natural de uso, pequenas lascas ou trincas superficiais em piso/azulejo sem prejuízo de uso;
- qualquer item descrito como "bom estado", "funcionando", "ok", "novo" ou "sem avarias".

Em "nao_verificados" coloque os itens que o laudo diz que NÃO PUDERAM SER TESTADOS (ex.: "sem energia, não foi possível testar", "água cortada", "sem chave para testar").

Gravidade:
- CRITICA: risco à segurança ou à saúde (fiação exposta, gás, vidro quebrado, guarda-corpo solto).
- ALTA: impede o uso de algo essencial (sem água, vaso inutilizável, porta de entrada não tranca, chuveiro sem funcionar).
- MEDIA: prejudica o uso (tomada sem funcionar, torneira pingando, sifão vazando, janela que não fecha).
- BAIXA: reparo simples (lâmpada queimada, puxador solto).
Para itens em "nao_verificados" use gravidade BAIXA.

Regras obrigatórias:
- NUNCA invente problemas. Use apenas o que está escrito no laudo.
- "trecho_origem" deve ser uma cópia LITERAL e curta (até 200 caracteres) do texto do laudo que comprova o problema.
- "ambiente" é o cômodo (ex.: "Banheiro social"); "item" é o elemento (ex.: "Sifão da pia"); "descricao" explica o problema em uma frase objetiva.
- Não repita o mesmo problema mais de uma vez.
- Se não houver nenhuma não conformidade, devolva listas vazias.
- Responda somente com JSON válido, em português do Brasil, no formato:
{"nao_conformidades": [{"ambiente": "", "item": "", "descricao": "", "categoria": "", "gravidade": "", "trecho_origem": ""}], "nao_verificados": [...]}
Categorias permitidas: HIDRAULICA, ELETRICA, ESQUADRIAS, GAS, SEGURANCA_ESTRUTURA, EQUIPAMENTOS, OUTROS.

Exemplos:
- "Pia com sifão solto apresentando vazamento" -> NÃO CONFORMIDADE, HIDRAULICA, MEDIA.
- "Tomada ao lado da cama sem funcionamento" -> NÃO CONFORMIDADE, ELETRICA, MEDIA.
- "Porta de entrada: fechadura não tranca" -> NÃO CONFORMIDADE, ESQUADRIAS, ALTA.
- "Parede com pequenas manchas e furos de bucha" -> NÃO incluir (estético).
- "Piso cerâmico com leve desgaste, em bom estado" -> NÃO incluir.
- "Chuveiro não testado, imóvel sem energia" -> nao_verificados, ELETRICA, BAIXA."""


class _ItemIA(BaseModel):
    ambiente: str = ""
    item: str = ""
    descricao: str = ""
    categoria: str = "OUTROS"
    gravidade: str = "MEDIA"
    trecho_origem: str = ""


class _RespostaIA(BaseModel):
    nao_conformidades: List[_ItemIA] = []
    nao_verificados: List[_ItemIA] = []


@dataclass
class ItemNC:
    tipo: str
    ambiente: str
    item: str
    descricao: str
    categoria: str
    gravidade: str
    trecho_origem: str
    evidencia_validada: bool


@dataclass
class ResultadoAnalise:
    itens: List[ItemNC] = field(default_factory=list)
    tokens_entrada: int = 0
    tokens_saida: int = 0
    partes: int = 0
    truncado: bool = False


class ErroAnalise(Exception):
    def __init__(self, mensagem: str, recuperavel: bool = True):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.recuperavel = recuperavel


# --- Divisão em partes ---------------------------------------------------------

def dividir_em_partes(blocos: List[Bloco], max_chars: int = MAX_CHARS_POR_PARTE) -> List[str]:
    """Agrupa blocos (páginas/ambientes) em partes de até `max_chars`, sem quebrar blocos
    pequenos. Blocos maiores que o limite são cortados por linhas."""
    partes, atual, tamanho = [], [], 0

    def fechar():
        nonlocal atual, tamanho
        if atual:
            partes.append("\n\n".join(atual))
        atual, tamanho = [], 0

    for bloco in blocos:
        texto = f"[{bloco.rotulo}]\n{bloco.texto}"
        if len(texto) > max_chars:
            fechar()
            pedaco = []
            for linha in texto.splitlines():
                while len(linha) > max_chars:  # linha gigante (texto sem quebras)
                    if pedaco:
                        partes.append("\n".join(pedaco))
                        pedaco = []
                    partes.append(linha[:max_chars])
                    linha = linha[max_chars:]
                if sum(len(l) + 1 for l in pedaco) + len(linha) > max_chars and pedaco:
                    partes.append("\n".join(pedaco))
                    pedaco = [f"[{bloco.rotulo} - continuação]"]
                pedaco.append(linha)
            if pedaco:
                partes.append("\n".join(pedaco))
            continue
        if tamanho + len(texto) + 2 > max_chars:
            fechar()
        atual.append(texto)
        tamanho += len(texto) + 2
    fechar()
    return partes


# --- Interpretação da resposta -------------------------------------------------

def interpretar_resposta(conteudo: str) -> _RespostaIA:
    """Parse tolerante: aceita cercas ```json``` e texto antes/depois do objeto."""
    if conteudo is None:
        raise ValueError("Resposta vazia")
    texto = conteudo.strip()
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto)
    try:
        data = json.loads(texto)
    except json.JSONDecodeError:
        inicio, fim = texto.find("{"), texto.rfind("}")
        if inicio == -1 or fim <= inicio:
            raise ValueError("Resposta não contém JSON")
        data = json.loads(texto[inicio:fim + 1])
    if not isinstance(data, dict):
        raise ValueError("JSON da resposta não é um objeto")
    try:
        return _RespostaIA.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"JSON fora do formato esperado: {e.error_count()} erro(s)")


def _normalizar_enum(valor: str, permitidos, padrao: str) -> str:
    v = normalizar(valor).upper().replace(" ", "_").replace("/", "_")
    if v in permitidos:
        return v
    for p in permitidos:  # tolera "Elétrica", "segurança", etc.
        if v and (p.startswith(v) or v.startswith(p)):
            return p
    return padrao


# --- Validação de evidência ----------------------------------------------------

def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^\w\s]", " ", texto.lower())
    return re.sub(r"\s+", " ", texto).strip()


def validar_evidencia(trecho: str, fonte_normalizada: str, limiar: float = 0.75) -> bool:
    """O trecho citado pela IA existe no texto de origem? (exato ou quase exato)."""
    alvo = normalizar(trecho)
    if len(alvo) < 4:
        return False
    if alvo in fonte_normalizada:
        return True
    matcher = SequenceMatcher(None, alvo, fonte_normalizada, autojunk=False)
    match = matcher.find_longest_match(0, len(alvo), 0, len(fonte_normalizada))
    return match.size / len(alvo) >= limiar


# --- Consolidação --------------------------------------------------------------

def mesclar_itens(itens: List[ItemNC]) -> List[ItemNC]:
    """Remove duplicatas (o mesmo problema citado em partes diferentes do laudo),
    mantendo a maior gravidade e a evidência validada."""
    resultado: List[ItemNC] = []
    for novo in itens:
        chave = (novo.tipo, normalizar(novo.ambiente), normalizar(novo.item))
        duplicado = None
        for existente in resultado:
            if (existente.tipo, normalizar(existente.ambiente), normalizar(existente.item)) != chave:
                continue
            if SequenceMatcher(None, normalizar(existente.descricao), normalizar(novo.descricao)).ratio() >= 0.6:
                duplicado = existente
                break
        if duplicado is None:
            resultado.append(novo)
            continue
        if _PESO_GRAVIDADE[novo.gravidade] < _PESO_GRAVIDADE[duplicado.gravidade]:
            duplicado.gravidade = novo.gravidade
        if novo.evidencia_validada and not duplicado.evidencia_validada:
            duplicado.trecho_origem = novo.trecho_origem
            duplicado.evidencia_validada = True
    return resultado


def _converter(itens_ia: List[_ItemIA], tipo: str, fonte_normalizada: str) -> List[ItemNC]:
    convertidos = []
    for i in itens_ia:
        descricao = (i.descricao or "").strip()
        item = (i.item or "").strip()
        if not descricao and not item:
            continue
        gravidade = "BAIXA" if tipo == "NAO_VERIFICADO" else _normalizar_enum(i.gravidade, GRAVIDADES, "MEDIA")
        trecho = (i.trecho_origem or "").strip()[:500]
        convertidos.append(ItemNC(
            tipo=tipo,
            ambiente=(i.ambiente or "").strip()[:200] or "Não informado",
            item=item[:200] or descricao[:200],
            descricao=descricao[:1000] or item,
            categoria=_normalizar_enum(i.categoria, CATEGORIAS, "OUTROS"),
            gravidade=gravidade,
            trecho_origem=trecho,
            evidencia_validada=validar_evidencia(trecho, fonte_normalizada),
        ))
    return convertidos


# --- Orquestração --------------------------------------------------------------

def _mensagem_usuario(parte: str, indice: int, total: int) -> str:
    return (f"Trecho {indice} de {total} do laudo de vistoria de ENTRADA. "
            f"Analise apenas este trecho.\n\n<laudo>\n{parte}\n</laudo>")


def _consultar(provider: ProviderIA, mensagem: str):
    """Retorna (resposta interpretada, chamadas feitas). Pede correção uma vez se o JSON vier inválido."""
    resposta = provider.completar(SYSTEM_PROMPT, mensagem, SCHEMA_RESPOSTA)
    try:
        return interpretar_resposta(resposta.conteudo), [resposta]
    except ValueError as e:
        logger.warning(f"[IA] JSON inválido na resposta ({e}); pedindo correção.")
    correcao = provider.completar(
        SYSTEM_PROMPT,
        mensagem + "\n\nATENÇÃO: sua resposta anterior não era um JSON válido no formato pedido. "
                   "Responda novamente apenas com o JSON.",
        SCHEMA_RESPOSTA,
    )
    try:
        return interpretar_resposta(correcao.conteudo), [resposta, correcao]
    except ValueError as e:
        raise ErroAnalise(f"O modelo não retornou um JSON válido ({e}).")


def analisar_blocos(blocos: List[Bloco], provider: ProviderIA) -> ResultadoAnalise:
    """Executa a análise completa. Lança ErroAnalise em falhas."""
    blocos = [Bloco(b.rotulo, mascarar_dados_pessoais(b.texto)) for b in blocos if b.texto.strip()]
    if not blocos:
        raise ErroAnalise("O laudo não possui texto para analisar.", recuperavel=False)

    partes = dividir_em_partes(blocos)
    resultado = ResultadoAnalise(partes=len(partes))
    if len(partes) > MAX_PARTES:
        logger.warning(f"[IA] Laudo com {len(partes)} partes; analisando apenas as {MAX_PARTES} primeiras.")
        partes = partes[:MAX_PARTES]
        resultado.truncado = True

    todos: List[ItemNC] = []
    for indice, parte in enumerate(partes, start=1):
        try:
            resposta, chamadas = _consultar(provider, _mensagem_usuario(parte, indice, len(partes)))
        except ErroProviderIA as e:
            raise ErroAnalise(e.mensagem, recuperavel=e.recuperavel)
        for chamada in chamadas:
            resultado.tokens_entrada += chamada.tokens_entrada or 0
            resultado.tokens_saida += chamada.tokens_saida or 0
        fonte = normalizar(parte)
        todos += _converter(resposta.nao_conformidades, "NAO_CONFORMIDADE", fonte)
        todos += _converter(resposta.nao_verificados, "NAO_VERIFICADO", fonte)

    resultado.itens = mesclar_itens(todos)
    return resultado
