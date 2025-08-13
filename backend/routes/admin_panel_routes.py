# backend/routes/admin_panel_routes.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, extract, func
from typing import List, Dict
from uuid import UUID
from datetime import date, timedelta, datetime
from decimal import Decimal

from .. import models, schemas, auth

# Importa a função para obter a sessão do banco e a função de hash de senha
from ..config import get_db
from ..auth import get_password_hash, get_current_admin_user

# Cria um novo roteador para o painel de administração
# Todas as rotas aqui serão protegidas pela dependência 'get_current_admin_user'
router = APIRouter(
    prefix="/admin-panel",
    tags=["Painel de Administração"],
    dependencies=[Depends(get_current_admin_user)]
)

# =================================================================
# --- Funções Auxiliares de Lógica de Negócio ---
# =================================================================

def _calculate_valor_base_imovel(imobiliaria: models.Imobiliaria, tamanho: float, mobiliado: str) -> float:
    """Calcula o valor BASE da vistoria com base nas regras da imobiliária."""
    tamanho = float(tamanho)
    if mobiliado == "mobiliado":
        valor_m2 = imobiliaria.valor_mobiliado
    elif mobiliado == "semi_mobiliado":
        valor_m2 = imobiliaria.valor_semi_mobiliado
    else: # sem_mobilia
        valor_m2 = imobiliaria.valor_sem_mobilia
    
    return round(tamanho * float(valor_m2), 2)

def _calculate_valor_final_vistoria(imovel: models.Imovel, tipo_vistoria: str) -> float:
    """Calcula o valor FINAL (cobrado) da vistoria com base no tipo."""
    if tipo_vistoria == 'AVERIGUACAO':
        return 65.00

    valor_base = float(imovel.valor)
    
    if tipo_vistoria in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        return round(valor_base * 0.5, 2)
    else:
        return round(valor_base, 2)

def _calculate_valor_comissao_vistoriador(tamanho_m2: float, mobiliado_status: str, tipo_vistoria_agenda: str) -> float:
    """Calcula o valor da COMISSÃO do vistoriador com base nas regras."""
    tamanho_m2 = float(tamanho_m2)
    if tipo_vistoria_agenda == 'AVERIGUACAO':
        return 65.00
    
    valor_base = 0.0
    if mobiliado_status == 'mobiliado':
        if tamanho_m2 < 50: valor_base = 65.00
        elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.25
        elif 100 <= tamanho_m2 <= 140: valor_base = 125.00
        else: valor_base = tamanho_m2 * 0.90
    elif mobiliado_status in ['sem_mobilia', 'semi_mobiliado']:
        if tamanho_m2 < 50: valor_base = 50.00
        elif 50 <= tamanho_m2 < 100: valor_base = tamanho_m2 * 1.00
        elif 100 <= tamanho_m2 <= 135: valor_base = 100.00
        else: valor_base = tamanho_m2 * 0.75
    else:
        return 0.0

    valor_final = valor_base
    if tipo_vistoria_agenda in ['CONFERENCIA', 'COMPLEMENTO_VISITA']:
        valor_final = valor_base * 0.5
        if valor_final < 45.00:
            valor_final = 45.00
        
    return round(valor_final, 2)

# =================================================================
# --- Dashboard ---
# =================================================================

@router.get("/dashboard/stats", response_model=schemas.AdminDashboardStats, summary="Obter estatísticas para o dashboard do admin de vistorias")
def get_admin_dashboard_stats(db: Session = Depends(get_db)):
    today = date.today()
    start_of_month = today.replace(day=1)

    total_vistoriadores = db.query(models.Usuario).filter(models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).count()
    total_imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).count()
    total_clientes = db.query(models.Cliente).filter(models.Cliente.is_deleted == False).count()
    
    vistorias_mes_atual = db.query(models.Agenda).filter(
        models.Agenda.data >= start_of_month,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).count()

    improdutivas_mes_atual = db.query(models.VistoriaImprodutiva).filter(
        models.VistoriaImprodutiva.data_vistoria_original >= start_of_month
    ).count()

    return schemas.AdminDashboardStats(
        total_vistoriadores=total_vistoriadores,
        total_imobiliarias=total_imobiliarias,
        total_clientes=total_clientes,
        vistorias_mes_atual=vistorias_mes_atual,
        improdutivas_mes_atual=improdutivas_mes_atual
    )

