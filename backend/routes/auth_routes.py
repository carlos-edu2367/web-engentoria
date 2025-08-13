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

    dashboard_type = "vistoriador" # Padrão
    user_info = {"email": user.email, "nome": user.nome}

    if isinstance(user, models.UsuarioTI):
        dashboard_type = "ti"
    elif isinstance(user, models.GrupoImobiliaria):
        dashboard_type = "imobiliaria"
    elif isinstance(user, models.Usuario):
        if user.tipo == 'admin':
            dashboard_type = "admin"
        else:
            dashboard_type = "vistoriador"
        user_info["tipo"] = user.tipo
    
    user_info["dashboard_type"] = dashboard_type

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email, "dashboard": dashboard_type}, 
        expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer", "user_info": user_info}
