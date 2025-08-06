// frontend/assets/main.js

// URL base da nossa API. Altere se o backend estiver em outro endereço.
const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();

    // Executa a lógica específica para cada página
    if (currentPage === 'login.html') {
        setupLoginPage();
    } else if (currentPage === 'agenda.html') {
        setupAgendaPage();
    } else if (currentPage === 'ajuda.html') {
        setupAjudaPage();
    }

    // Adiciona evento de clique para todos os botões de logout
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
});

/**
 * Configura a lógica da página de Login.
 */
function setupLoginPage() {
    const loginForm = document.getElementById('login-form');
    const errorMessageDiv = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorMessageDiv.classList.add('hidden');

        const formData = new FormData(loginForm);
        // O backend espera 'username' e 'password' no form data
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
            window.location.href = 'agenda.html';

        } catch (error) {
            errorMessageDiv.textContent = error.message;
            errorMessageDiv.classList.remove('hidden');
        }
    });
}

/**
 * Configura a lógica da página da Agenda.
 */
function setupAgendaPage() {
    const agendaContainer = document.getElementById('agenda-container');
    const filterButtons = document.getElementById('filter-buttons');
    const welcomeMessage = document.getElementById('welcome-message');

    // Função para buscar e renderizar as vistorias
    const fetchAndRenderAgenda = async (period = 'hoje') => {
        agendaContainer.innerHTML = `
            <div id="loader" class="text-center py-10">
                <svg class="animate-spin h-8 w-8 text-green-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-2 text-gray-400">Carregando vistorias para '${period}'...</p>
            </div>`;

        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/agenda/?periodo=${period}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                logout(); // Token inválido ou expirado
                return;
            }
            if (!response.ok) throw new Error('Não foi possível carregar a agenda.');

            const vistorias = await response.json();
            renderAgenda(vistorias);

        } catch (error) {
            agendaContainer.innerHTML = `<div class="text-center text-red-400 bg-red-900/50 p-4 rounded-md">${error.message}</div>`;
        }
    };

    // Adiciona eventos de clique nos botões de filtro
    filterButtons.addEventListener('click', (event) => {
        if (event.target.classList.contains('filter-btn')) {
            // Remove a classe ativa de todos os botões
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('bg-green-500', 'text-gray-900');
                btn.classList.add('bg-gray-700', 'hover:bg-gray-600', 'text-white');
            });
            // Adiciona a classe ativa ao botão clicado
            event.target.classList.add('bg-green-500', 'text-gray-900');
            event.target.classList.remove('bg-gray-700', 'hover:bg-gray-600', 'text-white');
            
            const period = event.target.dataset.period;
            fetchAndRenderAgenda(period);
        }
    });

    // Carrega a agenda inicial (hoje)
    fetchAndRenderAgenda('hoje');
}

/**
 * Renderiza os dados da agenda no container.
 */
function renderAgenda(vistorias) {
    const agendaContainer = document.getElementById('agenda-container');
    agendaContainer.innerHTML = ''; // Limpa o container

    if (vistorias.length === 0) {
        agendaContainer.innerHTML = `<div class="text-center text-gray-400 bg-gray-800 p-6 rounded-lg">Nenhuma vistoria encontrada para este período.</div>`;
        return;
    }

    // Agrupa vistorias por data
    const vistoriasPorData = vistorias.reduce((acc, vistoria) => {
        const data = new Date(vistoria.data + 'T00:00:00');
        const dataFormatada = data.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        if (!acc[dataFormatada]) {
            acc[dataFormatada] = [];
        }
        acc[dataFormatada].push(vistoria);
        return acc;
    }, {});

    // Cria os cards para cada data
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

    // Adiciona evento para expandir/recolher detalhes
    document.querySelectorAll('.expand-btn').forEach(button => {
        button.addEventListener('click', () => {
            const details = button.closest('.vistoria-card').querySelector('.details');
            const icon = button.querySelector('svg');
            details.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
    });
}

/**
 * Cria o HTML para um único card de vistoria.
 */
function createVistoriaCard(vistoria) {
    const { horario, tipo_vistoria, imovel, cliente } = vistoria;
    
    // Formata os detalhes para exibição
    const detalhesImovel = imovel ? `
        <h4 class="font-semibold text-green-300 mt-4 border-t border-gray-600 pt-3">--- Detalhes do Imóvel ---</h4>
        <p><strong>Código:</strong> ${imovel['Código']}</p>
        <p><strong>Endereço:</strong> ${imovel['Endereço']}</p>
        <p><strong>CEP:</strong> ${imovel['CEP']}</p>
        <p><strong>Referência:</strong> ${imovel['Referência']}</p>
        <p><strong>Tamanho:</strong> ${imovel['Tamanho']}m²</p>
        <p><strong>Mobília:</strong> ${imovel['Mobília'].replace('_', ' ')}</p>
        <p><strong>Imobiliária:</strong> ${imovel.imobiliaria.nome}</p>
    ` : '';

    const detalhesCliente = cliente ? `
        <h4 class="font-semibold text-green-300 mt-4 border-t border-gray-600 pt-3">--- Detalhes do Cliente ---</h4>
        <p><strong>Nome:</strong> ${cliente.nome}</p>
        <p><strong>Email:</strong> ${cliente.email || 'N/D'}</p>
        <p><strong>Telefone 1:</strong> ${cliente['Telefone 1'] || 'N/D'}</p>
        <p><strong>Telefone 2:</strong> ${cliente['Telefone 2'] || 'N/D'}</p>
    ` : '';

    return `
        <div class="vistoria-card bg-gray-700/50 rounded-lg p-4">
            <div class="flex justify-between items-center">
                <div>
                    <p class="text-xl font-bold">${horario}</p>
                    <p class="text-green-400 font-semibold">${tipo_vistoria}</p>
                </div>
                <button class="expand-btn p-2 rounded-full hover:bg-gray-600 transition">
                    <svg class="h-6 w-6 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
            </div>
            <div class="details hidden mt-4 space-y-1 text-sm text-gray-300">
                ${detalhesImovel}
                ${detalhesCliente}
            </div>
        </div>
    `;
}

/**
 * Configura a lógica da página de Ajuda.
 */
function setupAjudaPage() {
    const supportForm = document.getElementById('support-form');
    const formMessageDiv = document.getElementById('form-message');

    supportForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formMessageDiv.classList.add('hidden');

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
