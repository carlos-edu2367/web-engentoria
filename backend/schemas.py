# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import date, datetime
from enum import Enum

# =================================================================
# --- Enums para Validação de Dados ---
# =================================================================

class TipoVistoriaEnum(str, Enum):
    ENTRADA = "ENTRADA"
    SAIDA = "SAIDA"
    CONFERENCIA = "CONFERENCIA"
    AVERIGUACAO = "AVERIGUACAO"
    COMPLEMENTO_VISITA = "COMPLEMENTO_VISITA"

class MobiliadoEnum(str, Enum):
    sem_mobilia = "sem_mobilia"
    semi_mobiliado = "semi_mobiliado"
    mobiliado = "mobiliado"

# =================================================================
# --- Schemas Base e de Autenticação ---
# =================================================================

class Token(BaseModel):
    access_token: str
    token_type: str
    user_info: Dict[str, Any]

class TokenData(BaseModel):
    email: Optional[str] = None

class PasswordRecoveryRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)

class UsuarioBase(BaseModel):
    nome: str
    email: EmailStr
    telefone1: Optional[str] = None
    telefone2: Optional[str] = None

class UsuarioCreate(UsuarioBase):
    tipo: str # 'vistoriador' ou 'admin'
    senha: str = Field(..., min_length=6)

class UsuarioDisplay(UsuarioBase):
    id: UUID
    tipo: str
    
    class Config:
        from_attributes = True

# =================================================================
# --- Schemas de Cliente ---
# =================================================================

class ClienteBase(BaseModel):
    nome: str
    email: EmailStr
    telefone1: Optional[str] = None
    telefone2: Optional[str] = None

class ClienteCreate(ClienteBase):
    saldo_devedor_total: float = 0.0

class ClienteDisplay(ClienteBase):
    id: UUID
    saldo_devedor_total: float
    
    class Config:
        from_attributes = True

# =================================================================
# --- Schemas de Imobiliária e Grupos ---
# =================================================================

class ImobiliariaBase(BaseModel):
    nome: str
    valor_sem_mobilia: float = Field(..., ge=0)
    valor_semi_mobiliado: float = Field(..., ge=0)
    valor_mobiliado: float = Field(..., ge=0)

class ImobiliariaCreate(ImobiliariaBase):
    pass

class ImobiliariaUpdate(ImobiliariaBase):
    pass

class ImobiliariaDisplay(ImobiliariaBase):
    id: UUID
    class Config:
        from_attributes = True

class GrupoImobiliariaBase(BaseModel):
    nome: str
    email: EmailStr

class GrupoImobiliariaCreate(GrupoImobiliariaBase):
    senha: str = Field(..., min_length=6)

class GrupoImobiliariaUpdate(GrupoImobiliariaBase):
    senha: Optional[str] = Field(None, min_length=6)

class GrupoImobiliariaDisplay(GrupoImobiliariaBase):
    id: UUID
    imobiliarias: List[ImobiliariaDisplay] = []
    class Config:
        from_attributes = True
        
class ImobiliariaDetail(ImobiliariaCreate):
    id: UUID
    grupo: Optional[GrupoImobiliariaBase] = None
    class Config:
        from_attributes = True

class ImobiliariaGrupoLink(BaseModel):
    grupo_id: Optional[UUID] = None

# =================================================================
# --- Schemas de Imóvel ---
# =================================================================

class ImovelBase(BaseModel):
    cod_imovel: str
    endereco: str
    cep: Optional[str] = None
    referencia: Optional[str] = None
    tamanho: float = Field(..., gt=0)
    mobiliado: MobiliadoEnum # Validação com Enum

class ImovelCreate(ImovelBase):
    cliente_id: UUID
    imobiliaria_id: UUID

class ImovelDisplay(ImovelBase):
    id: UUID
    valor: float
    cliente: ClienteDisplay
    imobiliaria: ImobiliariaDisplay

    class Config:
        from_attributes = True

# =================================================================
# --- Schemas de Agenda e Horários ---
# =================================================================

class HorarioFixoCreate(BaseModel):
    vistoriador_id: UUID
    # O dia da semana deve ser uma string de "0" (Segunda) a "6" (Domingo).
    dia_semana: str
    horario: str

class HorarioFixoDisplay(BaseModel):
    id: UUID
    dia_semana: str
    horario: str
    vistoriador: UsuarioDisplay

    class Config:
        from_attributes = True

class HorarioAvulsoCreate(BaseModel):
    vistoriador_id: UUID
    data: date
    horario: str

class AgendaBase(BaseModel):
    data: date
    horario: str

