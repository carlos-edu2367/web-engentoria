# backend/routes/auth_routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from .. import models, schemas, auth
from ..config import settings, get_db

router = APIRouter(
    prefix="/auth",
    tags=["Autenticação"]
)

@router.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Endpoint de login unificado. Recebe email (no campo username) e senha.
    Autentica usuários de TI, vistoriadores/admins e grupos de imobiliárias.
    """
    user = auth.get_user(db, email=form_data.username)

    if not user or not auth.verify_password(form_data.password, user.senha):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ALTERADO: Define o tipo de dashboard para o token com base no tipo de usuário
    dashboard_type = "vistoriador" # Padrão
    if isinstance(user, models.UsuarioTI):
        dashboard_type = "ti"
    elif isinstance(user, models.Usuario) and user.tipo == 'admin':
        dashboard_type = "admin"
    # NOVO: Verifica se o usuário é um grupo de imobiliária
    elif isinstance(user, models.GrupoImobiliaria):
        dashboard_type = "imobiliaria"

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        # Inclui o tipo de dashboard no payload do token
        data={"sub": user.email, "dashboard": dashboard_type}, 
        expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}
