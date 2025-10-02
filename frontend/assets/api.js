// /assets/api.js

const API_BASE_URL_ADMIN = window.APP_CONFIG.API_BASE_URL_ADMIN;

/**
 * Função principal para realizar chamadas à API que retornam JSON.
 * @param {string} endpoint O endpoint da API.
 * @param {string} method O método HTTP.
 * @param {object} [body=null] O corpo da requisição.
 * @returns {Promise<any>} A resposta da API em JSON.
 */
async function apiFetch(endpoint, method = 'GET', body = null) {
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
        const response = await fetch(`${API_BASE_URL_ADMIN}${endpoint}`, config);

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

/**
 * Função especializada para fazer download de arquivos da API.
 * @param {URLSearchParams} params - Os parâmetros de query para a URL.
 * @returns {Promise<void>}
 */
async function downloadApiFile(endpoint, params) {
    const token = getToken();
    if (!token) {
        logout();
        throw new Error("Token de autenticação não encontrado.");
    }
    const url = `${API_BASE_URL_ADMIN}${endpoint}?${params.toString()}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Falha ao iniciar o download (Status: ${response.status})`);
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'relatorio.xlsx'; // fallback
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match && match[1]) {
                filename = match[1];
            }
        }
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();

    } catch (error) {
        console.error(`Erro no download do arquivo de ${endpoint}:`, error);
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
    getClientes: (searchTerm = '') => {
        const endpoint = searchTerm 
            ? `/clientes/?search=${encodeURIComponent(searchTerm)}` 
            : '/clientes/';
        return apiFetch(endpoint);
    },
    createCliente: (data) => apiFetch('/clientes/', 'POST', data),
    updateCliente: (id, data) => apiFetch(`/clientes/${id}`, 'PUT', data),
    deleteCliente: (id) => apiFetch(`/clientes/${id}`, 'DELETE'),

    // Imóveis
    getImoveis: () => apiFetch('/imoveis/'),
    createImovel: (data) => apiFetch('/imoveis/', 'POST', data),
    deleteImovel: (id) => apiFetch(`/imoveis/${id}`, 'DELETE'),

    // Agenda
    getAgendaEvents: (start, end) => apiFetch(`/agenda/all?start=${start}&end=${end}`),
    generateAgenda: () => apiFetch('/agenda/gerar?semanas=4', 'POST'), 
    scheduleVistoria: (data) => apiFetch('/agenda/agendar', 'POST', data),
    updateVistoria: (id, data) => apiFetch(`/agenda/${id}`, 'PUT', data),
    cancelarVistoria: (id) => apiFetch(`/agenda/${id}/cancelar`, 'PUT'),
    reagendarVistoria: (id, targetId) => apiFetch(`/agenda/${id}/reagendar`, 'PUT', { target_agenda_id: targetId }),
    markAsImprodutiva: (id, data) => apiFetch(`/agenda/${id}/improdutiva`, 'PUT', data),
    fecharHorario: (id, motivo) => apiFetch(`/agenda/${id}/fechar`, 'PUT', { motivo }),

    // Relatórios
    getRelatorioImobiliaria: (imobiliariaId, mes, ano) => apiFetch(`/imobiliarias/${imobiliariaId}/relatorio?mes=${mes}&ano=${ano}`),
    getRelatorioVistoriador: (vistoriadorId, mes, ano) => apiFetch(`/vistoriadores/${vistoriadorId}/relatorio?mes=${mes}&ano=${ano}`),
    downloadRelatorio: (params) => downloadApiFile('/relatorios/download', params),
    sendValoresTotaisEmail: (ano, mes) => apiFetch(`/valores_totais_email/${ano}/${mes}`),

    // Configurações
    getConfig: () => apiFetch('/configuracoes/'),
    updateConfig: (data) => apiFetch('/configuracoes/', 'PUT', data),
};
