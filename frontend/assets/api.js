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
    const token = getToken(); // Função global de auth.js
    if (!token) {
        logout(); // Função global de auth.js
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
            logout(); // Função global de auth.js
            throw new Error("Acesso não autorizado.");
        }

        const responseBody = await response.text();

        if (!response.ok) {
            // A API de laudo por agendamento retorna 404 se não encontrado,
            // o que é um fluxo esperado e não um erro.
            if (response.status === 404 && endpoint.includes('/laudos/agendamento/')) {
                throw new Error('404 Not Found'); // Lança um erro específico
            }
            
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
 * INÍCIO DA PARTE 1
 * Nova função helper para lidar com uploads de FormData (arquivos).
 * @param {string} endpoint O endpoint da API.
 * @param {string} method O método HTTP (geralmente 'POST' ou 'PUT').
 * @param {FormData} formData O objeto FormData para enviar.
 * @returns {Promise<any>} A resposta da API em JSON.
 */
async function apiFetchFormData(endpoint, method = 'POST', formData) {
    const token = getToken(); // Função global de auth.js
    if (!token) {
        logout(); // Função global de auth.js
        throw new Error("Token de autenticação não encontrado.");
    }

    const headers = new Headers({ 'Authorization': `Bearer ${token}` });
    // Não definimos 'Content-Type': o browser faz isso automaticamente com o 'boundary'
    const config = { method, headers, body: formData };

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
        console.error(`Erro na chamada FormData da API para ${endpoint}:`, error);
        throw error;
    }
}
// FIM DA PARTE 1 (Helper)

/**
 * Função especializada para fazer download de arquivos da API.
 * @param {URLSearchParams} params - Os parâmetros de query para a URL.
 * @returns {Promise<void>}
 */
