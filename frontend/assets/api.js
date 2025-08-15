// /assets/api.js

// A constante API_BASE_URL_ADMIN agora é lida da variável global definida no gestao.html
const API_BASE_URL_ADMIN = window.APP_CONFIG.API_BASE_URL_ADMIN;

/**
 * Função principal para realizar chamadas à API.
 * Abstrai a lógica de autenticação e tratamento de erros.
 * @param {string} endpoint O endpoint da API a ser chamado.
 * @param {string} method O método HTTP (GET, POST, PUT, DELETE).
 * @param {object} [body=null] O corpo da requisição para POST/PUT.
 * @returns {Promise<any>} A resposta da API em JSON.
 */
async function apiFetch(endpoint, method = 'GET', body = null) {
    // As funções getToken() e logout() são globais, vindas do auth.js,
    // por isso não usamos 'import'.
    const token = getToken();
    if (!token) {
        logout();
        return;
    }

    const headers = new Headers({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    });

    const config = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL_ADMIN}${endpoint}`, config);

        // Tratamento de erros de autenticação/autorização
        if (response.status === 401 || response.status === 403) {
            console.error('Acesso não autorizado. Fazendo logout...');
            logout();
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(errorData.detail || 'Ocorreu um erro na comunicação com o servidor.');
        }
        
        // Se a resposta não tiver corpo (ex: DELETE com status 204), retorna sucesso
        if (response.status === 204) {
            return { success: true };
        }

        return await response.json();
    } catch (error) {
        console.error(`Erro na chamada da API para ${endpoint}:`, error);
        throw error; // Propaga o erro para ser tratado no módulo que chamou
    }
}

// Exporta um objeto com métodos específicos para cada endpoint, facilitando o uso
export const api = {
    // Dashboard
    getDashboardStats: () => apiFetch('/dashboard/stats'),
    getVistoriasChartData: () => apiFetch('/dashboard/vistorias-chart'),

    // Imobiliárias
    getImobiliarias: () => apiFetch('/imobiliarias/'),
    createImobiliaria: (data) => apiFetch('/imobiliarias/', 'POST', data),
    updateImobiliaria: (id, data) => apiFetch(`/imobiliarias/${id}`, 'PUT', data),
    deleteImobiliaria: (id) => apiFetch(`/imobiliarias/${id}`, 'DELETE'),

    // Vistoriadores
    getVistoriadores: () => apiFetch('/vistoriadores/'),
    getVistoriadorDetails: (id) => apiFetch(`/vistoriadores/${id}/detalhes`),
    createVistoriador: (data) => apiFetch('/vistoriadores/', 'POST', data),
    updateVistoriador: (id, data) => apiFetch(`/vistoriadores/${id}`, 'PUT', data),
    deleteVistoriador: (id) => apiFetch(`/vistoriadores/${id}`, 'DELETE'),

    // Horários
    getHorariosFixos: (vistoriadorId) => apiFetch(`/vistoriadores/${vistoriadorId}/horarios-fixos/`),
    addHorarioFixo: (data) => apiFetch('/horarios-fixos/', 'POST', data),
    deleteHorarioFixo: (horarioId) => apiFetch(`/horarios-fixos/${horarioId}`, 'DELETE'),
    addHorarioAvulso: (data) => apiFetch('/horarios-avulsos/', 'POST', data),
    
    // Clientes
    getClientes: () => apiFetch('/clientes/'),
    createCliente: (data) => apiFetch('/clientes/', 'POST', data),
    updateCliente: (id, data) => apiFetch(`/clientes/${id}`, 'PUT', data),
    deleteCliente: (id) => apiFetch(`/clientes/${id}`, 'DELETE'),

    // Imóveis
    getImoveis: () => apiFetch('/imoveis/'),

    // Agenda
    getAgendaEvents: (start, end) => apiFetch(`/agenda/all?start=${start}&end=${end}`),
    scheduleVistoria: (data) => apiFetch('/agenda/agendar', 'POST', data),
    updateVistoria: (id, data) => apiFetch(`/agenda/${id}`, 'PUT', data),
    cancelarVistoria: (id) => apiFetch(`/agenda/${id}/cancelar`, 'PUT'),
    reagendarVistoria: (id, targetId) => apiFetch(`/agenda/${id}/reagendar`, 'PUT', { target_agenda_id: targetId }),
    markAsImprodutiva: (id, motivo) => apiFetch(`/agenda/${id}/improdutiva`, 'PUT', { motivo }),

    // Configurações
    getConfig: () => apiFetch('/configuracoes/'),
    updateConfig: (data) => apiFetch('/configuracoes/', 'PUT', data),
};
