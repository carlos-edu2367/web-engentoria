# backend/routes/agenda_routes.py

from fastapi import APIRouter, Depends, Query
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

@router.get("/", response_model=List[schemas.Vistoria])
def read_agenda_do_vistoriador(
    periodo: Optional[str] = Query(None, description="Filtre por 'hoje', 'amanha', 'semana', ou 'mes'"),
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(auth.get_current_active_vistoriador)
):
    """
    Endpoint principal que retorna a agenda do vistoriador logado.
    Ele é protegido e só pode ser acessado com um token válido.
    """
    # Construo a query base para buscar as vistorias.
    query = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == current_user.id, models.Agenda.is_deleted == False)

    # Uso 'joinedload' para otimizar a query. Ele faz um JOIN para buscar os dados
    # relacionados (imovel, cliente, etc.) em uma única consulta, evitando o problema N+1.
    query = query.options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.cliente),
        joinedload(models.Agenda.vistoriador)
    )

    # Aplico os filtros de data com base no parâmetro 'periodo'.
    today = date.today()
    if periodo == "hoje":
        query = query.filter(models.Agenda.data == today)
    elif periodo == "amanha":
        tomorrow = today + timedelta(days=1)
        query = query.filter(models.Agenda.data == tomorrow)
    elif periodo == "semana":
        # Do dia de hoje até os próximos 7 dias.
        end_of_week = today + timedelta(days=7)
        query = query.filter(models.Agenda.data.between(today, end_of_week))
    elif periodo == "mes":
        # Do dia de hoje até os próximos 30 dias.
        end_of_month = today + timedelta(days=30)
        query = query.filter(models.Agenda.data.between(today, end_of_month))

    # Ordeno os resultados por data e horário.
    vistorias = query.order_by(models.Agenda.data, models.Agenda.horario).all()

    # Preparo a lista de resultados para o formato do schema.
    # Isso é necessário para montar a estrutura aninhada do JSON de resposta.
    results = []
    for vistoria in vistorias:
        vistoria_data = {
            "id": vistoria.id,
            "tipo_vistoria": vistoria.tipo,
            "data": vistoria.data,
            "horario": vistoria.horario,
            "vistoriador": vistoria.vistoriador,
            "imovel": None,
            "cliente": None
        }
        if vistoria.imovel:
            vistoria_data["imovel"] = vistoria.imovel
            if vistoria.imovel.cliente:
                 vistoria_data["cliente"] = vistoria.imovel.cliente
        
        results.append(schemas.Vistoria.model_validate(vistoria_data))

    return results
