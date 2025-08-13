# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import date, datetime

# =================================================================
# --- Schemas Base e de Autenticação ---
# =================================================================

class Token(BaseModel):
    access_token: str
    token_type: str
    user_info: Dict[str, Any] # Adicionado para retornar informações do usuário no login

class TokenData(BaseModel):
    email: Optional[str] = None

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
# --- Schemas de Imobiliária ---
# =================================================================

class ImobiliariaBase(BaseModel):
    nome: str
    valor_sem_mobilia: float = Field(..., ge=0)
    valor_semi_mobiliado: float = Field(..., ge=0)
    valor_mobiliado: float = Field(..., ge=0)

class ImobiliariaCreate(ImobiliariaBase):
    email: Optional[EmailStr] = None
    senha: Optional[str] = Field(None, min_length=6)

class ImobiliariaUpdate(ImobiliariaBase):
    nome: str
    valor_sem_mobilia: float = Field(..., ge=0)
    valor_semi_mobiliado: float = Field(..., ge=0)
    valor_mobiliado: float = Field(..., ge=0)

class ImobiliariaDisplay(ImobiliariaBase):
    id: UUID
    email: Optional[EmailStr] = None

    class Config:
        from_attributes = True

# =================================================================
# --- Schemas de Imóvel ---
# =================================================================

class ImovelBase(BaseModel):
    cod_imovel: str
    endereco: str
    cep: Optional[str] = None
    referencia: Optional[str] = None
    tamanho: float = Field(..., gt=0)
    mobiliado: str # "sem_mobilia", "semi_mobiliado", "mobiliado"

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

class AgendaCreate(AgendaBase):
    imovel_id: UUID
    vistoriador_id: UUID
    tipo: str # 'ENTRADA', 'SAIDA', etc.

class AgendaUpdate(BaseModel):
    cod_imovel: Optional[str] = None
    endereco: Optional[str] = None
    cep: Optional[str] = None
    referencia: Optional[str] = None
    tamanho: Optional[float] = None
    mobiliado: Optional[str] = None
    tipo_vistoria: Optional[str] = None
    valor_final_vistoria: Optional[float] = None

class AgendaObservacaoUpdate(BaseModel):
    observacao_privada: str

class AgendaDisplay(AgendaBase):
    id: UUID
    disponivel: bool
    tipo: Optional[str] = None
    observacao_privada: Optional[str] = None
    valor_final_vistoria: Optional[float] = None
    vistoriador: UsuarioDisplay
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
# --- Schemas de Relatórios ---
# =================================================================

class RelatorioVistoriaItem(BaseModel):
    data: date
    cod_imovel: str
    endereco: str
    tamanho: float
    tipo_mobilia: str
    tipo_vistoria: str
    valor: float

class RelatorioImprodutivaItem(BaseModel):
    data: date
    cod_imovel: str
    motivo: str
    valor: float

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
    total_geral: float

# =================================================================
# --- Schemas de Suporte (Já existentes, mantidos) ---
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
