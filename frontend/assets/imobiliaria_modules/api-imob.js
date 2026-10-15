// frontend/assets/imobiliaria_modules/api-imob.js

const isLocalImob = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const BASE_URL = isLocalImob ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';
const API_URL = `${BASE_URL}/imobiliaria`;
const EXT_SCHEDULING_URL = `${BASE_URL}/agendamento-externo`;

async function apiFetch(url, options = {}) {
    const token = window.getToken ? window.getToken() : localStorage.getItem('engentoria_vist_token');
    
    if (!token) {
        window.location.href = 'index.html';
        throw new Error("Sessão expirada.");
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401 || response.status === 403) {
        if(window.logout) window.logout();
        throw new Error("Acesso negado.");
    }

    // Se for download de arquivo (blob), retorna a resposta crua para processamento
    if (options.isBlob) {
        if (!response.ok) {
             const err = await response.json();
             throw new Error(err.detail || "Erro ao baixar arquivo");
        }
        return response; 
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || "Erro na requisição");
    }
    return data;
}

export const api = {
    // --- DASHBOARD & METRICS ---
    getDashboardStats: () => apiFetch(`${API_URL}/dashboard-stats`),

    // --- AGENDA ---
    getAgenda: (start, end) => apiFetch(`${API_URL}/agenda?start_date=${start}&end_date=${end}`),
    getComentarios: (agendaId) => apiFetch(`${API_URL}/ver_comentarios/${agendaId}`),
    postComentario: (agendaId, text) => apiFetch(`${API_URL}/adicionar_comentario_mural/${agendaId}`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}, // Backend espera query ou form as vezes, mas rota diz parametro
        // Ajuste conforme rota backend: backend pede query param. Vamos tentar passar na URL
    }),
    // O backend pede POST mas parametros via query ou form. Ajustando para query param que é mais seguro com FastAPI default
    postComentarioQuery: (agendaId, text) => apiFetch(`${API_URL}/adicionar_comentario_mural/${agendaId}?comentario=${encodeURIComponent(text)}`, { method: 'POST' }),

    // --- INFO MENSAL (FECHAMENTO) ---
    getInfoMensal: (month, year) => apiFetch(`${API_URL}/status_info_mensal/${month}/${year}`),
    acceptInfoMensal: (id, status) => apiFetch(`${API_URL}/aceitar_recusar_info/${id}?aceito=${status}`, { method: 'PUT' }),
    sendInfoMessage: (idInfo, msg) => apiFetch(`${API_URL}/enviar_mensagem_info/${idInfo}?mensagem=${encodeURIComponent(msg)}`, { method: 'POST' }),
    
    // --- LAUDOS ---
    getLaudos: (page, search = '') => apiFetch(`${API_URL}/laudos?skip=${(page-1)*10}&limit=10&search=${search}`),
    // Pega detalhes do laudo (incluindo URL assinada do PDF)
    getLaudoDetalhes: (idLaudo) => apiFetch(`${API_URL}/laudo/${idLaudo}`),
    // PDF do laudo de não conformidades (retorna a Response crua para gerar o blob)
    getPdfNaoConformidades: (idLaudo) => apiFetch(`${API_URL}/laudo/${idLaudo}/nao-conformidades/pdf`, { isBlob: true }),

    // --- RELATÓRIOS ---
    // Pega dados JSON para visualização
    getRelatorioDados: (mes, ano) => apiFetch(`${API_URL}/relatorio-mensal?mes=${mes}&ano=${ano}`),
    // Download Blob (PDF/Excel)
    downloadRelatorio: (mes, ano, formato) => apiFetch(`${API_URL}/relatorio-download?mes=${mes}&ano=${ano}&formato=${formato}`, { isBlob: true }),

    // --- CADASTROS & SUPORTE ---
    getImoveis: (search = '') => apiFetch(`${API_URL}/imoveis?search=${search}`),
    getClientes: (search = '') => apiFetch(`${API_URL}/clientes?search=${search}`),
    getImobiliarias: () => apiFetch(`${API_URL}/sub-imobiliarias`),

    // --- GESTÃO DE CLIENTES (edição) ---
    updateCliente: (id, data) => apiFetch(`${API_URL}/clientes/${id}`, { method: 'PUT', body: data }),

    // --- AGENDAMENTO EXTERNO ---
    createSolicitacao: (formData) => apiFetch(`${EXT_SCHEDULING_URL}/solicitacao`, {
        method: 'POST',
        body: formData
    }),
    // --- AGENDAMENTO EXTERNO ---
    createCliente: (data) => apiFetch(`${EXT_SCHEDULING_URL}/clientes`, { method: 'POST', body: data }),
    createImovel: (data) => apiFetch(`${EXT_SCHEDULING_URL}/imoveis`, { method: 'POST', body: data }),
    getVistoriadores: () => apiFetch(`${EXT_SCHEDULING_URL}/vistoriadores`),
    gerarLink: (data) => apiFetch(`${EXT_SCHEDULING_URL}/criar-link`, { method: 'POST', body: data }),
};