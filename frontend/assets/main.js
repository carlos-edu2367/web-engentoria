// frontend/assets/main.js

// Lógica para definir a URL da API dinamicamente
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isLocal ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';

// --- LÓGICA DE RATE LIMIT ---
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const LOGIN_ATTEMPTS_KEY = 'login_attempts';

/**
 * Obtém as tentativas de login recentes (nos últimos 5 minutos).
 * @returns {number[]} Um array de timestamps.
 */
function getLoginAttempts() {
    const attempts = JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY)) || [];
    const fiveMinutesAgo = Date.now() - LOCKOUT_MINUTES * 60 * 1000;
    // Filtra para manter apenas as tentativas dentro da janela de tempo.
    const recentAttempts = attempts.filter(timestamp => timestamp > fiveMinutesAgo);
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(recentAttempts));
    return recentAttempts;
}

/**
 * Adiciona um timestamp da tentativa de login atual.
 */
function addLoginAttempt() {
    const attempts = getLoginAttempts();
    attempts.push(Date.now());
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
}

/**
 * Limpa o histórico de tentativas de login.
 */
function clearLoginAttempts() {
    localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
}
// --- FIM DA LÓGICA DE RATE LIMIT ---


// --- ETAPA 1: Novas Funções de API (Vistoriador) ---

