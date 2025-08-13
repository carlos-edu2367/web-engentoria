# backend/models.py

from sqlalchemy import (Boolean, Column, ForeignKey, String, DateTime,
                        Date, Numeric, Text, Integer)
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, TEXT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Importo a Base que declarei no config.py
from .config import Base

# --- Modelo para a tabela de Grupos de Imobiliárias ---
class GrupoImobiliaria(Base):
    __tablename__ = "grupos_imobiliarias"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    senha = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    imobiliarias = relationship("Imobiliaria", back_populates="grupo")

# --- Modelo para a tabela de Usuários de TI (Gestores) ---
class UsuarioTI(Base):
    __tablename__ = "usuarios_ti"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(TEXT, nullable=False)
    email = Column(TEXT, unique=True, nullable=False, index=True)
    senha = Column(TEXT, nullable=False)
    nivel_acesso = Column(TEXT, nullable=False, default='gestor')
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())

# --- Modelo para a tabela de Usuários (Vistoriadores/ADM do App) ---
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(TEXT, nullable=False)
    email = Column(TEXT, unique=True, nullable=False, index=True)
    telefone1 = Column(TEXT, nullable=True)
    telefone2 = Column(TEXT, nullable=True)
    tipo = Column(TEXT, nullable=False, index=True) # 'vistoriador' ou 'admin'
    senha = Column(TEXT, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    # Relacionamentos
    vistorias = relationship("Agenda", back_populates="vistoriador")
    chamados = relationship("Chamado", back_populates="usuario")
    feedbacks = relationship("Feedback", back_populates="usuario")
    horarios_fixos = relationship("HorarioFixo", back_populates="vistoriador", cascade="all, delete-orphan")

# --- Modelo para a tabela de Clientes ---
class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(TEXT, nullable=False, index=True)
    email = Column(TEXT, nullable=False, index=True)
    telefone1 = Column(TEXT, nullable=True)
    telefone2 = Column(TEXT, nullable=True)
    saldo_devedor_total = Column(Numeric(10, 2), default=0.0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    # Relacionamentos
    imoveis = relationship("Imovel", back_populates="cliente")
    vistorias_improdutivas = relationship("VistoriaImprodutiva", back_populates="cliente")

# --- Modelo para a tabela de Imobiliárias ---
class Imobiliaria(Base):
    __tablename__ = "imobiliarias"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grupo_id = Column(UUID(as_uuid=True), ForeignKey("grupos_imobiliarias.id"), nullable=True)
    nome = Column(TEXT, unique=True, nullable=False, index=True)
    valor_sem_mobilia = Column(Numeric(10, 2), nullable=False, default=0.0)
    valor_semi_mobiliado = Column(Numeric(10, 2), nullable=False, default=0.0)
    valor_mobiliado = Column(Numeric(10, 2), nullable=False, default=0.0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    # Relacionamentos
    imoveis = relationship("Imovel", back_populates="imobiliaria")
    grupo = relationship("GrupoImobiliaria", back_populates="imobiliarias")

# --- Modelo para a tabela de Imóveis ---
class Imovel(Base):
    __tablename__ = "imoveis"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cod_imovel = Column(TEXT, nullable=False, index=True)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("clientes.id"), nullable=False)
    imobiliaria_id = Column(UUID(as_uuid=True), ForeignKey("imobiliarias.id", ondelete="RESTRICT"), nullable=False)
    endereco = Column(Text, nullable=False)
    cep = Column(TEXT, nullable=True)
    referencia = Column(Text, nullable=True)
    tamanho = Column(Numeric(10, 2), nullable=False, default=0.0)
    mobiliado = Column(TEXT, nullable=True) 
    valor = Column(Numeric(10, 2), nullable=False, default=0.0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    # Relacionamentos
    cliente = relationship("Cliente", back_populates="imoveis")
    imobiliaria = relationship("Imobiliaria", back_populates="imoveis")
    agendamentos = relationship("Agenda", back_populates="imovel")

# --- Modelo para a tabela da Agenda ---
class Agenda(Base):
    __tablename__ = "agenda"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    imovel_id = Column(UUID(as_uuid=True), ForeignKey("imoveis.id", ondelete="SET NULL"), nullable=True)
    vistoriador_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(Date, nullable=False, index=True)
    horario = Column(TEXT, nullable=False)
    disponivel = Column(Boolean, default=True)
    tipo = Column(TEXT, nullable=True, index=True)
    observacao_privada = Column(Text, nullable=True)
    valor_final_vistoria = Column(Numeric(10, 2), nullable=True)
    valor_vistoriador = Column(Numeric(10, 2), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    # Relacionamentos
    imovel = relationship("Imovel", back_populates="agendamentos")
    vistoriador = relationship("Usuario", back_populates="vistorias")
    horario_fechado = relationship("HorarioFechado", back_populates="agenda_entry", uselist=False, cascade="all, delete-orphan")

# --- Modelo para a tabela de Horários Fixos ---
class HorarioFixo(Base):
    __tablename__ = "horarios_fixos"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vistoriador_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    dia_semana = Column(TEXT, nullable=False)
    horario = Column(TEXT, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relacionamento
    vistoriador = relationship("Usuario", back_populates="horarios_fixos")

# --- Modelo para a tabela de Horários Fechados ---
class HorarioFechado(Base):
    __tablename__ = "horarios_fechados"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agenda_id = Column(UUID(as_uuid=True), ForeignKey("agenda.id", ondelete="CASCADE"), unique=True, nullable=False)
    motivo = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    # Relacionamento
    agenda_entry = relationship("Agenda", back_populates="horario_fechado")

# --- Modelo para a tabela de Vistorias Improdutivas ---
class VistoriaImprodutiva(Base):
    __tablename__ = "vistorias_improdutivas"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agenda_id_original = Column(UUID(as_uuid=True), ForeignKey("agenda.id", ondelete="RESTRICT"), nullable=False)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    imovel_id = Column(UUID(as_uuid=True), ForeignKey("imoveis.id", ondelete="SET NULL"), nullable=True)
    imobiliaria_id = Column(UUID(as_uuid=True), ForeignKey("imobiliarias.id", ondelete="SET NULL"), nullable=True)
    data_marcacao = Column(Date, nullable=False, server_default=func.now())
    data_vistoria_original = Column(Date, nullable=False)
    horario_vistoria_original = Column(TEXT, nullable=False)
    motivo_improdutividade = Column(Text, nullable=False)
    valor_cobranca = Column(Numeric(10, 2), nullable=False)
    valor_para_vistoriador = Column(Numeric(10, 2), nullable=True)
    pago = Column(Boolean, default=False)
    data_pagamento = Column(Date, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Relacionamentos
    agenda_original = relationship("Agenda")
    cliente = relationship("Cliente", back_populates="vistorias_improdutivas")
    imovel = relationship("Imovel")
    imobiliaria = relationship("Imobiliaria")

# --- Modelo para a tabela de Feedbacks ---
class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    app_version = Column(TEXT, nullable=False)
    nota = Column(Integer, nullable=False)
    comentario = Column(Text, nullable=True)
    data_envio = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    # Relacionamento
    usuario = relationship("Usuario", back_populates="feedbacks")

# --- Modelo para a tabela de Chamados (Suporte) ---
class Chamado(Base):
    __tablename__ = "chamados"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    titulo = Column(TEXT, nullable=False)
    descricao = Column(Text, nullable=True)
    categoria = Column(TEXT, nullable=False)
    prioridade = Column(TEXT, nullable=False)
    status = Column(TEXT, nullable=False, default="Aberto", index=True)
    data_abertura = Column(TIMESTAMP(timezone=True), server_default=func.now())
    data_conclusao = Column(TIMESTAMP(timezone=True), nullable=True)
    comentario_conclusao = Column(Text, nullable=True)
    notificacao_vista = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    
    # Relacionamento
    usuario = relationship("Usuario", back_populates="chamados")

# --- Modelo para a tabela de Versão do App ---
class AppVersion(Base):
    __tablename__ = "app_version"
    id = Column(Integer, primary_key=True, default=1)
    version_tag = Column(TEXT, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())

# --- Tabela de Configurações do Sistema ---
class Configuracao(Base):
    __tablename__ = "configuracoes"
    id = Column(Integer, primary_key=True, default=1)
    percentual_comissao_improdutiva = Column(Numeric(5, 2), nullable=False, default=50.0)
    updated_at = Column(TIMESTAMP(timezone=True), default=func.now(), onupdate=func.now())
