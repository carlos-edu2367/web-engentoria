# backend/migrar.py
"""
Aplica as migrations SQL pendentes de backend/migrations/, em ordem de nome.

Roda na subida da API (backend/main.py), logo depois do create_all, então todo
deploy na Railway aplica o que faltar antes de atender requisições. Também pode
ser rodado à mão: python -m backend.migrar

Regras para uma migration nova:
  - Nome com prefixo numérico sequencial: 0003_descricao.sql
  - Idempotente (IF NOT EXISTS etc.): em banco novo o create_all já criou as
    tabelas com as colunas atuais antes dela rodar.
  - Nunca editar uma migration já aplicada; crie outra.

Cada migration roda em uma transação e fica registrada em schema_migrations.
Se uma falhar, nada dela é aplicado e a subida é interrompida (o deploy falha).
Um advisory lock impede que duas réplicas apliquem ao mesmo tempo.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PASTA_MIGRATIONS = Path(__file__).resolve().parent / "migrations"
# Chave arbitrária do pg_advisory_lock usado só por este runner
LOCK_ID = 7_351_204_118


def listar_migrations(pasta: Path = PASTA_MIGRATIONS) -> list[Path]:
    return sorted(pasta.glob("*.sql"), key=lambda p: p.name)


def aplicar_migrations(engine, pasta: Path = PASTA_MIGRATIONS) -> list[str]:
    """Aplica as migrations ainda não registradas e devolve os nomes aplicados."""
    conn = engine.raw_connection()
    cur = conn.cursor()
    aplicadas_agora = []
    try:
        cur.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                nome TEXT PRIMARY KEY,
                aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        conn.commit()

        cur.execute("SELECT nome FROM schema_migrations")
        ja_aplicadas = {linha[0] for linha in cur.fetchall()}

        for arquivo in listar_migrations(pasta):
            if arquivo.name in ja_aplicadas:
                continue
            logger.info(f"Aplicando migration {arquivo.name}")
            try:
                cur.execute(arquivo.read_text(encoding="utf-8"))
                cur.execute("INSERT INTO schema_migrations (nome) VALUES (%s)", (arquivo.name,))
                conn.commit()
            except Exception:
                conn.rollback()
                logger.exception(f"Falha na migration {arquivo.name}; nada dela foi aplicado.")
                raise
            aplicadas_agora.append(arquivo.name)

        if not aplicadas_agora:
            logger.info("Nenhuma migration pendente.")
        return aplicadas_agora
    finally:
        try:
            cur.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
            conn.commit()
        finally:
            conn.close()


if __name__ == "__main__":
    from .config import engine, Base
    from . import models  # noqa: F401 (registra as tabelas no Base)
    # Mesma ordem da subida da API: tabelas novas primeiro, depois as migrations
    Base.metadata.create_all(bind=engine)
    aplicadas = aplicar_migrations(engine)
    print(f"{len(aplicadas)} migration(s) aplicada(s): {', '.join(aplicadas) or '-'}")
