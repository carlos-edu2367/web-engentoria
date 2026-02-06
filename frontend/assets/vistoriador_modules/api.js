const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isLocal ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';

// Função auxiliar para obter o token de forma segura
function getAuthToken() {
    // 1. Tenta pegar diretamente do localStorage (padrão mais seguro para módulos)
    // O main.js geralmente salva como 'access_token'
    let token = localStorage.getItem('engentoria_vist_token');
    
    if (!token) {
        token = localStorage.getItem('token');
    }

    // 2. Fallback para função global se existir e o localStorage falhar
    if (!token && typeof window.getToken === 'function') {
        token = window.getToken();
    }
    
    return token;
}

async function request(endpoint, options = {}) {
    const token = getAuthToken();
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    // Se não for FormData (upload de arquivo), define JSON
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        if (response.status === 401) {
            // Token inválido ou expirado
            if (typeof window.logout === 'function') {
                window.logout();
            } else {
                window.location.href = 'index.html';
            }
            throw new Error('Sessão expirada. Faça login novamente.');
        }

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
            throw new Error(data.detail || `Erro na requisição: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`Erro API [${endpoint}]:`, error);
        throw error;
    }
}

export const api = {
    // Agenda
    getMinhaAgenda: (periodo) => request(`/agenda/?periodo=${periodo}&status_filtro=todos`),
    
    // Detalhes / Laudo
    getLaudoInfo: (agendamentoId) => request(`/agenda/laudos/laudo/${agendamentoId}`),
    
    // Correção específica solicitada: passar ID na URL como query param
    createLaudo: (agendamentoId) => request(`/agenda/laudos/laudo?id_agendamento=${encodeURIComponent(agendamentoId)}`, { method: 'POST' }),
    
    // Comentários
    getComentarios: (agendaId) => request(`/agenda/ver_comentarios/${agendaId}`),
    postComentario: (agendaId, texto) => request(`/agenda/adicionar_comentario/${agendaId}?comentario=${encodeURIComponent(texto)}`, { method: 'POST' }),
    
    // Documentos
    getDocumentos: (agendaId) => request(`/agenda/listar_documentos_agenda/${agendaId}`),
    uploadDocumento: (formData) => request(`/agenda/adicionar_documento_agendamento`, { method: 'POST', body: formData }),
    deleteDocumento: (docId) => request(`/agenda/deletar_documento/${docId}`, { method: 'DELETE' }),

    // Pendências
    getPendencias: () => request(`/agenda/laudos/pendencias`),

    // Relatórios
    getMeuRelatorio: (mes, ano) => request(`/agenda/meu-relatorio?mes=${mes}&ano=${ano}`),

    // Info Básica e Status
    getLaudoInfo: (agendamentoId) => request(`/agenda/laudos/laudo/${agendamentoId}`),
    createLaudo: (agendamentoId) => request(`/agenda/laudos/laudo?id_agendamento=${encodeURIComponent(agendamentoId)}`, { method: 'POST' }),
    updateStatusLaudo: (laudoId, finalizado) => request(`/agenda/laudos/laudo/status?id_laudo=${laudoId}&finalizado=${finalizado}`, { method: 'PUT' }),

    // Categorias
    addCategoria: (laudoId, titulo) => request(`/agenda/laudos/${laudoId}/categoria?titulo=${encodeURIComponent(titulo)}`, { method: 'POST' }),
    deleteCategoria: (categoriaId) => request(`/agenda/laudos/categoria/${categoriaId}`, { method: 'DELETE' }),
    getCategoriaContent: (categoriaId) => request(`/agenda/laudos/categoria/${categoriaId}`),

    // Itens
    addItem: (categoriaId, descricao) => request(`/agenda/laudos/categoria/${categoriaId}/item?descricao=${encodeURIComponent(descricao)}`, { method: 'POST' }),
    deleteItem: (itemId) => request(`/agenda/laudos/item/${itemId}`, { method: 'DELETE' }),

    // Imagens do Laudo
    uploadImagemCategoria: (formData) => request(`/agenda/laudos/categoria/imagem`, { method: 'POST', body: formData }),
    deleteImagemCategoria: (imagemId) => request(`/agenda/laudos/imagem/${imagemId}`, { method: 'DELETE' }),

    // Anexo Principal (PDF/DOCX)
    uploadLaudoPdf: (formData) => request(`/agenda/laudo/adicionar_laudo_pdf`, { method: 'POST', body: formData }),
    deleteLaudoPdf: (laudoId) => request(`/agenda/laudo/pdf/${laudoId}`, { method: 'DELETE' })
};