/** Busca comentários de uma vistoria */
async function fetchComentarios(agendaId) {
    const response = await fetch(`${API_BASE_URL}/agenda/ver_comentarios/${agendaId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao buscar comentários.');
    }
    return response.json();
}

/** Posta um novo comentário */
async function postComentario(agendaId, comentario) {
    const response = await fetch(`${API_BASE_URL}/agenda/adicionar_comentario/${agendaId}?comentario=${encodeURIComponent(comentario)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao enviar comentário.');
    }
    // Não retorna JSON, apenas status 200
}

/** Busca documentos de uma vistoria */
async function fetchDocumentos(agendaId) {
    const response = await fetch(`${API_BASE_URL}/agenda/listar_documentos_agenda/${agendaId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao buscar documentos.');
    }
    return response.json();
}

/** Faz upload de um documento para a vistoria */
async function uploadDocumento(agendaId, formData) {
    formData.append("id_agendamento", agendaId); // O backend espera 'id_agendamento' no form
    const response = await fetch(`${API_BASE_URL}/agenda/adicionar_documento_agendamento`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao enviar documento.');
    }
    // Não retorna JSON
}

/** Deleta um documento */
async function deleteDocumento(documentoId) {
    const response = await fetch(`${API_BASE_URL}/agenda/deletar_documento/${documentoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao deletar documento.');
    }
    // Não retorna JSON
}

// (NOVO) Busca laudos pendentes do vistoriador
/**
 * Busca laudos pendentes (não finalizados) para o vistoriador logado.
 * @returns {Promise<object>} Um objeto contendo a lista de pendências.
 */
async function fetchPendencias() {
    // Rota baseada na sua definição de API (listar_pendencias)
    const response = await fetch(`${API_BASE_URL}/agenda/laudos/pendencias`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (response.status === 401) {
        logout();
        return;
    }
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao buscar pendências.');
    }
    return response.json();
}

// --- FIM ETAPA 1: API ---

// --- INÍCIO REQUISITO LAUDO: Funções de API (Laudo) ---

/**
 * Tenta buscar um laudo pelo ID do agendamento.
 * @param {string} agendamentoId ID do agendamento
 * @returns {Promise<object|null>} Objeto do laudo ou null se não encontrado (404)
 */
async function fetchLaudoByAgendamento(agendamentoId) {
    const response = await fetch(`${API_BASE_URL}/agenda/laudos/laudo/${agendamentoId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (response.ok) {
        return response.json();
    }
    if (response.status === 404) {
        return null;
    }
    // Outros erros
    const err = await response.json();
    throw new Error(err.detail || 'Falha ao buscar laudo.');
}

/**
 * Cria um novo laudo para um agendamento.
 * @param {string} agendamentoId ID do agendamento
 * @returns {Promise<object>} Objeto com o ID do novo laudo
 */
async function createLaudo(agendamentoId) {
    // CORREÇÃO: Alinhado com a assinatura do backend (id_agendamento: str),
    // que espera o ID como um query parameter, não como form-data.
    const response = await fetch(`${API_BASE_URL}/agenda/laudos/laudo?id_agendamento=${encodeURIComponent(agendamentoId)}`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${getToken()}`
            // Não é necessário Content-Type ou body, pois o parâmetro está na URL
        }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Falha ao criar laudo.');
    }
    return response.json();
}

/**
 * Garante que um laudo exista, criando um se necessário.
 * @param {string} agendamentoId ID do agendamento
 * @returns {Promise<object>} O objeto do laudo (existente ou recém-criado)
 */
async function getOrCreateLaudo(agendamentoId) {
    try {
        // 1. Tenta buscar o laudo
        let laudo = await fetchLaudoByAgendamento(agendamentoId);
        
        if (laudo) {
            return laudo; // Laudo encontrado
        }

        // 2. Se 404 (null), cria o laudo
        const novoLaudoInfo = await createLaudo(agendamentoId);
        
        // 3. Busca o laudo recém-criado para obter todos os detalhes
        laudo = await fetchLaudoByAgendamento(agendamentoId);
        
        if (!laudo) {
            // Isso não deve acontecer se a criação foi bem-sucedida
            throw new Error("Falha ao buscar o laudo recém-criado.");
        }
        
        return laudo;

    } catch (error) {
        console.error("Erro no processo getOrCreateLaudo:", error);
        throw error; // Propaga o erro para o chamador
    }
}
// --- FIM REQUISITO LAUDO: Funções de API (Laudo) ---


// Objeto para manter o estado atual dos filtros
let currentFilters = {
    period: 'hoje',
    status: 'todos'
};
let currentAppVersion = null; // Variável global para a versão do app

document.addEventListener('DOMContentLoaded', () => {
    // Adiciona a nova página de laudo à lógica de proteção
    const currentPage = window.location.pathname.split('/').pop();

    // Executa a lógica específica para cada página
    if (currentPage === 'login.html' || currentPage === 'login-ti.html' || currentPage === 'login-imobiliaria.html') {
        setupLoginPage();
    } else if (currentPage === 'agenda.html') {
        setupAgendaPage();
    } else if (currentPage === 'ajuda.html') {
        setupAjudaPage();
    } else if (currentPage === 'login-ajuda.html') {
        setupLoginAjudaPage();
    } else if (currentPage === 'relatorios-vistoriador.html') {
        setupRelatoriosVistoriadorPage();
    } else if (currentPage === 'pendencias.html') { // (NOVO)
        setupPendenciasPage();
    } else if (currentPage === 'recuperar-senha.html') {
        setupRecoveryPage();
    } else if (currentPage === 'redefinir-senha.html') {
        setupResetPasswordPage();
    } else if (currentPage === 'laudo.html') {
        // A página de laudo é protegida, mas sua lógica está em laudo.js
        // auth.js já chama protectPage() globalmente, então está coberto.
    }


    // Adiciona evento de clique para todos os botões de logout
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    // Configura a funcionalidade da sidebar em todas as páginas que a possuem
    setupSidebar();

    // (NOVO) Verifica se há pendências em todas as páginas do dashboard
    if (currentPage !== 'login.html' && !currentPage.includes('login-') && currentPage !== 'recuperar-senha.html' && currentPage !== 'redefinir-senha.html') {
        checkPendenciasNotification();
    }
});


function setupLoginPage() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    const errorMessageDiv = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // --- VERIFICAÇÃO DE RATE LIMIT ---
        const recentAttempts = getLoginAttempts();
        if (recentAttempts.length >= MAX_ATTEMPTS) {
            errorMessageDiv.textContent = `Demasiadas tentativas. Por favor, aguarde ${LOCKOUT_MINUTES} minutos.`;
            errorMessageDiv.classList.remove('hidden');
            return; // Bloqueia a submissão do formulário
        }
        // --- FIM DA VERIFICAÇÃO ---

        errorMessageDiv.classList.add('hidden');
        loginButton.disabled = true;
        loginButton.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Autenticando...`;

        const formData = new FormData(loginForm);
        const body = new URLSearchParams();
        body.append('username', formData.get('email'));
        body.append('password', formData.get('password'));

        try {
            const response = await fetch(`${API_BASE_URL}/auth/token`, {
                method: 'POST',
                body: body,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Falha no login.');
            }
            
            saveLoginData(data.access_token, data.user_info);
            
            // Limpa as tentativas em caso de sucesso
            clearLoginAttempts();
            
            redirectToDashboard();

        } catch (error) {
            // Adiciona uma tentativa em caso de falha
            addLoginAttempt();
            const remainingAttempts = MAX_ATTEMPTS - getLoginAttempts().length;
            
            errorMessageDiv.textContent = `${error.message} (${remainingAttempts} tentativas restantes.)`;
            errorMessageDiv.classList.remove('hidden');
            loginButton.disabled = false;
            loginButton.innerHTML = `
                <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                Entrar`;
        }
    });
}

function setupRecoveryPage() {
    const recoveryForm = document.getElementById('recovery-form');
    if (!recoveryForm) return;

    const formMessageDiv = document.getElementById('form-message');
    const recoveryButton = document.getElementById('recovery-button');

    recoveryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formMessageDiv.className = 'hidden';
        recoveryButton.disabled = true;
        recoveryButton.textContent = 'Enviando...';

        const formData = new FormData(recoveryForm);
        const body = { email: formData.get('email') };

        try {
            const response = await fetch(`${API_BASE_URL}/auth/recover-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Ocorreu um erro.');

            formMessageDiv.textContent = result.message || 'Link enviado com sucesso!';
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-green-900/30 text-green-300 border-green-700/50';
            recoveryForm.reset();
        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border-red-700/50';
        } finally {
            recoveryButton.disabled = false;
            recoveryButton.textContent = 'Enviar Link de Recuperação';
        }
    });
}

