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

    improdutivas_mes_atual = db.query(models.Agenda).filter(
        models.Agenda.data >= start_of_month,
        models.Agenda.tipo == 'IMPRODUTIVA'
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
    today = date.today()
    start_of_current_month = today.replace(day=1)
    # Garante 6 meses completos para trás
    six_months_ago = (start_of_current_month - timedelta(days=1)).replace(day=1) - timedelta(days=150) 

    vistorias_agrupadas = db.query(
        extract('year', models.Agenda.data).label('ano'),
        extract('month', models.Agenda.data).label('mes'),
        func.count(models.Agenda.id).label('total_vistorias'),
        func.sum(models.Agenda.valor_vistoriador).label('total_comissao')
    ).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        models.Agenda.data >= six_months_ago,
        models.Agenda.tipo != 'LIVRE' # Inclui normais e improdutivas
    ).group_by('ano', 'mes').all()
    
    monthly_data = {}
    for r in vistorias_agrupadas:
        key = f"{int(r.mes):02d}/{int(r.ano)}"
        monthly_data[key] = {
            'total_vistorias': r.total_vistorias, 
            'total_comissao': float(r.total_comissao or 0)
        }
    
    historico_mensal = [
        schemas.VistoriadorDetalhesItem(mes_ano=key, **value)
        for key, value in sorted(monthly_data.items())
    ]

    meses_finalizados = [
        item for item in historico_mensal 
        if datetime.strptime(f"01/{item.mes_ano}", "%d/%m/%Y").date() < start_of_current_month
    ]

    total_months_finalizados = len(meses_finalizados)
    if total_months_finalizados == 0:
        return schemas.VistoriadorDetalhes(media_vistorias_mensal=0, media_comissao_mensal=0, historico_mensal=historico_mensal)

    total_vistorias = sum(item.total_vistorias for item in meses_finalizados)
    total_comissao = sum(item.total_comissao for item in meses_finalizados)

    return schemas.VistoriadorDetalhes(
        media_vistorias_mensal=round(total_vistorias / total_months_finalizados, 2),
        media_comissao_mensal=round(total_comissao / total_months_finalizados, 2),
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

@router.get("/agenda/all", response_model=List[schemas.AgendaDisplay], summary="Busca todos os eventos da agenda para um período")
def get_all_agenda_events(start: date, end: date, db: Session = Depends(get_db)):
    events = db.query(models.Agenda).options(
        joinedload(models.Agenda.vistoriador),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.cliente),
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
    ).filter(
        models.Agenda.data.between(start, end),
        models.Agenda.is_deleted == False
    ).order_by(models.Agenda.data, models.Agenda.horario).all()
    return events


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
    horarios = db.query(models.HorarioFixo).filter(models.HorarioFixo.vistoriador_id == vistoriador_id, models.HorarioFixo.is_deleted == False).all()
    return horarios

@router.delete("/horarios-fixos/{horario_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remover um horário de trabalho fixo")
def delete_horario_fixo(horario_id: UUID, db: Session = Depends(get_db)):
    db_horario = db.query(models.HorarioFixo).filter(models.HorarioFixo.id == horario_id).first()
    if not db_horario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário fixo não encontrado.")
    # Soft delete em vez de db.delete(db_horario)
    db_horario.is_deleted = True
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
    horarios_fixos = db.query(models.HorarioFixo).filter(models.HorarioFixo.is_deleted == False).all()
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
    db_imovel = db.query(models.Imovel).filter(
        models.Imovel.id == agendamento.imovel_id,
        models.Imovel.imobiliaria_id == agendamento.imobiliaria_id,
        models.Imovel.is_deleted == False
    ).first()
    if not db_imovel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imóvel não encontrado ou não pertence à imobiliária informada.")
    
    db_agenda_1 = db.query(models.Agenda).filter(
        models.Agenda.id == agendamento.horario_id,
        models.Agenda.disponivel == True
    ).first()

    if not db_agenda_1:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Horário selecionado não está livre ou não existe.")
    
    valor_final = _calculate_valor_final_vistoria(db_imovel, agendamento.tipo.value)
    valor_comissao = _calculate_valor_comissao_vistoriador(db_imovel.tamanho, db_imovel.mobiliado, agendamento.tipo.value)

    necessita_horario_duplo = ((agendamento.tipo.value in ["ENTRADA", "SAIDA"]) and 
                              (float(db_imovel.tamanho) >= 100 or db_imovel.mobiliado == "mobiliado"))

    if necessita_horario_duplo and not agendamento.force_single_slot:
        try:
            horario_dt = datetime.strptime(db_agenda_1.horario, '%H:%M')
            proximo_horario_dt = horario_dt + timedelta(hours=1)
            proximo_horario_str = proximo_horario_dt.strftime('%H:%M')
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de horário inválido no banco de dados.")

        db_agenda_2 = db.query(models.Agenda).filter(
            models.Agenda.data == db_agenda_1.data,
            models.Agenda.horario == proximo_horario_str,
            models.Agenda.vistoriador_id == db_agenda_1.vistoriador_id,
            models.Agenda.disponivel == True
        ).first()

        if not db_agenda_2:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, 
                detail="Este imóvel necessita de 2 horários consecutivos, mas o segundo horário não está disponível. Você pode forçar o agendamento em um único horário ou escolher outro horário."
            )
        db_agenda_2.imovel_id = agendamento.imovel_id
        db_agenda_2.tipo = agendamento.tipo.value
        db_agenda_2.disponivel = False
        db_agenda_2.valor_final_vistoria = 0
        db_agenda_2.valor_vistoriador = 0

        db_agenda_1.imovel_id = agendamento.imovel_id
        db_agenda_1.tipo = agendamento.tipo.value
        db_agenda_1.disponivel = False
        db_agenda_1.valor_final_vistoria = valor_final if valor_final is not None else 0
        db_agenda_1.valor_vistoriador = valor_comissao if valor_comissao is not None else 0

    else:
        db_agenda_1.imovel_id = agendamento.imovel_id
        db_agenda_1.tipo = agendamento.tipo.value
        db_agenda_1.disponivel = False
        db_agenda_1.valor_final_vistoria = valor_final if valor_final is not None else 0
        db_agenda_1.valor_vistoriador = valor_comissao if valor_comissao is not None else 0

    db.commit()
    db.refresh(db_agenda_1)
    return db_agenda_1


