# check_db.py
import logging
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.schema import CreateTable, DropTable, CreateColumn
from sqlalchemy import MetaData

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

def compare_column_types(model_column, db_column, table_name):
    """Compara os tipos de coluna entre modelo e banco de dados."""
    model_type = str(model_column.type)
    db_type = str(db_column['type'])
    
    # Normaliza os tipos para comparação
    if model_type.replace(' ', '') != db_type.replace(' ', ''):
        logger.warning(f"  -> Tipo diferente para coluna '{model_column.name}': Modelo={model_type}, Banco={db_type}")
        return False
    return True

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
    extra_tables = set(db_tables) - set(model_tables.keys())
    
    if missing_tables:
        for table_name in missing_tables:
            logger.error(f"Tabela '{table_name}' está definida nos modelos, mas NÃO EXISTE no banco de dados.")
            # Gera o comando 'CREATE TABLE' completo usando o SQLAlchemy
            create_sql = str(CreateTable(model_tables[table_name]).compile(engine)).strip() + ";"
            commands_to_run.append(create_sql)
    else:
        logger.info("OK: Todas as tabelas definidas nos modelos existem no banco de dados.")
    
    if extra_tables:
        logger.warning("\nTabelas no banco de dados que não existem nos modelos (pode ser intencional):")
        for table_name in extra_tables:
            logger.warning(f"  - {table_name}")

    logger.info("\n--- 2. Verificando Colunas (para tabelas existentes) ---")
    for table_name, table_obj in model_tables.items():
        if table_name not in db_tables:
            continue

        logger.info(f"Verificando tabela: '{table_name}'...")
        db_columns = {col['name']: col for col in inspector.get_columns(table_name)}
        model_columns = table_obj.columns

        # Verifica colunas faltantes
        missing_columns = set(model_columns.keys()) - set(db_columns.keys())
        
        if missing_columns:
            for column_name in missing_columns:
                column_obj = model_columns[column_name]
                logger.error(f"  -> Coluna '{column_name}' está no modelo '{table_name}', mas NÃO EXISTE no banco de dados.")
                alter_sql = get_sql_for_missing_column(table_name, column_obj)
                commands_to_run.append(alter_sql)
        else:
            logger.info(f"  OK: Todas as colunas do modelo '{table_name}' existem no banco de dados.")

        # Verifica colunas extras no banco de dados
        extra_columns = set(db_columns.keys()) - set(model_columns.keys())
        if extra_columns:
            logger.warning(f"  -> Colunas no banco de dados que não existem no modelo (pode ser intencional):")
            for col_name in extra_columns:
                logger.warning(f"     - {col_name}")

        # Verifica tipos de dados e constraints para colunas existentes
        for column_name, model_column in model_columns.items():
            if column_name in db_columns:
                if not compare_column_types(model_column, db_columns[column_name], table_name):
                    # Aqui você poderia adicionar lógica para gerar comandos ALTER COLUMN
                    pass

    # --- 3. Verificando Constraints ---
    logger.info("\n--- 3. Verificando Constraints ---")
    for table_name, table_obj in model_tables.items():
        if table_name not in db_tables:
            continue

        # Verifica chaves primárias
        db_pk = inspector.get_pk_constraint(table_name)
        model_pk = [key.name for key in table_obj.primary_key]
        
        if set(db_pk['constrained_columns']) != set(model_pk):
            logger.error(f"  -> Diferença na chave primária da tabela '{table_name}':")
            logger.error(f"     Banco: {db_pk['constrained_columns']}")
            logger.error(f"     Modelo: {model_pk}")

        # Verifica chaves estrangeiras
        db_fks = inspector.get_foreign_keys(table_name)
        model_fks = [fk for fk in table_obj.foreign_key_constraints]
        
        # Esta verificação é mais complexa, podemos apenas logar as diferenças
        # Implementação completa exigiria mais lógica para comparação detalhada

    # --- 4. Aplicar Mudanças ---
    if not commands_to_run:
        logger.info("\nVerificação concluída. O banco de dados está sincronizado com os modelos!")
        return

    logger.warning("\n--- 4. Sincronização Necessária ---")
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