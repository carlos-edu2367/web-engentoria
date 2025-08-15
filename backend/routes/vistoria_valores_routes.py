# backend/routes/vistoria_valores_routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from decimal import Decimal
from typing import Optional

from .. import models, auth
from ..config import get_db

router = APIRouter(
    prefix="/vistorias",
    tags=["Valores de Vistorias"],
    dependencies=[Depends(auth.get_current_admin_user)]
)

@router.put("/{vistoria_id}/valores", summary="Atualizar valores e observações de uma vistoria")
def update_vistoria_valores(
    vistoria_id: UUID,
    valor_cobrado: Optional[float] = None,
    valor_comissao: Optional[float] = None,
    observacoes: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Atualiza os valores e observações de uma vistoria específica."""
    
    db_vistoria = db.query(models.Agenda).filter(
        models.Agenda.id == vistoria_id,
        models.Agenda.is_deleted == False
    ).first()
    
    if not db_vistoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vistoria não encontrada"
        )

    # Atualiza os valores apenas se fornecidos
    if valor_cobrado is not None:
        try:
            db_vistoria.valor_final_vistoria = Decimal(str(valor_cobrado))
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Valor cobrado inválido"
            )
    
    if valor_comissao is not None:
        try:
            db_vistoria.valor_vistoriador = Decimal(str(valor_comissao))
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Valor de comissão inválido"
            )
    
    if observacoes is not None:
        db_vistoria.observacao_privada = observacoes.strip() or None
    
    try:
        db.commit()
        db.refresh(db_vistoria)
        return {
            "id": db_vistoria.id,
            "valor_final_vistoria": float(db_vistoria.valor_final_vistoria) if db_vistoria.valor_final_vistoria else None,
            "valor_vistoriador": float(db_vistoria.valor_vistoriador) if db_vistoria.valor_vistoriador else None,
            "observacao_privada": db_vistoria.observacao_privada
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar valores: {str(e)}"
        )
