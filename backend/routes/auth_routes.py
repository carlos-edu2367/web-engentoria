# backend/routes/auth_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

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
    elif isinstance(user, (models.GrupoImobiliaria, models.UsuarioImobiliaria)):
        dashboard_type = "imobiliaria"
        grupo = auth.resolver_login_imobiliaria(user)
        user_info["grupo"] = grupo.nome
        user_info["permissoes"] = grupo.permissoes
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


@router.post("/recover-password", status_code=status.HTTP_200_OK)
def request_password_recovery(
    recovery_data: schemas.PasswordRecoveryRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Inicia o fluxo de recuperação de senha.
    Recebe um e-mail e, se ele existir, envia um link de redefinição.
    """
    user = auth.get_user(db, email=recovery_data.email)

    if user:
        # Invalida tokens antigos para este e-mail
        db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.email == recovery_data.email
        ).update({"used": True})

        # Gera e salva o novo token
        token = auth.generate_reset_token()
        # CORREÇÃO: Usar datetime com timezone (aware)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        
        db_token = models.PasswordResetToken(
            email=recovery_data.email,
            token=token,
            expires_at=expires_at
        )
        db.add(db_token)
        db.commit()

        # Envia o e-mail em segundo plano para não travar a resposta
        background_tasks.add_task(auth.send_password_reset_email, email_to=user.email, token=token)

    # Resposta genérica para evitar enumeração de e-mails
    return {"message": "Se um usuário com este e-mail existir, um link de recuperação foi enviado."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    reset_data: schemas.PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Confirma a redefinição de senha usando um token válido.
    """
    db_token = auth.get_password_reset_token(db, token=reset_data.token)

    # Validações do token
    # CORREÇÃO: Usar datetime com timezone (aware) na comparação
    if not db_token or db_token.used or datetime.now(timezone.utc) > db_token.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou expirado."
        )

    user = auth.get_user(db, email=db_token.email)
    if not user:
        # Caso raro, mas seguro de se ter
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário associado a este token não foi encontrado."
        )

    # Atualiza a senha e invalida o token
    hashed_password = auth.get_password_hash(reset_data.new_password)
    user.senha = hashed_password
    db_token.used = True
    
    db.commit()

    return {"message": "Sua senha foi redefinida com sucesso."}

