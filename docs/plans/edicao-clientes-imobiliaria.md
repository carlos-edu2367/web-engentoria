# Plano: Edição de Clientes no Painel da Imobiliária

## Objetivo
Permitir que cada grupo de imobiliária edite **apenas seus próprios clientes**
(nome, email, telefone), com isolamento multi-tenant garantido no backend.

## Regra de propriedade
Um cliente "pertence" ao grupo logado se existe ao menos um `Imovel` (não deletado)
vinculado a esse cliente cuja imobiliária pertence ao grupo. Reutiliza o padrão de
`agendamento_externo_routes.get_clientes_agendamento`.

> **Decisão de UX (revisada):** não criar aba/página dedicada de Clientes. A edição
> foi integrada à aba **Clientes já existente dentro da ferramenta de Agendamento**
> (Hub de Gestão e Vistorias → aba "Clientes"), que já lista os clientes do grupo de
> forma isolada via `GET /agendamento-externo/clientes`.

## Backend (`backend/`)
1. `schemas.py`
   - `ClienteUpdate`: `nome`, `email` (EmailStr), `telefone1`, `telefone2` (apenas estes;
     `cpf` e `saldo_devedor_total` ficam fora de escopo — financeiro/sensível).
2. `routes/imobiliaria_routes.py`
   - Helper `_query_clientes_do_grupo(db, grupo_id)` aplicando o join Imovel/Imobiliaria.
   - `PUT /imobiliaria/clientes/{cliente_id}` (body `ClienteUpdate`):
     - 400 se UUID inválido.
     - 404 se o cliente não pertence ao grupo (não vaza existência).
     - 409 se o novo email já pertence a outro cliente ativo.
     - Atualiza e retorna `ClienteDisplay`.

## Frontend (`frontend/`)
3. `assets/imobiliaria_modules/api-imob.js`: `updateCliente(id, data)`.
4. `assets/imobiliaria_modules/scheduling.js`:
   - `renderClientesGrid`: cada card de cliente ganha botão **Editar** (`data-action="edit-cliente"`).
   - `openEditClienteModal(id)`: modal pré-preenchido (nome, email, telefone1, telefone2),
     salva via `api.updateCliente` e atualiza o estado/listagem local.
   - Delegação do clique no handler de `[data-action]`.

## Riscos / pontos de atenção
- **Clientes compartilhados**: se um cliente tem imóveis em grupos distintos, ambos podem
  editar o registro compartilhado (nome/email/telefone afetam todos). É consequência do
  modelo de dados (cliente global) e está alinhado ao requisito ("seus clientes").
- Listagem legada global em `GET /imobiliaria/clientes` permanece inalterada (fora de escopo).
- Sem testes automatizados no projeto para estas rotas; validação será manual.
