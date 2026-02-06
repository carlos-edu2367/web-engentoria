import logging
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from sqlalchemy import select, delete
from typing import Type

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from backend.config import Settings
from backend.models import DocumentosInfoMensal, DocumentoAgenda
from backend.supabase_client import deletar_arquivo_supabase_safe

logger = logging.getLogger(__name__)
database_url = Settings.DATABASE_URL
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
engine = create_async_engine(database_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def limpar_tabela_especifica(session: AsyncSession, Model, bucket_name: str, cutoff_date: datetime):
    """
    Função genérica que limpa qualquer tabela que tenha 'id', 'file_path' e 'created_at'.
    """
    nome_tabela = Model.__tablename__
    logger.info(f"[{nome_tabela}] Iniciando verificação...")

    try:
        # 1. Query Otimizada: Seleciona apenas ID e Path (evita carregar o objeto inteiro na RAM)
        stmt = select(Model.id, Model.file_path).where(Model.created_at < cutoff_date)
        result = await session.execute(stmt)
        registros = result.all() # Retorna lista de tuplas (id, file_path)

        if not registros:
            logger.info(f"[{nome_tabela}] Nenhum arquivo antigo encontrado.")
            return

        logger.info(f"[{nome_tabela}] Encontrados {len(registros)} arquivos para deletar.")
        
        ids_para_remover = []

        # 2. Deleta do Storage um por um (necessário pois cada path é único)
        for reg_id, file_path in registros:
            if await deletar_arquivo_supabase_safe(file_path, bucket_name):
                ids_para_remover.append(reg_id)
        
        # 3. Batch Delete no Banco (Extremamente rápido)
        if ids_para_remover:
            delete_stmt = delete(Model).where(Model.id.in_(ids_para_remover))
            await session.execute(delete_stmt)
            logger.info(f"[{nome_tabela}] Sucesso: {len(ids_para_remover)} registros removidos do banco.")
        
    except Exception as e:
        logger.error(f"[{nome_tabela}] Erro crítico durante limpeza: {e}")
        # Não damos raise aqui para não impedir que a próxima tabela seja limpa

# --- O JOB PRINCIPAL ---
async def job_limpeza_diaria():
    logger.info("--- INICIANDO ROTINA DE LIMPEZA (40 DIAS) ---")
    
    # Define a data de corte uma única vez para garantir consistência
    cutoff_date = datetime.now() - timedelta(days=40)
    
    async with AsyncSessionLocal() as session:
        # Limpeza 1: Documentos Info Mensal
        await limpar_tabela_especifica(
            session=session, 
            Model=DocumentosInfoMensal, 
            bucket_name="documentos", 
            cutoff_date=cutoff_date
        )

        # Limpeza 2: Documentos Agenda
        await limpar_tabela_especifica(
            session=session, 
            Model=DocumentoAgenda, 
            bucket_name="documentos", 
            cutoff_date=cutoff_date
        )
        
        # Commita tudo de uma vez no final se tudo correu bem
        try:
            await session.commit()
            logger.info("--- ROTINA FINALIZADA COM SUCESSO ---")
        except Exception as e:
            logger.error(f"Erro ao commitar alterações no banco: {e}")
            await session.rollback()