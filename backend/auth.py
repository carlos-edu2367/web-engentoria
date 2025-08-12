# backend/auth.py

import bcrypt
import hashlib 
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from typing import Optional, Union

from . import models, schemas
from .config import settings, get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        password_byte_enc = plain_password.encode('utf-8')
        hashed_password_byte_enc = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_byte_enc, hashed_password_byte_enc)
    except (ValueError, TypeError):
        old_system_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
        return old_system_hash == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# ALTERADO: A função agora busca em 3 tabelas diferentes
def get_user(db: Session, email: str) -> Optional[Union[models.Usuario, models.UsuarioTI, models.GrupoImobiliaria]]:
    """
    Busca um usuário pelo email, na seguinte ordem:
    1. Usuários de TI (Gestores)
    2. Grupos de Imobiliárias
    3. Usuários da Aplicação (Vistoriadores, etc.)
    Retorna o objeto do usuário encontrado, ou None.
    """
    # 1. Tenta encontrar na tabela de usuários de TI
    user_ti = db.query(models.UsuarioTI).filter(models.UsuarioTI.email == email).first()
    if user_ti:
        return user_ti
    
    # 2. NOVO: Tenta encontrar na tabela de grupos de imobiliárias
    user_imobiliaria = db.query(models.GrupoImobiliaria).filter(models.GrupoImobiliaria.email == email, models.GrupoImobiliaria.is_deleted == False).first()
    if user_imobiliaria:
        return user_imobiliaria

    # 3. Se não encontrar, busca na tabela de usuários da aplicação
    user_app = db.query(models.Usuario).filter(models.Usuario.email == email, models.Usuario.is_deleted == False).first()
    if user_app:
        return user_app

    return None

# ALTERADO: O tipo de retorno agora é mais genérico para acomodar todos os tipos de usuário
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Union[models.Usuario, models.UsuarioTI, models.GrupoImobiliaria]:
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
        
    return user

def get_current_active_vistoriador(current_user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
    if not isinstance(current_user, models.Usuario) or current_user.tipo not in ["vistoriador", "admin"]:
        raise HTTPException(status_code=403, detail="Acesso negado. Requer perfil de vistoriador ou admin.")
    return current_user

def get_current_gestor_user(current_user: models.UsuarioTI = Depends(get_current_user)) -> models.UsuarioTI:
    if not isinstance(current_user, models.UsuarioTI) or current_user.nivel_acesso != "gestor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Requer perfil de gestor de TI."
        )
    return current_user

# NOVO: Dependência de segurança para o Grupo de Imobiliária logado
def get_current_active_imobiliaria_group(current_user: models.GrupoImobiliaria = Depends(get_current_user)) -> models.GrupoImobiliaria:
    """
    Dependência de segurança para as rotas do painel da imobiliária.
    Garante que o usuário logado é um Grupo de Imobiliária.
    """
    if not isinstance(current_user, models.GrupoImobiliaria):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Requer perfil de imobiliária."
        )
    return current_user
