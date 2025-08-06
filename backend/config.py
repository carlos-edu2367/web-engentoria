# backend/config.py

import os
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Carrego as variáveis de ambiente do arquivo .env
load_dotenv()

class Settings(BaseSettings):
    """
    Aqui eu defino e valido as variáveis de ambiente que a aplicação precisa.
    O Pydantic faz a mágica de ler do .env e garantir que tudo está no lugar.
    """
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

    class Config:
        env_file = ".env"

# Crio uma instância das minhas configurações
settings = Settings()

# Crio a "engine" do SQLAlchemy, que é o ponto de entrada para o banco de dados.
# O pool_pre_ping=True verifica se a conexão ainda está ativa antes de cada uso.
engine = create_engine(
    settings.DATABASE_URL, pool_pre_ping=True
)

# Crio uma fábrica de sessões. Cada sessão é uma "conversa" com o banco de dados.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Crio uma classe Base que meus modelos de tabela vão herdar.
Base = declarative_base()

# Função para obter uma sessão do banco de dados
# Isso será usado como uma dependência no FastAPI para injetar a sessão nas rotas.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
