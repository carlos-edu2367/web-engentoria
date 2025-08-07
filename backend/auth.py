# backend/auth.py

import bcrypt
import hashlib # Importa a biblioteca original de hashing
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from typing import Optional, Union

# Importo meus próprios módulos
from . import models, schemas
from .config import settings, get_db

# Defino o esquema de segurança. O tokenUrl aponta para a rota de login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def get_password_hash(password: str) -> str:
    """
    Gera um hash de senha seguro usando bcrypt.
    """
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica a senha de forma compatível.
    Primeiro tenta com bcrypt (novo sistema) e, se falhar, tenta com SHA256 (sistema antigo).
    """
    try:
        # Tenta verificar com o novo método (bcrypt)
        password_byte_enc = plain_password.encode('utf-8')
        hashed_password_byte_enc = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_byte_enc, hashed_password_byte_enc)
    except ValueError:
        # Se o hash não for válido para bcrypt (ex: é um hash antigo SHA256),
        # um ValueError é lançado. Nesse caso, usamos o método antigo.
        old_system_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
        return old_system_hash == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Cria o token JWT.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Se o tempo de expiração não for passado, uso o valor do .env.
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_user(db: Session, email: str) -> Optional[Union[models.Usuario, models.UsuarioTI]]:
    """
    Busca um usuário pelo email, primeiro na tabela de TI e depois na de usuários normais.
    Retorna o objeto do usuário encontrado, ou None.
    """
    # 1. Tenta encontrar na tabela de usuários de TI
    user_ti = db.query(models.UsuarioTI).filter(models.UsuarioTI.email == email).first()
    if user_ti:
        return user_ti
    
    # 2. Se não encontrar, busca na tabela de usuários da aplicação
    user_app = db.query(models.Usuario).filter(models.Usuario.email == email, models.Usuario.is_deleted == False).first()
    if user_app:
        return user_app

    return None

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Union[models.Usuario, models.UsuarioTI]:
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
    # Verifica se o usuário é da instância correta e tem o tipo correto
    if not isinstance(current_user, models.Usuario) or current_user.tipo != "vistoriador":
        raise HTTPException(status_code=403, detail="Acesso negado. Requer perfil de vistoriador.")
    return current_user

# --- NOVO: Dependência de segurança para o Gestor de TI ---
def get_current_gestor_user(current_user: models.UsuarioTI = Depends(get_current_user)) -> models.UsuarioTI:
    """
    Dependência de segurança para as rotas do painel de gestão.
    Garante que o usuário logado:
    1. É um usuário da tabela `usuarios_ti`.
    2. Possui o `nivel_acesso` de 'gestor'.
    """
    if not isinstance(current_user, models.UsuarioTI):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Credenciais de gestão inválidas."
        )
    
    if current_user.nivel_acesso != "gestor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Você não tem permissão de gestor."
        )
    
    return current_user
