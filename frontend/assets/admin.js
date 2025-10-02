// frontend/assets/admin.js
import { api } from './api-ti.js';

document.addEventListener('DOMContentLoaded', () => {
    // Protege a página para acesso exclusivo do perfil de TI
    protectTiPage();

    const navLinks = document.querySelectorAll('.nav-link');
    const pageContent = document.getElementById('page-content');
    const adminNav = document.getElementById('admin-nav');

    // Função para carregar o conteúdo da página
    const loadPage = async (pageId) => {
        // Remove a classe ativa de todos os links
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        // Adiciona a classe ativa ao link clicado
        const activeLink = adminNav.querySelector(`a[href="#${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        pageContent.innerHTML = `
            <div class="text-center py-10 fade-in">
                <svg class="animate-spin h-8 w-8 text-orange-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-2 text-gray-400">Carregando...</p>
            </div>`;
        try {
            // Cada case corresponde a uma função que renderiza uma seção do painel
            switch (pageId) {
                case 'dashboard':
                    await renderDashboard();
                    break;
                case 'users':
                    await renderUsers();
                    break;
                case 'imobiliarias':
                    await renderImobiliarias();
                    break;
                case 'chamados':
                    await renderChamados();
                    break;
                case 'feedbacks':
                    await renderFeedbacks();
                    break;
                case 'improdutivas':
                    await renderImprodutivas();
                    break;
                case 'restore':
                    await renderRestore();
                    break;
                case 'maintenance':
                    await renderMaintenance();
                    break;
                default:
                    await renderDashboard(); // Carrega o dashboard por padrão
            }
        } catch (error) {
            pageContent.innerHTML = `<div class="text-center text-red-400 bg-red-900/50 p-4 rounded-md"><strong>Erro:</strong> ${error.message}</div>`;
        }
    };

    // Navegação baseada em Hash
    adminNav.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.hash) {
            e.preventDefault();
            const pageId = link.hash.substring(1);
            window.location.hash = pageId;
        }
    });

    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.substring(1) || 'dashboard';
        loadPage(pageId);
    });
    
    // Carrega a página inicial baseada no hash ou padrão
    const initialPage = window.location.hash.substring(1) || 'dashboard';
    loadPage(initialPage);

    // Logout
    document.getElementById('logout-button').addEventListener('click', logout);
});

// =================================================================
// --- Funções de Renderização de Páginas ---
// =================================================================

/**
 * Renderiza o conteúdo do Dashboard
 */
async function renderDashboard() {
    const contentDiv = document.getElementById('page-content');
    try {
        const [stats, chartData] = await Promise.all([
            api.getDashboardStats(),
            api.getFeedbackChartData()
        ]);

        contentDiv.innerHTML = `
            <h1 class="text-3xl font-bold text-white mb-6">Dashboard</h1>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                    <h2 class="text-gray-400 text-sm font-medium uppercase tracking-wider">Usuários do App</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_users}</p>
                </div>
                <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                    <h2 class="text-gray-400 text-sm font-medium uppercase tracking-wider">Clientes</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_clients}</p>
                </div>
                <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                    <h2 class="text-gray-400 text-sm font-medium uppercase tracking-wider">Imobiliárias</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_imobiliarias}</p>
                </div>
                 <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                    <h2 class="text-gray-400 text-sm font-medium uppercase tracking-wider">Imóveis</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_imoveis}</p>
                </div>
                <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                    <h2 class="text-gray-400 text-sm font-medium uppercase tracking-wider">Chamados Abertos</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.open_tickets}</p>
                </div>
            </div>
            <div class="mt-8 bg-gray-800/80 p-6 rounded-xl neon-border">
                <h2 class="text-lg font-semibold text-white mb-4">Média de Avaliação por Versão do App</h2>
                <div class="h-80">
                    <canvas id="feedbackChart"></canvas>
                </div>
            </div>
        `;

        renderFeedbackChart(chartData);

    } catch (error) {
        contentDiv.innerHTML = `<div class="text-center text-red-400 bg-red-900/50 p-4 rounded-md"><strong>Erro ao carregar dashboard:</strong> ${error.message}</div>`;
    }
}

/**
 * Renderiza o gráfico de feedback.
 * @param {Array<object>} chartData - Os dados para o gráfico.
 */
function renderFeedbackChart(chartData) {
    const canvasElement = document.getElementById('feedbackChart');
    if (!canvasElement) return;

    const labels = chartData.map(item => `v${item.version}`);
    const data = chartData.map(item => item.avg_rating);

    const ctx = canvasElement.getContext('2d');
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Média de Avaliação',
                data: data,
                backgroundColor: 'rgba(249, 115, 22, 0.6)',
                borderColor: 'rgba(249, 115, 22, 1)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Média: ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 5,
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { display: false }
                }
            }
        }
    });
}


/**
 * Renderiza a página de Gerenciamento de Usuários
 */
async function renderUsers() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h1 class="text-3xl font-bold text-white">Gerenciar Usuários</h1>
            <button id="add-user-btn" class="w-full md:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105">
                + Adicionar Usuário
            </button>
        </div>
        <input type="text" id="user-search" placeholder="Buscar por nome ou email..." class="w-full p-3 bg-gray-700/50 rounded-lg border border-gray-600/50 mb-6 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
        <div id="user-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
    `;

    const userListDiv = document.getElementById('user-list');
    const searchInput = document.getElementById('user-search');
    let allUsers = [];

    const fetchAndDisplayUsers = async () => {
        try {
            allUsers = await api.getAllUsers();
            displayUsers(allUsers);
        } catch (error) {
            userListDiv.innerHTML = `<p class="text-red-400 col-span-full">${error.message}</p>`;
        }
    };

    const displayUsers = (usersToDisplay) => {
        userListDiv.innerHTML = '';
        if (usersToDisplay.length === 0) {
            userListDiv.innerHTML = '<p class="text-gray-400 col-span-full text-center">Nenhum usuário encontrado.</p>';
            return;
        }
        usersToDisplay.forEach(user => {
            const userCard = document.createElement('div');
            userCard.className = 'bg-gray-800/80 backdrop-blur-sm p-4 rounded-xl flex flex-col neon-border';
            userCard.innerHTML = `
                <div class="flex-grow">
                    <h3 class="font-bold text-lg text-orange-300">${user.nome}</h3>
                    <p class="text-sm text-gray-400">${user.email}</p>
                    <p class="text-xs text-amber-300 bg-gray-700/50 px-2 py-1 rounded-full inline-block mt-2">${user.tipo.toUpperCase()}</p>
                </div>
                <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-700/50">
                    <button class="edit-user-btn text-sm bg-blue-500/80 hover:bg-blue-600/80 px-3 py-1 rounded-md transition-colors" data-user-id="${user.id}" data-user-table="${user.table}">Editar</button>
                    <button class="delete-user-btn text-sm bg-red-500/80 hover:bg-red-600/80 px-3 py-1 rounded-md transition-colors" data-user-id="${user.id}" data-user-table="${user.table}" data-user-name="${user.nome}">Excluir</button>
                </div>
            `;
            userListDiv.appendChild(userCard);
        });
    };

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = allUsers.filter(u => 
            u.nome.toLowerCase().includes(searchTerm) || 
            u.email.toLowerCase().includes(searchTerm)
        );
        displayUsers(filtered);
    });

    contentDiv.addEventListener('click', (e) => {
        if (e.target.id === 'add-user-btn') {
            showUserModal();
        }
        if (e.target.classList.contains('edit-user-btn')) {
            const userId = e.target.dataset.userId;
            const user = allUsers.find(u => u.id === userId);
            if (user) showUserModal(user);
        }
        if (e.target.classList.contains('delete-user-btn')) {
            const userId = e.target.dataset.userId;
            const userName = e.target.dataset.userName;
            const userTable = e.target.dataset.userTable;
            showDeleteConfirmModal('user', { id: userId, name: userName, table: userTable }, fetchAndDisplayUsers);
        }
    });

    await fetchAndDisplayUsers();
}

