# backend/ia/providers.py
"""
Clientes HTTP dos providers de IA (Ollama Cloud e OpenRouter).

O admin escolhe o provider e o modelo em `configuracoes_ia`; as chaves de API
ficam somente nas variáveis de ambiente e nunca são expostas ao frontend.
"""

import os
import re
import time
import logging
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

PROVIDERS = {
    "ollama_cloud": {
        "nome": "Ollama Cloud",
        "env_key": "OLLAMA_API_KEY",
        "modelo_padrao": "gemma4:31b",
        "url_modelos": "https://ollama.com/api/tags",
    },
    "openrouter": {
        "nome": "OpenRouter",
        "env_key": "OPENROUTER_API_KEY",
        "modelo_padrao": "google/gemma-4-31b-it",
        "url_modelos": "https://openrouter.ai/api/v1/models",
    },
}

PROVIDER_PADRAO = "ollama_cloud"
TEMPERATURA = 0.1
TIMEOUT_CONEXAO = 10
TIMEOUT_RESPOSTA = 240
ESPERAS_RETRY = (2, 4)  # segundos entre tentativas (3 tentativas no total)
CACHE_MODELOS_SEGUNDOS = 24 * 60 * 60  # a lista de modelos muda pouco

_RE_PENSAMENTO = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def limpar_resposta(texto: Optional[str]) -> str:
    """Remove blocos de raciocínio (<think>...</think>) que alguns modelos incluem no conteúdo."""
    return _RE_PENSAMENTO.sub("", texto or "").strip()


class ErroProviderIA(Exception):
    """Erro ao falar com o provider. `recuperavel` indica se vale tentar de novo mais tarde."""

    def __init__(self, mensagem: str, recuperavel: bool = True):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.recuperavel = recuperavel


@dataclass
class RespostaIA:
    conteudo: str
    tokens_entrada: Optional[int] = None
    tokens_saida: Optional[int] = None


def chave_configurada(provider: str) -> bool:
    info = PROVIDERS.get(provider)
    return bool(info and os.getenv(info["env_key"]))


class ProviderIA:
    nome = ""
    url = ""

    def __init__(self, api_key: str, modelo: str, timeout: int = TIMEOUT_RESPOSTA):
        self.api_key = api_key
        self.modelo = modelo
        self.timeout = timeout

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _payload(self, system: str, user: str, schema: Optional[dict]) -> dict:
        raise NotImplementedError

    def _interpretar(self, data: dict) -> RespostaIA:
        raise NotImplementedError

    def completar(self, system: str, user: str, schema: Optional[dict] = None) -> RespostaIA:
        payload = self._payload(system, user, schema)
        ultima_falha = None
        for tentativa in range(len(ESPERAS_RETRY) + 1):
            if tentativa:
                time.sleep(ESPERAS_RETRY[tentativa - 1])
            try:
                resp = requests.post(self.url, json=payload, headers=self._headers(),
                                     timeout=(TIMEOUT_CONEXAO, self.timeout))
            except (requests.Timeout, requests.ConnectionError) as e:
                ultima_falha = ErroProviderIA(f"Falha de comunicação com {self.nome}: {e.__class__.__name__}")
                logger.warning(f"[IA] {self.nome} tentativa {tentativa + 1}: {e}")
                continue

            if resp.status_code in (401, 403):
                raise ErroProviderIA(f"{self.nome} recusou a chave de API (HTTP {resp.status_code}). Verifique a variável de ambiente.", recuperavel=False)
            if resp.status_code == 404:
                raise ErroProviderIA(f"{self.nome}: modelo '{self.modelo}' não encontrado ou indisponível. Detalhe: {_resumo(resp)}", recuperavel=False)
            if resp.status_code == 429 or resp.status_code >= 500:
                ultima_falha = ErroProviderIA(f"{self.nome} indisponível no momento (HTTP {resp.status_code}).")
                logger.warning(f"[IA] {self.nome} tentativa {tentativa + 1}: HTTP {resp.status_code} {_resumo(resp)}")
                continue
            if resp.status_code >= 400:
                raise ErroProviderIA(f"{self.nome} rejeitou a requisição (HTTP {resp.status_code}): {_resumo(resp)}", recuperavel=False)

            try:
                resposta = self._interpretar(resp.json())
                resposta.conteudo = limpar_resposta(resposta.conteudo)
                return resposta
            except (ValueError, KeyError, IndexError, TypeError) as e:
                logger.warning(f"[IA] Resposta inesperada de {self.nome}: {e} | {_resumo(resp)}")
                ultima_falha = ErroProviderIA(f"Resposta inesperada de {self.nome}.")
                continue

        raise ultima_falha or ErroProviderIA(f"Falha ao consultar {self.nome}.")


class OllamaCloudProvider(ProviderIA):
    nome = "Ollama Cloud"
    url = "https://ollama.com/api/chat"

    def _payload(self, system, user, schema):
        payload = {
            "model": self.modelo,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
            "options": {"temperature": TEMPERATURA},
        }
        if schema:
            payload["format"] = schema
        return payload

    def _interpretar(self, data):
        return RespostaIA(
            conteudo=data["message"]["content"],
            tokens_entrada=data.get("prompt_eval_count"),
            tokens_saida=data.get("eval_count"),
        )


