# backend/schemas.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime

# --- Schemas para Autenticação ---

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

# --- Schemas para a Agenda (leitura de dados) ---
# Criei schemas "base" para cada modelo, para poder aninhar as informações
# e retornar um JSON completo e organizado, como planejamos.

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

# --- Schemas para Suporte ---

class ChamadoCreate(BaseModel):
    """
    O que eu preciso receber no corpo da requisição para criar um novo ticket.
    """
    titulo: str = Field(..., min_length=5, max_length=100)
    descricao: str = Field(..., min_length=10)
    categoria: str
    prioridade: str
