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


// Objeto para manter o estado atual dos filtros
let currentFilters = {
    period: 'hoje',
    status: 'todos'
};
let currentAppVersion = null; // Variável global para a versão do app

document.addEventListener('DOMContentLoaded', () => {
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
    } else if (currentPage === 'recuperar-senha.html') {
        setupRecoveryPage();
    } else if (currentPage === 'redefinir-senha.html') {
        setupResetPasswordPage();
    }


    // Adiciona evento de clique para todos os botões de logout
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    // Configura a funcionalidade da sidebar em todas as páginas que a possuem
    setupSidebar();
});

function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const openBtn = document.getElementById('open-sidebar-btn');
    const closeBtn = document.querySelector('#sidebar #close-sidebar-btn'); // Seleciona o botão dentro da sidebar

    if (sidebar && overlay && openBtn) {
        const openSidebar = () => {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        };
        const closeSidebar = () => {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        };
        openBtn.addEventListener('click', openSidebar);
        if(closeBtn) closeBtn.addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);
    }
}

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
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-green-900/30 text-green-300 border-green-700/50';
            helpForm.reset();
        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border-red-700/50';
        }
    });
}

async function setupAgendaPage() {
    const agendaContainer = document.getElementById('agenda-container');
    const periodFilterContainer = document.getElementById('period-filter-buttons');
    const statusFilterContainer = document.getElementById('status-filter-buttons');

    if (!agendaContainer || !periodFilterContainer || !statusFilterContainer) {
        return;
    }

    const fetchAndRenderAgenda = async () => {
        agendaContainer.innerHTML = `
            <div id="loader" class="text-center py-10 fade-in">
                <svg class="animate-spin h-8 w-8 text-cyan-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-2 text-gray-400">Carregando vistorias...</p>
            </div>`;
        
        let url = `${API_BASE_URL}/agenda/?periodo=${currentFilters.period}`;
        if (currentFilters.status !== 'todos') {
            url += `&status_filtro=${currentFilters.status}`;
        }

        try {
            const token = getToken();
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ detail: 'Não foi possível obter detalhes do erro.' }));
                throw new Error(errorData.detail || `Não foi possível carregar a agenda (Status: ${response.status}).`);
            }

            const vistorias = await response.json();
            renderAgenda(vistorias);

        } catch (error) {
            console.error("Erro detalhado ao buscar agenda:", error);
            agendaContainer.innerHTML = `<div class="text-center text-red-400 bg-red-900/50 p-4 rounded-md"><strong>Erro:</strong> ${error.message}</div>`;
        }
    };

    const updateFilterButtons = (container, dataAttribute) => {
        if (!container) return;
        container.querySelectorAll('button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset[dataAttribute] === currentFilters[dataAttribute]) {
                btn.classList.add('active');
            }
        });
    };

    if (periodFilterContainer) {
        periodFilterContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button && button.classList.contains('filter-btn')) {
                currentFilters.period = button.dataset.period;
                updateFilterButtons(periodFilterContainer, 'period');
                fetchAndRenderAgenda();
            }
        });
    }

    if (statusFilterContainer) {
        statusFilterContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button && button.classList.contains('filter-btn')) {
                currentFilters.status = button.dataset.status;
                updateFilterButtons(statusFilterContainer, 'status');
                fetchAndRenderAgenda();
            }
        });
    }
    
    updateFilterButtons(periodFilterContainer, 'period');
    updateFilterButtons(statusFilterContainer, 'status');

    await fetchAndRenderAgenda();
    await setupFeedbackFeature();
}