/**
 * Renderiza a página de Gerenciamento de Imobiliárias e Grupos
 */
async function renderImobiliarias() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <h1 class="text-3xl font-bold text-white mb-8">Gerenciar Imobiliárias e Grupos</h1>
        
        <!-- Seção de Grupos -->
        <div class="mb-12 bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 p-6 rounded-xl neon-border">
            <div class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <h2 class="text-2xl font-bold text-orange-400">Grupos de Imobiliárias</h2>
                <button id="add-group-btn" class="w-full md:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105">
                    + Adicionar Grupo
                </button>
            </div>
            <div id="group-list" class="space-y-3"></div>
        </div>

        <!-- Seção de Imobiliárias -->
        <div class="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 p-6 rounded-xl neon-border">
            <div class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <h2 class="text-2xl font-bold text-orange-400">Imobiliárias</h2>
                <button id="add-imobiliaria-btn" class="w-full md:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105">
                    + Adicionar Imobiliária
                </button>
            </div>
            <div id="imobiliaria-list" class="space-y-3"></div>
        </div>
    `;

    let allGroups = [];
    let allImobiliarias = [];

    const fetchAndDisplayData = async () => {
        document.getElementById('group-list').innerHTML = '<p>Carregando grupos...</p>';
        document.getElementById('imobiliaria-list').innerHTML = '<p>Carregando imobiliárias...</p>';
        try {
            const [groups, imobiliarias] = await Promise.all([
                api.getGrupos(),
                api.getImobiliarias()
            ]);

            allGroups = groups;
            allImobiliarias = imobiliarias;
            
            displayGroups(allGroups);
            displayImobiliarias(allImobiliarias, allGroups);

        } catch (error) {
            contentDiv.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        }
    };
    
    const displayGroups = (groups) => {
        const container = document.getElementById('group-list');
        container.innerHTML = '';
        if (groups.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhum grupo cadastrado.</p>';
            return;
        }
        groups.forEach(group => {
            const groupCard = document.createElement('div');
            groupCard.className = 'bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center';
            groupCard.innerHTML = `
                <div>
                    <h3 class="font-bold text-lg text-orange-300">${group.nome}</h3>
                    <p class="text-sm text-gray-400">${group.email}</p>
                    <div class="text-xs text-gray-400 mt-1">
                        Membros: ${group.imobiliarias.map(i => i.nome).join(', ') || 'Nenhum'}
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="edit-group-btn text-sm bg-blue-500/80 hover:bg-blue-600/80 px-3 py-1 rounded-md transition-colors" data-group-id="${group.id}">Editar</button>
                    <button class="delete-group-btn text-sm bg-red-500/80 hover:bg-red-600/80 px-3 py-1 rounded-md transition-colors" data-group-id="${group.id}" data-group-name="${group.nome}">Excluir</button>
                </div>
            `;
            container.appendChild(groupCard);
        });
    };

    const displayImobiliarias = (imobiliarias, groups) => {
        const container = document.getElementById('imobiliaria-list');
        container.innerHTML = '';
        if (imobiliarias.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhuma imobiliária cadastrada.</p>';
            return;
        }
        imobiliarias.forEach(imob => {
            const imobCard = document.createElement('div');
            imobCard.className = 'bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center flex-wrap gap-2';
            const groupName = imob.grupo ? imob.grupo.nome : 'Nenhum';
            const groupClass = imob.grupo ? 'text-green-400' : 'text-yellow-400';

            imobCard.innerHTML = `
                <div>
                    <h3 class="font-bold text-lg text-orange-300">${imob.nome}</h3>
                    <p class="text-sm text-gray-400">Grupo: <span class="${groupClass}">${groupName}</span></p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button class="link-group-btn text-sm bg-purple-500/80 hover:bg-purple-600/80 px-3 py-1 rounded-md transition-colors" data-imob-id="${imob.id}">Vincular Grupo</button>
                    <button class="edit-imobiliaria-btn text-sm bg-blue-500/80 hover:bg-blue-600/80 px-3 py-1 rounded-md transition-colors" data-imob-id="${imob.id}">Editar</button>
                    <button class="delete-imobiliaria-btn text-sm bg-red-500/80 hover:bg-red-600/80 px-3 py-1 rounded-md transition-colors" data-imob-id="${imob.id}" data-imob-name="${imob.nome}">Excluir</button>
                </div>
            `;
            container.appendChild(imobCard);
        });
    };

    contentDiv.addEventListener('click', e => {
        if (e.target.id === 'add-group-btn') showGroupModal(null, fetchAndDisplayData);
        if (e.target.id === 'add-imobiliaria-btn') showImobiliariaModal(null, fetchAndDisplayData);
        
        if (e.target.classList.contains('edit-group-btn')) {
            const group = allGroups.find(g => g.id === e.target.dataset.groupId);
            showGroupModal(group, fetchAndDisplayData);
        }
        if (e.target.classList.contains('delete-group-btn')) {
            showDeleteConfirmModal('group', { id: e.target.dataset.groupId, name: e.target.dataset.groupName }, fetchAndDisplayData);
        }
        if (e.target.classList.contains('edit-imobiliaria-btn')) {
            const imob = allImobiliarias.find(i => i.id === e.target.dataset.imobId);
            showImobiliariaModal(imob, fetchAndDisplayData);
        }
        if (e.target.classList.contains('link-group-btn')) {
            const imob = allImobiliarias.find(i => i.id === e.target.dataset.imobId);
            showLinkGroupModal(imob, allGroups, fetchAndDisplayData);
        }
        if (e.target.classList.contains('delete-imobiliaria-btn')) {
            showDeleteConfirmModal('imobiliaria', { id: e.target.dataset.imobId, name: e.target.dataset.imobName }, fetchAndDisplayData);
        }
    });

    await fetchAndDisplayData();
}


/**
 * Renderiza a página de Gerenciamento de Chamados
 */
async function renderChamados() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <h1 class="text-3xl font-bold text-white mb-6">Gerenciar Chamados</h1>
        <div id="chamado-list" class="space-y-4"></div>
    `;

    const chamadoListDiv = document.getElementById('chamado-list');
    let allChamados = [];

    try {
        allChamados = await api.getChamados();
        
        if (allChamados.length === 0) {
            chamadoListDiv.innerHTML = '<p class="text-gray-400 text-center">Nenhum chamado encontrado.</p>';
            return;
        }

        allChamados.forEach(chamado => {
            chamadoListDiv.innerHTML += createChamadoCardHTML(chamado);
        });

    } catch (error) {
        chamadoListDiv.innerHTML = `<p class="text-red-400 text-center">${error.message}</p>`;
    }

    chamadoListDiv.addEventListener('click', e => {
        if (e.target.classList.contains('resolve-chamado-btn')) {
            const chamadoId = e.target.dataset.chamadoId;
            const chamado = allChamados.find(c => c.id === chamadoId);
            if (chamado) showResolveChamadoModal(chamado);
        }
    });
}