class AgendaCreate(BaseModel):
    horario_id: UUID  # ID do horário selecionado na agenda
    imovel_id: UUID
    imobiliaria_id: UUID
    tipo: TipoVistoriaEnum # Validação com Enum
    observacao_vistoriador: Optional[str] = None # <-- NOVO CAMPO
    force_single_slot: Optional[bool] = False

class AgendaUpdate(BaseModel):
    cod_imovel: Optional[str] = None
    endereco: Optional[str] = None
    cep: Optional[str] = None
    referencia: Optional[str] = None
    tamanho: Optional[float] = None
    mobiliado: Optional[MobiliadoEnum] = None
    tipo_vistoria: Optional[TipoVistoriaEnum] = None
    valor_final_vistoria: Optional[float] = None
    valor_vistoriador: Optional[float] = None
    observacao_privada: Optional[str] = None
    observacao_vistoriador: Optional[str] = None # <-- NOVO CAMPO

class AgendaObservacaoUpdate(BaseModel):
    observacao_privada: str

class AgendaImprodutiva(BaseModel):
    motivo: str
    valor_cobranca: float = Field(..., ge=0)

class AgendaReagendar(BaseModel):
    target_agenda_id: UUID

class AgendaFecharHorario(BaseModel):
    fechar: bool # se for true, fecha o horário, se for false, reabre
    motivo: str

# Schema de exibição para Administradores (contém todos os campos)
class AgendaDisplay(AgendaBase):
    id: UUID
    disponivel: bool
    tipo: Optional[str] = None
    observacao_privada: Optional[str] = None
    observacao_vistoriador: Optional[str] = None
    valor_final_vistoria: Optional[float] = 0
    valor_vistoriador: Optional[float] = 0
    vistoriador: UsuarioDisplay | None
    imovel: Optional[ImovelDisplay] = None

    class Config:
        from_attributes = True

# NOVO: Schema específico para a visão do Vistoriador (sem o campo privado)
class AgendaVistoriadorDisplay(AgendaBase):
    id: UUID
    disponivel: bool
    tipo: Optional[str] = None
    observacao_vistoriador: Optional[str] = None
    valor_final_vistoria: Optional[float] = 0
    valor_vistoriador: Optional[float] = 0
    vistoriador: UsuarioDisplay | None
    imovel: Optional[ImovelDisplay] = None

    class Config:
        from_attributes = True

class VistoriaImprodutivaCreate(BaseModel):
    agenda_id_original: UUID
    cliente_id: UUID
    imovel_id: Optional[UUID] = None
    imobiliaria_id: Optional[UUID] = None
    data_vistoria_original: date
    horario_vistoria_original: str
    motivo_improdutividade: str
    valor_cobranca: float

# =================================================================
# --- Schemas de Relatórios e Dashboards ---
# =================================================================

class AdminDashboardStats(BaseModel):
    total_vistoriadores: int
    total_imobiliarias: int
    total_clientes: int
    vistorias_mes_atual: int
    improdutivas_mes_atual: int

class AdminDashboardFinancialStats(BaseModel):
    faturamento_mes_atual: float
    faturamento_mes_anterior_comparativo: float
    comissoes_a_pagar_mes_atual: float
    lucro_mes_atual: float
    crescimento_percentual: float

class VistoriasChartItem(BaseModel):
    mes_ano: str
    total: int

class VistoriadorDetalhesItem(BaseModel):
    mes_ano: str
    total_vistorias: int
    total_comissao: float

class VistoriadorDetalhes(BaseModel):
    media_vistorias_mensal: float
    media_comissao_mensal: float
    historico_mensal: List[VistoriadorDetalhesItem]

class VistoriaAgendadaRelatorio(BaseModel):
    id: UUID
    data: date
    horario: str
    tipo: str
    cod_imovel: str
    endereco: str
    tamanho: float
    mobiliado: str
    valor: float
    class Config: from_attributes = True

class VistoriaImprodutivaRelatorio(BaseModel):
    id: UUID
    data_vistoria_original: date
    cod_imovel: str
    motivo_improdutividade: str
    valor_cobranca: float
    class Config: from_attributes = True

class RelatorioMensal(BaseModel):
    mes_ano: str
    imobiliaria_nome: str
    total_vistorias: int
    total_improdutivas: int
    valor_vistorias: float
    valor_improdutivas: float
    valor_total: float
    vistorias_agendadas: List[VistoriaAgendadaRelatorio]
    vistorias_improdutivas: List[VistoriaImprodutivaRelatorio]

class StatsItem(BaseModel):
    total: int
    change: float

