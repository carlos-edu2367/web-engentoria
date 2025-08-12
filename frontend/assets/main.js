// frontend/assets/main.js

// Lógica para definir a URL da API dinamicamente
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isLocal ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';


// Objeto para manter o estado atual dos filtros
let currentFilters = {
    period: 'hoje',
    status: 'todos'
};
let currentAppVersion = null; // Variável global para a versão do app

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();

    // Executa a lógica específica para cada página
    // ALTERADO: Adicionada a página 'login-imobiliaria.html' à condição
    if (currentPage === 'login.html' || currentPage === 'login-ti.html' || currentPage === 'login-imobiliaria.html') {
        setupLoginPage();
    } else if (currentPage === 'agenda.html') {
        setupAgendaPage();
    } else if (currentPage === 'ajuda.html') {
        setupAjudaPage();
    } else if (currentPage === 'login-ajuda.html') {
        setupLoginAjudaPage();
    }

    // Adiciona evento de clique para todos os botões de logout
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    setupSidebar();
});

function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const openBtn = document.getElementById('open-sidebar-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');

    if (sidebar && overlay && openBtn && closeBtn) {
        const openSidebar = () => {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        };
        const closeSidebar = () => {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        };
        openBtn.addEventListener('click', openSidebar);
        closeBtn.addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);
    }
}

function setupLoginPage() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    const errorMessageDiv = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorMessageDiv.classList.add('hidden');

        const formData = new FormData(loginForm);
        const body = new URLSearchParams();
        body.append('username', formData.get('email'));
        body.append('password', formData.get('password'));

        try {
            const response = await fetch(`${API_BASE_URL}/auth/token`, {
                method: 'POST',
                body: body,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha no login.');
            }

            const data = await response.json();
            saveToken(data.access_token);
            
            // A lógica de redirecionamento agora está centralizada no auth.js
            redirectToDashboard(data.access_token);

        } catch (error) {
            errorMessageDiv.textContent = error.message;
            errorMessageDiv.classList.remove('hidden');
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
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-md bg-green-900/70 text-green-300';
            helpForm.reset();
        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-md bg-red-900/70 text-red-400';
        }
    });
}

/**
 * Configura a lógica da página da Agenda, incluindo filtros e feedback.
 */
