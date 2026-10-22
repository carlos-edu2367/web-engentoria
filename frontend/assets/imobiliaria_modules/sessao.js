// frontend/assets/imobiliaria_modules/sessao.js
import { api } from './api-imob.js';

// Usuário logado e suas permissões (GET /imobiliaria/me). Carregado uma vez pelo router.
// Permissões: 'financeiro' (fechamento mensal e relatórios) e 'vistorias' (agenda, solicitações, laudos).
let sessao = null;

export async function carregarSessao() {
    sessao = await api.getMe();
    return sessao;
}

export const temPermissao = (permissao) => !!sessao?.permissoes?.[permissao];
