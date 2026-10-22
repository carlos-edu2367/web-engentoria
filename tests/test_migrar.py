"""
Testes do runner de migrations (backend/migrar.py).

  - as migrations reais já foram aplicadas e registradas na subida da API (import do conftest)
  - aplica as pendentes em ordem e não reaplica as registradas
  - uma migration com erro é revertida inteira, não é registrada e interrompe a subida
"""

import uuid

import pytest
from sqlalchemy import text

from backend.config import engine
from backend.migrar import PASTA_MIGRATIONS, aplicar_migrations, listar_migrations


def _registradas():
    with engine.connect() as conn:
        return {linha[0] for linha in conn.execute(text("SELECT nome FROM schema_migrations"))}


@pytest.fixture
def ambiente(tmp_path):
    """Pasta de migrations temporária e uma tabela exclusiva do teste; limpa tudo no fim."""
    sufixo = uuid.uuid4().hex[:8]
    tabela = f"teste_migrar_{sufixo}"
    yield tmp_path, tabela, sufixo
    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {tabela}"))
        conn.execute(text("DELETE FROM schema_migrations WHERE nome LIKE :padrao"), {"padrao": f"%{sufixo}%"})


def test_migrations_do_projeto_aplicadas_na_subida():
    nomes = [p.name for p in listar_migrations(PASTA_MIGRATIONS)]
    assert nomes == sorted(nomes) and nomes, nomes
    assert set(nomes) <= _registradas()
    with engine.connect() as conn:
        colunas = {linha[0] for linha in conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'grupos_imobiliarias'"
        ))}
    assert {"acesso_financeiro", "acesso_vistorias"} <= colunas
    # Rodar de novo não aplica nada
    assert aplicar_migrations(engine) == []


def test_aplica_pendentes_em_ordem_e_uma_vez(ambiente):
    pasta, tabela, sufixo = ambiente
    # Escritas fora de ordem: a 0002 depende da tabela criada pela 0001
    (pasta / f"0002_coluna_{sufixo}.sql").write_text(f"ALTER TABLE {tabela} ADD COLUMN nome TEXT;\n")
    (pasta / f"0001_tabela_{sufixo}.sql").write_text(
        f"-- comentário com ; e 100% de texto\nCREATE TABLE {tabela} (id INT);\nINSERT INTO {tabela} VALUES (1);\n"
    )

    aplicadas = aplicar_migrations(engine, pasta)
    assert aplicadas == [f"0001_tabela_{sufixo}.sql", f"0002_coluna_{sufixo}.sql"]
    assert set(aplicadas) <= _registradas()

    # Só a nova é aplicada numa segunda rodada (a 0002 não é idempotente: falharia se rodasse de novo)
    (pasta / f"0003_dado_{sufixo}.sql").write_text(f"UPDATE {tabela} SET nome = 'ok';\n")
    assert aplicar_migrations(engine, pasta) == [f"0003_dado_{sufixo}.sql"]
    with engine.connect() as conn:
        assert conn.execute(text(f"SELECT nome FROM {tabela}")).scalar() == "ok"


def test_migration_com_erro_e_revertida_e_interrompe(ambiente):
    pasta, tabela, sufixo = ambiente
    (pasta / f"0001_ok_{sufixo}.sql").write_text(f"CREATE TABLE {tabela} (id INT);\n")
    (pasta / f"0002_quebrada_{sufixo}.sql").write_text(
        f"INSERT INTO {tabela} VALUES (1);\nSELECT * FROM tabela_que_nao_existe_{sufixo};\n"
    )
    (pasta / f"0003_depois_{sufixo}.sql").write_text(f"INSERT INTO {tabela} VALUES (3);\n")

    with pytest.raises(Exception):
        aplicar_migrations(engine, pasta)

    registradas = _registradas()
    assert f"0001_ok_{sufixo}.sql" in registradas
    assert f"0002_quebrada_{sufixo}.sql" not in registradas
    assert f"0003_depois_{sufixo}.sql" not in registradas
    with engine.connect() as conn:
        # O INSERT da migration quebrada foi revertido junto com ela
        assert conn.execute(text(f"SELECT count(*) FROM {tabela}")).scalar() == 0

    # Corrigida, a próxima subida continua de onde parou
    (pasta / f"0002_quebrada_{sufixo}.sql").write_text(f"INSERT INTO {tabela} VALUES (2);\n")
    assert aplicar_migrations(engine, pasta) == [f"0002_quebrada_{sufixo}.sql", f"0003_depois_{sufixo}.sql"]
