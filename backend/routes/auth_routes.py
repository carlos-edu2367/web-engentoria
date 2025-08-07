# backend/routes/auth_routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from .. import models, schemas, auth
from ..config import settings, get_db

# Crio um "roteador". É como um mini-app FastAPI que posso incluir no principal.
router = APIRouter(
    prefix="/auth",  # O prefixo da URL para todas as rotas neste arquivo
    tags=["Autenticação"] # Agrupa as rotas na documentação do FastAPI
)

@router.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Endpoint de login. Recebe email (no campo username) e senha.
    Usa o OAuth2PasswordRequestForm para seguir o padrão OAuth2.
    """
    # Busco o usuário no banco pelo email fornecido no formulário.
    user = auth.get_user(db, email=form_data.username)

    # Se o usuário não existe ou a senha está errada, retorno um erro.
    if not user or not auth.verify_password(form_data.password, user.senha):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # --- ATUALIZAÇÃO: Define o tipo de dashboard para o token ---
    dashboard_type = "vistoriador" # Padrão
    if isinstance(user, models.UsuarioTI):
        dashboard_type = "ti"
    elif isinstance(user, models.Usuario) and user.tipo == 'admin':
        dashboard_type = "admin"


    # Se deu tudo certo, crio o token de acesso.
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email, "dashboard": dashboard_type}, 
        expires_delta=access_token_expires
    )

    # Retorno o token no formato definido no schema.
    return {"access_token": access_token, "token_type": "bearer"}
