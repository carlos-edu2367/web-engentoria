# backend/models.py

from sqlalchemy import (Boolean, Column, ForeignKey, String, DateTime,
                        Date, Numeric, Text, Integer)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Importo a Base que declarei no config.py
from .config import Base

# --- Modelo para a tabela de Usuários (Vistoriadores/ADM) ---
class Usuario(Base):
    __tablename__ = "usuarios"

    # Defino as colunas da tabela, espelhando o schema do pg_schema_setup.py
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    telefone1 = Column(String, nullable=True)
    telefone2 = Column(String, nullable=True)
    tipo = Column(String, nullable=False) # 'vistoriador' ou 'adm'
    senha = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Defino o relacionamento: um usuário (vistoriador) pode ter várias vistorias na agenda.
    # O 'back_populates' faz o link com o relacionamento no modelo 'Agenda'.
    vistorias = relationship("Agenda", back_populates="vistoriador")
    chamados = relationship("Chamado", back_populates="usuario")


# --- Modelo para a tabela de Clientes ---
class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False)
    email = Column(String, nullable=False)
    telefone1 = Column(String, nullable=True)
    telefone2 = Column(String, nullable=True)
    saldo_devedor_total = Column(Numeric(10, 2), default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Um cliente pode ter vários imóveis.
    imoveis = relationship("Imovel", back_populates="cliente")


# --- Modelo para a tabela de Imobiliárias ---
class Imobiliaria(Base):
    __tablename__ = "imobiliarias"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, unique=True, nullable=False)
    valor_sem_mobilia = Column(Numeric(10, 2), nullable=False, default=0.0)
    valor_semi_mobiliado = Column(Numeric(10, 2), nullable=False, default=0.0)
    valor_mobiliado = Column(Numeric(10, 2), nullable=False, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Uma imobiliária pode ter vários imóveis.
    imoveis = relationship("Imovel", back_populates="imobiliaria")


# --- Modelo para a tabela de Imóveis ---
class Imovel(Base):
    __tablename__ = "imoveis"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cod_imovel = Column(String, nullable=False)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("clientes.id"), nullable=False)
    imobiliaria_id = Column(UUID(as_uuid=True), ForeignKey("imobiliarias.id"), nullable=False)
    endereco = Column(Text, nullable=False)
    cep = Column(String, nullable=True)
    referencia = Column(Text, nullable=True)
    tamanho = Column(Numeric(10, 2), nullable=False, default=0.0)
    mobiliado = Column(String, nullable=True)
    valor = Column(Numeric(10, 2), nullable=False, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relacionamentos "de volta" para Cliente e Imobiliária.
    cliente = relationship("Cliente", back_populates="imoveis")
    imobiliaria = relationship("Imobiliaria", back_populates="imoveis")
    # Um imóvel pode estar em várias agendas (ex: entrada, saída).
    agendamentos = relationship("Agenda", back_populates="imovel")


# --- Modelo para a tabela da Agenda ---
class Agenda(Base):
    __tablename__ = "agenda"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    imovel_id = Column(UUID(as_uuid=True), ForeignKey("imoveis.id"), nullable=True)
    vistoriador_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False)
    data = Column(Date, nullable=False)
    horario = Column(String, nullable=False)
    disponivel = Column(Boolean, default=True)
    tipo = Column(String, nullable=True) # 'ENTRADA', 'SAIDA', 'CONFERENCIA', etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relacionamentos "de volta" para Imóvel e Usuário (Vistoriador).
    imovel = relationship("Imovel", back_populates="agendamentos")
    vistoriador = relationship("Usuario", back_populates="vistorias")


# --- Modelo para a tabela de Chamados (Suporte) ---
class Chamado(Base):
    __tablename__ = "chamados"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False)
    titulo = Column(String, nullable=False)
    descricao = Column(Text, nullable=True)
    categoria = Column(String, nullable=False)
    prioridade = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Aberto")
    data_abertura = Column(DateTime(timezone=True), server_default=func.now())
    data_conclusao = Column(DateTime(timezone=True), nullable=True)
    comentario_conclusao = Column(Text, nullable=True)
    notificacao_vista = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    usuario = relationship("Usuario", back_populates="chamados")
