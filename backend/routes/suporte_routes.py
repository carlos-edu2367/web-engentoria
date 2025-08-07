# backend/routes/suporte_routes.py

from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..config import get_db

router = APIRouter(
    prefix="/suporte",
    tags=["Suporte"]
)

# =================================================================
# --- Endpoints Públicos ---
# =================================================================

@router.post(
    "/login-problema",
    status_code=status.HTTP_201_CREATED,
    summary="Cria um chamado de suporte para problemas de login (público)"
)
def create_login_help_request(
    chamado_data: schemas.LoginAjudaCreate,
    db: Session = Depends(get_db)
):
    """
    Endpoint público para usuários que não conseguem logar.
    Ele tenta encontrar o usuário pelo email e cria um chamado associado a ele.
    """
    user = auth.get_user(db, email=chamado_data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="O email fornecido não foi encontrado em nosso sistema. Por favor, verifique."
        )
    
    db_chamado = models.Chamado(
        titulo="Problema de Login Reportado",
        descricao=f"Email do usuário: {chamado_data.email}\n\nProblema: {chamado_data.descricao}",
        categoria="Problema Técnico",
        prioridade="Alta",
        usuario_id=user.id
    )
    db.add(db_chamado)
    db.commit()
    db.refresh(db_chamado)
    
    return {"message": "Seu pedido de ajuda foi enviado com sucesso. Nossa equipe entrará em contato em breve."}

@router.get(
    "/app-version",
    response_model=schemas.AppVersionInfo,
    summary="Obtém a versão atual do aplicativo"
)
def get_app_version(db: Session = Depends(get_db)):
    """Endpoint público para obter a versão atual do app."""
    version = db.query(models.AppVersion).filter(models.AppVersion.id == 1).first()
    if not version:
        raise HTTPException(status_code=404, detail="Versão do aplicativo não definida.")
    return version

# =================================================================
# --- Endpoints Protegidos (Usuário Logado) ---
# =================================================================

@router.post(
    "/chamados", 
    status_code=status.HTTP_201_CREATED, 
    response_model=schemas.ChamadoCreate,
    dependencies=[Depends(auth.get_current_user)],
    summary="Cria um chamado de suporte para usuários logados"
)
def create_chamado(
    chamado: schemas.ChamadoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(auth.get_current_user)
):
    """
    Endpoint para um vistoriador logado abrir um novo chamado de suporte.
    """
    db_chamado = models.Chamado(
        **chamado.model_dump(),
        usuario_id=current_user.id
    )
    db.add(db_chamado)
    db.commit()
    db.refresh(db_chamado)
    
    return db_chamado

@router.get(
    "/feedbacks/check-status",
    response_model=schemas.FeedbackCheck,
    summary="Verifica se o usuário já enviou feedback para a versão atual"
)
def check_feedback_status(
    app_version: str,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(auth.get_current_user)
):
    """Verifica se já existe um feedback do usuário logado para a versão especificada."""
    feedback = db.query(models.Feedback).filter(
        models.Feedback.usuario_id == current_user.id,
        models.Feedback.app_version == app_version
    ).first()
    return {"has_submitted": feedback is not None}


@router.post(
    "/feedbacks",
    status_code=status.HTTP_201_CREATED,
    summary="Envia um novo feedback"
)
def submit_feedback(
    feedback_data: schemas.FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(auth.get_current_user)
):
    """Endpoint para um usuário logado enviar um feedback sobre a versão do app."""
    
    # Verifica se já não existe um feedback para esta versão
    existing_feedback = db.query(models.Feedback).filter(
        models.Feedback.usuario_id == current_user.id,
        models.Feedback.app_version == feedback_data.app_version
    ).first()

    if existing_feedback:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você já enviou um feedback para esta versão do aplicativo."
        )

    new_feedback = models.Feedback(
        **feedback_data.model_dump(),
        usuario_id=current_user.id
    )
    db.add(new_feedback)
    db.commit()
    return {"message": "Seu feedback foi enviado com sucesso. Obrigado!"}
