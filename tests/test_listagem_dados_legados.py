"""
Regressão: um único cadastro antigo fora do padrão (e-mail inválido, saldo nulo,
imóvel com tamanho 0 ou sem mobília) derrubava com erro 500 as listagens de
clientes/imóveis do agendamento, e a imobiliária ficava presa em
"Sincronizando Base de Dados...".
"""

import uuid
from types import SimpleNamespace

from backend import schemas


def _cliente(**kw):
    dados = dict(id=uuid.uuid4(), nome="Cliente", email="cliente@exemplo.com", telefone1=None,
                 telefone2=None, cpf=None, saldo_devedor_total=0)
    dados.update(kw)
    return SimpleNamespace(**dados)


def _imobiliaria():
    return SimpleNamespace(id=uuid.uuid4(), nome="Imob", valor_sem_mobilia=1,
                           valor_semi_mobiliado=1, valor_mobiliado=1)


def test_cliente_com_email_fora_do_padrao_e_saldo_nulo_e_listado():
    c = schemas.ClienteDisplay.model_validate(
        _cliente(email="cliente@exemplo.com.", saldo_devedor_total=None), from_attributes=True)
    assert c.email == "cliente@exemplo.com."
    assert c.saldo_devedor_total == 0.0


def test_imovel_com_tamanho_zero_e_sem_mobilia_e_listado():
    imovel = SimpleNamespace(id=uuid.uuid4(), cod_imovel="A1", endereco="Rua A", cep=None, referencia=None,
                             tamanho=0, mobiliado=None, valor=0, cliente=_cliente(email="x@y"),
                             imobiliaria=_imobiliaria())
    i = schemas.ImovelDisplay.model_validate(imovel, from_attributes=True)
    assert i.tamanho == 0
    assert i.mobiliado is None


def test_cadastro_continua_validando():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        schemas.ClienteCreate(nome="X", email="invalido@")
    with pytest.raises(ValidationError):
        schemas.ImovelCreate(cod_imovel="A", endereco="R", tamanho=0, mobiliado="mobiliado",
                             cliente_id=uuid.uuid4(), imobiliaria_id=uuid.uuid4())