class DashboardStatsImobiliaria(BaseModel):
    vistorias_30d: StatsItem
    improdutivas_30d: StatsItem
    vistorias_mes_atual: int
    improdutivas_mes_atual: int
    projecao_proximo_mes: int
    monthly_breakdown: Dict[str, int]

class RelatorioVistoriaItem(BaseModel):
    data: date
    cod_imovel: str
    endereco: str
    tamanho: float
    tipo_mobilia: str
    tipo_vistoria: str
    valor: float
    comissao_vistoriador: float
    observacao_privada: Optional[str] = None
    observacao_vistoriador: Optional[str] = None # <-- NOVO CAMPO

class RelatorioImprodutivaItem(BaseModel):
    data_vistoria_original: date
    cod_imovel: str
    motivo_improdutividade: str
    valor_cobrado: float
    comissao_vistoriador: float

class RelatorioImobiliaria(BaseModel):
    imobiliaria_nome: str
    periodo: str
    vistorias: List[RelatorioVistoriaItem]
    improdutivas: List[RelatorioImprodutivaItem]
    total_vistorias: float
    total_improdutivas: float
    total_geral: float

class RelatorioVistoriador(BaseModel):
    vistoriador_nome: str
    periodo: str
    vistorias_por_imobiliaria: Dict[str, List[RelatorioVistoriaItem]]
    improdutivas: List[RelatorioImprodutivaItem]
    total_comissao_vistorias: float
    total_comissao_improdutivas: float
    total_geral_comissao: float
    
class RelatorioGeralItem(BaseModel):
    imobiliaria_nome: str
    total_vistorias: int
    total_improdutivas: int
    valor_total_vistorias: float
    valor_total_improdutivas: float

class RelatorioGeral(BaseModel):
    periodo: str
    data: List[RelatorioGeralItem]
    total_geral_vistorias: int
    total_geral_improdutivas: int
    valor_final_vistorias: float
    valor_final_improdutivas: float
    faturamento_total: float

# =================================================================
# --- Schemas de Suporte e TI ---
# =================================================================

class ChamadoCreate(BaseModel):
    titulo: str = Field(..., min_length=5, max_length=100)
    descricao: str = Field(..., min_length=10)
    categoria: str
    prioridade: str

class FeedbackCreate(BaseModel):
    app_version: str
    nota: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = None

class LoginAjudaCreate(BaseModel):
    email: EmailStr
    descricao: str = Field(..., min_length=10)

class AppVersionInfo(BaseModel):
    version_tag: str

class FeedbackCheck(BaseModel):
    has_submitted: bool

class DashboardStats(BaseModel):
    total_users: int
    total_clients: int
    total_imobiliarias: int
    total_imoveis: int
    open_tickets: int

class FeedbackChartItem(BaseModel):
    version: str
    avg_rating: float

class AdminUserDisplay(BaseModel):
    id: UUID
    nome: str
    email: EmailStr
    tipo: str
    table: str
    class Config: 
        from_attributes = True

class AdminUserCreate(BaseModel):
    nome: str
    email: EmailStr
    tipo: str
    senha: Optional[str] = None

class AdminUserUpdate(BaseModel):
    nome: str
    email: EmailStr
    tipo: str
    senha: Optional[str] = None

class ChamadoAdminDisplay(BaseModel):
    id: UUID
    titulo: str
    status: str
    prioridade: str
    categoria: str
    nome_usuario: str
    data_abertura: datetime
    descricao: Optional[str] = None
    comentario_conclusao: Optional[str] = None
    class Config: 
        from_attributes = True


class ChamadoResolve(BaseModel):
    comentario_conclusao: str = Field(..., min_length=5)

class FeedbackAdminDisplay(BaseModel):
    app_version: str
    nota: int
    comentario: Optional[str]
    data_envio: datetime
    nome_usuario: str

    class Config:
        from_attributes = True

class ImprodutivaDisplay(BaseModel):
    id: UUID
    data_vistoria: str
    horario: str
    cod_imovel: str
    cliente: str
    motivo: Optional[str]

    class Config:
        from_attributes = True

class AppVersionUpdate(BaseModel):
    new_version: str

class DeletedRecordInfo(BaseModel):
    id: UUID
    nome_info: str
    data_delecao: str
    tabela: str

    class Config:
        from_attributes = True
    
class CleanupPreviewResponse(BaseModel):
    counts: Dict[str, int]
    total: int

# =================================================================
# --- Schemas de Configurações ---
# =================================================================

class ConfiguracaoUpdate(BaseModel):
    percentual_comissao_improdutiva: float = Field(..., ge=0)

class ConfiguracaoDisplay(BaseModel):
    percentual_comissao_improdutiva: float

    class Config:
        from_attributes = True