function setupResetPasswordPage() {
    const resetForm = document.getElementById('reset-password-form');
    if (!resetForm) return;

    const formMessageDiv = document.getElementById('form-message');
    const resetButton = document.getElementById('reset-button');
    const tokenInput = document.getElementById('token');
    const loginLinkContainer = document.getElementById('login-link-container');

    // Extrai o token da URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        tokenInput.value = token;
    } else {
        formMessageDiv.textContent = 'Token de redefinição não encontrado ou inválido.';
        formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border-red-700/50';
        resetButton.disabled = true;
    }

    resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formMessageDiv.className = 'hidden';
        
        const newPassword = document.getElementById('new_password').value;
        const confirmPassword = document.getElementById('confirm_password').value;

        if (newPassword !== confirmPassword) {
            formMessageDiv.textContent = 'As senhas não coincidem.';
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border-red-700/50';
            return;
        }

        resetButton.disabled = true;
        resetButton.textContent = 'Redefinindo...';

        const body = {
            token: tokenInput.value,
            new_password: newPassword,
        };

        try {
            const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Ocorreu um erro.');

            formMessageDiv.textContent = result.message || 'Senha redefinida com sucesso!';
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-green-900/30 text-green-300 border-green-700/50';
            resetForm.reset();
            resetButton.style.display = 'none'; // Esconde o botão de redefinir
            loginLinkContainer.classList.remove('hidden'); // Mostra o link para o login
        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border-red-700/50';
            resetButton.disabled = false;
            resetButton.textContent = 'Redefinir Senha';
        }
    });
}


function setupLoginAjudaPage() {
    const helpForm = document.getElementById('login-help-form');
    if (!helpForm) return;

    const formMessageDiv = document.getElementById('form-message');

    helpForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formMessageDiv.className = 'hidden';
        const formData = new FormData(helpForm);
        const body = Object.fromEntries(formData.entries());

        try {
            const response = await fetch(`${API_BASE_URL}/suporte/login-problema`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Ocorreu um erro.');
            formMessageDiv.textContent = result.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-green-900/30 text-green-300 border border-green-700/50';
            helpForm.reset();
        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border border-red-700/50';
        }
    });
}