class OpenRouterProvider(ProviderIA):
    nome = "OpenRouter"
    url = "https://openrouter.ai/api/v1/chat/completions"

    def _headers(self):
        headers = super()._headers()
        headers["HTTP-Referer"] = "https://web-engentoria-production.up.railway.app"
        headers["X-Title"] = "Engentoria"
        return headers

    def _payload(self, system, user, schema):
        payload = {
            "model": self.modelo,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": TEMPERATURA,
            # Usa somente provedores que não retêm/treinam com os dados enviados (LGPD)
            "provider": {"data_collection": "deny"},
        }
        if schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "resposta", "strict": True, "schema": schema},
            }
        return payload

    def _interpretar(self, data):
        if data.get("error"):
            raise ValueError(data["error"])
        usage = data.get("usage") or {}
        return RespostaIA(
            conteudo=data["choices"][0]["message"]["content"],
            tokens_entrada=usage.get("prompt_tokens"),
            tokens_saida=usage.get("completion_tokens"),
        )


_CLASSES = {"ollama_cloud": OllamaCloudProvider, "openrouter": OpenRouterProvider}


def criar_provider(provider: str, modelo: str, timeout: int = TIMEOUT_RESPOSTA) -> ProviderIA:
    info = PROVIDERS.get(provider)
    if not info:
        raise ErroProviderIA(f"Provider de IA desconhecido: '{provider}'.", recuperavel=False)
    api_key = os.getenv(info["env_key"])
    if not api_key:
        raise ErroProviderIA(f"Variável de ambiente {info['env_key']} não configurada no servidor.", recuperavel=False)
    if not modelo or not modelo.strip():
        raise ErroProviderIA("Nenhum modelo de IA configurado.", recuperavel=False)
    return _CLASSES[provider](api_key=api_key, modelo=modelo.strip(), timeout=timeout)


def _resumo(resp: requests.Response, limite: int = 300) -> str:
    try:
        return resp.text[:limite]
    except Exception:
        return ""


# --- Lista de modelos (com cache) ------------------------------------------------

_cache_modelos: Dict[str, dict] = {}
_cache_lock = threading.Lock()


def _normalizar_ollama(data: dict) -> List[dict]:
    modelos = []
    for m in data.get("models") or []:
        nome = m.get("name") or m.get("model")
        if not nome:
            continue
        capacidades = m.get("capabilities") or []
        modelos.append({
            "id": nome,
            "nome": nome,
            "contexto": None,
            "preco_entrada": None,
            "preco_saida": None,
            "capacidades": ["raciocinio"] if "thinking" in capacidades else [],
            "imagem": "vision" in capacidades,
        })
    return modelos


def _preco_por_milhao(valor) -> Optional[float]:
    try:
        preco = float(valor)
    except (TypeError, ValueError):
        return None
    return round(preco * 1_000_000, 4) if preco >= 0 else None


def _normalizar_openrouter(data: dict) -> List[dict]:
    modelos = []
    for m in data.get("data") or []:
        arquitetura = m.get("architecture") or {}
        if "text" not in (arquitetura.get("output_modalities") or ["text"]):
            continue  # modelos que não geram texto (imagem, áudio) não servem aqui
        parametros = m.get("supported_parameters") or []
        precos = m.get("pricing") or {}
        modelos.append({
            "id": m.get("id"),
            "nome": (m.get("name") or m.get("id") or "").strip(),
            "contexto": m.get("context_length"),
            "preco_entrada": _preco_por_milhao(precos.get("prompt")),
            "preco_saida": _preco_por_milhao(precos.get("completion")),
            "capacidades": [c for c, ok in (
                ("saida_estruturada", "response_format" in parametros or "structured_outputs" in parametros),
                ("raciocinio", "reasoning" in parametros),
            ) if ok],
            "imagem": "image" in (arquitetura.get("input_modalities") or []),
        })
    return [m for m in modelos if m["id"]]


_NORMALIZADORES = {"ollama_cloud": _normalizar_ollama, "openrouter": _normalizar_openrouter}


def listar_modelos(provider: str, forcar: bool = False) -> dict:
    """Lista os modelos do provider, com cache em memória de 24h.
    Se o provider falhar e houver cache antigo, devolve o cache (marcado como desatualizado)."""
    info = PROVIDERS.get(provider)
    if not info:
        raise ErroProviderIA(f"Provider de IA desconhecido: '{provider}'.", recuperavel=False)

    agora = time.time()
    with _cache_lock:
        em_cache = _cache_modelos.get(provider)
    if em_cache and not forcar and agora - em_cache["atualizado_em"] < CACHE_MODELOS_SEGUNDOS:
        return {**em_cache, "desatualizado": False}

    headers = {}
    api_key = os.getenv(info["env_key"])
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        resp = requests.get(info["url_modelos"], headers=headers, timeout=(TIMEOUT_CONEXAO, 30))
        resp.raise_for_status()
        modelos = sorted(_NORMALIZADORES[provider](resp.json()), key=lambda m: m["nome"].lower())
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[IA] Falha ao listar modelos de {info['nome']}: {e}")
        if em_cache:
            return {**em_cache, "desatualizado": True}
        raise ErroProviderIA(f"Não foi possível obter a lista de modelos de {info['nome']}.")

    registro = {"provider": provider, "modelos": modelos, "atualizado_em": agora}
    with _cache_lock:
        _cache_modelos[provider] = registro
    return {**registro, "desatualizado": False}