async function downloadApiFile(endpoint, params) {
    const token = getToken(); // Função global de auth.js
    if (!token) {
        logout(); // Função global de auth.js
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

/**
 * Busca um PDF autenticado e abre em uma nova aba.
 * A aba é aberta antes do fetch para não ser bloqueada pelo navegador.
 */
async function openApiPdf(endpoint) {
    const token = getToken(); // Função global de auth.js
    if (!token) {
        logout(); // Função global de auth.js
        throw new Error("Token de autenticação não encontrado.");
    }
    const novaAba = window.open('', '_blank');
    try {
        const response = await fetch(`${API_BASE_URL_ADMIN}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Erro ao abrir PDF (Status: ${response.status})`);
        }
        const url = window.URL.createObjectURL(await response.blob());
        if (novaAba) {
            novaAba.location.href = url;
        } else {
            window.open(url, '_blank');
        }
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (error) {
        if (novaAba) novaAba.close();
        throw error;
    }
}

export const api = {
    // Dashboard
    getDashboardStats: () => apiFetch('/dashboard/stats'),
    getDashboardFinancialStats: () => apiFetch('/dashboard/financial-stats'),
    getVistoriasChartData: () => apiFetch('/dashboard/vistorias-chart'),
    analyzeScheduleWithAI: () => apiFetch('/dashboard/analise-ia'),

    // ==================================================================
    // AQUI ESTÁ A CORREÇÃO
    // ==================================================================
    postEnviarRelatorioEmail: (infoId, data) => {
        // Usando 'apiFetch' (a função correta) e o endpoint relativo
        return apiFetch(`/mensal/${infoId}/enviar-relatorio`, 'POST', data);
    },
    // ==================================================================

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
    generateAgenda: () => apiFetch('/agenda/gerar?semanas=8', 'POST'), 
    scheduleVistoria: (data) => apiFetch('/agenda/agendar', 'POST', data),
    updateVistoria: (id, data) => apiFetch(`/agenda/${id}`, 'PUT', data),
    cancelarVistoria: (id) => apiFetch(`/agenda/${id}/cancelar`, 'PUT'),
    reagendarVistoria: (id, targetId) => apiFetch(`/agenda/${id}/reagendar`, 'PUT', { target_agenda_id: targetId }),
    markAsImprodutiva: (id, data) => apiFetch(`/agenda/${id}/improdutiva`, 'PUT', data),
    fecharHorario: (id, data) => apiFetch(`/agenda/${id}/fechar`, 'PUT', data),
    recalcularValoresAgenda: (id) => apiFetch(`/agenda/${id}/recalcular-valores`, 'POST'),

    // Relatórios
    getRelatorioImobiliaria: (imobiliariaId, mes, ano) => apiFetch(`/imobiliarias/${imobiliariaId}/relatorio?mes=${mes}&ano=${ano}`),
    getRelatorioVistoriador: (vistoriadorId, mes, ano) => apiFetch(`/vistoriadores/${vistoriadorId}/relatorio?mes=${mes}&ano=${ano}`),
    downloadRelatorio: (params) => downloadApiFile('/relatorios/download', params),
    sendValoresTotaisEmail: (ano, mes) => apiFetch(`/valores_totais_email/${ano}/${mes}`),

    // Configurações
    getConfig: () => apiFetch('/configuracoes/'),
    updateConfig: (data) => apiFetch('/configuracoes/', 'PUT', data),

    // --- INÍCIO DA PARTE 1 (Endpoints) ---
    // NOVAS: Interação com Vistorias (Mural)
    getComentariosVistoria: (id) => apiFetch(`/agenda/${id}/comentarios`),
    postComentarioVistoria: (id, comentario) => apiFetch(`/agenda/${id}/comentario?comentario=${encodeURIComponent(comentario)}`, 'POST'),
    getDocumentosVistoria: (id) => apiFetch(`/agenda/${id}/documentos`),
    postDocumentoVistoria: (formData) => apiFetchFormData(`/agenda/documento`, 'POST', formData),
    deleteDocumentoVistoria: (docId) => apiFetch(`/agenda/${docId}/documento`, 'DELETE'),

    // NOVAS: Grupos de Imobiliárias
    getGrupos: () => apiFetch('/grupo/grupos'),
    getGrupoDetails: (id) => apiFetch(`/grupo/${id}`),

    // NOVAS: Resumo Mensal (InfoMensal)
    getInfoMensal: (mes, ano, grupoId) => apiFetch(`/mensal/${mes}/${ano}/${grupoId}`),
    postInfoMensalMensagem: (infoId, mensagem) => apiFetch(`/mensal/${infoId}/mensagem?mensagem=${encodeURIComponent(mensagem)}`, 'POST'),
    postInfoMensalDocumento: (formData) => apiFetchFormData(`/mensal/documento`, 'POST', formData),
    deleteInfoMensalDocumento: (docId) => apiFetch(`/deletar_doc_info/${docId}`, 'DELETE'),
    
    // --- NOVAS ROTAS DE LAUDO ---
    getLaudosPendentes: () => apiFetch('/laudos/pendentes'),
    getLaudoDetails: (id_laudo) => apiFetch(`/laudo/${id_laudo}`),
    updateLaudoStatus: (data) => apiFetch('/laudo/status', 'PUT', data),
    getLaudoCategoriaDetails: (id_categoria) => apiFetch(`/laudos/categoria/${id_categoria}`),
    getLaudoByAgendamento: (id_agendamento) => apiFetch(`/laudos/agendamento/${id_agendamento}`),

    // --- LAUDO DE NÃO CONFORMIDADES (IA) ---
    getNaoConformidades: (id_laudo) => apiFetch(`/laudo/${id_laudo}/nao-conformidades`),
    gerarNaoConformidades: (id_laudo) => apiFetch(`/laudo/${id_laudo}/nao-conformidades/gerar`, 'POST'),
    addItemNaoConformidade: (id_laudo, data) => apiFetch(`/laudo/${id_laudo}/nao-conformidades/itens`, 'POST', data),
    updateItemNaoConformidade: (id_item, data) => apiFetch(`/nao-conformidades/itens/${id_item}`, 'PUT', data),
    deleteItemNaoConformidade: (id_item) => apiFetch(`/nao-conformidades/itens/${id_item}`, 'DELETE'),
    abrirPdfNaoConformidades: (id_laudo) => openApiPdf(`/laudo/${id_laudo}/nao-conformidades/pdf`),

    // --- CONFIGURAÇÃO DE IA ---
    getIAConfig: () => apiFetch('/ia/config'),
    updateIAConfig: (data) => apiFetch('/ia/config', 'PUT', data),
    testarIA: (data) => apiFetch('/ia/testar', 'POST', data),
    listarModelosIA: (provider, atualizar = false) => apiFetch(`/ia/modelos?provider=${encodeURIComponent(provider)}&atualizar=${atualizar}`),
    getUsoIA: (dias = 30) => apiFetch(`/ia/uso?dias=${dias}`),
    
    // --- NOVAS ROTAS DE IMPRODUTIVAS (PARTE 5) ---
    getImprodutivas: (skip = 0, limit = 50) => apiFetch(`/improdutivas/?skip=${skip}&limit=${limit}`),
    updateImprodutiva: (id, data) => apiFetch(`/improdutivas/${id}`, 'PUT', data),
    reverterImprodutiva: (id, data) => apiFetch(`/improdutivas/${id}/reverter`, 'POST', data),

    // --- NOVAS ROTAS DE VISTORIAS PENDENTES ---
    getVistoriasPendentes: async () => {
        // Remove '/admin-panel' do baseUrl para aceder ao router correto
        const baseUrl = window.APP_CONFIG.API_BASE_URL_ADMIN.replace('/admin-panel', '');
        const token = getToken(); // Ajuste se o seu token estiver guardado com outro nome
        
        const response = await fetch(`${baseUrl}/agendamento-externo/pendentes`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Erro ao buscar vistorias pendentes');
        return await response.json();
    },

    marcarSolicitacaoAgendada: async (solicitacaoId, agendaId) => {
        const baseUrl = window.APP_CONFIG.API_BASE_URL_ADMIN.replace('/admin-panel', '');
        const token = getToken();
        
        const response = await fetch(`${baseUrl}/agendamento-externo/marcar_agendada?solicitacao_id=${solicitacaoId}&agenda_id=${agendaId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Erro ao vincular solicitação à agenda');
        return await response.json();
    },
    getSolicitacaoInfo: (id) => apiFetch(`/../agendamento-externo/pendentes/${id}`),
};
