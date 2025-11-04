import os, logging
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib.parse import urlparse
from fastapi import HTTPException
from storage3.exceptions import StorageApiError
import json
import httpx

logger = logging.getLogger(__name__)
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def gerar_url_assinada(bucket: str, file_path: str, validade_segundos: int = 3600):
    if not file_path:
        return None

    try:
        resposta = supabase.storage.from_(bucket).create_signed_url(file_path, validade_segundos)
    except (StorageApiError, httpx.HTTPStatusError, json.JSONDecodeError) as e:
        logger.warning(f"[gerar_url_assinada] Falha ao gerar URL assinada para '{file_path}': {e}")
        return None
    except Exception as e:
        # captura qualquer outro erro inesperado
        logger.error(f"[gerar_url_assinada] Erro inesperado para '{file_path}': {e}", exc_info=True)
        return None

    # diferentes formatos possíveis dependendo da versão do supabase-py
    if isinstance(resposta, dict):
        if "signedURL" in resposta:
            return resposta["signedURL"]
        if "data" in resposta and isinstance(resposta["data"], dict) and "signedURL" in resposta["data"]:
            return resposta["data"]["signedURL"]

    if hasattr(resposta, "get"):
        if resposta.get("signedURL"):
            return resposta.get("signedURL")
        if "data" in resposta and resposta["data"].get("signedURL"):
            return resposta["data"]["signedURL"]

    logger.error(f"[gerar_url_assinada] Resposta inesperada do Supabase: {resposta}")
    return None




def deletar_arquivo_supabase(file_path, bucket):
    try:
            resposta = supabase.storage.from_(bucket).remove([file_path])
            if resposta.count(["error"])>0:
                raise HTTPException(status_code=400, detail="Erro ao deletar do storage")
            return True
        
    except Exception as e:
            logger.error(f"Erro ao deletar imagem: {e}")
            raise e