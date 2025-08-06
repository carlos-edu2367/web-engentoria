# backend/routes/suporte_routes.py

from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..config import get_db

router = APIRouter(
    prefix="/suporte",
    tags=["Suporte"]
)

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
