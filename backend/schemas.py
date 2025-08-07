# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict
from uuid import UUID
from datetime import date, datetime

# =================================================================
# --- Schemas para Autenticação e Usuários (Existentes) ---
# =================================================================

class Token(BaseModel):
    """
    Este é o formato do token que vou enviar de volta no login.
    """
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """
    Este é o formato dos dados que eu guardo dentro do token JWT.
    """
    email: Optional[str] = None

class UsuarioLogin(BaseModel):
    """
    O que eu preciso receber no corpo da requisição de login.
    """
    email: EmailStr
    password: str

# =================================================================
# --- Schemas para a Agenda (Leitura de Dados Existentes) ---
# =================================================================

class Vistoriador(BaseModel):
    """Schema simplificado para mostrar os dados do vistoriador na vistoria."""
    nome: str

    class Config:
        from_attributes = True # Permite criar o schema a partir de um objeto SQLAlchemy

class Imobiliaria(BaseModel):
    """Schema simplificado para a imobiliária."""
    nome: str

    class Config:
        from_attributes = True

class Cliente(BaseModel):
    """Schema para os detalhes do cliente."""
    nome: str
    email: Optional[EmailStr] = None
    telefone1: Optional[str] = Field(None, alias="Telefone 1")
    telefone2: Optional[str] = Field(None, alias="Telefone 2")

    class Config:
        from_attributes = True
        populate_by_name = True # Permite usar o 'alias'

class Imovel(BaseModel):
    """Schema para os detalhes do imóvel."""
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
    """
    Este é o schema principal para cada "card" de vistoria na agenda.
    Ele junta todas as informações necessárias.
    """
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
# --- Schemas para Suporte (Existentes) ---
# =================================================================

class ChamadoCreate(BaseModel):
    """
    O que eu preciso receber no corpo da requisição para criar um novo ticket.
    """
    titulo: str = Field(..., min_length=5, max_length=100)
    descricao: str = Field(..., min_length=10)
    categoria: str
    prioridade: str

class LoginAjudaCreate(BaseModel):
    """
    Schema para o formulário público de ajuda com o login.
    """
    email: EmailStr
    descricao: str = Field(..., min_length=10)


# =================================================================
# --- NOVO: Schemas para o Painel de Gestão de TI ---
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
    tipo: str  # Ex: 'admin', 'vistoriador', 'cliente', 'gestor_ti'
    table: str # A tabela de origem: 'usuarios', 'clientes', 'usuarios_ti'

    class Config:
        from_attributes = True

class AdminUserCreate(BaseModel):
    nome: str
    email: EmailStr
    tipo: str # 'admin', 'vistoriador', ou 'cliente'
    senha: Optional[str] = None

class AdminUserUpdate(BaseModel):
    nome: str
    email: EmailStr
    tipo: str
    senha: Optional[str] = None # Opcional, para não forçar a mudança de senha

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

    class Config:
        from_attributes = True

class ChamadoResolve(BaseModel):
    comentario_conclusao: str = Field(..., min_length=5)

class FeedbackAdminDisplay(BaseModel):
    app_version: str
    nota: int
    comentario: str
    data_envio: datetime
    nome_usuario: str

    class Config:
        from_attributes = True

# --- Vistorias Improdutivas ---
class ImprodutivaDisplay(BaseModel):
    id: UUID
    data_vistoria: str
    horario: str
    cod_imovel: str
    cliente: str
    motivo: str

    class Config:
        from_attributes = True

# --- Manutenção e Restauração ---
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
