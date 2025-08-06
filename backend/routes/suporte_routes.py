# backend/routes/suporte_routes.py

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..config import get_db

router = APIRouter(
    prefix="/suporte",
    tags=["Suporte"],
    dependencies=[Depends(auth.get_current_user)] # Protegido para qualquer usuário logado
)

@router.post("/chamados", status_code=status.HTTP_201_CREATED, response_model=schemas.ChamadoCreate)
def create_chamado(
    chamado: schemas.ChamadoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(auth.get_current_user)
):
    """
    Endpoint para um vistoriador abrir um novo chamado de suporte.
    """
    # Crio a nova entrada no banco de dados com os dados recebidos e o ID do usuário logado.
    db_chamado = models.Chamado(
        **chamado.model_dump(),
        usuario_id=current_user.id
    )
    db.add(db_chamado)
    db.commit()
    db.refresh(db_chamado)
    
    return db_chamado