@router.get("/dashboard/vistorias-chart", response_model=List[schemas.VistoriasChartItem], summary="Obter dados para o gráfico de vistorias mensais")
def get_vistorias_chart_data(db: Session = Depends(get_db)):
    six_months_ago = date.today() - timedelta(days=180)
    
    results = db.query(
        extract('year', models.Agenda.data).label('ano'),
        extract('month', models.Agenda.data).label('mes'),
        func.count(models.Agenda.id).label('total')
    ).filter(
        models.Agenda.data >= six_months_ago,
        models.Agenda.tipo != 'LIVRE'
    ).group_by('ano', 'mes').order_by('ano', 'mes').all()

    chart_data = [
        schemas.VistoriasChartItem(mes_ano=f"{int(r.mes):02d}/{int(r.ano)}", total=r.total)
        for r in results
    ]
    return chart_data

# =================================================================
# --- CRUD para Imobiliárias ---
# =================================================================

@router.post("/imobiliarias/", response_model=schemas.ImobiliariaDisplay, status_code=status.HTTP_201_CREATED, summary="Criar uma nova imobiliária")
def create_imobiliaria(imobiliaria: schemas.ImobiliariaCreate, db: Session = Depends(get_db)):
    existing_by_name = db.query(models.Imobiliaria).filter(models.Imobiliaria.nome == imobiliaria.nome).first()
    if existing_by_name:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Já existe uma imobiliária com o nome '{imobiliaria.nome}'.")
    db_imobiliaria = models.Imobiliaria(**imobiliaria.model_dump())
    db.add(db_imobiliaria)
    db.commit()
    db.refresh(db_imobiliaria)
    return db_imobiliaria

