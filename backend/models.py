# backend/models.py

from sqlalchemy import (Boolean, Column, ForeignKey, String, DateTime,
                        Date, Numeric, Text, Integer)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Importo a Base que declarei no config.py
from .config import Base

# --- Modelo para a tabela de Usuários de TI (Gestores) ---
class UsuarioTI(Base):
    __tablename__ = "usuarios_ti"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    senha = Column(String, nullable=False)
    nivel_acesso = Column(String, nullable=False, default='gestor')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

# --- Modelo para a tabela de Usuários (Vistoriadores/ADM do App) ---
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    telefone1 = Column(String, nullable=True)
    telefone2 = Column(String, nullable=True)
    tipo = Column(String, nullable=False)
    senha = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    vistorias = relationship("Agenda", back_populates="vistoriador")
    chamados = relationship("Chamado", back_populates="usuario")
    feedbacks = relationship("Feedback", back_populates="usuario")

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
    imoveis = relationship("Imovel", back_populates="cliente")
    vistorias_improdutivas = relationship("VistoriaImprodutiva", back_populates="cliente")

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
    cliente = relationship("Cliente", back_populates="imoveis")
    imobiliaria = relationship("Imobiliaria", back_populates="imoveis")
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
    tipo = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
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

# --- Modelo para a tabela de Feedbacks ---
class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False)
    app_version = Column(String, nullable=False)
    nota = Column(Integer, nullable=False)
    comentario = Column(Text, nullable=True)
    data_envio = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    usuario = relationship("Usuario", back_populates="feedbacks")

# --- Modelo para Vistorias Improdutivas ---
class VistoriaImprodutiva(Base):
    __tablename__ = "vistorias_improdutivas"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agenda_id_original = Column(UUID(as_uuid=True), ForeignKey("agenda.id"), nullable=False)
    cliente_id = Column(UUID(as_uuid=True), ForeignKey("clientes.id"), nullable=False)
    imovel_id = Column(UUID(as_uuid=True), ForeignKey("imoveis.id"), nullable=True)
    data_vistoria_original = Column(Date, nullable=False)
    horario_vistoria_original = Column(String, nullable=False)
    motivo_improdutividade = Column(Text, nullable=False)
    valor_cobranca = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

    agenda_original = relationship("Agenda")
    cliente = relationship("Cliente", back_populates="vistorias_improdutivas")
    imovel = relationship("Imovel")

# --- NOVO: Modelo para a tabela de Versão do App ---
class AppVersion(Base):
    __tablename__ = "app_version"

    id = Column(Integer, primary_key=True, default=1)
    version_tag = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
