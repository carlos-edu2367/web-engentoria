# backend/auth.py

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from typing import Optional

# Importo meus próprios módulos
from . import models, schemas
from .config import settings, get_db

# Crio um contexto para o hashing de senhas. Digo para usar o bcrypt.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Defino o esquema de segurança. O tokenUrl aponta para a rota de login que vamos criar.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Compara a senha que o usuário enviou com a senha hashada no banco.
    """
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """
    Gera um hash a partir de uma senha em texto plano.
    """
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Cria o token JWT.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Se o tempo de expiração não for passado, uso 15 minutos como padrão.
        expire = datetime.utcnow() + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_user(db: Session, email: str) -> Optional[models.Usuario]:
    """
    Busca um usuário no banco pelo email.
    """
    return db.query(models.Usuario).filter(models.Usuario.email == email, models.Usuario.is_deleted == False).first()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Usuario:
    """
    Esta é a função de dependência que vou usar para proteger as rotas.
    Ela decodifica o token, valida e retorna os dados do usuário logado.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = get_user(db, email=token_data.email)
    if user is None:
        raise credentials_exception
        
    # Retorno o objeto do usuário completo, assim posso usá-lo nas rotas.
    return user

def get_current_active_vistoriador(current_user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
    """
    Uma camada extra de segurança para garantir que o usuário logado é um 'vistoriador'.
    """
    if current_user.tipo != "vistoriador":
        raise HTTPException(status_code=403, detail="Acesso negado. Requer perfil de vistoriador.")
    return current_user
