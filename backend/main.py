# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Importo os roteadores que criei
from .routes import auth_routes, agenda_routes, suporte_routes
from . import models
from .config import engine

# Crio as tabelas no banco de dados (se elas não existirem)
# Em um ambiente de produção real, eu poderia usar Alembic para migrações.
models.Base.metadata.create_all(bind=engine)

# Crio a instância principal do FastAPI
app = FastAPI(
    title="Engentoria - API Vistoriador",
    description="API para o portal web do vistoriador da Engentoria.",
    version="1.0.0"
)

# Configuro o CORS (Cross-Origin Resource Sharing)
# Isso é essencial para permitir que o meu frontend (que estará em outro "domínio")
# possa fazer requisições para esta API.
origins = [
    "http://localhost",
    "http://localhost:8080", # Exemplo se eu usar um servidor de desenvolvimento para o frontend
    "http://127.0.0.1:5500", # Exemplo para o Live Server do VS Code
    # Adicionar aqui o domínio do site em produção
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Permite todos os métodos (GET, POST, etc.)
    allow_headers=["*"], # Permite todos os cabeçalhos
)

# Incluo os roteadores na aplicação principal, definindo um prefixo para a API.
app.include_router(auth_routes.router, prefix="/api/v1")
app.include_router(agenda_routes.router, prefix="/api/v1")
app.include_router(suporte_routes.router, prefix="/api/v1")


@app.get("/", tags=["Root"])
def read_root():
    """
    Endpoint raiz para verificar se a API está no ar.
    """
    return {"message": "Bem-vindo à API da Engentoria para Vistoriadores!"}

