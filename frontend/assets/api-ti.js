// assets/api-ti.js

// Lógica para definir a URL da API dinamicamente
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isLocal ? 'http://127.0.0.1:8000/api/v1/admin' : '/api/v1/admin';

/**
 * Função principal para realizar chamadas à API que retornam JSON.
 * @param {string} endpoint O endpoint da API.
 * @param {string} method O método HTTP.
 * @param {object} [body=null] O corpo da requisição.
 * @returns {Promise<any>} A resposta da API em JSON.
 */
async function apiFetch(endpoint, method = 'GET', body = null) {
    // Funções globais de auth.js
    const token = getToken();
    if (!token) {
        logout();
        throw new Error("Token de autenticação não encontrado.");
    }

    const headers = new Headers({ 'Authorization': `Bearer ${token}` });
    const config = { method, headers };

    if (body) {
        headers.append('Content-Type', 'application/json');
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        if (response.status === 401 || response.status === 403) {
            logout();
            throw new Error("Acesso não autorizado.");
        }

        const responseBody = await response.text();

        if (!response.ok) {
            try {
                const errorData = JSON.parse(responseBody);
                throw new Error(errorData.detail || `Erro HTTP: ${response.status}`);
            } catch (e) {
                throw new Error(responseBody || `Erro HTTP: ${response.status}`);
            }
        }
        
        if (response.status === 204 || !responseBody) {
            return { success: true };
        }

        return JSON.parse(responseBody);
    } catch (error) {
        console.error(`Erro na chamada da API para ${endpoint}:`, error);
        throw error;
    }
}

export const api = {
    // Dashboard
    getDashboardStats: () => apiFetch('/dashboard/stats'),
    getFeedbackChartData: () => apiFetch('/dashboard/feedback-chart'),

    // Users
    getAllUsers: () => apiFetch('/users'),
    createUser: (data) => apiFetch('/users', 'POST', data),
    updateUser: (table, id, data) => apiFetch(`/users/${table}/${id}`, 'PUT', data),
    deleteUser: (table, id) => apiFetch(`/users/${table}/${id}`, 'DELETE'),

    // Imobiliarias & Grupos
    getGrupos: () => apiFetch('/grupos-imobiliarias'),
    createGrupo: (data) => apiFetch('/grupos-imobiliarias', 'POST', data),
    updateGrupo: (id, data) => apiFetch(`/grupos-imobiliarias/${id}`, 'PUT', data),
    deleteGrupo: (id) => apiFetch(`/grupos-imobiliarias/${id}`, 'DELETE'),
    getImobiliarias: () => apiFetch('/imobiliarias'),
    createImobiliaria: (data) => apiFetch('/imobiliarias', 'POST', data),
    updateImobiliaria: (id, data) => apiFetch(`/imobiliarias/${id}`, 'PUT', data),
    deleteImobiliaria: (id) => apiFetch(`/imobiliarias/${id}`, 'DELETE'),
    linkImobiliariaToGroup: (id, data) => apiFetch(`/imobiliarias/${id}/link-group`, 'PUT', data),

    // Chamados & Feedbacks
    getChamados: () => apiFetch('/chamados'),
    resolveChamado: (id, data) => apiFetch(`/chamados/${id}/resolve`, 'POST', data),
    getFeedbacks: () => apiFetch('/feedbacks'),

    // Improdutivas
    searchImprodutivas: (params) => apiFetch(`/improdutivas?${params.toString()}`),
    revertImprodutiva: (id) => apiFetch(`/improdutivas/${id}/revert`, 'POST'),

    // Restore & Maintenance
    getDeletedRecords: () => apiFetch('/restore/records'),
    restoreRecord: (table, id) => apiFetch(`/restore/records/${table}/${id}`, 'POST'),
    getCleanupPreview: () => apiFetch('/maintenance/cleanup-preview'),
    executeCleanup: () => apiFetch('/maintenance/cleanup-execute', 'DELETE'),
    updateAppVersion: (data) => apiFetch('/maintenance/app-version', 'POST', data),
};