@router.get("/imobiliarias/", response_model=List[schemas.ImobiliariaDisplay], summary="Listar todas as imobiliárias")
def read_imobiliarias(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    imobiliarias = db.query(models.Imobiliaria).filter(models.Imobiliaria.is_deleted == False).order_by(models.Imobiliaria.nome).offset(skip).limit(limit).all()
    return imobiliarias

@router.put("/imobiliarias/{imobiliaria_id}", response_model=schemas.ImobiliariaDisplay, summary="Atualizar uma imobiliária")
def update_imobiliaria(imobiliaria_id: UUID, imobiliaria_update: schemas.ImobiliariaUpdate, db: Session = Depends(get_db)):
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")
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
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if db_imobiliaria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada")
    imoveis_associados = db.query(models.Imovel).filter(models.Imovel.imobiliaria_id == imobiliaria_id, models.Imovel.is_deleted == False).count()
    if imoveis_associados > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {imoveis_associados} imóveis ativos associados a esta imobiliária.")
    db_imobiliaria.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- CRUD para Vistoriadores ---
# =================================================================
@router.post("/vistoriadores/", response_model=schemas.UsuarioDisplay, status_code=status.HTTP_201_CREATED, summary="Criar um novo vistoriador")
def create_vistoriador(vistoriador: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    if vistoriador.tipo != 'vistoriador':
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de usuário inválido. Deve ser 'vistoriador'.")
    existing_user = db.query(models.Usuario).filter(models.Usuario.email == vistoriador.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"O e-mail '{vistoriador.email}' já está em uso.")
    hashed_password = get_password_hash(vistoriador.senha)
    db_vistoriador = models.Usuario(**vistoriador.model_dump(exclude={"senha"}), senha=hashed_password)
    db.add(db_vistoriador)
    db.commit()
    db.refresh(db_vistoriador)
    return db_vistoriador

@router.get("/vistoriadores/", response_model=List[schemas.UsuarioDisplay], summary="Listar todos os vistoriadores")
def read_vistoriadores(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    vistoriadores = db.query(models.Usuario).filter(models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).order_by(models.Usuario.nome).offset(skip).limit(limit).all()
    return vistoriadores

@router.get("/vistoriadores/{vistoriador_id}/detalhes", response_model=schemas.VistoriadorDetalhes, summary="Obter detalhes e estatísticas de um vistoriador")
def get_vistoriador_details(vistoriador_id: UUID, db: Session = Depends(get_db)):
    six_months_ago = date.today() - timedelta(days=180)
    
    vistorias_normais = db.query(
        extract('year', models.Agenda.data).label('ano'),
        extract('month', models.Agenda.data).label('mes'),
        func.count(models.Agenda.id).label('total_vistorias'),
        func.sum(models.Agenda.valor_vistoriador).label('total_comissao')
    ).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        models.Agenda.data >= six_months_ago,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).group_by('ano', 'mes').subquery()

    vistorias_improdutivas = db.query(
        extract('year', models.VistoriaImprodutiva.data_vistoria_original).label('ano'),
        extract('month', models.VistoriaImprodutiva.data_vistoria_original).label('mes'),
        func.count(models.VistoriaImprodutiva.id).label('total_vistorias'),
        func.sum(models.VistoriaImprodutiva.valor_para_vistoriador).label('total_comissao')
    ).join(models.Agenda, models.VistoriaImprodutiva.agenda_id_original == models.Agenda.id).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        models.VistoriaImprodutiva.data_vistoria_original >= six_months_ago
    ).group_by('ano', 'mes').subquery()

    results_normais = db.query(vistorias_normais).all()
    results_improdutivas = db.query(vistorias_improdutivas).all()

    monthly_data = {}
    for r in results_normais:
        key = f"{int(r.mes):02d}/{int(r.ano)}"
        monthly_data[key] = {'total_vistorias': r.total_vistorias, 'total_comissao': float(r.total_comissao or 0)}

    for r in results_improdutivas:
        key = f"{int(r.mes):02d}/{int(r.ano)}"
        if key in monthly_data:
            monthly_data[key]['total_vistorias'] += r.total_vistorias
            monthly_data[key]['total_comissao'] += float(r.total_comissao or 0)
        else:
            monthly_data[key] = {'total_vistorias': r.total_vistorias, 'total_comissao': float(r.total_comissao or 0)}
    
    historico_mensal = [
        schemas.VistoriadorDetalhesItem(mes_ano=key, **value)
        for key, value in sorted(monthly_data.items())
    ]

    total_months = len(historico_mensal)
    if total_months == 0:
        return schemas.VistoriadorDetalhes(media_vistorias_mensal=0, media_comissao_mensal=0, historico_mensal=[])

    total_vistorias = sum(item.total_vistorias for item in historico_mensal)
    total_comissao = sum(item.total_comissao for item in historico_mensal)

    return schemas.VistoriadorDetalhes(
        media_vistorias_mensal=round(total_vistorias / total_months, 2),
        media_comissao_mensal=round(total_comissao / total_months, 2),
        historico_mensal=historico_mensal
    )

@router.put("/vistoriadores/{vistoriador_id}", response_model=schemas.UsuarioDisplay, summary="Atualizar um vistoriador")
def update_vistoriador(vistoriador_id: UUID, vistoriador_update: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == vistoriador_id, models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).first()
    if db_vistoriador is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado")
    if vistoriador_update.email != db_vistoriador.email:
        existing = db.query(models.Usuario).filter(models.Usuario.email == vistoriador_update.email).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este e-mail já está em uso.")
    update_data = vistoriador_update.model_dump(exclude_unset=True)
    if 'senha' in update_data and update_data['senha']:
        hashed_password = get_password_hash(update_data['senha'])
        db_vistoriador.senha = hashed_password
    db_vistoriador.nome = update_data.get('nome', db_vistoriador.nome)
    db_vistoriador.email = update_data.get('email', db_vistoriador.email)
    db_vistoriador.telefone1 = update_data.get('telefone1', db_vistoriador.telefone1)
    db_vistoriador.telefone2 = update_data.get('telefone2', db_vistoriador.telefone2)
    db.commit()
    db.refresh(db_vistoriador)
    return db_vistoriador

@router.delete("/vistoriadores/{vistoriador_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar um vistoriador")
def delete_vistoriador(vistoriador_id: UUID, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == vistoriador_id, models.Usuario.tipo == 'vistoriador', models.Usuario.is_deleted == False).first()
    if db_vistoriador is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado")
    vistorias_futuras = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == vistoriador_id, models.Agenda.data >= date.today()).count()
    if vistorias_futuras > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {vistorias_futuras} vistorias futuras agendadas para este vistoriador.")
    db_vistoriador.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- CRUD para Clientes ---
