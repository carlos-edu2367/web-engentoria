-- Migração: adicionar campos cpf e nome_proprietario
-- Executar UMA VEZ no banco de produção (Railway / PostgreSQL)
--
-- Este projeto usa Base.metadata.create_all() que NÃO adiciona colunas a
-- tabelas existentes. Execute este script manualmente via psql ou pelo
-- painel do Railway (Query runner) antes de fazer o deploy.

-- 1. CPF do inquilino (tabela clientes)
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS cpf TEXT;

-- 2. Nome do proprietário na solicitação de agendamento
ALTER TABLE solicitacoes_agendamento
    ADD COLUMN IF NOT EXISTS nome_proprietario TEXT;

-- 3. Nome do proprietário na agenda (copiado da solicitação ou informado pelo admin)
ALTER TABLE agenda
    ADD COLUMN IF NOT EXISTS nome_proprietario TEXT;
