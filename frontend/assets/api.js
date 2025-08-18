// /assets/api.js

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

        if (response.status === 401 || response.status === 403) {
            console.error('Acesso não autorizado. Fazendo logout...');
            logout();
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Erro HTTP: ${response.status}` }));
            throw new Error(errorData.detail || 'Ocorreu um erro na comunicação com o servidor.');
        }
        
        if (response.status === 204) {
            return { success: true };
        }

        return await response.json();
    } catch (error) {
        console.error(`Erro na chamada da API para ${endpoint}:`, error);
        throw error;
    }
}

export const api = {
    // Dashboard
    getDashboardStats: () => apiFetch('/dashboard/stats'),
    getDashboardFinancialStats: () => apiFetch('/dashboard/financial-stats'),
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
    createImovel: (data) => apiFetch('/imoveis/', 'POST', data),
    deleteImovel: (id) => apiFetch(`/imoveis/${id}`, 'DELETE'),

    // Agenda
    getAgendaEvents: (start, end) => apiFetch(`/agenda/all?start=${start}&end=${end}`),
    generateAgenda: () => apiFetch('/agenda/gerar', 'POST'), // <-- NOVA FUNÇÃO ADICIONADA
    scheduleVistoria: (data) => apiFetch('/agenda/agendar', 'POST', data),
    updateVistoria: (id, data) => apiFetch(`/agenda/${id}`, 'PUT', data),
    cancelarVistoria: (id) => apiFetch(`/agenda/${id}/cancelar`, 'PUT'),
    reagendarVistoria: (id, targetId) => apiFetch(`/agenda/${id}/reagendar`, 'PUT', { target_agenda_id: targetId }),
    markAsImprodutiva: (id, data) => apiFetch(`/agenda/${id}/improdutiva`, 'PUT', data),
    fecharHorario: (id, motivo) => apiFetch(`/agenda/${id}/fechar`, 'PUT', { motivo }),

    // Relatórios
    getRelatorioImobiliaria: (imobiliariaId, mes, ano) => apiFetch(`/relatorios/imobiliaria/${imobiliariaId}?mes=${mes}&ano=${ano}`),
    getRelatorioVistoriador: (vistoriadorId, mes, ano) => apiFetch(`/relatorios/vistoriador/${vistoriadorId}?mes=${mes}&ano=${ano}`),

    // Configurações
    getConfig: () => apiFetch('/configuracoes/'),
    updateConfig: (data) => apiFetch('/configuracoes/', 'PUT', data),
};
