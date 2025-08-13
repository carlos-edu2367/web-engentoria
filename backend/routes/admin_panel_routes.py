# backend/routes/admin_panel_routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from .. import models, schemas, auth

# Importa a função para obter a sessão do banco e a função de hash de senha
from ..config import get_db
from ..auth import get_password_hash

# Cria um novo roteador para o painel de administração
# Todas as rotas aqui serão protegidas pela dependência 'get_current_admin_user'
router = APIRouter(
    prefix="/admin",
    tags=["Painel de Administração"],
    dependencies=[Depends(auth.get_current_admin_user)]
)

# =================================================================
# --- CRUD para Imobiliárias ---
# =================================================================

@router.post("/imobiliarias/", response_model=schemas.ImobiliariaDisplay, status_code=status.HTTP_201_CREATED, summary="Criar uma nova imobiliária")
def create_imobiliaria(imobiliaria: schemas.ImobiliariaCreate, db: Session = Depends(get_db)):
    """
    Cria um novo registro de imobiliária no banco de dados.
    - **nome**: Nome da imobiliária (obrigatório e único).
    - **valores**: Valores por m² para os tipos de mobília.
    - **email/senha**: Opcionais para criar um login para a imobiliária.
    """
    # Verifica se já existe uma imobiliária com o mesmo nome ou email
    existing_imobiliaria = db.query(models.Imobiliaria).filter(
        (models.Imobiliaria.nome == imobiliaria.nome) | 
        (models.Imobiliaria.email == imobiliaria.email if imobiliaria.email else False)
    ).first()

    if existing_imobiliaria:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma imobiliária com este nome ou e-mail."
        )
    
    hashed_password = None
    if imobiliaria.senha:
        hashed_password = get_password_hash(imobiliaria.senha)

    db_imobiliaria = models.Imobiliaria(
        **imobiliaria.model_dump(exclude={"senha"}), 
        senha=hashed_password
    )
    
    db.add(db_imobiliaria)
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

@router.get("/imobiliarias/", response_model=List[schemas.ImobiliariaDisplay], summary="Listar todas as imobiliárias")
def read_imobiliarias(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retorna uma lista de todas as imobiliárias não deletadas.
    """
    imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).offset(skip).limit(limit).all()
    return imobiliarias

@router.get("/imobiliarias/{imobiliaria_id}", response_model=schemas.ImobiliariaDisplay, summary="Obter uma imobiliária por ID")
def read_imobiliaria(imobiliaria_id: UUID, db: Session = Depends(get_db)):
    """
    Retorna os detalhes de uma imobiliária específica pelo seu ID.
    """
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")
    return db_imobiliaria

@router.put("/imobiliarias/{imobiliaria_id}", response_model=schemas.ImobiliariaDisplay, summary="Atualizar uma imobiliária")
def update_imobiliaria(imobiliaria_id: UUID, imobiliaria_update: schemas.ImobiliariaUpdate, db: Session = Depends(get_db)):
    """
    Atualiza os dados de uma imobiliária existente.
    """
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")

    # Verifica se o novo nome já está em uso por outra imobiliária
    if imobiliaria_update.nome != db_imobiliaria.nome:
        existing = db.query(models.Imobiliaria).filter(models.Imobiliaria.nome == imobiliaria_update.nome, models.Imobiliaria.is_deleted == False).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma imobiliária com este nome.")

    update_data = imobiliaria_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_imobiliaria, key, value)
    
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

@router.delete("/imobiliarias/{imobiliaria_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar uma imobiliária")
def delete_imobiliaria(imobiliaria_id: UUID, db: Session = Depends(get_db)):
    """
    Realiza a exclusão lógica (soft delete) de uma imobiliária.
    A imobiliária não será removida permanentemente, mas marcada como deletada.
    """
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")
    
    # Verifica se existem imóveis associados antes de deletar
    imoveis_associados = db.query(models.Imovel).filter(models.Imovel.imobiliaria_id == imobiliaria_id, models.Imovel.is_deleted == False).count()
    if imoveis_associados > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não é possível deletar. Existem {imoveis_associados} imóveis ativos associados a esta imobiliária."
        )

    db_imobiliaria.is_deleted = True
    db.commit()
    return None
