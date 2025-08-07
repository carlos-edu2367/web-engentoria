# backend/main.py
import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Importo os roteadores que criei
from .routes import auth_routes, agenda_routes, suporte_routes
# NOVO: Importo o roteador do painel de gestão
from .routes import admin_routes
from . import models
from .config import engine

# Crio as tabelas no banco de dados (se elas não existirem)
# Isso agora também criará a tabela 'usuarios_ti'
models.Base.metadata.create_all(bind=engine)

# Crio a instância principal do FastAPI
app = FastAPI(
    title="Engentoria - API Vistoriador & Gestão",
    description="API para o portal web do vistoriador e para o painel de gestão de TI da Engentoria.",
    version="1.0.0"
)

# Configuro o CORS (Cross-Origin Resource Sharing)
origins = ["*"] # Para o deploy, é mais seguro permitir tudo inicialmente

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluo os roteadores da API, mantendo o prefixo para organização.
app.include_router(auth_routes.router, prefix="/api/v1")
app.include_router(agenda_routes.router, prefix="/api/v1")
app.include_router(suporte_routes.router, prefix="/api/v1")
# NOVO: Incluo o roteador do painel de gestão
app.include_router(admin_routes.router, prefix="/api/v1")


# --- SERVINDO O FRONTEND ---

# 1. Monto a pasta 'assets' para que o HTML possa encontrar o CSS e o JS.
# Qualquer requisição para /assets/... será servida a partir da pasta frontend/assets.
app.mount("/assets", StaticFiles(directory="frontend/assets"), name="assets")

# 2. Crio rotas para servir os arquivos HTML.
@app.get("/{page_name}.html", include_in_schema=False)
async def read_html_page(page_name: str):
    file_path = f'frontend/{page_name}.html'
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Página não encontrada")

@app.get("/", include_in_schema=False)
async def read_root():
    """
    Endpoint raiz agora serve o index.html.
    """
    return FileResponse('frontend/index.html')
