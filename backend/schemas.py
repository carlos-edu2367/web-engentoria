# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import date, datetime

# =================================================================
# --- Schemas para Autenticação e Usuários ---
# =================================================================

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    dashboard: Optional[str] = None

class UsuarioLogin(BaseModel):
    email: EmailStr
    password: str

# =================================================================
# --- Schemas para a Agenda ---
# =================================================================

class Vistoriador(BaseModel):
    nome: str
    class Config: from_attributes = True

class ImobiliariaBase(BaseModel):
    id: UUID
    nome: str
    class Config: from_attributes = True

class Cliente(BaseModel):
    nome: str
    email: Optional[EmailStr] = None
    telefone1: Optional[str] = None
    telefone2: Optional[str] = None
    class Config:
        from_attributes = True

class Imovel(BaseModel):
    cod_imovel: str
    endereco: str
    cep: Optional[str] = "N/D"
    referencia: Optional[str] = "N/D"
    tamanho: float
    mobiliado: str
    valor: float
    imobiliaria: ImobiliariaBase
    class Config:
        from_attributes = True

class Vistoria(BaseModel):
    id: UUID
    tipo_vistoria: str
    data: date
    horario: str
    vistoriador: Vistoriador
    imovel: Optional[Imovel] = None
    cliente: Optional[Cliente] = None
    class Config:
        from_attributes = True

# =================================================================
# --- Schemas para Imobiliárias e Grupos ---
# =================================================================

class GrupoImobiliariaBase(BaseModel):
    nome: str
    email: EmailStr

class GrupoImobiliariaCreate(GrupoImobiliariaBase):
    senha: str = Field(..., min_length=6)

class GrupoImobiliariaDisplay(GrupoImobiliariaBase):
    id: UUID
    imobiliarias: List[ImobiliariaBase] = []
    class Config:
        from_attributes = True

class ImobiliariaCreate(BaseModel):
    nome: str
    valor_sem_mobilia: float = Field(..., ge=0)
    valor_semi_mobiliado: float = Field(..., ge=0)
    valor_mobiliado: float = Field(..., ge=0)

class ImobiliariaUpdate(ImobiliariaCreate):
    pass

class ImobiliariaDetail(ImobiliariaCreate):
    id: UUID
    grupo: Optional[GrupoImobiliariaBase] = None
    class Config:
        from_attributes = True

class ImobiliariaGrupoLink(BaseModel):
    grupo_id: Optional[UUID] = None

# --- Schemas para o Dashboard da Imobiliária ---

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

class VistoriaImprodutivaRelatorio(BaseModel):
    id: UUID
    data_vistoria_original: date
    cod_imovel: str
    motivo_improdutividade: str
    valor_cobranca: float
    class Config: from_attributes = True

# ALTERADO: Adicionados novos campos para o relatório
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

# =================================================================
# --- Schemas para Suporte ---
# =================================================================
class ChamadoCreate(BaseModel):
    titulo: str = Field(..., min_length=5, max_length=100)
    descricao: str = Field(..., min_length=10)
    categoria: str
    prioridade: str

class LoginAjudaCreate(BaseModel):
    email: EmailStr
    descricao: str = Field(..., min_length=10)

class FeedbackCreate(BaseModel):
    app_version: str
    nota: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = None

class AppVersionInfo(BaseModel):
    version_tag: str

class FeedbackCheck(BaseModel):
    has_submitted: bool

# =================================================================
# --- Schemas para o Painel de Gestão de TI ---
# =================================================================
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
    class Config: from_attributes = True

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
    class Config: from_attributes = True

class ChamadoResolve(BaseModel):
    comentario_conclusao: str = Field(..., min_length=5)

class FeedbackAdminDisplay(BaseModel):
    app_version: str
    nota: int
    comentario: str
    data_envio: datetime
    nome_usuario: str
    class Config: from_attributes = True

class ImprodutivaDisplay(BaseModel):
    id: UUID
    data_vistoria: str
    horario: str
    cod_imovel: str
    cliente: str
    motivo: str
    class Config: from_attributes = True

class AppVersionUpdate(BaseModel):
    new_version: str

class DeletedRecordInfo(BaseModel):
    id: UUID
    nome_info: str
    data_delecao: str
    tabela: str
    class Config: from_attributes = True

class CleanupPreviewResponse(BaseModel):
    counts: Dict[str, int]
    total: int
