# backend/models.py

from sqlalchemy import (Boolean, Column, ForeignKey, String, DateTime,
                        Date, Numeric, Text, Integer)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Importo a Base que declarei no config.py
from .config import Base

# --- Tabela de Usuários de TI (Gestores) ---
class UsuarioTI(Base):
    __tablename__ = "usuarios_ti"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    senha = Column(String, nullable=False)
    nivel_acesso = Column(String, nullable=False, default='gestor')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

# --- Tabela de Usuários (Vistoriadores/ADM do App) ---
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    telefone1 = Column(String, nullable=True)
    telefone2 = Column(String, nullable=True)
    tipo = Column(String, nullable=False, index=True) # 'vistoriador' ou 'admin'
    senha = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    # Relacionamentos
    vistorias = relationship("Agenda", back_populates="vistoriador")
    chamados = relationship("Chamado", back_populates="usuario")
    feedbacks = relationship("Feedback", back_populates="usuario")
    horarios_fixos = relationship("HorarioFixo", back_populates="vistoriador", cascade="all, delete-orphan")

# --- Tabela de Clientes ---
class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    telefone1 = Column(String, nullable=True)
    telefone2 = Column(String, nullable=True)
    saldo_devedor_total = Column(Numeric(10, 2), default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    # Relacionamentos
    imoveis = relationship("Imovel", back_populates="cliente")
    vistorias_improdutivas = relationship("VistoriaImprodutiva", back_populates="cliente")

# --- Tabela de Imobiliárias ---
class Imobiliaria(Base):
    __tablename__ = "imobiliarias"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, unique=True, nullable=False, index=True)
    valor_sem_mobilia = Column(Numeric(10, 2), nullable=False, default=0.0)
    valor_semi_mobiliado = Column(Numeric(10, 2), nullable=False, default=0.0)
    valor_mobiliado = Column(Numeric(10, 2), nullable=False, default=0.0)
    # Login para imobiliária (opcional, pode ser um grupo)
    email = Column(String, unique=True, nullable=True, index=True)
    senha = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    # Relacionamentos
    imoveis = relationship("Imovel", back_populates="imobiliaria")

# --- Tabela de Imóveis ---
class Imovel(Base):
    __tablename__ = "imoveis"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cod_imovel = Column(String, nullable=False, index=True)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("clientes.id"), nullable=False)
    imobiliaria_id = Column(UUID(as_uuid=True), ForeignKey("imobiliarias.id", ondelete="RESTRICT"), nullable=False)
    endereco = Column(Text, nullable=False)
    cep = Column(String, nullable=True)
    referencia = Column(Text, nullable=True)
    tamanho = Column(Numeric(10, 2), nullable=False, default=0.0)
    mobiliado = Column(String, nullable=True) # "sem_mobilia", "semi_mobiliado", "mobiliado"
    valor = Column(Numeric(10, 2), nullable=False, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    # Relacionamentos
    cliente = relationship("Cliente", back_populates="imoveis")
    imobiliaria = relationship("Imobiliaria", back_populates="imoveis")
    agendamentos = relationship("Agenda", back_populates="imovel")

# --- Tabela da Agenda ---
class Agenda(Base):
    __tablename__ = "agenda"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    imovel_id = Column(UUID(as_uuid=True), ForeignKey("imoveis.id", ondelete="SET NULL"), nullable=True)
    vistoriador_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(Date, nullable=False, index=True)
    horario = Column(String, nullable=False)
    disponivel = Column(Boolean, default=True)
    tipo = Column(String, nullable=True, index=True) # 'ENTRADA', 'SAIDA', 'LIVRE', 'FECHADO', etc.
    observacao_privada = Column(Text, nullable=True)
    valor_final_vistoria = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    # Relacionamentos
    imovel = relationship("Imovel", back_populates="agendamentos")
    vistoriador = relationship("Usuario", back_populates="vistorias")
    horario_fechado = relationship("HorarioFechado", back_populates="agenda_entry", uselist=False, cascade="all, delete-orphan")

# --- Tabela de Horários Fixos ---
class HorarioFixo(Base):
    __tablename__ = "horarios_fixos"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vistoriador_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    dia_semana = Column(String, nullable=False) # '0' para Domingo, '1' para Segunda...
    horario = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relacionamento
    vistoriador = relationship("Usuario", back_populates="horarios_fixos")

# --- Tabela de Horários Fechados ---
class HorarioFechado(Base):
    __tablename__ = "horarios_fechados"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agenda_id = Column(UUID(as_uuid=True), ForeignKey("agenda.id", ondelete="CASCADE"), unique=True, nullable=False)
    motivo = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    # Relacionamento
    agenda_entry = relationship("Agenda", back_populates="horario_fechado")

# --- Tabela de Vistorias Improdutivas ---
class VistoriaImprodutiva(Base):
    __tablename__ = "vistorias_improdutivas"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agenda_id_original = Column(UUID(as_uuid=True), ForeignKey("agenda.id", ondelete="RESTRICT"), nullable=False)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    imovel_id = Column(UUID(as_uuid=True), ForeignKey("imoveis.id", ondelete="SET NULL"), nullable=True)
    imobiliaria_id = Column(UUID(as_uuid=True), ForeignKey("imobiliarias.id", ondelete="SET NULL"), nullable=True)
    data_marcacao = Column(Date, nullable=False, server_default=func.now())
    data_vistoria_original = Column(Date, nullable=False)
    horario_vistoria_original = Column(String, nullable=False)
    motivo_improdutividade = Column(Text, nullable=False)
    valor_cobranca = Column(Numeric(10, 2), nullable=False)
    valor_para_vistoriador = Column(Numeric(10, 2), nullable=True)
    pago = Column(Boolean, default=False)
    data_pagamento = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relacionamentos
    agenda_original = relationship("Agenda")
    cliente = relationship("Cliente", back_populates="vistorias_improdutivas")
    imovel = relationship("Imovel")
    imobiliaria = relationship("Imobiliaria")

# --- Tabela de Feedbacks ---
class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    app_version = Column(String, nullable=False)
    nota = Column(Integer, nullable=False)
    comentario = Column(Text, nullable=True)
    data_envio = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    # Relacionamento
    usuario = relationship("Usuario", back_populates="feedbacks")

# --- Tabela de Chamados (Suporte) ---
class Chamado(Base):
    __tablename__ = "chamados"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    titulo = Column(String, nullable=False)
    descricao = Column(Text, nullable=True)
    categoria = Column(String, nullable=False)
    prioridade = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Aberto", index=True)
    data_abertura = Column(DateTime(timezone=True), server_default=func.now())
    data_conclusao = Column(DateTime(timezone=True), nullable=True)
    comentario_conclusao = Column(Text, nullable=True)
    notificacao_vista = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    # Relacionamento
    usuario = relationship("Usuario", back_populates="chamados")

# --- Tabela de Versão do App ---
class AppVersion(Base):
    __tablename__ = "app_version"
    id = Column(Integer, primary_key=True, default=1)
    version_tag = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