async function setupFeedbackFeature() {
    const reminderToast = document.getElementById('feedback-toast');
    const feedbackModal = document.getElementById('feedback-modal');
    
    if (!reminderToast || !feedbackModal) return;
    
    const cancelFeedbackBtn = document.getElementById('cancel-feedback-btn');
    const feedbackForm = document.getElementById('feedback-form');

    if (!cancelFeedbackBtn || !feedbackForm) return;

    try {
        const versionResponse = await fetch(`${API_BASE_URL}/suporte/app-version`);
        if (!versionResponse.ok) {
            const errorData = await versionResponse.json().catch(() => null);
            console.error(`Falha ao buscar a versão do app (Status: ${versionResponse.status}). A notificação de feedback não será exibida. Detalhe: ${errorData?.detail || 'N/A'}. Verifique se uma versão foi definida no painel de Manutenção.`);
            return;
        }
        const versionData = await versionResponse.json();
        currentAppVersion = versionData.version_tag;

        const token = getToken();
        const statusResponse = await fetch(`${API_BASE_URL}/suporte/feedbacks/check-status?app_version=${currentAppVersion}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!statusResponse.ok) {
            console.error('Falha ao verificar o status de feedback. A notificação não será exibida.');
            return;
        }
        const statusData = await statusResponse.json();

        if (!statusData.has_submitted) {
            setTimeout(() => {
                reminderToast.classList.remove('opacity-0', '-translate-y-20');
                reminderToast.classList.add('opacity-100', 'translate-y-0');
            }, 500);

            const hideTimer = setTimeout(() => {
                reminderToast.classList.remove('opacity-100', 'translate-y-0');
                reminderToast.classList.add('opacity-0', '-translate-y-20');
            }, 5500);

            reminderToast.addEventListener('click', () => {
                clearTimeout(hideTimer);
                reminderToast.classList.remove('opacity-100', 'translate-y-0');
                reminderToast.classList.add('opacity-0', '-translate-y-20');
                feedbackModal.classList.add('flex');
                feedbackModal.classList.remove('hidden');
            }, { once: true });
        }

    } catch (error) {
        console.error("Erro inesperado ao configurar a funcionalidade de feedback:", error);
    }

    cancelFeedbackBtn.addEventListener('click', () => {
        feedbackModal.classList.add('hidden');
        feedbackModal.classList.remove('flex');
    });

    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('feedback-error');
        errorDiv.classList.add('hidden');

        const formData = new FormData(feedbackForm);
        const data = {
            app_version: currentAppVersion,
            nota: parseInt(formData.get('nota')),
            comentario: formData.get('comentario')
        };

        if (!data.nota) {
            errorDiv.textContent = 'Por favor, selecione uma nota.';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/suporte/feedbacks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Erro ao enviar feedback.');

            feedbackModal.classList.add('hidden');
            feedbackModal.classList.remove('flex');
            alert('Obrigado pelo seu feedback!');

        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
        }
    });
}


function renderAgenda(vistorias) {
    const agendaContainer = document.getElementById('agenda-container');
    agendaContainer.innerHTML = '';

    if (vistorias.length === 0) {
        agendaContainer.innerHTML = `<div class="text-center text-gray-400 bg-gray-800/80 p-6 rounded-xl neon-border">Nenhuma vistoria encontrada para os filtros selecionados.</div>`;
        return;
    }

    const vistoriasPorData = vistorias.reduce((acc, vistoria) => {
        const data = new Date(vistoria.data + 'T00:00:00');
        const dataFormatada = data.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        if (!acc[dataFormatada]) {
            acc[dataFormatada] = [];
        }
        acc[dataFormatada].push(vistoria);
        return acc;
    }, {});

    for (const data in vistoriasPorData) {
        const dayCard = document.createElement('div');
        dayCard.className = 'bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg neon-border fade-in';
        
        let vistoriasHtml = vistoriasPorData[data].map(v => createVistoriaCard(v)).join('');

        dayCard.innerHTML = `
            <h2 class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300 p-4 border-b border-gray-700/50">${data}</h2>
            <div class="p-4 space-y-4">
                ${vistoriasHtml}
            </div>
        `;
        agendaContainer.appendChild(dayCard);
    }

    document.querySelectorAll('.expand-btn').forEach(button => {
        button.addEventListener('click', () => {
            const details = button.closest('.vistoria-card').querySelector('.details');
            const icon = button.querySelector('svg');
            details.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
    });
}

function createVistoriaCard(vistoria) {
    const { horario, tipo, imovel, observacao_vistoriador } = vistoria;
    
    const isBooked = !!imovel;
    const cardBgClass = isBooked ? 'bg-gray-700/40' : 'bg-gray-700/20';
    const borderColorClass = isBooked ? 'border-cyan-500/50' : 'border-gray-600/50';

    const subtitleHTML = isBooked 
        ? `<p class="text-sm text-gray-300">Cód. Imóvel: ${imovel.cod_imovel}</p>`
        : `<p class="text-sm text-cyan-400">Horário Livre</p>`;

    // INÍCIO DA MODIFICAÇÃO: Adiciona a observação do vistoriador
    const observacaoHTML = observacao_vistoriador ? `
        <div class="mt-3 pt-3 border-t border-gray-600/30">
            <h4 class="font-semibold text-amber-300 text-sm">Observações:</h4>
            <p class="text-sm text-gray-300 whitespace-pre-wrap">${observacao_vistoriador}</p>
        </div>
    ` : '';
    // FIM DA MODIFICAÇÃO

    const detalhesImovelHTML = isBooked ? `
        <h4 class="font-semibold text-cyan-300 mt-4 border-t border-gray-600/50 pt-3">Detalhes do Imóvel</h4>
        <p><strong>Tipo de Vistoria:</strong> ${(tipo || 'N/D').replace(/_/g, ' ')}</p>
        <p><strong>Código:</strong> ${imovel.cod_imovel || 'N/D'}</p>
        <p><strong>Endereço:</strong> ${imovel.endereco || 'N/D'}</p>
        <p><strong>CEP:</strong> ${imovel.cep || 'N/D'}</p>
        <p><strong>Referência:</strong> ${imovel.referencia || 'N/D'}</p>
        <p><strong>Tamanho:</strong> ${imovel.tamanho ? imovel.tamanho + 'm²' : 'N/D'}</p>
        <p><strong>Mobília:</strong> ${(imovel.mobiliado || '').replace(/_/g, ' ')}</p>
        <p><strong>Imobiliária:</strong> ${imovel.imobiliaria ? imovel.imobiliaria.nome : 'N/D'}</p>
    ` : '';

    const detalhesClienteHTML = (imovel && imovel.cliente) ? `
        <h4 class="font-semibold text-cyan-300 mt-4 border-t border-gray-600/50 pt-3">Detalhes do Cliente</h4>
        <p><strong>Nome:</strong> ${imovel.cliente.nome || 'N/D'}</p>
        <p><strong>Email:</strong> ${imovel.cliente.email || 'N/D'}</p>
    ` : '';

    return `
        <div class="vistoria-card ${cardBgClass} rounded-lg p-4 border ${borderColorClass} transition-all duration-300">
            <div class="flex justify-between items-center">
                <div>
                    <p class="text-xl font-bold">${horario || 'N/D'}</p>
                    ${subtitleHTML}
                </div>
                ${isBooked ? `
                <button class="expand-btn p-2 rounded-full hover:bg-gray-600/50 transition">
                    <svg class="h-6 w-6 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                ` : ''}
            </div>
            ${isBooked ? `
            <div class="details hidden mt-4 space-y-1 text-sm text-gray-300">
                ${observacaoHTML}
                ${detalhesImovelHTML}
                ${detalhesClienteHTML}
            </div>
            ` : ''}
        </div>
    `;
}


function setupAjudaPage() {
    const supportForm = document.getElementById('support-form');
    if (!supportForm) return;

    const formMessageDiv = document.getElementById('form-message');

    supportForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formMessageDiv.className = 'hidden';

        const formData = new FormData(supportForm);
        const body = Object.fromEntries(formData.entries());

        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/suporte/chamados`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha ao enviar chamado.');
            }
            
            const result = await response.json();
            formMessageDiv.textContent = result.message || 'Chamado enviado com sucesso!';
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-green-900/30 text-green-300 border border-green-700/50';
            supportForm.reset();

        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-lg bg-red-900/30 text-red-400 border border-red-700/50';
        }
    });
}

