# backend/routes/admin_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, and_, inspect, text, case
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, date

from .. import models, schemas, auth
from ..config import get_db, Base

# Crio um roteador dedicado para o painel de gestão.
# Todas as rotas aqui dentro serão protegidas pela dependência de gestor.
router = APIRouter(
    prefix="/admin",
    tags=["Painel de Gestão de TI"],
    dependencies=[Depends(auth.get_current_gestor_user)]
)

# =================================================================
# --- Endpoints do Dashboard ---
# =================================================================

@router.get(
    "/dashboard/stats",
    response_model=schemas.DashboardStats,
    summary="Obtém estatísticas gerais do sistema"
)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Retorna as contagens principais do sistema para exibição nos cards do dashboard.
    Acesso restrito a usuários com nível de acesso 'gestor'.
    """
    try:
        total_users = db.query(models.Usuario).filter(models.Usuario.is_deleted == False).count()
        total_clients = db.query(models.Cliente).filter(models.Cliente.is_deleted == False).count()
        total_imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).count()
        total_imoveis = db.query(models.Imovel).filter(models.Imovel.is_deleted == False).count()
        
        open_tickets_statuses = ["Aberto", "Reaberto"]
        open_tickets = db.query(models.Chamado).filter(
            models.Chamado.status.in_(open_tickets_statuses),
            models.Chamado.is_deleted == False
        ).count()

        return schemas.DashboardStats(
            total_users=total_users,
            total_clients=total_clients,
            total_imobiliarias=total_imobiliarias,
            total_imoveis=total_imoveis,
            open_tickets=open_tickets
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocorreu um erro ao buscar as estatísticas do dashboard: {e}"
        )

@router.get(
    "/dashboard/feedback-chart",
    response_model=List[schemas.FeedbackChartItem],
    summary="Obtém dados para o gráfico de média de avaliações"
)
def get_feedback_stats_for_chart(db: Session = Depends(get_db)):
    """
    Busca a nota média de feedback por versão do app, para as últimas 5 versões com feedback.
    Acesso restrito a usuários com nível de acesso 'gestor'.
    """
    try:
        latest_versions_subquery = db.query(models.Feedback.app_version)\
            .filter(models.Feedback.is_deleted == False)\
            .distinct()\
            .order_by(desc(models.Feedback.app_version))\
            .limit(5)\
            .subquery()

        results = db.query(
            models.Feedback.app_version,
            func.avg(models.Feedback.nota).label("media_nota")
        ).filter(
            models.Feedback.app_version.in_(latest_versions_subquery),
            models.Feedback.is_deleted == False
        ).group_by(
            models.Feedback.app_version
        ).order_by(
            models.Feedback.app_version
        ).all()
        
        return [schemas.FeedbackChartItem(version=row[0], avg_rating=float(row[1])) for row in results]
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocorreu um erro ao buscar os dados do gráfico de feedback: {e}"
        )

# =================================================================
# --- Endpoints de Gerenciamento de Usuários ---
# =================================================================

@router.get(
    "/users",
    response_model=List[schemas.AdminUserDisplay],
    summary="Lista todos os usuários do sistema (app e clientes)"
)
def get_all_system_users(db: Session = Depends(get_db)):
    all_users = []
    app_users = db.query(models.Usuario).filter(models.Usuario.is_deleted == False).order_by(models.Usuario.nome).all()
    for user in app_users:
        all_users.append(schemas.AdminUserDisplay(id=user.id, nome=user.nome, email=user.email, tipo=user.tipo, table='usuarios'))
    client_users = db.query(models.Cliente).filter(models.Cliente.is_deleted == False).order_by(models.Cliente.nome).all()
    for user in client_users:
        all_users.append(schemas.AdminUserDisplay(id=user.id, nome=user.nome, email=user.email, tipo='cliente', table='clientes'))
    return all_users

@router.post(
    "/users",
    response_model=schemas.AdminUserDisplay,
    status_code=status.HTTP_201_CREATED,
    summary="Cria um novo usuário (admin, vistoriador ou cliente)"
)
def create_user(user_data: schemas.AdminUserCreate, db: Session = Depends(get_db)):
    existing_user = auth.get_user(db, email=user_data.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está cadastrado no sistema.")
    if user_data.tipo in ['admin', 'vistoriador']:
        if not user_data.senha:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A senha é obrigatória para usuários do tipo 'admin' ou 'vistoriador'.")
        hashed_password = auth.get_password_hash(user_data.senha)
        new_user = models.Usuario(nome=user_data.nome, email=user_data.email, tipo=user_data.tipo, senha=hashed_password)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return schemas.AdminUserDisplay(id=new_user.id, nome=new_user.nome, email=new_user.email, tipo=new_user.tipo, table='usuarios')
    elif user_data.tipo == 'cliente':
        new_user = models.Cliente(nome=user_data.nome, email=user_data.email)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return schemas.AdminUserDisplay(id=new_user.id, nome=new_user.nome, email=new_user.email, tipo='cliente', table='clientes')
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de usuário inválido. Use 'admin', 'vistoriador' ou 'cliente'.")

@router.put(
    "/users/{table}/{user_id}",
    response_model=schemas.AdminUserDisplay,
    summary="Atualiza um usuário existente"
)
def update_user(table: str, user_id: UUID, user_data: schemas.AdminUserUpdate, db: Session = Depends(get_db)):
    if table not in ['usuarios', 'clientes']:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tabela inválida.")
    Model = models.Usuario if table == 'usuarios' else models.Cliente
    db_user = db.query(Model).filter(Model.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    db_user.nome = user_data.nome
    db_user.email = user_data.email
    if table == 'usuarios':
        db_user.tipo = user_data.tipo
        if user_data.senha:
            db_user.senha = auth.get_password_hash(user_data.senha)
    db.commit()
    db.refresh(db_user)
    return schemas.AdminUserDisplay(id=db_user.id, nome=db_user.nome, email=db_user.email, tipo=db_user.tipo if table == 'usuarios' else 'cliente', table=table)

@router.delete(
    "/users/{table}/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Move um usuário para a lixeira (soft delete)"
)
def soft_delete_user(table: str, user_id: UUID, db: Session = Depends(get_db)):
    if table not in ['usuarios', 'clientes']:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tabela inválida.")
    Model = models.Usuario if table == 'usuarios' else models.Cliente
    db_user = db.query(Model).filter(Model.id == user_id, Model.is_deleted == False).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado ou já deletado.")
    db_user.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- Endpoints de Gestão de Chamados e Feedbacks ---
# =================================================================

@router.get(
    "/chamados",
    response_model=List[schemas.ChamadoAdminDisplay],
    summary="Lista todos os chamados de suporte do sistema"
)
def get_all_chamados(db: Session = Depends(get_db)):
    """
    Busca todos os chamados que não foram deletados, juntando com os dados do usuário
    que abriu o chamado. A ordenação prioriza os chamados abertos e mais antigos.
    """
    order_logic = case(
        (models.Chamado.status == 'Aberto', 1),
        (models.Chamado.status == 'Reaberto', 2),
        (models.Chamado.status == 'Resolvido', 3),
        else_=4
    )

    chamados = db.query(models.Chamado)\
        .options(joinedload(models.Chamado.usuario))\
        .filter(models.Chamado.is_deleted == False)\
        .order_by(order_logic, models.Chamado.data_abertura.asc())\
        .all()

    response = []
    for c in chamados:
        response.append(schemas.ChamadoAdminDisplay(
            id=c.id,
            titulo=c.titulo,
            status=c.status,
            prioridade=c.prioridade,
            categoria=c.categoria,
            nome_usuario=c.usuario.nome if c.usuario else "Usuário não encontrado",
            data_abertura=c.data_abertura,
            descricao=c.descricao,
            comentario_conclusao=c.comentario_conclusao
        ))
    return response

@router.post(
    "/chamados/{chamado_id}/resolve",
    response_model=schemas.ChamadoAdminDisplay,
    summary="Resolve um chamado de suporte"
)
def resolve_chamado(chamado_id: UUID, resolve_data: schemas.ChamadoResolve, db: Session = Depends(get_db)):
    db_chamado = db.query(models.Chamado).filter(models.Chamado.id == chamado_id, models.Chamado.is_deleted == False).first()
    if not db_chamado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chamado não encontrado.")
    if db_chamado.status == 'Resolvido':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este chamado já está resolvido.")
    db_chamado.status = 'Resolvido'
    db_chamado.comentario_conclusao = resolve_data.comentario_conclusao
    db_chamado.data_conclusao = datetime.utcnow()
    db_chamado.notificacao_vista = False
    db.commit()
    db.refresh(db_chamado)
    return schemas.ChamadoAdminDisplay(id=db_chamado.id, titulo=db_chamado.titulo, status=db_chamado.status, prioridade=db_chamado.prioridade, categoria=db_chamado.categoria, nome_usuario=db_chamado.usuario.nome if db_chamado.usuario else "Usuário não encontrado", data_abertura=db_chamado.data_abertura, descricao=db_chamado.descricao, comentario_conclusao=db_chamado.comentario_conclusao)

@router.get(
    "/feedbacks",
    response_model=List[schemas.FeedbackAdminDisplay],
    summary="Lista todos os feedbacks dos usuários"
)
def get_all_feedbacks(db: Session = Depends(get_db)):
    feedbacks = db.query(models.Feedback).options(joinedload(models.Feedback.usuario)).filter(models.Feedback.is_deleted == False).order_by(desc(models.Feedback.data_envio)).all()
    response = []
    for fb in feedbacks:
        response.append(schemas.FeedbackAdminDisplay(app_version=fb.app_version, nota=fb.nota, comentario=fb.comentario, data_envio=fb.data_envio, nome_usuario=fb.usuario.nome if fb.usuario else "Usuário não encontrado"))
    return response

# =================================================================
# --- Endpoints de Gestão de Vistorias Improdutivas ---
# =================================================================

@router.get(
    "/improdutivas",
    response_model=List[schemas.ImprodutivaDisplay],
    summary="Busca vistorias marcadas como improdutivas"
)
def search_improdutivas(
    cod_imovel: Optional[str] = Query(None, description="Filtrar por código do imóvel (busca parcial)"),
    data_vistoria: Optional[date] = Query(None, description="Filtrar por data exata da vistoria original (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    query = db.query(models.VistoriaImprodutiva).options(joinedload(models.VistoriaImprodutiva.imovel), joinedload(models.VistoriaImprodutiva.cliente)).filter(models.VistoriaImprodutiva.is_deleted == False)
    if cod_imovel:
        query = query.join(models.Imovel).filter(models.Imovel.cod_imovel.ilike(f"%{cod_imovel}%"))
    if data_vistoria:
        query = query.filter(models.VistoriaImprodutiva.data_vistoria_original == data_vistoria)
    results = query.order_by(desc(models.VistoriaImprodutiva.data_vistoria_original)).all()
    response = []
    for vi in results:
        response.append(schemas.ImprodutivaDisplay(id=vi.id, data_vistoria=vi.data_vistoria_original.strftime('%d/%m/%Y'), horario=vi.horario_vistoria_original, cod_imovel=vi.imovel.cod_imovel if vi.imovel else "N/A", cliente=vi.cliente.nome if vi.cliente else "N/A", motivo=vi.motivo_improdutividade))
    return response

@router.post(
    "/improdutivas/{improdutiva_id}/revert",
    summary="Reverte uma vistoria improdutiva",
    status_code=status.HTTP_200_OK
)
def revert_improdutiva(improdutiva_id: UUID, db: Session = Depends(get_db)):
    try:
        improdutiva = db.query(models.VistoriaImprodutiva).options(joinedload(models.VistoriaImprodutiva.agenda_original), joinedload(models.VistoriaImprodutiva.cliente)).filter(models.VistoriaImprodutiva.id == improdutiva_id).first()
        if not improdutiva:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoria improdutiva não encontrada.")
        agenda_original = improdutiva.agenda_original
        cliente = improdutiva.cliente
        valor_cobranca = improdutiva.valor_cobranca
        if not agenda_original or not cliente:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dados associados (agenda ou cliente) não encontrados.")
        cliente.saldo_devedor_total -= valor_cobranca
        agenda_original.tipo = 'LIVRE'
        agenda_original.disponivel = True
        agenda_original.imovel_id = None
        db.delete(improdutiva)
        db.commit()
        return {"message": "Vistoria improdutiva revertida com sucesso! O horário na agenda foi liberado e a cobrança estornada."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro ao reverter a vistoria: {e}")

# =================================================================
# --- Endpoints de Manutenção e Restauração ---
# =================================================================

# Mapeamento de nomes de tabela para os modelos SQLAlchemy
TABLE_MODEL_MAP = {
    "usuarios": models.Usuario,
    "clientes": models.Cliente,
    "imobiliarias": models.Imobiliaria,
    "imoveis": models.Imovel,
    "agenda": models.Agenda,
    "feedbacks": models.Feedback,
    "chamados": models.Chamado,
    "vistorias_improdutivas": models.VistoriaImprodutiva,
}

@router.get(
    "/restore/records",
    response_model=List[schemas.DeletedRecordInfo],
    summary="Lista todos os registros marcados para exclusão (soft-deleted)"
)
def get_deleted_records(db: Session = Depends(get_db)):
    """
    Varre todas as tabelas gerenciáveis, busca por registros com `is_deleted = True`
    e os retorna em uma lista unificada para a tela de restauração.
    """
    deleted_records = []
    for table_name, model in TABLE_MODEL_MAP.items():
        display_column_attr = getattr(model, 'nome', getattr(model, 'titulo', getattr(model, 'cod_imovel', None)))
        
        records = db.query(model).filter(model.is_deleted == True).all()
        for record in records:
            display_info = str(record.id)
            if display_column_attr:
                # CORREÇÃO: Acessa o nome da coluna usando .key em vez de .__name__
                display_info = getattr(record, display_column_attr.key, str(record.id))

            deleted_records.append(schemas.DeletedRecordInfo(
                id=record.id,
                nome_info=display_info,
                data_delecao=record.updated_at.strftime('%d/%m/%Y %H:%M'),
                tabela=table_name
            ))
    
    deleted_records.sort(key=lambda r: r.data_delecao, reverse=True)
    return deleted_records

@router.post(
    "/restore/records/{table_name}/{record_id}",
    summary="Restaura um registro específico"
)
def restore_record(table_name: str, record_id: UUID, db: Session = Depends(get_db)):
    """
    Restaura um item que foi movido para a lixeira, alterando `is_deleted` para `False`.
    """
    if table_name not in TABLE_MODEL_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome de tabela inválido.")
    
    model = TABLE_MODEL_MAP[table_name]
    record = db.query(model).filter(model.id == record_id, model.is_deleted == True).first()

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado na lixeira.")

    record.is_deleted = False
    db.commit()
    return {"message": f"Registro da tabela '{table_name}' restaurado com sucesso."}

@router.get(
    "/maintenance/cleanup-preview",
    response_model=schemas.CleanupPreviewResponse,
    summary="Verifica a contagem de registros a serem limpos"
)
def count_deleted_records(db: Session = Depends(get_db)):
    """
    Conta quantos registros em cada tabela estão marcados com `is_deleted = True`
    para prever o que será removido na limpeza permanente.
    """
    counts = {}
    total_count = 0
    for table_name, model in TABLE_MODEL_MAP.items():
        count = db.query(model).filter(model.is_deleted == True).count()
        if count > 0:
            counts[table_name] = count
            total_count += count
    
    return schemas.CleanupPreviewResponse(counts=counts, total=total_count)

@router.delete(
    "/maintenance/cleanup-execute",
    summary="Executa a limpeza permanente de registros"
)
def permanently_delete_records(db: Session = Depends(get_db)):
    """
    **AÇÃO DESTRUTIVA E IRREVERSÍVEL.**
    Deleta permanentemente todos os registros de todas as tabelas gerenciáveis
    que estão marcados com `is_deleted = True`.
    A ordem de exclusão respeita as dependências para evitar erros de chave estrangeira.
    """
    cleanup_order = [
        "vistorias_improdutivas", "agenda", "feedbacks", "chamados",
        "imoveis", "clientes", "usuarios", "imobiliarias"
    ]
    
    total_deleted = 0
    try:
        for table_name in cleanup_order:
            if table_name in TABLE_MODEL_MAP:
                model = TABLE_MODEL_MAP[table_name]
                deleted_count = db.query(model).filter(model.is_deleted == True).delete(synchronize_session=False)
                total_deleted += deleted_count
        
        db.commit()
        return {"message": f"Limpeza concluída com sucesso! Total de {total_deleted} registros permanentemente removidos."}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocorreu um erro durante a limpeza permanente: {e}"
        )

@router.post(
    "/maintenance/app-version",
    summary="Atualiza a versão do aplicativo"
)
def update_app_version(version_data: schemas.AppVersionUpdate, db: Session = Depends(get_db)):
    """
    Atualiza ou cria o registro da versão do aplicativo.
    Utiliza um ID fixo (1) para garantir que haja sempre um único registro de versão.
    """
    if not version_data.new_version or not version_data.new_version.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A nova versão não pode ser vazia."
        )

    db_version = db.query(models.AppVersion).filter(models.AppVersion.id == 1).first()

    if db_version:
        db_version.version_tag = version_data.new_version.strip()
        db_version.updated_at = datetime.utcnow()
    else:
        db_version = models.AppVersion(
            id=1,
            version_tag=version_data.new_version.strip()
        )
        db.add(db_version)
    
    try:
        db.commit()
        db.refresh(db_version)
        return {"message": f"Versão do aplicativo atualizada para '{db_version.version_tag}' com sucesso!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ocorreu um erro ao atualizar a versão: {e}"
        )
