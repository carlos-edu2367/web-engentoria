# backend/main.py
import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Importo os roteadores que criei
from .routes import auth_routes, agenda_routes, suporte_routes, admin_routes, imobiliaria_routes
from . import models
from .config import engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Engentoria - API Vistoriador & Gestão",
    description="API para o portal web do vistoriador, painel da imobiliária e painel de gestão de TI.",
    version="1.14"
)

origins = ["*"] 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluo os roteadores da API
app.include_router(auth_routes.router, prefix="/api/v1")
app.include_router(agenda_routes.router, prefix="/api/v1")
app.include_router(suporte_routes.router, prefix="/api/v1")
app.include_router(admin_routes.router, prefix="/api/v1")
app.include_router(imobiliaria_routes.router, prefix="/api/v1")


# --- SERVINDO O FRONTEND ---
app.mount("/assets", StaticFiles(directory="frontend/assets"), name="assets")

@app.get("/{page_name}.html", include_in_schema=False)
async def read_html_page(page_name: str):
    file_path = f'frontend/{page_name}.html'
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Página não encontrada")

@app.get("/", include_in_schema=False)
async def read_root():
    return FileResponse('frontend/index.html')
