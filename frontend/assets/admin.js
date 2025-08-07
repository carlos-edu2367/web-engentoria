// frontend/assets/admin.js

// Lógica para definir a URL da API dinamicamente
const isLocalAdmin = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL_ADMIN = isLocalAdmin ? 'http://127.0.0.1:8000/api/v1/admin' : '/api/v1/admin';


document.addEventListener('DOMContentLoaded', () => {
    // Protege a página, garantindo que apenas gestores logados possam acessá-la.
    protectAdminPage();

    const navLinks = document.querySelectorAll('.nav-link');
    const pageContent = document.getElementById('page-content');
    const adminNav = document.getElementById('admin-nav');

    // Função para carregar o conteúdo da página
    const loadPage = async (pageId) => {
        // Remove a classe ativa de todos os links
        navLinks.forEach(link => {
            link.classList.remove('bg-orange-500/20', 'text-orange-300');
            link.classList.add('hover:bg-gray-700');
        });
        // Adiciona a classe ativa ao link clicado
        const activeLink = adminNav.querySelector(`a[href="#${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('bg-orange-500/20', 'text-orange-300');
            activeLink.classList.remove('hover:bg-gray-700');
        }

        pageContent.innerHTML = '<p class="text-center">Carregando...</p>';
        try {
            // Cada case corresponde a uma função que renderiza uma seção do painel
            switch (pageId) {
                case 'dashboard':
                    await renderDashboard();
                    break;
                case 'users':
                    await renderUsers();
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
                    pageContent.innerHTML = `<h1 class="text-2xl font-bold">Bem-vindo ao Painel de Gestão de TI</h1>`;
            }
        } catch (error) {
            pageContent.innerHTML = `<p class="text-red-400 text-center">Erro ao carregar conteúdo: ${error.message}</p>`;
        }
    };

    // Navegação baseada em Hash
    adminNav.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link) {
            e.preventDefault();
            const pageId = link.hash.substring(1);
            window.location.hash = pageId;
            loadPage(pageId);
        }
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
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const detail = errorData ? errorData.detail : `Erro ${response.status}`;
            throw new Error(detail || 'Falha ao buscar estatísticas.');
        }
        
        const stats = await response.json();

        contentDiv.innerHTML = `
            <h1 class="text-3xl font-bold text-white mb-6">Dashboard</h1>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <h2 class="text-gray-400 text-sm font-medium">Usuários do App</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_users}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <h2 class="text-gray-400 text-sm font-medium">Clientes</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_clients}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <h2 class="text-gray-400 text-sm font-medium">Imobiliárias</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_imobiliarias}</p>
                </div>
                 <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <h2 class="text-gray-400 text-sm font-medium">Imóveis</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.total_imoveis}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <h2 class="text-gray-400 text-sm font-medium">Chamados Abertos</h2>
                    <p class="text-3xl font-bold text-orange-400 mt-2">${stats.open_tickets}</p>
                </div>
            </div>
        `;
    } catch (error) {
        contentDiv.innerHTML = `<p class="text-red-400">Erro ao carregar dashboard: ${error.message}</p>`;
    }
}

/**
 * Renderiza a página de Gerenciamento de Usuários
 */
async function renderUsers() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold text-white">Gerenciar Usuários</h1>
            <button id="add-user-btn" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg">
                + Adicionar Usuário
            </button>
        </div>
        <input type="text" id="user-search" placeholder="Buscar por nome ou email..." class="w-full p-2 bg-gray-700 rounded-lg border border-gray-600 mb-6">
        <div id="user-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
    `;

    const userListDiv = document.getElementById('user-list');
    const searchInput = document.getElementById('user-search');
    let allUsers = [];

    const fetchAndDisplayUsers = async () => {
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL_ADMIN}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar usuários.');
            
            allUsers = await response.json();
            displayUsers(allUsers);
        } catch (error) {
            userListDiv.innerHTML = `<p class="text-red-400">${error.message}</p>`;
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
            userCard.className = 'bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col';
            userCard.innerHTML = `
                <div class="flex-grow">
                    <h3 class="font-bold text-lg">${user.nome}</h3>
                    <p class="text-sm text-gray-400">${user.email}</p>
                    <p class="text-xs text-orange-400 bg-gray-700 px-2 py-1 rounded-full inline-block mt-2">${user.tipo.toUpperCase()}</p>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="edit-user-btn text-sm bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded" data-user-id="${user.id}" data-user-table="${user.table}">Editar</button>
                    <button class="delete-user-btn text-sm bg-red-500 hover:bg-red-600 px-3 py-1 rounded" data-user-id="${user.id}" data-user-table="${user.table}" data-user-name="${user.nome}">Excluir</button>
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

    document.getElementById('add-user-btn').addEventListener('click', () => showUserModal());

    userListDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-user-btn')) {
            const userId = e.target.dataset.userId;
            const user = allUsers.find(u => u.id === userId);
            if (user) showUserModal(user);
        }
        if (e.target.classList.contains('delete-user-btn')) {
            const userId = e.target.dataset.userId;
            const userName = e.target.dataset.userName;
            const userTable = e.target.dataset.userTable;
            showDeleteConfirmModal(userId, userName, userTable);
        }
    });

    await fetchAndDisplayUsers();
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
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/chamados`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar chamados.');

        allChamados = await response.json();
        
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
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/feedbacks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar feedbacks.');

        const feedbacks = await response.json();
        
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
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 mb-6 flex gap-4 items-center flex-wrap">
            <input type="text" id="improdutiva-cod-imovel" placeholder="Cód. Imóvel" class="p-2 bg-gray-700 rounded border border-gray-600">
            <input type="date" id="improdutiva-data" class="p-2 bg-gray-700 rounded border border-gray-600">
            <button id="search-improdutivas-btn" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg">Buscar</button>
        </div>
        <div id="improdutivas-table-container"></div>
    `;

    const tableContainer = document.getElementById('improdutivas-table-container');

    const fetchAndDisplayImprodutivas = async () => {
        const codImovel = document.getElementById('improdutiva-cod-imovel').value;
        const dataVistoria = document.getElementById('improdutiva-data').value;
        
        let url = new URL(`${API_BASE_URL_ADMIN}/improdutivas`);
        if (codImovel) url.searchParams.append('cod_imovel', codImovel);
        if (dataVistoria) url.searchParams.append('data_vistoria', dataVistoria);

        tableContainer.innerHTML = '<p>Buscando...</p>';
        try {
            const token = getToken();
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar vistorias improdutivas.');
            const improdutivas = await response.json();
            
            if (improdutivas.length === 0) {
                tableContainer.innerHTML = '<p class="text-gray-400 text-center">Nenhuma vistoria improdutiva encontrada.</p>';
                return;
            }

            let tableHTML = `
                <table class="w-full text-left bg-gray-800 rounded-lg">
                    <thead class="border-b border-gray-700">
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
                    <tr class="border-b border-gray-700">
                        <td class="p-4">${item.data_vistoria}</td>
                        <td class="p-4">${item.horario}</td>
                        <td class="p-4">${item.cod_imovel}</td>
                        <td class="p-4">${item.cliente}</td>
                        <td class="p-4">${item.motivo}</td>
                        <td class="p-4">
                            <button class="revert-improdutiva-btn bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-1 px-2 rounded" data-id="${item.id}">Reverter</button>
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
        <div id="restore-table-container"></div>
    `;

    const tableContainer = document.getElementById('restore-table-container');

    const fetchAndDisplayRecords = async () => {
        tableContainer.innerHTML = '<p>Buscando registros na lixeira...</p>';
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL_ADMIN}/restore/records`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao buscar registros excluídos.');
            const records = await response.json();

            if (records.length === 0) {
                tableContainer.innerHTML = '<p class="text-gray-400 text-center">A lixeira está vazia.</p>';
                return;
            }

            let tableHTML = `
                <table class="w-full text-left bg-gray-800 rounded-lg">
                    <thead class="border-b border-gray-700">
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
                    <tr class="border-b border-gray-700">
                        <td class="p-4">${item.nome_info}</td>
                        <td class="p-4">${item.tabela}</td>
                        <td class="p-4">${item.data_delecao}</td>
                        <td class="p-4">
                            <button class="restore-btn bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-1 px-2 rounded" data-id="${item.id}" data-table="${item.tabela}" data-name="${item.nome_info}">Restaurar</button>
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
            <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h2 class="text-xl font-bold text-orange-400 mb-4">Atualizar Versão do App</h2>
                <form id="version-form" class="flex items-center gap-4">
                    <input type="text" name="new_version" required placeholder="Ex: 2.1.0" class="flex-grow p-2 bg-gray-700 rounded border border-gray-600">
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Atualizar</button>
                </form>
                <div id="version-message" class="text-sm mt-3"></div>
            </div>

            <!-- Limpeza Permanente -->
            <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h2 class="text-xl font-bold text-orange-400 mb-4">Limpeza Permanente</h2>
                <div id="cleanup-preview" class="mb-4">
                    <p>Verificando registros para limpeza...</p>
                </div>
                <button id="cleanup-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-500" disabled>
                    Limpar Permanentemente
                </button>
            </div>
        </div>
    `;

    const fetchAndDisplayCleanupPreview = async () => {
        const previewDiv = document.getElementById('cleanup-preview');
        const cleanupBtn = document.getElementById('cleanup-btn');
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL_ADMIN}/maintenance/cleanup-preview`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao verificar registros.');
            const data = await response.json();

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
            const token = getToken();
            const response = await fetch(`${API_BASE_URL_ADMIN}/maintenance/app-version`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Erro desconhecido.');
            
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
        <h2 class="text-2xl font-bold mb-4">${title}</h2>
        <form id="user-form" class="space-y-4">
            <div>
                <label for="nome" class="block text-sm font-medium">Nome</label>
                <input type="text" id="nome" name="nome" value="${user?.nome || ''}" required class="w-full p-2 bg-gray-700 rounded">
            </div>
            <div>
                <label for="email" class="block text-sm font-medium">Email</label>
                <input type="email" id="email" name="email" value="${user?.email || ''}" required class="w-full p-2 bg-gray-700 rounded">
            </div>
            <div>
                <label for="tipo" class="block text-sm font-medium">Tipo</label>
                <select id="tipo" name="tipo" required class="w-full p-2 bg-gray-700 rounded">
                    <option value="vistoriador" ${user?.tipo === 'vistoriador' ? 'selected' : ''}>Vistoriador</option>
                    <option value="admin" ${user?.tipo === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="cliente" ${user?.tipo === 'cliente' ? 'selected' : ''}>Cliente</option>
                </select>
            </div>
            <div>
                <label for="senha" class="block text-sm font-medium">Senha</label>
                <input type="password" id="senha" name="senha" placeholder="${passwordPlaceholder}" class="w-full p-2 bg-gray-700 rounded">
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden"></div>
            <div class="flex justify-end gap-4 pt-4">
                <button type="button" id="cancel-btn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded">Cancelar</button>
                <button type="submit" class="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded">${buttonText}</button>
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

        const token = getToken();
        const url = isEdit 
            ? `${API_BASE_URL_ADMIN}/users/${user.table}/${user.id}` 
            : `${API_BASE_URL_ADMIN}/users`;
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocorreu um erro.');
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
 * Exibe o modal de confirmação para exclusão de usuário.
 */
function showDeleteConfirmModal(userId, userName, userTable) {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4">Confirmar Exclusão</h2>
        <p>Você tem certeza que deseja excluir o usuário <strong>${userName}</strong>?</p>
        <p class="text-sm text-gray-400 mt-2">Esta ação moverá o usuário para a lixeira e pode ser revertida na tela "Restaurar".</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4">
            <button type="button" id="cancel-btn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded">Cancelar</button>
            <button type="button" id="confirm-delete-btn" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded">Sim, Excluir</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        const token = getToken();
        const url = `${API_BASE_URL_ADMIN}/users/${userTable}/${userId}`;
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocorreu um erro ao excluir.');
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
 * Cria o HTML para um único card de chamado.
 */
function createChamadoCardHTML(chamado) {
    const statusColors = {
        'Aberto': 'bg-blue-500',
        'Reaberto': 'bg-yellow-500',
        'Resolvido': 'bg-green-500'
    };
    const statusColor = statusColors[chamado.status] || 'bg-gray-500';
    const dataAbertura = new Date(chamado.data_abertura).toLocaleString('pt-BR');

    const resolveButtonHTML = chamado.status !== 'Resolvido'
        ? `<button class="resolve-chamado-btn text-sm bg-green-600 hover:bg-green-700 px-3 py-1 rounded" data-chamado-id="${chamado.id}">Resolver</button>`
        : '';

    return `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-lg">${chamado.titulo}</h3>
                    <p class="text-sm text-gray-400">Aberto por: ${chamado.nome_usuario} em ${dataAbertura}</p>
                </div>
                <span class="text-xs font-bold text-white ${statusColor} px-2 py-1 rounded-full">${chamado.status}</span>
            </div>
            <div class="mt-2 text-sm">
                <p><strong>Prioridade:</strong> ${chamado.prioridade} | <strong>Categoria:</strong> ${chamado.categoria}</p>
            </div>
            <div class="mt-4 pt-2 border-t border-gray-700">
                <p class="text-gray-300 whitespace-pre-wrap">${chamado.descricao}</p>
                ${chamado.comentario_conclusao ? `<p class="mt-2 text-green-300 bg-green-900/50 p-2 rounded"><strong>Conclusão:</strong> ${chamado.comentario_conclusao}</p>` : ''}
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
        <h2 class="text-2xl font-bold mb-4">Resolver Chamado</h2>
        <p class="mb-2"><strong>Título:</strong> ${chamado.titulo}</p>
        <form id="resolve-chamado-form">
            <div>
                <label for="comentario_conclusao" class="block text-sm font-medium">Comentário de Conclusão</label>
                <textarea id="comentario_conclusao" name="comentario_conclusao" required rows="4" class="w-full p-2 bg-gray-700 rounded mt-1"></textarea>
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
            <div class="flex justify-end gap-4 pt-4 mt-4">
                <button type="button" id="cancel-btn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded">Cancelar</button>
                <button type="submit" class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded">Confirmar Resolução</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('resolve-chamado-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        const token = getToken();
        const url = `${API_BASE_URL_ADMIN}/chamados/${chamado.id}/resolve`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocorreu um erro.');
            }
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
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-lg">${stars} <span class="text-base font-medium text-gray-300">(${feedback.nota}/5)</span></h3>
                    <p class="text-sm text-gray-400">Enviado por: ${feedback.nome_usuario} em ${dataEnvio}</p>
                </div>
                <span class="text-xs font-bold text-white bg-gray-600 px-2 py-1 rounded-full">v${feedback.app_version}</span>
            </div>
            <div class="mt-4 pt-2 border-t border-gray-700">
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
        <h2 class="text-2xl font-bold mb-4">Confirmar Reversão</h2>
        <p>Você tem certeza que deseja reverter esta vistoria improdutiva?</p>
        <p class="text-sm text-gray-400 mt-2">Esta ação irá deletar o registro, liberar o horário na agenda e estornar a cobrança do cliente.</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4">
            <button type="button" id="cancel-btn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded">Cancelar</button>
            <button type="button" id="confirm-revert-btn" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded">Sim, Reverter</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-revert-btn').addEventListener('click', async () => {
        const token = getToken();
        const url = `${API_BASE_URL_ADMIN}/improdutivas/${improdutivaId}/revert`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocorreu um erro ao reverter.');
            }
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
        <h2 class="text-2xl font-bold mb-4">Confirmar Restauração</h2>
        <p>Você tem certeza que deseja restaurar o item <strong>${recordName}</strong>?</p>
        <p class="text-sm text-gray-400 mt-2">Esta ação irá remover o item da lixeira e torná-lo ativo novamente no sistema.</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mt-2"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4">
            <button type="button" id="cancel-btn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded">Cancelar</button>
            <button type="button" id="confirm-restore-btn" class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded">Sim, Restaurar</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-restore-btn').addEventListener('click', async () => {
        const token = getToken();
        const url = `${API_BASE_URL_ADMIN}/restore/records/${recordTable}/${recordId}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocorreu um erro ao restaurar.');
            }
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
        <div class="flex justify-end gap-4 pt-4 mt-4">
            <button type="button" id="cancel-btn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded">Cancelar</button>
            <button type="button" id="confirm-cleanup-btn" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded">Sim, Limpar Permanentemente</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-cleanup-btn').addEventListener('click', async () => {
        const token = getToken();
        const url = `${API_BASE_URL_ADMIN}/maintenance/cleanup-execute`;
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocorreu um erro na limpeza.');
            }
            closeModal();
            onCleanupSuccess(); // Recarrega a contagem
        } catch (error) {
             document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
        }
    });
}