# =================================================================
@router.post("/clientes/", response_model=schemas.ClienteDisplay, status_code=status.HTTP_201_CREATED, summary="Criar um novo cliente")
def create_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    existing_cliente = db.query(models.Cliente).filter(models.Cliente.email == cliente.email).first()
    if existing_cliente:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"O e-mail '{cliente.email}' já está cadastrado para outro cliente.")
    db_cliente = models.Cliente(**cliente.model_dump())
    db.add(db_cliente)
    db.commit()
    db.refresh(db_cliente)
    return db_cliente

@router.get("/clientes/", response_model=List[schemas.ClienteDisplay], summary="Listar todos os clientes")
def read_clientes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    clientes = db.query(models.Cliente).filter(models.Cliente.is_deleted == False).order_by(models.Cliente.nome).offset(skip).limit(limit).all()
    return clientes

@router.put("/clientes/{cliente_id}", response_model=schemas.ClienteDisplay, summary="Atualizar um cliente")
def update_cliente(cliente_id: UUID, cliente_update: schemas.ClienteCreate, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id, models.Cliente.is_deleted == False).first()
    if db_cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    if cliente_update.email != db_cliente.email:
        existing = db.query(models.Cliente).filter(models.Cliente.email == cliente_update.email).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este e-mail já está em uso por outro cliente.")
    update_data = cliente_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cliente, key, value)
    db.commit()
    db.refresh(db_cliente)
    return db_cliente

@router.delete("/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar um cliente")
def delete_cliente(cliente_id: UUID, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id, models.Cliente.is_deleted == False).first()
    if db_cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    imoveis_associados = db.query(models.Imovel).filter(models.Imovel.cliente_id == cliente_id, models.Imovel.is_deleted == False).count()
    if imoveis_associados > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {imoveis_associados} imóveis ativos associados a este cliente.")
    db_cliente.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- CRUD para Imóveis ---
# =================================================================
@router.post("/imoveis/", response_model=schemas.ImovelDisplay, status_code=status.HTTP_201_CREATED, summary="Criar um novo imóvel")
def create_imovel(imovel: schemas.ImovelCreate, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == imovel.cliente_id, models.Cliente.is_deleted == False).first()
    if not db_cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imovel.imobiliaria_id, models.Imobiliaria.is_deleted == False).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada.")
    valor_calculado = _calculate_valor_base_imovel(db_imobiliaria, imovel.tamanho, imovel.mobiliado)
    db_imovel = models.Imovel(**imovel.model_dump(), valor=valor_calculado)
    db.add(db_imovel)
    db.commit()
    db.refresh(db_imovel)
    return db_imovel