// NOVA FUNÇÃO PARA A PÁGINA DE RELATÓRIOS DO VISTORIADOR
async function setupRelatoriosVistoriadorPage() {
    const reportForm = document.getElementById('report-form');
    if (!reportForm) return;

    // Define o valor padrão do input de mês para o mês atual
    const today = new Date();
    const monthInput = document.getElementById('month-input');
    monthInput.value = today.toISOString().slice(0, 7);

    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const resultsContainer = document.getElementById('report-results');
        const monthValue = monthInput.value;
        const [ano, mes] = monthValue.split('-');
        const button = e.target.querySelector('button[type="submit"]');

        button.disabled = true;
        button.textContent = 'Gerando...';
        resultsContainer.innerHTML = `<div class="text-center p-8 text-gray-400">Buscando dados do relatório...</div>`;

        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/agenda/meu-relatorio?mes=${mes}&ano=${ano}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha ao buscar relatório.');
            }

            const reportData = await response.json();
            renderVistoriadorReport(resultsContainer, reportData);

        } catch (error) {
            resultsContainer.innerHTML = `<div class="text-center p-8 text-red-400 bg-red-900/30 rounded-lg">${error.message}</div>`;
        } finally {
            button.disabled = false;
            button.textContent = 'Gerar Relatório';
        }
    });
}

