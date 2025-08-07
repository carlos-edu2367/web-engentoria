# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict
from uuid import UUID
from datetime import date, datetime

# =================================================================
# --- Schemas para Autenticação e Usuários (Existentes) ---
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
# --- Schemas para a Agenda (Leitura de Dados Existentes) ---
# =================================================================

class Vistoriador(BaseModel):
    nome: str
    class Config: from_attributes = True

class Imobiliaria(BaseModel):
    nome: str
    class Config: from_attributes = True

class Cliente(BaseModel):
    nome: str
    email: Optional[EmailStr] = None
    telefone1: Optional[str] = Field(None, alias="Telefone 1")
    telefone2: Optional[str] = Field(None, alias="Telefone 2")
    class Config:
        from_attributes = True
        populate_by_name = True

class Imovel(BaseModel):
    cod_imovel: str = Field(..., alias="Código")
    endereco: str = Field(..., alias="Endereço")
    cep: Optional[str] = Field("N/D", alias="CEP")
    referencia: Optional[str] = Field("N/D", alias="Referência")
    tamanho: float = Field(..., alias="Tamanho")
    mobiliado: str = Field(..., alias="Mobília")
    imobiliaria: Imobiliaria
    class Config:
        from_attributes = True
        populate_by_name = True

class Vistoria(BaseModel):
    id: UUID
    tipo_vistoria: str = Field(..., alias="Tipo de Vistoria")
    data: date
    horario: str
    vistoriador: Vistoriador
    imovel: Optional[Imovel] = None
    cliente: Optional[Cliente] = None
    class Config:
        from_attributes = True
        populate_by_name = True

# =================================================================
# --- Schemas para Suporte (Existentes e Novos) ---
# =================================================================

class ChamadoCreate(BaseModel):
    titulo: str = Field(..., min_length=5, max_length=100)
    descricao: str = Field(..., min_length=10)
    categoria: str
    prioridade: str

class LoginAjudaCreate(BaseModel):
    email: EmailStr
    descricao: str = Field(..., min_length=10)

# --- NOVO: Schemas para Feedback do Vistoriador ---
class FeedbackCreate(BaseModel):
    app_version: str
    nota: int = Field(..., ge=1, le=5) # Garante que a nota esteja entre 1 e 5
    comentario: Optional[str] = None

class AppVersionInfo(BaseModel):
    version_tag: str

class FeedbackCheck(BaseModel):
    has_submitted: bool


# =================================================================
# --- Schemas para o Painel de Gestão de TI (Existentes) ---
# =================================================================

# --- Dashboard ---
class DashboardStats(BaseModel):
    total_users: int
    total_clients: int
    total_imobiliarias: int
    total_imoveis: int
    open_tickets: int

class FeedbackChartItem(BaseModel):
    version: str
    avg_rating: float

# --- Gerenciamento de Usuários ---
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

# --- Chamados e Feedbacks ---
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

# --- Vistorias Improdutivas ---
class ImprodutivaDisplay(BaseModel):
    id: UUID
    data_vistoria: str
    horario: str
    cod_imovel: str
    cliente: str
    motivo: str
    class Config: from_attributes = True

# --- Manutenção e Restauração ---
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