/**
 * Renderiza a página de Feedbacks
 */
async function renderFeedbacks() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <h1 class="text-3xl font-bold text-white mb-6">Feedbacks dos Usuários</h1>
        <div id="feedback-list" class="space-y-4"></div>
    `;

    const feedbackListDiv = document.getElementById('feedback-list');
    try {
        const feedbacks = await api.getFeedbacks();
        
        if (feedbacks.length === 0) {
            feedbackListDiv.innerHTML = '<p class="text-gray-400 text-center">Nenhum feedback encontrado.</p>';
            return;
        }

        feedbacks.forEach(fb => {
            feedbackListDiv.innerHTML += createFeedbackCardHTML(fb);
        });

    } catch (error) {
        feedbackListDiv.innerHTML = `<p class="text-red-400 text-center">${error.message}</p>`;
    }
}

/**
 * Renderiza a página de Vistorias Improdutivas
 */
async function renderImprodutivas() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <h1 class="text-3xl font-bold text-white mb-6">Vistorias Improdutivas</h1>
        <div class="bg-gray-800/80 backdrop-blur-sm p-4 rounded-xl neon-border mb-6 flex gap-4 items-center flex-wrap">
            <input type="text" id="improdutiva-cod-imovel" placeholder="Cód. Imóvel" class="p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            <input type="date" id="improdutiva-data" class="p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            <button id="search-improdutivas-btn" class="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-lg">Buscar</button>
        </div>
        <div id="improdutivas-table-container" class="overflow-x-auto"></div>
    `;

    const tableContainer = document.getElementById('improdutivas-table-container');

    const fetchAndDisplayImprodutivas = async () => {
        const codImovel = document.getElementById('improdutiva-cod-imovel').value;
        const dataVistoria = document.getElementById('improdutiva-data').value;
        
        const params = new URLSearchParams();
        if (codImovel) params.append('cod_imovel', codImovel);
        if (dataVistoria) params.append('data_vistoria', dataVistoria);

        tableContainer.innerHTML = '<p>Buscando...</p>';
        try {
            const improdutivas = await api.searchImprodutivas(params);
            
            if (improdutivas.length === 0) {
                tableContainer.innerHTML = '<p class="text-gray-400 text-center">Nenhuma vistoria improdutiva encontrada.</p>';
                return;
            }

            let tableHTML = `
                <table class="w-full min-w-max text-left bg-gray-800/80 rounded-lg neon-border">
                    <thead class="border-b border-gray-700/50">
                        <tr>
                            <th class="p-4">Data Vistoria</th>
                            <th class="p-4">Horário</th>
                            <th class="p-4">Cód. Imóvel</th>
                            <th class="p-4">Cliente</th>
                            <th class="p-4">Motivo</th>
                            <th class="p-4">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            improdutivas.forEach(item => {
                tableHTML += `
                    <tr class="border-b border-gray-700/50">
                        <td class="p-4">${item.data_vistoria}</td>
                        <td class="p-4">${item.horario}</td>
                        <td class="p-4">${item.cod_imovel}</td>
                        <td class="p-4">${item.cliente}</td>
                        <td class="p-4">${item.motivo}</td>
                        <td class="p-4">
                            <button class="revert-improdutiva-btn bg-red-500/80 hover:bg-red-600/80 text-white text-sm font-bold py-1 px-2 rounded-md transition-colors" data-id="${item.id}">Reverter</button>
                        </td>
                    </tr>
                `;
            });
            tableHTML += '</tbody></table>';
            tableContainer.innerHTML = tableHTML;

        } catch (error) {
            tableContainer.innerHTML = `<p class="text-red-400 text-center">${error.message}</p>`;
        }
    };

    document.getElementById('search-improdutivas-btn').addEventListener('click', fetchAndDisplayImprodutivas);
    tableContainer.addEventListener('click', e => {
        if (e.target.classList.contains('revert-improdutiva-btn')) {
            const id = e.target.dataset.id;
            showRevertConfirmModal(id, fetchAndDisplayImprodutivas);
        }
    });

    await fetchAndDisplayImprodutivas();
}

/**
 * Renderiza a página de Restauração de Registros
 */
async function renderRestore() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <h1 class="text-3xl font-bold text-white mb-6">Restaurar Registros Excluídos</h1>
        <div id="restore-table-container" class="overflow-x-auto"></div>
    `;

    const tableContainer = document.getElementById('restore-table-container');

    const fetchAndDisplayRecords = async () => {
        tableContainer.innerHTML = '<p>Buscando registros na lixeira...</p>';
        try {
            const records = await api.getDeletedRecords();

            if (records.length === 0) {
                tableContainer.innerHTML = '<p class="text-gray-400 text-center">A lixeira está vazia.</p>';
                return;
            }

            let tableHTML = `
                <table class="w-full min-w-max text-left bg-gray-800/80 rounded-lg neon-border">
                    <thead class="border-b border-gray-700/50">
                        <tr>
                            <th class="p-4">Item</th>
                            <th class="p-4">Tipo/Tabela</th>
                            <th class="p-4">Data de Exclusão</th>
                            <th class="p-4">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            records.forEach(item => {
                tableHTML += `
                    <tr class="border-b border-gray-700/50">
                        <td class="p-4">${item.nome_info}</td>
                        <td class="p-4">${item.tabela}</td>
                        <td class="p-4">${item.data_delecao}</td>
                        <td class="p-4">
                            <button class="restore-btn bg-green-600/80 hover:bg-green-700/80 text-white text-sm font-bold py-1 px-2 rounded-md transition-colors" data-id="${item.id}" data-table="${item.tabela}" data-name="${item.nome_info}">Restaurar</button>
                        </td>
                    </tr>
                `;
            });
            tableHTML += '</tbody></table>';
            tableContainer.innerHTML = tableHTML;

        } catch (error) {
            tableContainer.innerHTML = `<p class="text-red-400 text-center">${error.message}</p>`;
        }
    };

    tableContainer.addEventListener('click', e => {
        if (e.target.classList.contains('restore-btn')) {
            const id = e.target.dataset.id;
            const table = e.target.dataset.table;
            const name = e.target.dataset.name;
            showRestoreConfirmModal(id, table, name, fetchAndDisplayRecords);
        }
    });

    await fetchAndDisplayRecords();
}

/**
 * Renderiza a página de Manutenção
 */
async function renderMaintenance() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <h1 class="text-3xl font-bold text-white mb-6">Manutenção do Sistema</h1>
        <div class="space-y-8">
            <!-- Atualização de Versão -->
            <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                <h2 class="text-xl font-bold text-orange-400 mb-4">Atualizar Versão do App</h2>
                <form id="version-form" class="flex flex-col sm:flex-row items-center gap-4">
                    <input type="text" name="new_version" required placeholder="Ex: 2.1.0" class="flex-grow w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
                    <button type="submit" class="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-2 px-4 rounded-lg">Atualizar</button>
                </form>
                <div id="version-message" class="text-sm mt-3"></div>
            </div>

            <!-- Limpeza Permanente -->
            <div class="bg-gray-800/80 backdrop-blur-sm p-6 rounded-xl neon-border">
                <h2 class="text-xl font-bold text-orange-400 mb-4">Limpeza Permanente</h2>
                <div id="cleanup-preview" class="mb-4">
                    <p>Verificando registros para limpeza...</p>
                </div>
                <button id="cleanup-btn" class="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold py-2 px-4 rounded-lg disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed">
                    Limpar Permanentemente
                </button>
            </div>
        </div>
    `;

    const fetchAndDisplayCleanupPreview = async () => {
        const previewDiv = document.getElementById('cleanup-preview');
        const cleanupBtn = document.getElementById('cleanup-btn');
        try {
            const data = await api.getCleanupPreview();

            if (data.total === 0) {
                previewDiv.innerHTML = '<p>Nenhum registro encontrado na lixeira para limpeza.</p>';
                cleanupBtn.disabled = true;
            } else {
                let previewHTML = `<p><strong>Total de ${data.total}</strong> registros prontos para limpeza:</p><ul class="list-disc list-inside mt-2 text-gray-400">`;
                for (const table in data.counts) {
                    previewHTML += `<li>${table}: ${data.counts[table]}</li>`;
                }
                previewHTML += '</ul>';
                previewDiv.innerHTML = previewHTML;
                cleanupBtn.disabled = false;
            }
        } catch (error) {
            previewDiv.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        }
    };

    document.getElementById('version-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const versionMsg = document.getElementById('version-message');
        const formData = new FormData(e.target);
        const data = { new_version: formData.get('new_version') };
        
        versionMsg.textContent = 'Atualizando...';
        versionMsg.className = 'text-sm mt-3 text-yellow-400';
        
        try {
            const result = await api.updateAppVersion(data);
            versionMsg.textContent = result.message;
            versionMsg.className = 'text-sm mt-3 text-green-400';
            e.target.reset();
        } catch (error) {
            versionMsg.textContent = `Erro: ${error.message}`;
            versionMsg.className = 'text-sm mt-3 text-red-400';
        }
    });

    document.getElementById('cleanup-btn').addEventListener('click', () => {
        showCleanupConfirmModal(fetchAndDisplayCleanupPreview);
    });

    await fetchAndDisplayCleanupPreview();
}


// =================================================================
// --- Funções Auxiliares e de Modal ---
// =================================================================

function openModal(content) {
    const modal = document.getElementById('generic-modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = content;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('generic-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/**
 * Exibe o modal para adicionar ou editar um usuário.
 */
function showUserModal(user = null) {
    const isEdit = user !== null;
    const title = isEdit ? 'Editar Usuário' : 'Adicionar Novo Usuário';
    const buttonText = isEdit ? 'Salvar Alterações' : 'Criar Usuário';
    const passwordPlaceholder = isEdit ? 'Deixe em branco para não alterar' : 'Senha (obrigatória para admin/vistoriador)';

    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-orange-300">${title}</h2>
        <form id="user-form" class="space-y-4">
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome</label>
                <input type="text" id="nome" name="nome" value="${user?.nome || ''}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div>
                <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input type="email" id="email" name="email" value="${user?.email || ''}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div>
                <label for="tipo" class="block text-sm font-medium text-gray-300 mb-1">Tipo</label>
                <select id="tipo" name="tipo" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
                    <option value="vistoriador" ${user?.tipo === 'vistoriador' ? 'selected' : ''}>Vistoriador</option>
                    <option value="admin" ${user?.tipo === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="cliente" ${user?.tipo === 'cliente' ? 'selected' : ''}>Cliente</option>
                </select>
            </div>
            <div>
                <label for="senha" class="block text-sm font-medium text-gray-300 mb-1">Senha</label>
                <input type="password" id="senha" name="senha" placeholder="${passwordPlaceholder}" class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden"></div>
            <div class="flex justify-end gap-4 pt-4 border-t border-gray-700/50 mt-4">
                <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
                <button type="submit" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all">${buttonText}</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        if (isEdit && !data.senha) {
            delete data.senha;
        }

        try {
            if (isEdit) {
                await api.updateUser(user.table, user.id, data);
            } else {
                await api.createUser(data);
            }
            closeModal();
            renderUsers();
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Exibe o modal de confirmação para exclusão.
 */
function showDeleteConfirmModal(type, item, onSuccess) {
    const itemType = type === 'user' ? 'usuário' : (type === 'group' ? 'grupo' : 'imobiliária');

    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-red-400">Confirmar Exclusão</h2>
        <p>Você tem certeza que deseja excluir o ${itemType} <strong>${item.name}</strong>?</p>
        <p class="text-sm text-gray-400 mt-2">Esta ação moverá o item para a lixeira e pode ser revertida na tela "Restaurar".</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
            <button type="button" id="confirm-delete-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 transition-all">Sim, Excluir</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        try {
            if (type === 'user') {
                await api.deleteUser(item.table, item.id);
            } else if (type === 'imobiliaria') {
                await api.deleteImobiliaria(item.id);
            } else if (type === 'group') {
                await api.deleteGrupo(item.id);
            }
            closeModal();
            onSuccess();
        } catch (error) {
             document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Exibe o modal para criar ou editar um Grupo de Imobiliária.
 */
function showGroupModal(group = null, onSuccess) {
    const isEdit = group !== null;
    const title = isEdit ? 'Editar Grupo' : 'Adicionar Novo Grupo';
    const buttonText = isEdit ? 'Salvar Alterações' : 'Criar Grupo';
    const passwordPlaceholder = isEdit ? 'Deixe em branco para não alterar' : 'Senha (obrigatória)';

    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-orange-300">${title}</h2>
        <form id="group-form" class="space-y-4">
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome do Grupo</label>
                <input type="text" id="nome" name="nome" value="${group?.nome || ''}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div>
                <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email de Login</label>
                <input type="email" id="email" name="email" value="${group?.email || ''}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div>
                <label for="senha" class="block text-sm font-medium text-gray-300 mb-1">Senha</label>
                <input type="password" id="senha" name="senha" placeholder="${passwordPlaceholder}" ${!isEdit ? 'required' : ''} class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden"></div>
            <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
                <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
                <button type="submit" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all">${buttonText}</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        if (isEdit && !data.senha) {
            delete data.senha;
        }

        try {
            if (isEdit) {
                await api.updateGrupo(group.id, data);
            } else {
                await api.createGrupo(data);
            }
            closeModal();
            onSuccess();
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Exibe o modal para criar ou editar uma Imobiliária.
 */
function showImobiliariaModal(imob = null, onSuccess) {
    const isEdit = imob !== null;
    const title = isEdit ? 'Editar Imobiliária' : 'Adicionar Nova Imobiliária';
    const buttonText = isEdit ? 'Salvar Alterações' : 'Criar Imobiliária';

    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-orange-300">${title}</h2>
        <form id="imobiliaria-form" class="space-y-4">
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome da Imobiliária</label>
                <input type="text" id="nome" name="nome" value="${imob?.nome || ''}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="valor_sem_mobilia" class="block text-sm font-medium text-gray-300 mb-1">Valor s/ Mobília</label>
                    <input type="number" step="0.01" id="valor_sem_mobilia" name="valor_sem_mobilia" value="${imob?.valor_sem_mobilia || 0}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
                </div>
                <div>
                    <label for="valor_semi_mobiliado" class="block text-sm font-medium text-gray-300 mb-1">Valor Semi Mob.</label>
                    <input type="number" step="0.01" id="valor_semi_mobiliado" name="valor_semi_mobiliado" value="${imob?.valor_semi_mobiliado || 0}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
                </div>
                <div>
                    <label for="valor_mobiliado" class="block text-sm font-medium text-gray-300 mb-1">Valor Mobiliado</label>
                    <input type="number" step="0.01" id="valor_mobiliado" name="valor_mobiliado" value="${imob?.valor_mobiliado || 0}" required class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
                </div>
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden"></div>
            <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
                <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
                <button type="submit" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all">${buttonText}</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('imobiliaria-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            nome: formData.get('nome'),
            valor_sem_mobilia: parseFloat(formData.get('valor_sem_mobilia')),
            valor_semi_mobiliado: parseFloat(formData.get('valor_semi_mobiliado')),
            valor_mobiliado: parseFloat(formData.get('valor_mobiliado')),
        };

        try {
            if (isEdit) {
                await api.updateImobiliaria(imob.id, data);
            } else {
                await api.createImobiliaria(data);
            }
            closeModal();
            onSuccess();
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Exibe o modal para vincular uma imobiliária a um grupo.
 */
function showLinkGroupModal(imob, groups, onSuccess) {
    let optionsHTML = '<option value="">Nenhum</option>';
    groups.forEach(g => {
        const isSelected = imob.grupo && imob.grupo.id === g.id;
        optionsHTML += `<option value="${g.id}" ${isSelected ? 'selected' : ''}>${g.nome}</option>`;
    });

    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-orange-300">Vincular Grupo</h2>
        <p class="mb-4">Selecione o grupo para a imobiliária <strong>${imob.nome}</strong>.</p>
        <form id="link-group-form">
            <select name="grupo_id" class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition">
                ${optionsHTML}
            </select>
            <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
            <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
                <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
                <button type="submit" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 transition-all">Salvar Vínculo</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('link-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const grupoId = formData.get('grupo_id');
        const data = {
            grupo_id: grupoId || null // Envia null se a opção "Nenhum" for selecionada
        };

        try {
            await api.linkImobiliariaToGroup(imob.id, data);
            closeModal();
            onSuccess();
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}


/**
 * Cria o HTML para um único card de chamado.
 */
function createChamadoCardHTML(chamado) {
    const statusColors = {
        'Aberto': 'bg-blue-500/80 text-blue-200 border-blue-400/50',
        'Reaberto': 'bg-yellow-500/80 text-yellow-200 border-yellow-400/50',
        'Resolvido': 'bg-green-500/80 text-green-200 border-green-400/50'
    };
    const statusClass = statusColors[chamado.status] || 'bg-gray-500/80 text-gray-200 border-gray-400/50';
    const dataAbertura = new Date(chamado.data_abertura).toLocaleString('pt-BR');

    const resolveButtonHTML = chamado.status !== 'Resolvido'
        ? `<button class="resolve-chamado-btn text-sm bg-green-600/80 hover:bg-green-700/80 px-3 py-1 rounded-md transition-colors" data-chamado-id="${chamado.id}">Resolver</button>`
        : '';

    return `
        <div class="bg-gray-800/80 p-4 rounded-xl border border-gray-700/50 neon-border">
            <div class="flex justify-between items-start flex-wrap gap-2">
                <div>
                    <h3 class="font-bold text-lg text-orange-300">${chamado.titulo}</h3>
                    <p class="text-sm text-gray-400">Aberto por: ${chamado.nome_usuario} em ${dataAbertura}</p>
                </div>
                <span class="text-xs font-bold ${statusClass} px-2 py-1 rounded-full border">${chamado.status}</span>
            </div>
            <div class="mt-2 text-sm">
                <p><strong>Prioridade:</strong> ${chamado.prioridade} | <strong>Categoria:</strong> ${chamado.categoria}</p>
            </div>
            <div class="mt-4 pt-4 border-t border-gray-700/50">
                <p class="text-gray-300 whitespace-pre-wrap">${chamado.descricao}</p>
                ${chamado.comentario_conclusao ? `<p class="mt-2 text-green-300 bg-green-900/50 p-3 rounded-lg border border-green-400/30"><strong>Conclusão:</strong> ${chamado.comentario_conclusao}</p>` : ''}
            </div>
            <div class="flex justify-end mt-4">
                ${resolveButtonHTML}
            </div>
        </div>
    `;
}

/**
 * Exibe o modal para resolver um chamado.
 */
function showResolveChamadoModal(chamado) {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-green-400">Resolver Chamado</h2>
        <p class="mb-2"><strong>Título:</strong> ${chamado.titulo}</p>
        <form id="resolve-chamado-form">
            <div>
                <label for="comentario_conclusao" class="block text-sm font-medium text-gray-300 mb-1">Comentário de Conclusão</label>
                <textarea id="comentario_conclusao" name="comentario_conclusao" required rows="4" class="w-full p-2 bg-gray-700/50 rounded-lg border border-gray-600/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition mt-1"></textarea>
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
            <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
                <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
                <button type="submit" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 transition-all">Confirmar Resolução</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('resolve-chamado-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        try {
            await api.resolveChamado(chamado.id, data);
            closeModal();
            renderChamados(); // Recarrega a lista de chamados
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Cria o HTML para um único card de feedback.
 */
function createFeedbackCardHTML(feedback) {
    const dataEnvio = new Date(feedback.data_envio).toLocaleString('pt-BR');
    const clampedNota = Math.max(0, Math.min(5, feedback.nota));
    const stars = '⭐'.repeat(clampedNota) + '☆'.repeat(5 - clampedNota);

    return `
        <div class="bg-gray-800/80 p-4 rounded-xl border border-gray-700/50 neon-border">
            <div class="flex justify-between items-start flex-wrap gap-2">
                <div>
                    <h3 class="font-bold text-lg text-amber-400">${stars} <span class="text-base font-medium text-gray-300">(${feedback.nota}/5)</span></h3>
                    <p class="text-sm text-gray-400">Enviado por: ${feedback.nome_usuario} em ${dataEnvio}</p>
                </div>
                <span class="text-xs font-bold text-white bg-gray-600/80 px-2 py-1 rounded-full border border-gray-500/50">${feedback.app_version}</span>
            </div>
            <div class="mt-4 pt-4 border-t border-gray-700/50">
                <p class="text-gray-300">${feedback.comentario || '<i>Nenhum comentário adicional.</i>'}</p>
            </div>
        </div>
    `;
}

/**
 * Exibe o modal de confirmação para reverter uma vistoria improdutiva.
 */
function showRevertConfirmModal(improdutivaId, onRevertSuccess) {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-red-400">Confirmar Reversão</h2>
        <p>Você tem certeza que deseja reverter esta vistoria improdutiva?</p>
        <p class="text-sm text-gray-400 mt-2">Esta ação irá deletar o registro, liberar o horário na agenda e estornar a cobrança do cliente.</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
            <button type="button" id="confirm-revert-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 transition-all">Sim, Reverter</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-revert-btn').addEventListener('click', async () => {
        try {
            await api.revertImprodutiva(improdutivaId);
            closeModal();
            onRevertSuccess(); // Recarrega a lista de improdutivas
        } catch (error) {
             document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Exibe o modal de confirmação para restaurar um registro.
 */
function showRestoreConfirmModal(recordId, recordTable, recordName, onRestoreSuccess) {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-green-400">Confirmar Restauração</h2>
        <p>Você tem certeza que deseja restaurar o item <strong>${recordName}</strong>?</p>
        <p class="text-sm text-gray-400 mt-2">Esta ação irá remover o item da lixeira e torná-lo ativo novamente no sistema.</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
            <button type="button" id="confirm-restore-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 transition-all">Sim, Restaurar</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-restore-btn').addEventListener('click', async () => {
        try {
            await api.restoreRecord(recordTable, recordId);
            closeModal();
            onRestoreSuccess(); // Recarrega a lista
        } catch (error) {
             document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

/**
 * Exibe o modal de confirmação para a limpeza permanente.
 */
function showCleanupConfirmModal(onCleanupSuccess) {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-red-400">AÇÃO DESTRUTIVA</h2>
        <p>Você tem certeza que deseja limpar permanentemente todos os registros da lixeira?</p>
        <p class="text-sm text-gray-400 mt-2"><strong>Esta ação é irreversível.</strong> Todos os dados marcados como excluídos serão removidos para sempre.</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
            <button type="button" id="confirm-cleanup-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 transition-all">Sim, Limpar Permanentemente</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-cleanup-btn').addEventListener('click', async () => {
        try {
            await api.executeCleanup();
            closeModal();
            onCleanupSuccess(); // Recarrega a contagem
        } catch (error) {
             document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}

