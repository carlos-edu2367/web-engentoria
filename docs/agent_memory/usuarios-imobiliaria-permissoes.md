# Usuários de imobiliária e permissões

## Modelo
- O login principal continua sendo `GrupoImobiliaria` (e-mail/senha do grupo). Ganhou `acesso_financeiro` e `acesso_vistorias` (DEFAULT TRUE: logins antigos ficam com as duas).
- Usuários adicionais: `UsuarioImobiliaria` (`usuarios_imobiliaria`), com `grupo_id`, login próprio e as mesmas duas flags. Exclusão é definitiva (libera o e-mail).
- As colunas novas em `grupos_imobiliarias` vêm da migration `backend/migrations/0002_usuarios_imobiliaria.sql`, aplicada no deploy.

## Autenticação
- `auth.get_user` também procura em `UsuarioImobiliaria` (grupo não deletado). O e-mail é único entre todas as tabelas de login.
- `auth.get_current_user` → `resolver_login_imobiliaria`: um usuário adicional vira o **próprio grupo** (as rotas usam `current_user.id` como grupo_id), com o usuário em `grupo.usuario_logado`. `GrupoImobiliaria.permissoes` lê as flags de quem está logado. Para o login principal, `usuario_logado` é zerado (a instância pode vir do identity map).
- Dependências: `auth.require_acesso_financeiro` e `auth.require_acesso_vistorias`. O 403 de permissão tem `detail = {"code": "permissao_negada", "message": ...}`; o `apiFetch` do portal da imobiliária não desloga nesse caso.
- `get_current_active_user_or_imobiliaria` (agendamento externo / solicitações) exige vistorias para imobiliárias.

## Divisão das rotas
- Financeiro: `relatorio-mensal`, `relatorio-download`, `status_info_mensal`, documentos/mensagens/aceite da info mensal.
- Vistorias: o resto de `/imobiliaria/*` (agenda, dashboard-stats, laudos, clientes, imóveis, comentários, documentos da agenda, PDF de não conformidades) e `/agendamento-externo/*`.
- `GET /imobiliaria/me`: nome, grupo e permissões (qualquer login de imobiliária).
- `status_info_mensal` também chama `verify_and_create_infos` (antes só o dashboard-stats criava a info do mês).

## Frontend
- Gestão no painel de TI (`admin-dashboard.html` → Imobiliárias): lista de usuários por grupo, criar/editar/remover, e permissões do login principal no "Editar Grupo".
- Portal: `imobiliaria_modules/sessao.js` carrega `/me`; o router esconde `[data-permissao]` e redireciona páginas proibidas para o dashboard; o dashboard mostra indicadores/agenda (vistorias) e/ou fechamento (financeiro).
