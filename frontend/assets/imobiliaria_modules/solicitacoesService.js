// frontend/assets/imobiliaria_modules/solicitacoesService.js

const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const BASE_URL = `${isLocal ? 'http://127.0.0.1:8000/api/v1' : '/api/v1'}/agendamento-externo`;

/**
 * Função utilitária interna para realizar fetch autenticado.
 */
async function authFetch(endpoint, options = {}) {
    const token = window.getToken ? window.getToken() : localStorage.getItem('engentoria_vist_token');
    
    if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
    };

    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao comunicar com o servidor");
    }

    return response.json();
}

export const SolicitacoesService = {
    /**
     * Lista as solicitações da imobiliária com paginação
     * @param {number} page Página atual
     * @param {number} pageSize Quantidade de itens por página
     * @param {string} status Filtro opcional de status
     */
    listar: async (page = 1, pageSize = 10, status = '') => {
        let url = `/minhas-solicitacoes?page=${page}&page_size=${pageSize}`;
        if (status) url += `&status=${status}`;
        return authFetch(url);
    },

    /**
     * Obtém os detalhes completos de uma solicitação específica
     * @param {string} id UUID da solicitação
     */
    obterDetalhes: async (id) => {
        return authFetch(`/minhas-solicitacoes/${id}`);
    },

    /**
     * Cancela uma solicitação (apenas PENDENTE_ADMIN ou PENDENTE_CLIENTE)
     * @param {string} id UUID da solicitação
     */
    cancelar: async (id) => {
        return authFetch(`/minhas-solicitacoes/${id}/cancelar`, { method: 'PATCH' });
    },

    /**
     * Edita os campos de uma solicitação (apenas PENDENTE_ADMIN ou PENDENTE_CLIENTE)
     * @param {string} id UUID da solicitação
     * @param {FormData} formData Campos a atualizar (tipo_vistoria, observacao, vistoriadores_ids, arquivos)
     */
    editar: async (id, formData) => {
        const token = window.getToken ? window.getToken() : localStorage.getItem('engentoria_vist_token');
        if (!token) throw new Error("Sessão expirada. Faça login novamente.");

        const response = await fetch(`${BASE_URL}/minhas-solicitacoes/${id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Erro ao comunicar com o servidor");
        }

        return response.json();
    }
};