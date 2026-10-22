# Migrations do banco

- Runner: `backend/migrar.py`, chamado em `backend/main.py` logo após o `create_all`. Todo deploy na Railway (start da API) aplica as pendentes antes de atender requisições. Manual: `python -m backend.migrar`.
- Arquivos: `backend/migrations/NNNN_descricao.sql`, aplicados em ordem de nome. Registro em `schema_migrations (nome, aplicada_em)`.
- Cada arquivo roda em uma transação; se falhar, é revertido, não é registrado e a subida da API falha (o deploy não sobe com schema pela metade).
- `pg_advisory_lock` serializa réplicas subindo ao mesmo tempo.
- Regras: migrations idempotentes (em banco novo o `create_all` já criou as colunas atuais), nunca editar uma já aplicada, prefixo sequencial.
- `0001` (cpf/nome_proprietario) já tinha sido rodada à mão em produção; como é idempotente, o runner só a registra.