// NOVA FUNÇÃO PARA RENDERIZAR O RELATÓRIO
function renderVistoriadorReport(container, data) {
    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Helper para formatar o status da mobília
    const formatMobilia = (status) => {
        const map = {
            'sem_mobilia': 'Sem Mobília',
            'semi_mobiliado': 'Semi Mobiliado',
            'mobiliado': 'Mobiliado'
        };
        return map[status] || status;
    };

    let vistoriasHtml = '';
    if (Object.keys(data.vistorias_por_imobiliaria).length > 0) {
        for (const imobNome in data.vistorias_por_imobiliaria) {
            const vistorias = data.vistorias_por_imobiliaria[imobNome];
            vistoriasHtml += `
                <h4 class="text-lg font-semibold text-cyan-300 mt-6 mb-2">${imobNome}</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-900/50">
                            <tr>
                                <th class="p-2">Data</th>
                                <th class="p-2">Cód. Imóvel</th>
                                <th class="p-2">Endereço</th>
                                <th class="p-2">Tamanho</th>
                                <th class="p-2">Mobília</th>
                                <th class="p-2">Tipo</th>
                                <th class="p-2 text-right">Comissão</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vistorias.map(v => `
                                <tr class="border-b border-gray-700/50">
                                    <td class="p-2 whitespace-nowrap">${new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td class="p-2">${v.cod_imovel}</td>
                                    <td class="p-2 truncate max-w-xs" title="${v.endereco}">${v.endereco}</td>
                                    <td class="p-2 whitespace-nowrap">${v.tamanho} m²</td>
                                    <td class="p-2">${formatMobilia(v.tipo_mobilia)}</td>
                                    <td class="p-2">${v.tipo_vistoria}</td>
                                    <td class="p-2 text-right whitespace-nowrap">${formatCurrency(v.comissao_vistoriador)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } else {
        vistoriasHtml = '<p class="text-gray-400 mt-4">Nenhuma vistoria normal encontrada para este período.</p>';
    }
    

    let improdutivasHtml = '';
    if (data.improdutivas.length > 0) {
        improdutivasHtml = `
            <h4 class="text-lg font-semibold text-red-400 mt-6 mb-2">Vistorias Improdutivas</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-900/50">
                        <tr>
                            <th class="p-2">Data</th>
                            <th class="p-2">Cód. Imóvel</th>
                            <th class="p-2">Motivo</th>
                            <th class="p-2 text-right">Comissão</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.improdutivas.map(i => `
                            <tr class="border-b border-gray-700/50">
                                <td class="p-2 whitespace-nowrap">${new Date(i.data_vistoria_original + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                <td class="p-2">${i.cod_imovel}</td>
                                <td class="p-2 truncate max-w-sm" title="${i.motivo_improdutividade}">${i.motivo_improdutividade}</td>
                                <td class="p-2 text-right whitespace-nowrap">${formatCurrency(i.comissao_vistoriador)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="bg-gray-800/80 p-6 rounded-xl neon-border fade-in">
            <div class="border-b border-gray-700/50 pb-4 mb-4">
                <h3 class="text-2xl font-bold text-white">Relatório de Comissão</h3>
                <p class="text-gray-400">Vistoriador: ${data.vistoriador_nome}</p>
                <p class="text-gray-400">Período: ${data.periodo}</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6">
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <p class="text-sm text-gray-400">Comissão Vistorias</p>
                    <p class="text-xl font-bold">${formatCurrency(data.total_comissao_vistorias)}</p>
                </div>
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <p class="text-sm text-gray-400">Comissão Improdutivas</p>
                    <p class="text-xl font-bold">${formatCurrency(data.total_comissao_improdutivas)}</p>
                </div>
                <div class="bg-cyan-900/50 p-3 rounded-lg">
                    <p class="text-sm text-cyan-300">Total Geral</p>
                    <p class="text-xl font-bold text-white">${formatCurrency(data.total_geral_comissao)}</p>
                </div>
            </div>

            ${vistoriasHtml}
            ${improdutivasHtml}
        </div>
    `;
}


