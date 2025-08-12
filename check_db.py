# check_db.py
import logging
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.schema import CreateTable, DropTable # Importa construtores de SQL

# Importa a 'engine' e a 'Base' dos seus arquivos de configuração e modelos.
from backend.config import engine
from backend.models import Base

# Configura um logger para exibir as mensagens de forma clara
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def get_sql_for_missing_column(table_name, column):
    """Gera o comando SQL 'ALTER TABLE' para adicionar uma coluna faltante."""
    # Compila o tipo da coluna para a sintaxe específica do dialeto do banco (PostgreSQL)
    column_type = column.type.compile(engine.dialect)
    
    # Inicia a construção do comando
    sql = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column_type}"
    
    # Adiciona restrições
    if not column.nullable:
        sql += " NOT NULL"
    if column.server_default:
        # Formata o valor padrão para ser uma string SQL válida
        default_value = column.server_default.arg.text if hasattr(column.server_default.arg, 'text') else str(column.server_default.arg)
        sql += f" DEFAULT {default_value}"
    if column.foreign_keys:
        fk = list(column.foreign_keys)[0]
        target_table = fk.column.table.name
        target_column = fk.column.name
        sql += f" REFERENCES {target_table}({target_column})"
        
    return sql + ";"


def check_and_migrate_schema():
    """
    Compara os modelos com o banco de dados, reporta diferenças e oferece
    a opção de aplicar as migrações necessárias.
    """
    logger.info("Iniciando verificação da estrutura do banco de dados...")
    commands_to_run = []

    try:
        inspector = inspect(engine)
    except OperationalError as e:
        logger.error(f"ERRO DE CONEXÃO: Não foi possível conectar ao banco de dados.\nDetalhe: {e}")
        return

    db_tables = inspector.get_table_names()
    model_tables = Base.metadata.tables

    logger.info("--- 1. Verificando Tabelas ---")
    missing_tables = set(model_tables.keys()) - set(db_tables)
    
    if missing_tables:
        for table_name in missing_tables:
            logger.error(f"Tabela '{table_name}' está definida nos modelos, mas NÃO EXISTE no banco de dados.")
            # Gera o comando 'CREATE TABLE' completo usando o SQLAlchemy
            create_sql = str(CreateTable(model_tables[table_name]).compile(engine)).strip() + ";"
            commands_to_run.append(create_sql)
    else:
        logger.info("OK: Todas as tabelas definidas nos modelos existem no banco de dados.")

    logger.info("\n--- 2. Verificando Colunas (para tabelas existentes) ---")
    for table_name, table_obj in model_tables.items():
        if table_name not in db_tables:
            continue

        logger.info(f"Verificando tabela: '{table_name}'...")
        db_columns = [col['name'] for col in inspector.get_columns(table_name)]
        model_columns = table_obj.columns

        missing_columns = set(model_columns.keys()) - set(db_columns)
        
        if missing_columns:
            for column_name in missing_columns:
                column_obj = model_columns[column_name]
                logger.error(f"  -> Coluna '{column_name}' está no modelo '{table_name}', mas NÃO EXISTE no banco de dados.")
                alter_sql = get_sql_for_missing_column(table_name, column_obj)
                commands_to_run.append(alter_sql)
        else:
            logger.info(f"  OK: Todas as colunas do modelo '{table_name}' existem no banco de dados.")

    # --- 3. Aplicar Mudanças ---
    if not commands_to_run:
        logger.info("\nVerificação concluída. O banco de dados está sincronizado com os modelos!")
        return

    logger.warning("\n--- 3. Sincronização Necessária ---")
    logger.info("Os seguintes comandos SQL precisam ser executados para sincronizar o banco de dados:")
    for cmd in commands_to_run:
        print(f"  {cmd}")

    # Pergunta ao usuário se deseja aplicar as mudanças
    user_input = input("\nDeseja aplicar as mudanças necessárias? (s/n): ").lower()

    if user_input in ['s', 'sim']:
        logger.info("Aplicando mudanças...")
        try:
            # Usa uma conexão para executar todos os comandos em uma transação
            with engine.connect() as connection:
                transaction = connection.begin()
                try:
                    for cmd in commands_to_run:
                        logger.info(f"Executando: {cmd}")
                        connection.execute(text(cmd))
                    transaction.commit()
                    logger.info("SUCESSO: O banco de dados foi atualizado com sucesso!")
                except Exception as e:
                    logger.error(f"ERRO: Falha ao executar um comando. A transação será revertida.")
                    logger.error(f"Detalhe do erro: {e}")
                    transaction.rollback()
        except Exception as e:
            logger.error(f"ERRO DE CONEXÃO: Não foi possível aplicar as mudanças. Detalhe: {e}")
    else:
        logger.info("Operação cancelada pelo usuário. Nenhuma mudança foi aplicada.")


if __name__ == "__main__":
    check_and_migrate_schema()
