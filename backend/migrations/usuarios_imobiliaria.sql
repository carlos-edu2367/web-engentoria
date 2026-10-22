-- Migração: usuários adicionais por grupo de imobiliárias e permissões
--
-- A tabela usuarios_imobiliaria é criada pelo create_all() na subida da API.
-- As colunas abaixo, em uma tabela que já existe, também são aplicadas
-- automaticamente na subida (backend/main.py), porque sem elas o login das
-- imobiliárias quebra. O script fica aqui para execução manual, se preferir.
--
-- Os logins já existentes ficam com as duas permissões marcadas (DEFAULT TRUE).

ALTER TABLE grupos_imobiliarias
    ADD COLUMN IF NOT EXISTS acesso_financeiro BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE grupos_imobiliarias
    ADD COLUMN IF NOT EXISTS acesso_vistorias BOOLEAN NOT NULL DEFAULT TRUE;
