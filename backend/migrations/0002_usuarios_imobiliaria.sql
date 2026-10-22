-- Migração: usuários adicionais por grupo de imobiliárias e permissões
-- Aplicada automaticamente na subida da API (backend/migrar.py).
--
-- A tabela usuarios_imobiliaria é criada pelo create_all().
-- Os logins já existentes ficam com as duas permissões marcadas (DEFAULT TRUE).

ALTER TABLE grupos_imobiliarias
    ADD COLUMN IF NOT EXISTS acesso_financeiro BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE grupos_imobiliarias
    ADD COLUMN IF NOT EXISTS acesso_vistorias BOOLEAN NOT NULL DEFAULT TRUE;