@router.put("/agenda/{agenda_id}", response_model=schemas.AgendaDisplay, summary="Atualiza os detalhes de uma vistoria")
def update_vistoria(
    agenda_id: UUID,
    update_data: schemas.AgendaUpdate,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).options(
        joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)
    ).filter(models.Agenda.id == agenda_id).first()

    if not db_agenda:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")

    if not db_agenda.imovel:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este agendamento não está vinculado a um imóvel.")

    update_payload = update_data.model_dump(exclude_unset=True)
    recalcular = False

    if "tamanho" in update_payload and float(update_payload["tamanho"]) != float(db_agenda.imovel.tamanho):
        db_agenda.imovel.tamanho = Decimal(str(update_payload["tamanho"]))
        recalcular = True
    
    if "mobiliado" in update_payload and update_payload["mobiliado"] != db_agenda.imovel.mobiliado:
        db_agenda.imovel.mobiliado = update_payload["mobiliado"]
        recalcular = True

    if "tipo_vistoria" in update_payload and update_payload["tipo_vistoria"] != db_agenda.tipo:
        db_agenda.tipo = update_payload["tipo_vistoria"]
        recalcular = True

    if recalcular and "valor_final_vistoria" not in update_payload and "valor_vistoriador" not in update_payload:
        db_agenda.imovel.valor = _calculate_valor_base_imovel(db_agenda.imovel.imobiliaria, db_agenda.imovel.tamanho, db_agenda.imovel.mobiliado)
        db_agenda.valor_final_vistoria = _calculate_valor_final_vistoria(db_agenda.imovel, db_agenda.tipo)
        db_agenda.valor_vistoriador = _calculate_valor_comissao_vistoriador(db_agenda.imovel.tamanho, db_agenda.imovel.mobiliado, db_agenda.tipo)
    else:
        if "valor_final_vistoria" in update_payload:
            db_agenda.valor_final_vistoria = Decimal(str(update_payload["valor_final_vistoria"]))
        if "valor_vistoriador" in update_payload:
            db_agenda.valor_vistoriador = Decimal(str(update_payload["valor_vistoriador"]))

    if "observacao_privada" in update_payload:
        db_agenda.observacao_privada = update_payload["observacao_privada"]

    db.commit()
    db.refresh(db_agenda)
    return db_agenda