@router.get("/imoveis/", response_model=List[schemas.ImovelDisplay], summary="Listar todos os imóveis")
def read_imoveis(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    imoveis = db.query(models.Imovel).options(joinedload(models.Imovel.cliente), joinedload(models.Imovel.imobiliaria)).filter(models.Imovel.is_deleted == False).order_by(models.Imovel.cod_imovel).offset(skip).limit(limit).all()
    return imoveis

@router.delete("/imoveis/{imovel_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deletar um imóvel")
def delete_imovel(imovel_id: UUID, db: Session = Depends(get_db)):
    db_imovel = db.query(models.Imovel).filter(models.Imovel.id == imovel_id, models.Imovel.is_deleted == False).first()
    if db_imovel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado")
    vistorias_futuras = db.query(models.Agenda).filter(models.Agenda.imovel_id == imovel_id, models.Agenda.data >= date.today()).count()
    if vistorias_futuras > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Não é possível deletar. Existem {vistorias_futuras} vistorias futuras agendadas para este imóvel.")
    db_imovel.is_deleted = True
    db.commit()
    return None

# =================================================================
# --- Gestão de Disponibilidade e Agenda ---
# =================================================================
@router.post("/horarios-fixos/", response_model=schemas.HorarioFixoDisplay, status_code=status.HTTP_201_CREATED, summary="Adicionar horário de trabalho fixo")
def add_horario_fixo(horario: schemas.HorarioFixoCreate, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == horario.vistoriador_id, models.Usuario.tipo == 'vistoriador').first()
    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado.")
    existing_horario = db.query(models.HorarioFixo).filter(models.HorarioFixo.vistoriador_id == horario.vistoriador_id, models.HorarioFixo.dia_semana == horario.dia_semana, models.HorarioFixo.horario == horario.horario).first()
    if existing_horario:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este horário fixo já existe para o vistoriador.")
    db_horario = models.HorarioFixo(**horario.model_dump())
    db.add(db_horario)
    db.commit()
    db.refresh(db_horario)
    return db_horario

@router.get("/vistoriadores/{vistoriador_id}/horarios-fixos/", response_model=List[schemas.HorarioFixoDisplay], summary="Listar horários fixos de um vistoriador")
def get_horarios_fixos(vistoriador_id: UUID, db: Session = Depends(get_db)):
    horarios = db.query(models.HorarioFixo).filter(models.HorarioFixo.vistoriador_id == vistoriador_id).all()
    return horarios

@router.delete("/horarios-fixos/{horario_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remover um horário de trabalho fixo")
def delete_horario_fixo(horario_id: UUID, db: Session = Depends(get_db)):
    db_horario = db.query(models.HorarioFixo).filter(models.HorarioFixo.id == horario_id).first()
    if not db_horario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário fixo não encontrado.")
    db.delete(db_horario)
    db.commit()
    return None

@router.post("/horarios-avulsos/", response_model=schemas.AgendaDisplay, status_code=status.HTTP_201_CREATED, summary="Adicionar horário de trabalho avulso")
def add_horario_avulso(horario: schemas.HorarioAvulsoCreate, db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == horario.vistoriador_id, models.Usuario.tipo == 'vistoriador').first()
    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado.")
    existing_agenda = db.query(models.Agenda).filter(models.Agenda.vistoriador_id == horario.vistoriador_id, models.Agenda.data == horario.data, models.Agenda.horario == horario.horario).first()
    if existing_agenda:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um registro na agenda para esta data e horário.")
    db_agenda = models.Agenda(vistoriador_id=horario.vistoriador_id, data=horario.data, horario=horario.horario, disponivel=True, tipo="LIVRE")
    db.add(db_agenda)
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.post("/agenda/gerar", summary="Gerar agenda com base nos horários fixos")
def generate_agenda(semanas: int = 4, db: Session = Depends(get_db)):
    today = date.today()
    horarios_fixos = db.query(models.HorarioFixo).all()
    novos_agendamentos = 0
    for i in range(7 * semanas):
        current_date = today + timedelta(days=i)
        dia_semana_str = str(current_date.weekday())
        for hf in horarios_fixos:
            if hf.dia_semana == dia_semana_str:
                existe = db.query(models.Agenda).filter(and_(models.Agenda.vistoriador_id == hf.vistoriador_id, models.Agenda.data == current_date, models.Agenda.horario == hf.horario)).first()
                if not existe:
                    novo_agendamento = models.Agenda(vistoriador_id=hf.vistoriador_id, data=current_date, horario=hf.horario, disponivel=True, tipo="LIVRE")
                    db.add(novo_agendamento)
                    novos_agendamentos += 1
    db.commit()
    return {"message": f"Geração de agenda concluída. {novos_agendamentos} novos horários disponíveis foram criados."}

# =================================================================
# --- Gestão de Vistorias ---
# =================================================================

@router.post("/agenda/agendar", response_model=schemas.AgendaDisplay, summary="Agendar uma nova vistoria")
def schedule_vistoria(agendamento: schemas.AgendaCreate, db: Session = Depends(get_db)):
    db_imovel = db.query(models.Imovel).filter(models.Imovel.id == agendamento.imovel_id, models.Imovel.is_deleted == False).first()
    if not db_imovel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado.")
    db_agenda_1 = db.query(models.Agenda).filter(models.Agenda.data == agendamento.data, models.Agenda.horario == agendamento.horario, models.Agenda.vistoriador_id == agendamento.vistoriador_id, models.Agenda.disponivel == True).first()
    if not db_agenda_1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário selecionado não está livre ou não existe.")
    
    valor_final = _calculate_valor_final_vistoria(db_imovel, agendamento.tipo.value)
    valor_comissao = _calculate_valor_comissao_vistoriador(db_imovel.tamanho, db_imovel.mobiliado, agendamento.tipo.value)

    necessita_horario_duplo = (agendamento.tipo.value in ["ENTRADA", "SAIDA"] and db_imovel.tamanho > 100)
    if necessita_horario_duplo:
        try:
            horario_dt = datetime.strptime(agendamento.horario, '%H:%M')
            proximo_horario_dt = horario_dt + timedelta(hours=1)
            proximo_horario_str = proximo_horario_dt.strftime('%H:%M')
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de horário inválido. Use HH:MM.")
        db_agenda_2 = db.query(models.Agenda).filter(models.Agenda.data == agendamento.data, models.Agenda.horario == proximo_horario_str, models.Agenda.vistoriador_id == agendamento.vistoriador_id, models.Agenda.disponivel == True).first()
        if not db_agenda_2:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este imóvel necessita de 2 horários consecutivos, mas o segundo horário não está disponível.")
        db_agenda_2.imovel_id = agendamento.imovel_id
        db_agenda_2.tipo = agendamento.tipo.value
        db_agenda_2.disponivel = False
        db_agenda_2.valor_final_vistoria = valor_final
        db_agenda_2.valor_vistoriador = valor_comissao

    db_agenda_1.imovel_id = agendamento.imovel_id
    db_agenda_1.tipo = agendamento.tipo.value
    db_agenda_1.disponivel = False
    db_agenda_1.valor_final_vistoria = valor_final
    db_agenda_1.valor_vistoriador = valor_comissao
    
    db.commit()
    db.refresh(db_agenda_1)
    return db_agenda_1

@router.post("/agenda/{agenda_id}/cancelar", response_model=schemas.AgendaDisplay, summary="Cancelar uma vistoria agendada")
def cancel_vistoria(agenda_id: UUID, db: Session = Depends(get_db)):
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id, models.Agenda.is_deleted == False).first()
    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")
    if db_agenda.disponivel:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este horário já está livre.")
    agendamentos_a_cancelar = db.query(models.Agenda).filter(models.Agenda.imovel_id == db_agenda.imovel_id, models.Agenda.data == db_agenda.data, models.Agenda.vistoriador_id == db_agenda.vistoriador_id).all()
    for agendamento in agendamentos_a_cancelar:
        agendamento.imovel_id = None
        agendamento.tipo = "LIVRE"
        agendamento.disponivel = True
        agendamento.observacao_privada = None
        agendamento.valor_final_vistoria = None
        agendamento.valor_vistoriador = None
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.put("/agenda/{agenda_id}", response_model=schemas.AgendaDisplay, summary="Editar detalhes de uma vistoria")
def update_vistoria_details(agenda_id: UUID, update_data: schemas.AgendaUpdate, db: Session = Depends(get_db)):
    db_agenda = db.query(models.Agenda).options(joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda or not db_agenda.imovel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento ou imóvel associado não encontrado.")
    
    db_imovel = db_agenda.imovel
    recalcular_valores = False

    if update_data.tamanho is not None and update_data.tamanho != float(db_imovel.tamanho): recalcular_valores = True
    if update_data.mobiliado is not None and update_data.mobiliado.value != db_imovel.mobiliado: recalcular_valores = True
    if update_data.tipo_vistoria is not None and update_data.tipo_vistoria.value != db_agenda.tipo: recalcular_valores = True

    if update_data.cod_imovel: db_imovel.cod_imovel = update_data.cod_imovel
    if update_data.endereco: db_imovel.endereco = update_data.endereco
    if update_data.cep: db_imovel.cep = update_data.cep
    if update_data.referencia: db_imovel.referencia = update_data.referencia
    if update_data.tamanho: db_imovel.tamanho = update_data.tamanho
    if update_data.mobiliado: db_imovel.mobiliado = update_data.mobiliado.value
    if update_data.tipo_vistoria: db_agenda.tipo = update_data.tipo_vistoria.value
    
    if recalcular_valores:
        db_imovel.valor = _calculate_valor_base_imovel(db_imovel.imobiliaria, db_imovel.tamanho, db_imovel.mobiliado)
        db_agenda.valor_final_vistoria = _calculate_valor_final_vistoria(db_imovel, db_agenda.tipo)
        db_agenda.valor_vistoriador = _calculate_valor_comissao_vistoriador(db_imovel.tamanho, db_imovel.mobiliado, db_agenda.tipo)

    if update_data.valor_final_vistoria is not None: db_agenda.valor_final_vistoria = update_data.valor_final_vistoria
    if update_data.valor_vistoriador is not None: db_agenda.valor_vistoriador = update_data.valor_vistoriador
    
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.post("/agenda/{agenda_id}/marcar-improdutiva", summary="Marcar vistoria como improdutiva")
def mark_as_unproductive(agenda_id: UUID, improdutiva_data: schemas.VistoriaImprodutivaCreate, db: Session = Depends(get_db)):
    db_agenda = db.query(models.Agenda).options(joinedload(models.Agenda.imovel)).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento original não encontrado.")
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == improdutiva_data.cliente_id).first()
    if not db_cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente para cobrança não encontrado.")
    config = db.query(models.Configuracao).filter(models.Configuracao.id == 1).first()
    if not config:
        config = models.Configuracao()
        db.add(config)
        db.commit()
        db.refresh(config)
    percentual = config.percentual_comissao_improdutiva / 100.0
    valor_para_vistoriador = improdutiva_data.valor_cobranca * float(percentual)
    db_improdutiva = models.VistoriaImprodutiva(**improdutiva_data.model_dump(), valor_para_vistoriador=valor_para_vistoriador)
    db.add(db_improdutiva)
    db_cliente.saldo_devedor_total = (db_cliente.saldo_devedor_total or 0) + improdutiva_data.valor_cobranca
    db_agenda.tipo = "IMPRODUTIVA"
    db_agenda.disponivel = False
    db.commit()
    return {"message": "Vistoria marcada como improdutiva com sucesso."}

