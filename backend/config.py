# backend/config.py

import os
import time
import logging
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Carrego as variáveis de ambiente do arquivo .env para o ambiente do sistema
load_dotenv()

# Configuro o logging para que possamos ver as mensagens de tentativa de reconexão no console
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Settings:
    """
    Classe simples para armazenar as configurações lidas diretamente do ambiente.
    Foco em simplicidade e clareza.
    """
    # Leio as variáveis de ambiente. Se não existirem, o valor será None.
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    
    # Para estas, defino um valor padrão diretamente na chamada do getenv.
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    
    # Leio a variável e já converto para int, com um padrão de 60 minutos.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Crio uma instância única das configurações para usar no resto da aplicação.
settings = Settings()

# Se as variáveis essenciais não forem encontradas, gero um erro claro.
if not settings.DATABASE_URL or not settings.SECRET_KEY:
    raise ValueError("As variáveis de ambiente DATABASE_URL e SECRET_KEY devem ser definidas no arquivo .env")

def create_db_engine_with_retry(max_retries=5, delay_seconds=3):
    """
    Tenta criar a engine do banco de dados com múltiplas tentativas.
    Isso é útil para ambientes onde o banco de dados pode "dormir" (como em planos gratuitos).
    """
    retries = 0
    while retries < max_retries:
        try:
            engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
            # Tenta fazer uma conexão simples para garantir que a engine é válida
            with engine.connect():
                logger.info("Conexão com o banco de dados bem-sucedida!")
                return engine
        except OperationalError as e:
            retries += 1
            logger.warning(
                f"Erro ao conectar ao banco de dados (Tentativa {retries}/{max_retries}). "
                f"Isso pode ser normal se o banco estava dormindo. "
                f"Tentando novamente em {delay_seconds} segundos..."
            )
            time.sleep(delay_seconds)
    
    logger.error("Não foi possível conectar ao banco de dados após várias tentativas.")
    raise OperationalError("Falha ao conectar ao banco de dados após múltiplas tentativas.", orig=e)


# Crio a "engine" do SQLAlchemy, agora com a lógica de reconexão.
engine = create_db_engine_with_retry()

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