@router.put("/agenda/{agenda_id}/improdutiva", response_model=schemas.AgendaDisplay, summary="Marcar vistoria como improdutiva")
def mark_vistoria_improdutiva(
    agenda_id: UUID,
    data: schemas.AgendaImprodutiva,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    # Busca o valor fixo da comissão na tabela de configurações
    config = db.query(models.Configuracao).first()
    if not config:
        # Fallback caso a configuração não exista, embora seja improvável
        raise HTTPException(status_code=500, detail="Configuração do sistema não encontrada.")

    valor_comissao_improdutiva = config.valor_comissao_improdutiva

    db_agenda.tipo = "IMPRODUTIVA"
    db_agenda.observacao_privada = data.motivo
    db_agenda.valor_final_vistoria = 0  # Valor cobrado do cliente é zero neste fluxo
    db_agenda.valor_vistoriador = valor_comissao_improdutiva
    
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.put("/agenda/{agenda_id}/cancelar", response_model=schemas.AgendaDisplay, summary="Cancelar uma vistoria agendada")
def cancelar_vistoria(
    agenda_id: UUID,
    db: Session = Depends(get_db)
):
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    db_agenda.imovel_id = None
    db_agenda.tipo = "LIVRE"
    db_agenda.disponivel = True
    db_agenda.valor_final_vistoria = None
    db_agenda.valor_vistoriador = None
    db_agenda.observacao_privada = None

    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@router.put("/agenda/{agenda_id}/reagendar", response_model=schemas.AgendaDisplay, summary="Reagendar uma vistoria para um novo horário")
def reagendar_vistoria(agenda_id: UUID, reagendamento: schemas.AgendaReagendar, db: Session = Depends(get_db)):
    db_agenda_origem = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    db_agenda_destino = db.query(models.Agenda).filter(models.Agenda.id == reagendamento.target_agenda_id).first()

    if not db_agenda_origem:
        raise HTTPException(status_code=404, detail="Agendamento original não encontrado.")
    if not db_agenda_destino:
        raise HTTPException(status_code=404, detail="Horário de destino não encontrado.")
    if not db_agenda_destino.disponivel:
        raise HTTPException(status_code=400, detail="O horário de destino não está disponível.")

    db_agenda_destino.imovel_id = db_agenda_origem.imovel_id
    db_agenda_destino.tipo = db_agenda_origem.tipo
    db_agenda_destino.observacao_privada = db_agenda_origem.observacao_privada
    db_agenda_destino.valor_final_vistoria = db_agenda_origem.valor_final_vistoria
    db_agenda_destino.valor_vistoriador = db_agenda_origem.valor_vistoriador
    db_agenda_destino.disponivel = False

    db_agenda_origem.imovel_id = None
    db_agenda_origem.tipo = "LIVRE"
    db_agenda_origem.disponivel = True
    db_agenda_origem.observacao_privada = None
    db_agenda_origem.valor_final_vistoria = None
    db_agenda_origem.valor_vistoriador = None

    db.commit()
    db.refresh(db_agenda_destino)
    return db_agenda_destino

# =================================================================
# --- Gestão de Configurações ---
# =================================================================

@router.get("/configuracoes/", response_model=schemas.ConfiguracaoDisplay, summary="Obter configurações do sistema")
def get_configuracoes(db: Session = Depends(get_db)):
    config = db.query(models.Configuracao).first()
    if not config:
        config = models.Configuracao()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/configuracoes/", response_model=schemas.ConfiguracaoDisplay, summary="Atualizar configurações do sistema")
def update_configuracoes(config_update: schemas.ConfiguracaoUpdate, db: Session = Depends(get_db)):
    db_config = db.query(models.Configuracao).first()
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

    improdutivas = db.query(models.Agenda).join(models.Imovel).filter(
        models.Imovel.imobiliaria_id == imobiliaria_id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo == 'IMPRODUTIVA'
    ).all()

    total_vistorias = sum(v.valor_final_vistoria or 0 for v in vistorias)
    total_improdutivas = sum(i.valor_final_vistoria or 0 for i in improdutivas) # Assumindo que o valor cobrado fica aqui

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

    vistorias_do_mes = db.query(models.Agenda).filter(
        models.Agenda.vistoriador_id == vistoriador_id,
        extract('year', models.Agenda.data) == ano,
        extract('month', models.Agenda.data) == mes,
        models.Agenda.tipo != 'LIVRE'
    ).options(joinedload(models.Agenda.imovel).joinedload(models.Imovel.imobiliaria)).all()
    
    vistorias_por_imobiliaria = {}
    improdutivas = []
    total_comissao_vistorias = Decimal(0)
    total_comissao_improdutivas = Decimal(0)

    for v in vistorias_do_mes:
        if v.tipo == 'IMPRODUTIVA':
            improdutivas.append(v)
            total_comissao_improdutivas += v.valor_vistoriador or 0
        elif v.imovel and v.imovel.imobiliaria:
            imob_nome = v.imovel.imobiliaria.nome
            if imob_nome not in vistorias_por_imobiliaria:
                vistorias_por_imobiliaria[imob_nome] = []
            vistorias_por_imobiliaria[imob_nome].append(v)
            total_comissao_vistorias += v.valor_vistoriador or 0

    return {
        "vistoriador_nome": db_vistoriador.nome,
        "periodo": f"{mes:02d}/{ano}",
        "vistorias_por_imobiliaria": vistorias_por_imobiliaria,
        "improdutivas": improdutivas,
        "total_comissao_vistorias": total_comissao_vistorias,
        "total_comissao_improdutivas": total_comissao_improdutivas,
        "total_geral_comissao": total_comissao_vistorias + total_comissao_improdutivas
    }