# =================================================================
# --- Gestão de Configurações ---
# =================================================================

@router.get("/configuracoes/", response_model=schemas.ConfiguracaoDisplay, summary="Obter configurações do sistema")
def get_configuracoes(db: Session = Depends(get_db)):
    config = db.query(models.Configuracao).filter(models.Configuracao.id == 1).first()
    if not config:
        config = models.Configuracao()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/configuracoes/", response_model=schemas.ConfiguracaoDisplay, summary="Atualizar configurações do sistema")
def update_configuracoes(config_update: schemas.ConfiguracaoUpdate, db: Session = Depends(get_db)):
    db_config = db.query(models.Configuracao).filter(models.Configuracao.id == 1).first()
    if not db_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configurações não encontradas.")
    update_data = config_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_config, key, value)
    db.commit()
    db.refresh(db_config)
    return db_config

# =================================================================
# --- Geração de Relatórios ---
# =================================================================

@router.get("/relatorios/imobiliaria/{imobiliaria_id}", response_model=schemas.RelatorioImobiliaria, summary="Gerar relatório mensal por imobiliária")
def get_relatorio_imobiliaria(imobiliaria_id: UUID, mes: int = Query(..., ge=1, le=12), ano: int = Query(..., ge=2020), db: Session = Depends(get_db)):
    db_imobiliaria = db.query(models.Imobiliaria).filter(models.Imobiliaria.id == imobiliaria_id).first()
    if not db_imobiliaria:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imobiliária não encontrada.")

    vistorias = db.query(models.Agenda).join(models.Imovel).filter(
        models.Imovel.imobiliaria_id == imobiliaria_id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).all()

    improdutivas = db.query(models.VistoriaImprodutiva).filter(
        models.VistoriaImprodutiva.imobiliaria_id == imobiliaria_id,
        extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
        extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes
    ).all()

    total_vistorias = sum(v.valor_final_vistoria or 0 for v in vistorias)
    total_improdutivas = sum(i.valor_cobranca for i in improdutivas)

    return {
        "imobiliaria_nome": db_imobiliaria.nome,
        "periodo": f"{mes:02d}/{ano}",
        "vistorias": vistorias,
        "improdutivas": improdutivas,
        "total_vistorias": total_vistorias,
        "total_improdutivas": total_improdutivas,
        "total_geral": total_vistorias + total_improdutivas
    }