async function setupAgendaPage() {
    const agendaContainer = document.getElementById('agenda-container');
    const periodFilterContainer = document.getElementById('period-filter-buttons');
    const statusFilterContainer = document.getElementById('status-filter-buttons');

    if (!agendaContainer || !periodFilterContainer || !statusFilterContainer) {
        return;
    }

    const fetchAndRenderAgenda = async () => {
        agendaContainer.innerHTML = `
            <div id="loader" class="text-center py-10">
                <svg class="animate-spin h-8 w-8 text-green-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
            btn.classList.remove('bg-green-500', 'text-gray-900');
            btn.classList.add('bg-gray-700', 'hover:bg-gray-600', 'text-white');
            if (btn.dataset[dataAttribute] === currentFilters[dataAttribute]) {
                btn.classList.add('bg-green-500', 'text-gray-900');
                btn.classList.remove('bg-gray-700', 'hover:bg-gray-600', 'text-white');
            }
        });
    };

    if (periodFilterContainer) {
        periodFilterContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button && button.classList.contains('period-filter-btn')) {
                currentFilters.period = button.dataset.period;
                updateFilterButtons(periodFilterContainer, 'period');
                fetchAndRenderAgenda();
            }
        });
    }

    if (statusFilterContainer) {
        statusFilterContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button && button.classList.contains('status-filter-btn')) {
                currentFilters.status = button.dataset.status;
                updateFilterButtons(statusFilterContainer, 'status');
                fetchAndRenderAgenda();
            }
        });
    }

    await fetchAndRenderAgenda();
    await setupFeedbackFeature();
}

/**
 * Lógica para o sistema de feedback do vistoriador.
 */
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
                feedbackModal.classList.remove('hidden');
            }, { once: true });
        }

    } catch (error) {
        console.error("Erro inesperado ao configurar a funcionalidade de feedback:", error);
    }

    cancelFeedbackBtn.addEventListener('click', () => feedbackModal.classList.add('hidden'));

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
        agendaContainer.innerHTML = `<div class="text-center text-gray-400 bg-gray-800 p-6 rounded-lg">Nenhuma vistoria encontrada para os filtros selecionados.</div>`;
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
        dayCard.className = 'bg-gray-800 rounded-xl shadow-lg border border-gray-700 fade-in';
        
        let vistoriasHtml = vistoriasPorData[data].map(v => createVistoriaCard(v)).join('');

        dayCard.innerHTML = `
            <h2 class="text-lg font-bold text-green-400 p-4 border-b border-gray-700">${data}</h2>
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
    const { horario, tipo_vistoria, imovel, cliente } = vistoria;
    
    const isBooked = !!imovel;
    const cardBgClass = isBooked ? 'bg-green-900/20 border-l-4 border-green-500' : 'bg-gray-700/50';
    const subtitleHTML = isBooked 
        ? `<p class="text-sm text-gray-300">Cód. Imóvel: ${imovel['Código']}</p>`
        : `<p class="text-sm text-blue-400">Horário Livre</p>`;

    const detalhesImovelHTML = isBooked ? `
        <h4 class="font-semibold text-green-300 mt-4 border-t border-gray-600 pt-3">--- Detalhes do Imóvel ---</h4>
        <p><strong>Tipo de Vistoria:</strong> ${(tipo_vistoria || 'N/D').replace(/_/g, ' ')}</p>
        <p><strong>Código:</strong> ${imovel['Código'] || 'N/D'}</p>
        <p><strong>Endereço:</strong> ${imovel['Endereço'] || 'N/D'}</p>
        <p><strong>CEP:</strong> ${imovel['CEP'] || 'N/D'}</p>
        <p><strong>Referência:</strong> ${imovel['Referência'] || 'N/D'}</p>
        <p><strong>Tamanho:</strong> ${imovel['Tamanho'] ? imovel['Tamanho'] + 'm²' : 'N/D'}</p>
        <p><strong>Mobília:</strong> ${(imovel['Mobília'] || '').replace(/_/g, ' ')}</p>
        <p><strong>Imobiliária:</strong> ${imovel.imobiliaria ? imovel.imobiliaria.nome : 'N/D'}</p>
    ` : '';

    const detalhesClienteHTML = cliente ? `
        <h4 class="font-semibold text-green-300 mt-4 border-t border-gray-600 pt-3">--- Detalhes do Cliente ---</h4>
        <p><strong>Nome:</strong> ${cliente.nome || 'N/D'}</p>
        <p><strong>Email:</strong> ${cliente.email || 'N/D'}</p>
        <p><strong>Telefone 1:</strong> ${cliente['Telefone 1'] || 'N/D'}</p>
        <p><strong>Telefone 2:</strong> ${cliente['Telefone 2'] || 'N/D'}</p>
    ` : '';

    return `
        <div class="vistoria-card ${cardBgClass} rounded-lg p-4">
            <div class="flex justify-between items-center">
                <div>
                    <p class="text-xl font-bold">${horario || 'N/D'}</p>
                    ${subtitleHTML}
                </div>
                ${isBooked ? `
                <button class="expand-btn p-2 rounded-full hover:bg-gray-600 transition">
                    <svg class="h-6 w-6 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                ` : ''}
            </div>
            ${isBooked ? `
            <div class="details hidden mt-4 space-y-1 text-sm text-gray-300">
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

            formMessageDiv.textContent = 'Chamado enviado com sucesso!';
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-md bg-green-900/70 text-green-300';
            supportForm.reset();

        } catch (error) {
            formMessageDiv.textContent = error.message;
            formMessageDiv.className = 'block mt-4 text-center p-3 rounded-md bg-red-900/70 text-red-400';
        }
    });
}
