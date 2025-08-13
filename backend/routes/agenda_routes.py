# backend/routes/agenda_routes.py

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import date, timedelta

from .. import models, schemas, auth
from ..config import get_db

router = APIRouter(
    prefix="/agenda",
    tags=["Agenda"],
    # Adiciono a dependência de autenticação para todas as rotas neste arquivo.
    dependencies=[Depends(auth.get_current_active_vistoriador)]
)

@router.get("/", response_model=List[schemas.AgendaDisplay])
def read_agenda_do_vistoriador(
    periodo: Optional[str] = Query("hoje", description="Filtre por 'hoje', 'amanha', 'semana', 'mes' ou 'semana_passada'"),
    status_filtro: Optional[str] = Query(None, description="Filtre por 'agendados' ou 'livres'"),
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)
):
    """
    Endpoint principal que retorna a agenda do vistoriador logado.
    Ele é protegido e só pode ser acessado com um token válido.
    Agora com filtros avançados de período e status.
    """
    # Construo a query base para buscar as vistorias.
    query = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == current_user.id, models.Agenda.is_deleted == False)

    # Uso 'joinedload' para otimizar a query.
    query = query.options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.cliente),
        joinedload(models.Agenda.vistoriador)
    )

    # Aplico o filtro de STATUS
    if status_filtro == "agendados":
        tipos_agendados = ['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA', 'IMPRODUTIVA']
        query = query.filter(models.Agenda.tipo.in_(tipos_agendados))
    elif status_filtro == "livres":
        query = query.filter(models.Agenda.tipo == 'LIVRE')

    # Aplico os filtros de PERÍODO
    today = date.today()
    if periodo == "hoje":
        query = query.filter(models.Agenda.data == today)
    elif periodo == "amanha":
        tomorrow = today + timedelta(days=1)
        query = query.filter(models.Agenda.data == tomorrow)
    elif periodo == "semana":
        end_of_week = today + timedelta(days=7)
        query = query.filter(models.Agenda.data.between(today, end_of_week))
    elif periodo == "mes":
        end_of_month = today + timedelta(days=30)
        query = query.filter(models.Agenda.data.between(today, end_of_month))
    elif periodo == "semana_passada":
        start_of_last_week = today - timedelta(days=today.weekday() + 7)
        end_of_last_week = start_of_last_week + timedelta(days=6)
        query = query.filter(models.Agenda.data.between(start_of_last_week, end_of_last_week))
    
    # Ordeno os resultados por data e horário.
    vistorias = query.order_by(models.Agenda.data, models.Agenda.horario).all()

    return vistorias