@router.get("/relatorios/vistoriador/{vistoriador_id}", response_model=schemas.RelatorioVistoriador, summary="Gerar relatório mensal por vistoriador")
def get_relatorio_vistoriador(vistoriador_id: UUID, mes: int = Query(..., ge=1, le=12), ano: int = Query(..., ge=2020), db: Session = Depends(get_db)):
    db_vistoriador = db.query(models.Usuario).filter(models.Usuario.id == vistoriador_id).first()
    if not db_vistoriador:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vistoriador não encontrado.")

    vistorias = db.query(models.Agenda).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo.in_(['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'])
    ).options(joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)).all()

    improdutivas_query = db.query(models.VistoriaImprodutiva).join(models.Agenda, models.VistoriaImprodutiva.agenda_id_original == models.Agenda.id)
    improdutivas = improdutivas_query.filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        extract('year', models.VistoriaImprodutiva.data_vistoria_original) == ano,
        extract('month', models.VistoriaImprodutiva.data_vistoria_original) == mes
    ).all()
    
    vistorias_por_imobiliaria = {}
    total_comissao_vistorias = Decimal(0)
    for v in vistorias:
        if v.imovel and v.imovel.imobiliaria:
            imob_nome = v.imovel.imobiliaria.nome
            if imob_nome not in vistorias_por_imobiliaria:
                vistorias_por_imobiliaria[imob_nome] = []
            vistorias_por_imobiliaria[imob_nome].append(v)
            total_comissao_vistorias += v.valor_vistoriador or 0

    total_comissao_improdutivas = sum(i.valor_para_vistoriador or 0 for i in improdutivas)

    return {
        "vistoriador_nome": db_vistoriador.nome,
        "periodo": f"{mes:02d}/{ano}",
        "vistorias_por_imobiliaria": vistorias_por_imobiliaria,
        "improdutivas": improdutivas,
        "total_comissao_vistorias": total_comissao_vistorias,
        "total_comissao_improdutivas": total_comissao_improdutivas,
        "total_geral_comissao": total_comissao_vistorias + total_comissao_improdutivas
    }
