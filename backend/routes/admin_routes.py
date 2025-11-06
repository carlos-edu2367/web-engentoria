# backend/routes/admin_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, case
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date

from .. import models, schemas, auth
from ..config import get_db


# Roteador para o painel de gestão, protegido para acesso de gestores (TI).
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
    Retorna as contagens principais para os cards do dashboard de gestão.
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
    Busca a nota média de feedback para as últimas 5 versões do app com avaliações.
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
    """Lista todos os usuários (app) e clientes, unificando a resposta."""
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
    """Cria um novo usuário, verificando a unicidade do e-mail em todo o sistema."""
    existing_user = auth.get_user(db, email=user_data.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está cadastrado no sistema.")

    if user_data.tipo in ['admin', 'vistoriador']:
        if not user_data.senha:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A senha é obrigatória para usuários do tipo 'admin' ou 'vistoriador'.")
        
        hashed_password = auth.get_password_hash(user_data.senha)
        new_user = models.Usuario(
            nome=user_data.nome, 
            email=user_data.email, 
            tipo=user_data.tipo, 
            senha=hashed_password
        )
        table_name = 'usuarios'

    elif user_data.tipo == 'cliente':
        new_user = models.Cliente(nome=user_data.nome, email=user_data.email)
        table_name = 'clientes'

    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de usuário inválido. Use 'admin', 'vistoriador' ou 'cliente'.")

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return schemas.AdminUserDisplay(
            id=new_user.id, 
            nome=new_user.nome, 
            email=new_user.email, 
            tipo=getattr(new_user, 'tipo', 'cliente'), 
            table=table_name
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Erro ao criar usuário: {e}")

@router.put(
    "/users/{table}/{user_id}",
    response_model=schemas.AdminUserDisplay,
    summary="Atualiza um usuário existente"
)
def update_user(table: str, user_id: UUID, user_data: schemas.AdminUserUpdate, db: Session = Depends(get_db)):
    """Atualiza um usuário, garantindo que o novo e-mail não entre em conflito com outros."""
    if table not in ['usuarios', 'clientes']:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tabela de usuário inválida.")
    
    Model = models.Usuario if table == 'usuarios' else models.Cliente
    db_user = db.query(Model).filter(Model.id == user_id, Model.is_deleted == False).first()

    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    if user_data.email != db_user.email:
        existing_user = auth.get_user(db, email=user_data.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O novo e-mail já está em uso.")
    
    db_user.nome = user_data.nome
    db_user.email = user_data.email
    
    if table == 'usuarios':
        db_user.tipo = user_data.tipo
        if user_data.senha:
            db_user.senha = auth.get_password_hash(user_data.senha)
            
    try:
        db.commit()
        db.refresh(db_user)
        return schemas.AdminUserDisplay(
            id=db_user.id, 
            nome=db_user.nome, 
            email=db_user.email, 
            tipo=getattr(db_user, 'tipo', 'cliente'), 
            table=table
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Erro ao atualizar usuário: {e}")

@router.delete(
    "/users/{table}/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Move um usuário para a lixeira (soft delete)"
)
def soft_delete_user(table: str, user_id: UUID, db: Session = Depends(get_db)):
    """Marca um usuário como deletado, sem removê-lo fisicamente do banco."""
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
# --- Endpoints de Gerenciamento de Imobiliárias e Grupos ---
# =================================================================

@router.post(
    "/grupos-imobiliarias",
    response_model=schemas.GrupoImobiliariaDisplay,
    status_code=status.HTTP_201_CREATED,
    summary="Cria um novo grupo de imobiliárias"
)
def create_imobiliaria_group(
    group_data: schemas.GrupoImobiliariaCreate,
    db: Session = Depends(get_db)
):
    """Cria um novo login de grupo, verificando a unicidade do e-mail em todo o sistema."""
    existing_user = auth.get_user(db, email=group_data.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está cadastrado no sistema.")
    
    hashed_password = auth.get_password_hash(group_data.senha)
    new_group = models.GrupoImobiliaria(
        nome=group_data.nome,
        email=group_data.email,
        senha=hashed_password
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return new_group

@router.get(
    "/grupos-imobiliarias",
    response_model=List[schemas.GrupoImobiliariaDisplay],
    summary="Lista todos os grupos de imobiliárias"
)
def get_all_imobiliaria_groups(db: Session = Depends(get_db)):
    """Retorna uma lista de todos os grupos de imobiliárias não deletados."""
    groups = db.query(models.GrupoImobiliaria).options(
        joinedload(models.GrupoImobiliaria.imobiliarias)
    ).filter(
        models.GrupoImobiliaria.is_deleted == False
    ).order_by(models.GrupoImobiliaria.nome).all()
    return groups

@router.put(
    "/grupos-imobiliarias/{group_id}",
    response_model=schemas.GrupoImobiliariaDisplay,
    summary="Atualiza um grupo de imobiliárias"
)
def update_imobiliaria_group(
    group_id: UUID,
    group_data: schemas.GrupoImobiliariaUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza nome, e-mail e, opcionalmente, a senha de um grupo de imobiliárias."""
    db_group = db.query(models.GrupoImobiliaria).filter(
        models.GrupoImobiliaria.id == group_id, 
        models.GrupoImobiliaria.is_deleted == False
    ).first()

    if not db_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo não encontrado.")

    if group_data.email != db_group.email:
        existing_user = auth.get_user(db, email=group_data.email)
        if existing_user and existing_user.id != group_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O novo e-mail já está em uso.")
    
    db_group.nome = group_data.nome
    db_group.email = group_data.email
    if group_data.senha:
        db_group.senha = auth.get_password_hash(group_data.senha)

    db.commit()
    db.refresh(db_group)
    return db_group

@router.delete(
    "/grupos-imobiliarias/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Move um grupo de imobiliárias para a lixeira"
)
def soft_delete_imobiliaria_group(group_id: UUID, db: Session = Depends(get_db)):
    """Marca um grupo como deletado, se não houver imobiliárias vinculadas."""
    db_group = db.query(models.GrupoImobiliaria).filter(
        models.GrupoImobiliaria.id == group_id, 
        models.GrupoImobiliaria.is_deleted == False
    ).first()
    
    if not db_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo não encontrado ou já deletado.")

    imobiliarias_vinculadas = db.query(models.Imobiliaria).filter(
        models.Imobiliaria.grupo_id == group_id,
        models.Imobiliaria.is_deleted == False
    ).count()

    if imobiliarias_vinculadas > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não é possível excluir. Existem {imobiliarias_vinculadas} imobiliárias ativas vinculadas a este grupo."
        )

    db_group.is_deleted = True
    db.commit()
    return None

@router.get(
    "/imobiliarias",
    response_model=List[schemas.ImobiliariaDetail],
    summary="Lista todas as imobiliárias e seus grupos"
)
def get_all_imobiliarias(db: Session = Depends(get_db)):
    """Retorna uma lista de todas as imobiliárias, incluindo a qual grupo pertencem."""
    imobiliarias = db.query(models.Imobiliaria).options(joinedload(models.Imobiliaria.grupo)).filter(models.Imobiliaria.is_deleted == False).order_by(models.Imobiliaria.nome).all()
    return imobiliarias

@router.post(
    "/imobiliarias",
    response_model=schemas.ImobiliariaDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Cria uma nova imobiliária"
)
def create_imobiliaria(
    imobiliaria_data: schemas.ImobiliariaCreate,
    db: Session = Depends(get_db)
):
    """Cria um novo registro de imobiliária."""
    existing = db.query(models.Imobiliaria).filter(models.Imobiliaria.nome == imobiliaria_data.nome, models.Imobiliaria.is_deleted == False).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma imobiliária com este nome.")
    
    new_imobiliaria = models.Imobiliaria(**imobiliaria_data.model_dump())
    db.add(new_imobiliaria)
    db.commit()
    db.refresh(new_imobiliaria)
    return new_imobiliaria

@router.put(
    "/imobiliarias/{imobiliaria_id}",
    response_model=schemas.ImobiliariaDetail,
    summary="Atualiza uma imobiliária existente"
)
def update_imobiliaria(
    imobiliaria_id: UUID,
    imobiliaria_data: schemas.ImobiliariaUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza os dados de uma imobiliária."""
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada.")
    
    existing_with_name = db.query(models.Imobiliaria).filter(
        models.Imobiliaria.nome == imobiliaria_data.nome,
        models.Imobiliaria.id != imobiliaria_id,
        models.Imobiliaria.is_deleted == False
    ).first()
    if existing_with_name:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma imobiliária com este nome.")

    for key, value in imobiliaria_data.model_dump().items():
        setattr(db_imobiliaria, key, value)
        
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

@router.delete(
    "/imobiliarias/{imobiliaria_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Move uma imobiliária para a lixeira (soft delete)"
)
def soft_delete_imobiliaria(imobiliaria_id: UUID, db: Session = Depends(get_db)):
    """Marca uma imobiliária como deletada (is_deleted = True)."""
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada ou já deletada.")
    
    db_imobiliaria.is_deleted = True
    db.commit()
    return None

@router.put(
    "/imobiliarias/{imobiliaria_id}/link-group",
    response_model=schemas.ImobiliariaDetail,
    summary="Vincula ou desvincula uma imobiliária de um grupo"
)
def link_imobiliaria_to_group(
    imobiliaria_id: UUID,
    link_data: schemas.ImobiliariaGrupoLink,
    db: Session = Depends(get_db)
):
    """
    Atualiza o vínculo de uma imobiliária a um grupo.
    Para desvincular, envie `{\"grupo_id\": null}`.
    """
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada.")

    if link_data.grupo_id:
        db_group = db.query(models.GrupoImobiliaria).filter(models.GrupoImobiliaria.id == link_data.grupo_id).first()
        if not db_group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grupo de imobiliária não encontrado.")
    
    db_imobiliaria.grupo_id = link_data.grupo_id
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

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
    Busca todos os chamados não deletados, priorizando os abertos e mais antigos.
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
    db_chamado = db.query(models.Chamado).options(joinedload(models.Chamado.usuario)).filter(models.Chamado.id == chamado_id, models.Chamado.is_deleted == False).first()
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
    
    # Recarrega o usuário para garantir que está na sessão, se existir
    if db_chamado.usuario:
        db.refresh(db_chamado.usuario)
    
    return schemas.ChamadoAdminDisplay(
        id=db_chamado.id,
        titulo=db_chamado.titulo,
        status=db_chamado.status,
        prioridade=db_chamado.prioridade,
        categoria=db_chamado.categoria,
        nome_usuario=db_chamado.usuario.nome if db_chamado.usuario else "Usuário não encontrado",
        data_abertura=db_chamado.data_abertura,
        descricao=db_chamado.descricao,
        comentario_conclusao=db_chamado.comentario_conclusao
    )


@router.get(
    "/feedbacks",
    response_model=List[schemas.FeedbackAdminDisplay],
    summary="Lista todos os feedbacks dos usuários"
)
def get_all_feedbacks(db: Session = Depends(get_db)):
    feedbacks = db.query(models.Feedback).options(joinedload(models.Feedback.usuario)).filter(models.Feedback.is_deleted == False).order_by(desc(models.Feedback.data_envio)).all()
    response = []
    for fb in feedbacks:
        response.append(schemas.FeedbackAdminDisplay(
            app_version=fb.app_version,
            nota=fb.nota,
            comentario=fb.comentario,
            data_envio=fb.data_envio,
            nome_usuario=fb.usuario.nome if fb.usuario else "Usuário não encontrado"
        ))
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
    query = db.query(models.VistoriaImprodutiva).options(
        joinedload(models.VistoriaImprodutiva.imovel), 
        joinedload(models.VistoriaImprodutiva.cliente)
    ).filter(models.VistoriaImprodutiva.is_deleted == False)
    
    if cod_imovel:
        query = query.join(models.Imovel).filter(models.Imovel.cod_imovel.ilike(f"%{cod_imovel}%"))
    if data_vistoria:
        query = query.filter(models.VistoriaImprodutiva.data_vistoria_original == data_vistoria)
        
    results = query.order_by(desc(models.VistoriaImprodutiva.data_vistoria_original)).all()
    
    response = []
    for vi in results:
        response.append(schemas.ImprodutivaDisplay(
            id=vi.id,
            data_vistoria=vi.data_vistoria_original.strftime('%d/%m/%Y'),
            horario=vi.horario_vistoria_original,
            cod_imovel=vi.imovel.cod_imovel if vi.imovel else "N/A",
            cliente=vi.cliente.nome if vi.cliente else "N/A",
            motivo=vi.motivo_improdutividade
        ))
    return response

@router.post(
    "/improdutivas/{improdutiva_id}/revert",
    summary="Reverte uma vistoria improdutiva",
    status_code=status.HTTP_200_OK
)
def revert_improdutiva(improdutiva_id: UUID, db: Session = Depends(get_db)):
    """
    Reverte uma vistoria improdutiva, liberando o horário na agenda e estornando
    a cobrança do saldo devedor do cliente.
    """
    try:
        improdutiva = db.query(models.VistoriaImprodutiva).options(
            joinedload(models.VistoriaImprodutiva.agenda_original),
            joinedload(models.VistoriaImprodutiva.cliente)
        ).filter(models.VistoriaImprodutiva.id == improdutiva_id).first()
        
        if not improdutiva:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoria improdutiva não encontrada.")
            
        agenda_original = improdutiva.agenda_original
        cliente = improdutiva.cliente
        
        if not agenda_original or not cliente:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dados associados (agenda ou cliente) não encontrados para a reversão.")

        # Estorna o valor do saldo do cliente
        if cliente.saldo_devedor_total is not None:
             cliente.saldo_devedor_total -= improdutiva.valor_cobranca
        
        # Libera o horário na agenda
        agenda_original.tipo = 'LIVRE'
        agenda_original.disponivel = True
        agenda_original.imovel_id = None
        
        # Remove o registro da vistoria improdutiva
        db.delete(improdutiva)
        
        db.commit()
        return {"message": "Vistoria improdutiva revertida com sucesso! O horário na agenda foi liberado e a cobrança estornada."}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro ao reverter a vistoria: {e}")

# =================================================================
# --- Endpoints de Manutenção e Restauração ---
# =================================================================

TABLE_MODEL_MAP = {
    "usuarios": models.Usuario,
    "clientes": models.Cliente,
    "imobiliarias": models.Imobiliaria,
    "grupos_imobiliarias": models.GrupoImobiliaria,
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
    Varre as tabelas gerenciáveis, busca registros com `is_deleted = True` e os retorna.
    """
    deleted_records = []
    for table_name, model in TABLE_MODEL_MAP.items():
        display_column_attr = getattr(model, 'nome', getattr(model, 'titulo', getattr(model, 'cod_imovel', None)))
        
        records = db.query(model).filter(model.is_deleted == True).all()
        for record in records:
            display_info = str(record.id)
            if display_column_attr:
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
    """Restaura um item da lixeira, alterando `is_deleted` para `False`."""
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
    AÇÃO DESTRUTIVA: Deleta permanentemente todos os registros com `is_deleted = True`.
    """
    cleanup_order = [
        "vistorias_improdutivas", "agenda", "feedbacks", "chamados",
        "imoveis", "clientes", "usuarios", "imobiliarias", "grupos_imobiliarias"
    ]
    
    total_deleted = 0
    try:
        for table_name in cleanup_order:
            if table_name in TABLE_MODEL_MAP:
                model = TABLE_MODEL_MAP[table_name]
                deleted_count = db.query(model).filter(model.is_deleted == True).delete(synchronize_session=False)
                total_deleted += deleted_count
        
        db.commit()
        return {"message": f"Limpeza concluída! {total_deleted} registros permanentemente removidos."}
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

