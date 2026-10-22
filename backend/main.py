# backend/main.py
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Importo os roteadores que criei
from .routes import auth_routes, agenda_routes, suporte_routes, admin_routes, imobiliaria_routes, laudo_pdf_routes, agendamento_externo_routes
from .routes import admin_panel_routes # Rota para o novo painel de admin
from .routes import vistoria_valores_routes # Rota para manipulação de valores de vistorias
from .routes import nao_conformidades_routes # Laudo de não conformidades (IA)
from .ia.servico import varrer_analises_pendentes
from . import models
from .config import engine

from backend.cron.clear import job_limpeza_diaria
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Agenda o job
    scheduler.add_job(job_limpeza_diaria, CronTrigger(hour=3, minute=0))
    # Retoma análises de não conformidades interrompidas (ex.: deploy) e re-tenta erros recuperáveis
    scheduler.add_job(varrer_analises_pendentes, IntervalTrigger(minutes=5), max_instances=1, coalesce=True)
    scheduler.start()
    logger.info("Scheduler iniciado")
    
    yield # A aplicação roda aqui
    
    scheduler.shutdown()

app = FastAPI(
    title="Engentoria - API Vistoriador & Gestão",
    lifespan=lifespan,
    description="API para o portal web do vistoriador, painel da imobiliária e painel de gestão de TI.",
    version="2.0" # Versão atualizada para refletir as novas funcionalidades
)
models.Base.metadata.create_all(bind=engine)

# create_all não adiciona colunas em tabelas existentes. Estas são aplicadas aqui
# (idempotente) porque o model já as lê: sem elas o login das imobiliárias quebra.
# Mesmo conteúdo de backend/migrations/usuarios_imobiliaria.sql.
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE grupos_imobiliarias ADD COLUMN IF NOT EXISTS acesso_financeiro BOOLEAN NOT NULL DEFAULT TRUE"))
    conn.execute(text("ALTER TABLE grupos_imobiliarias ADD COLUMN IF NOT EXISTS acesso_vistorias BOOLEAN NOT NULL DEFAULT TRUE"))

# Configuração do CORS para permitir todas as origens
origins = ["*"] 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluo os roteadores da API com um prefixo global
api_prefix = "/api/v1"
app.include_router(auth_routes.router, prefix=api_prefix)
app.include_router(agenda_routes.router, prefix=api_prefix)
app.include_router(suporte_routes.router, prefix=api_prefix)
app.include_router(admin_routes.router, prefix=api_prefix) # Painel de gestão de TI
app.include_router(imobiliaria_routes.router, prefix=api_prefix)
app.include_router(admin_panel_routes.router, prefix=api_prefix) # Novo painel de administração
app.include_router(vistoria_valores_routes.router, prefix=api_prefix) # Rota para manipulação de valores
app.include_router(laudo_pdf_routes.router, prefix=api_prefix)
app.include_router(agendamento_externo_routes.router_protected, prefix=api_prefix)
app.include_router(agendamento_externo_routes.router_public, prefix=api_prefix)
app.include_router(nao_conformidades_routes.router_admin, prefix=api_prefix)
app.include_router(nao_conformidades_routes.router_imobiliaria, prefix=api_prefix)

# --- SERVINDO O FRONTEND (Opcional, para desenvolvimento) ---
# Monta a pasta 'assets' do frontend
app.mount("/assets", StaticFiles(directory="frontend/assets"), name="assets")

@app.get("/{page_name}.html", include_in_schema=False)
async def read_html_page(page_name: str):
    """Serve páginas HTML da pasta frontend."""
    file_path = f'frontend/{page_name}.html'
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Página não encontrada")

@app.get("/", include_in_schema=False)
async def read_root():
    """Serve a página principal (index.html)."""
    return FileResponse('frontend/index.html')
