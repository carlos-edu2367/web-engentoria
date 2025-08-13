// frontend/assets/gestao.js

// Define a URL base da API, alternando entre local e produção
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL_ADMIN = isLocal ? 'http://127.0.0.1:8000/api/v1/admin-panel' : '/api/v1/admin-panel';

// Executa o código quando o DOM estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    // Protege a página, garantindo que apenas usuários administradores logados possam acessá-la
    protectAdminPage(); 

    const navLinks = document.querySelectorAll('.nav-link');
    const pageContent = document.getElementById('page-content');
    const adminNav = document.getElementById('admin-nav');

    // Função para carregar o conteúdo da página com base no ID (hash da URL)
    const loadPage = async (pageId) => {
        // Atualiza o estado visual dos links de navegação
        navLinks.forEach(link => {
            link.classList.remove('active');
            link.classList.add('hover:bg-gray-700/50');
        });
        const activeLink = adminNav.querySelector(`a[href="#${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            activeLink.classList.remove('hover:bg-gray-700/50');
        }

        // Exibe um indicador de carregamento
        pageContent.innerHTML = `<div class="flex justify-center items-center h-64"><div class="animate-pulse flex flex-col items-center"><div class="h-12 w-12 bg-cyan-400/20 rounded-full flex items-center justify-center mb-4"><svg class="h-6 w-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg></div><p class="text-cyan-400">Carregando...</p></div></div>`;
        
        try {
            // Roteamento para renderizar a página correta
            switch (pageId) {
                case 'dashboard':
                    await renderDashboard();
                    break;
                case 'imobiliarias':
                    await renderImobiliarias();
                    break;
                case 'vistoriadores':
                    await renderVistoriadores();
                    break;
                // Adicione outros casos para as demais seções aqui
                default:
                    await renderDashboard(); // Página padrão
            }
        } catch (error) {
            // Exibe uma mensagem de erro amigável se o carregamento falhar
            pageContent.innerHTML = `<div class="bg-red-900/30 border border-red-800/50 rounded-lg p-4 text-center"><p class="text-red-400 font-medium">Erro ao carregar conteúdo:</p><p class="text-gray-400 mt-1">${error.message}</p></div>`;
        }
    };

    // Ouve cliques na navegação para mudar de página
    adminNav.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.hash) {
            e.preventDefault();
            window.location.hash = link.hash.substring(1);
        }
    });
    
    // Ouve mudanças no hash da URL para carregar a página correspondente
    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.substring(1) || 'dashboard';
        loadPage(pageId);
    });

    // Carrega a página inicial com base no hash da URL ou usa 'dashboard' como padrão
    const initialPage = window.location.hash.substring(1) || 'dashboard';
    loadPage(initialPage);

    // Adiciona funcionalidade ao botão de logout
    document.getElementById('logout-button').addEventListener('click', logout);
    
    // Exibe as informações do usuário logado
    const userInfo = getUserInfo();
    if(userInfo) {
        document.getElementById('user-name').textContent = userInfo.nome || 'Admin';
        document.getElementById('user-email').textContent = userInfo.email || '';
    }
});

// =================================================================
// --- Funções de Renderização de Páginas ---
// =================================================================

async function renderDashboard() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="fade-in">
            <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300 mb-6">Visão Geral da Operação</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8" id="kpi-container">
                <!-- KPIs serão inseridos aqui -->
            </div>
            
            <div class="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 neon-border">
                <h2 class="text-xl font-bold text-cyan-300 mb-4">Vistorias Realizadas (Últimos 6 meses)</h2>
                <div class="h-80">
                    <canvas id="vistoriasChart"></canvas>
                </div>
            </div>
        </div>
    `;
    
    try {
        const token = getToken();
        const statsResponse = await fetch(`${API_BASE_URL_ADMIN}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!statsResponse.ok) throw new Error('Falha ao buscar estatísticas.');
        const stats = await statsResponse.json();

        const kpiContainer = document.getElementById('kpi-container');
        kpiContainer.innerHTML = `
            ${createKpiCard('kpi-vistoriadores', 'Vistoriadores Ativos', 'bg-cyan-900/20', 'text-cyan-400', 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.125-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', stats.total_vistoriadores)}
            ${createKpiCard('kpi-imobiliarias', 'Imobiliárias', 'bg-emerald-900/20', 'text-emerald-400', 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', stats.total_imobiliarias)}
            ${createKpiCard('kpi-clientes', 'Clientes', 'bg-sky-900/20', 'text-sky-400', 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', stats.total_clientes)}
            ${createKpiCard('kpi-vistorias-mes', 'Vistorias no Mês', 'bg-indigo-900/20', 'text-indigo-400', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', stats.vistorias_mes_atual)}
            ${createKpiCard('kpi-improdutivas-mes', 'Improdutivas no Mês', 'bg-yellow-900/20', 'text-yellow-400', 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', stats.improdutivas_mes_atual)}
        `;

        const chartResponse = await fetch(`${API_BASE_URL_ADMIN}/dashboard/vistorias-chart`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!chartResponse.ok) throw new Error('Falha ao buscar dados do gráfico.');
        const chartData = await chartResponse.json();

        const chartCtx = document.getElementById('vistoriasChart').getContext('2d');
        const labels = chartData.map(item => item.mes_ano);
        const data = chartData.map(item => item.total);
        
        new Chart(chartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nº de Vistorias',
                    data: data,
                    backgroundColor: 'rgba(0, 255, 179, 0.2)',
                    borderColor: 'rgba(0, 255, 179, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(0, 255, 179, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(0, 255, 179, 1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grid: { color: 'rgba(55, 65, 81, 0.5)' },
                        ticks: { color: '#9ca3af', precision: 0 } 
                    }, 
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#9ca3af' } 
                    } 
                },
                plugins: { 
                    legend: { display: false } 
                }
            }
        });

    } catch (error) {
        contentDiv.innerHTML = `<div class="bg-red-900/30 border border-red-800/50 rounded-lg p-4 text-center"><p class="text-red-400 font-medium">Erro ao carregar o dashboard:</p><p class="text-gray-400 mt-1">${error.message}</p></div>`;
    }
}

async function renderImobiliarias() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">Gestão de Imobiliárias</h1>
                <button id="add-imobiliaria-btn" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20 flex items-center">
                    <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Adicionar Nova
                </button>
            </div>
            <div id="imobiliarias-table-container" class="bg-gray-800/50 rounded-xl border border-gray-700/50 neon-border overflow-hidden">
                <!-- Tabela será inserida aqui -->
            </div>
        </div>
    `;

    await fetchAndDisplayImobiliarias();

    document.getElementById('add-imobiliaria-btn').addEventListener('click', () => openImobiliariaModal());
}

async function renderVistoriadores() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">Gestão de Vistoriadores</h1>
                <button id="add-vistoriador-btn" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20 flex items-center">
                    <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Adicionar Novo
                </button>
            </div>
            <div id="vistoriadores-table-container" class="bg-gray-800/50 rounded-xl border border-gray-700/50 neon-border overflow-hidden">
                <!-- Tabela será inserida aqui -->
            </div>
        </div>
    `;

    await fetchAndDisplayVistoriadores();

    document.getElementById('add-vistoriador-btn').addEventListener('click', () => openVistoriadorModal());
}


// =================================================================
// --- Funções de Lógica (Imobiliárias) ---
// =================================================================

async function fetchAndDisplayImobiliarias() {
    const container = document.getElementById('imobiliarias-table-container');
    container.innerHTML = `<p class="text-center p-8 text-gray-400">Carregando imobiliárias...</p>`;

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/imobiliarias/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar imobiliárias.');
        const imobiliarias = await response.json();

        if (imobiliarias.length === 0) {
            container.innerHTML = `<p class="text-center p-8 text-gray-400">Nenhuma imobiliária cadastrada.</p>`;
            return;
        }

        const table = document.createElement('table');
        table.className = 'w-full text-left';
        table.innerHTML = `
            <thead class="bg-gray-700/50">
                <tr>
                    <th class="p-4 font-semibold">Nome</th>
                    <th class="p-4 font-semibold">Valor s/ Mobília (m²)</th>
                    <th class="p-4 font-semibold">Valor Semi-Mobiliado (m²)</th>
                    <th class="p-4 font-semibold">Valor Mobiliado (m²)</th>
                    <th class="p-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${imobiliarias.map(imob => `
                    <tr class="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                        <td class="p-4">${imob.nome}</td>
                        <td class="p-4">${imob.valor_sem_mobilia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td class="p-4">${imob.valor_semi_mobiliado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td class="p-4">${imob.valor_mobiliado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td class="p-4 text-right">
                            <button class="edit-btn p-2 text-sky-400 hover:text-sky-300" data-imob='${JSON.stringify(imob)}'>
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                            </button>
                            <button class="delete-btn p-2 text-red-400 hover:text-red-300" data-id="${imob.id}" data-nome="${imob.nome}">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        container.innerHTML = '';
        container.appendChild(table);

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const imobData = JSON.parse(e.currentTarget.dataset.imob);
                openImobiliariaModal(imobData);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const nome = e.currentTarget.dataset.nome;
                handleDeleteImobiliaria(id, nome);
            });
        });

    } catch (error) {
        container.innerHTML = `<p class="text-center p-8 text-red-400">${error.message}</p>`;
    }
}

function openImobiliariaModal(imobiliaria = null) {
    const modal = document.getElementById('generic-modal');
    const modalContent = document.getElementById('modal-content');
    const isEditing = imobiliaria !== null;
    
    modalContent.innerHTML = `
        <form id="imobiliaria-form" class="space-y-4">
            <div class="flex justify-between items-start">
                <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">${isEditing ? 'Editar' : 'Adicionar'} Imobiliária</h2>
                <button type="button" id="close-modal-btn" class="p-1 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <input type="hidden" id="imobiliaria-id" value="${isEditing ? imobiliaria.id : ''}">
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome</label>
                <input type="text" id="nome" required class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" value="${isEditing ? imobiliaria.nome : ''}">
            </div>
            <div>
                <label for="valor_sem_mobilia" class="block text-sm font-medium text-gray-300 mb-1">Valor s/ Mobília (m²)</label>
                <input type="number" step="0.01" id="valor_sem_mobilia" required class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing ? imobiliaria.valor_sem_mobilia : ''}">
            </div>
            <div>
                <label for="valor_semi_mobiliado" class="block text-sm font-medium text-gray-300 mb-1">Valor Semi-Mobiliado (m²)</label>
                <input type="number" step="0.01" id="valor_semi_mobiliado" required class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing ? imobiliaria.valor_semi_mobiliado : ''}">
            </div>
            <div>
                <label for="valor_mobiliado" class="block text-sm font-medium text-gray-300 mb-1">Valor Mobiliado (m²)</label>
                <input type="number" step="0.01" id="valor_mobiliado" required class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing ? imobiliaria.valor_mobiliado : ''}">
            </div>
            <div id="form-error" class="hidden text-red-400 text-sm"></div>
            <div class="flex justify-end pt-4">
                <button type="submit" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition">Salvar</button>
            </div>
        </form>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('imobiliaria-form').addEventListener('submit', handleSaveImobiliaria);
}

async function handleSaveImobiliaria(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('#imobiliaria-id').value;
    const isEditing = !!id;

    const body = {
        nome: form.querySelector('#nome').value,
        valor_sem_mobilia: parseFloat(form.querySelector('#valor_sem_mobilia').value),
        valor_semi_mobiliado: parseFloat(form.querySelector('#valor_semi_mobiliado').value),
        valor_mobiliado: parseFloat(form.querySelector('#valor_mobiliado').value),
    };

    const url = isEditing ? `${API_BASE_URL_ADMIN}/imobiliarias/${id}` : `${API_BASE_URL_ADMIN}/imobiliarias/`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const token = getToken();
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Ocorreu um erro.');

        document.getElementById('generic-modal').classList.add('hidden');
        showToast(`Imobiliária ${isEditing ? 'atualizada' : 'criada'} com sucesso!`);
        await fetchAndDisplayImobiliarias();

    } catch (error) {
        document.getElementById('form-error').textContent = error.message;
        document.getElementById('form-error').classList.remove('hidden');
    }
}

async function handleDeleteImobiliaria(id, nome) {
    if (!confirm(`Tem certeza que deseja excluir a imobiliária "${nome}"? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/imobiliarias/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.detail || 'Ocorreu um erro ao excluir.');
        }
        showToast('Imobiliária excluída com sucesso!');
        await fetchAndDisplayImobiliarias();
    } catch (error) {
        showToast(error.message, true);
    }
}

// =================================================================
// --- Funções de Lógica (Vistoriadores) ---
// =================================================================

async function fetchAndDisplayVistoriadores() {
    const container = document.getElementById('vistoriadores-table-container');
    container.innerHTML = `<p class="text-center p-8 text-gray-400">Carregando vistoriadores...</p>`;

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/vistoriadores/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar vistoriadores.');
        const vistoriadores = await response.json();

        if (vistoriadores.length === 0) {
            container.innerHTML = `<p class="text-center p-8 text-gray-400">Nenhum vistoriador cadastrado.</p>`;
            return;
        }

        const table = document.createElement('table');
        table.className = 'w-full text-left';
        table.innerHTML = `
            <thead class="bg-gray-700/50">
                <tr>
                    <th class="p-4 font-semibold">Nome</th>
                    <th class="p-4 font-semibold">Email</th>
                    <th class="p-4 font-semibold">Telefone</th>
                    <th class="p-4 font-semibold text-center">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${vistoriadores.map(vist => `
                    <tr class="border-b border-gray-700/50">
                        <td class="p-4 align-top">${vist.nome}</td>
                        <td class="p-4 align-top">${vist.email}</td>
                        <td class="p-4 align-top">${vist.telefone1 || 'N/D'}</td>
                        <td class="p-4 text-center align-top">
                            <button class="details-btn p-2 text-cyan-400 hover:text-cyan-300" data-id="${vist.id}">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </button>
                            <button class="edit-btn p-2 text-sky-400 hover:text-sky-300" data-vist='${JSON.stringify(vist)}'>
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                            </button>
                            <button class="delete-btn p-2 text-red-400 hover:text-red-300" data-id="${vist.id}" data-nome="${vist.nome}">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </td>
                    </tr>
                    <tr class="details-row hidden bg-gray-900/50">
                        <td colspan="4" class="p-0">
                            <div id="details-${vist.id}" class="p-4"></div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        container.innerHTML = '';
        container.appendChild(table);

        document.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const detailsRow = e.currentTarget.closest('tr').nextElementSibling;
                handleVistoriadorDetails(id, detailsRow);
            });
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const vistData = JSON.parse(e.currentTarget.dataset.vist);
                openVistoriadorModal(vistData);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const nome = e.currentTarget.dataset.nome;
                handleDeleteVistoriador(id, nome);
            });
        });

    } catch (error) {
        container.innerHTML = `<p class="text-center p-8 text-red-400">${error.message}</p>`;
    }
}

async function handleVistoriadorDetails(id, detailsRow) {
    const detailsCell = detailsRow.querySelector('td > div');
    const isVisible = !detailsRow.classList.contains('hidden');

    if (isVisible) {
        detailsRow.classList.add('hidden');
        detailsCell.innerHTML = '';
        return;
    }

    // Mostra o loader e expande a linha
    detailsCell.innerHTML = `<p class="text-gray-400">Buscando detalhes...</p>`;
    detailsRow.classList.remove('hidden');

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/vistoriadores/${id}/detalhes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar detalhes do vistoriador.');
        const details = await response.json();

        const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        detailsCell.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                ${createKpiCard('', 'Média de Vistorias/Mês', 'bg-gray-700/30', 'text-cyan-400', '', details.media_vistorias_mensal.toFixed(1))}
                ${createKpiCard('', 'Média de Comissão/Mês', 'bg-gray-700/30', 'text-emerald-400', '', formatCurrency(details.media_comissao_mensal))}
            </div>
            <div class="h-64">
                <canvas id="chart-${id}"></canvas>
            </div>
        `;

        const chartCtx = document.getElementById(`chart-${id}`).getContext('2d');
        const labels = details.historico_mensal.map(item => item.mes_ano);
        const data = details.historico_mensal.map(item => item.total_vistorias);

        new Chart(chartCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nº de Vistorias',
                    data: data,
                    backgroundColor: 'rgba(0, 255, 179, 0.5)',
                    borderColor: 'rgba(0, 255, 179, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, ticks: { color: '#9ca3af', precision: 0 } }, 
                    x: { ticks: { color: '#9ca3af' } } 
                },
                plugins: { legend: { display: false } }
            }
        });

    } catch (error) {
        detailsCell.innerHTML = `<p class="text-red-400">${error.message}</p>`;
    }
}


function openVistoriadorModal(vistoriador = null) {
    const modal = document.getElementById('generic-modal');
    const modalContent = document.getElementById('modal-content');
    const isEditing = vistoriador !== null;
    
    modalContent.innerHTML = `
        <form id="vistoriador-form" class="space-y-4">
            <div class="flex justify-between items-start">
                <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">${isEditing ? 'Editar' : 'Adicionar'} Vistoriador</h2>
                <button type="button" id="close-modal-btn" class="p-1 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <input type="hidden" id="vistoriador-id" value="${isEditing ? vistoriador.id : ''}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                    <input type="text" id="nome" required class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing ? vistoriador.nome : ''}">
                </div>
                <div>
                    <label for="email" class="block text-sm font-medium text-gray-300 mb-1">Email</label>
                    <input type="email" id="email" required class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing ? vistoriador.email : ''}">
                </div>
                <div>
                    <label for="telefone1" class="block text-sm font-medium text-gray-300 mb-1">Telefone 1</label>
                    <input type="text" id="telefone1" class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing && vistoriador.telefone1 ? vistoriador.telefone1 : ''}">
                </div>
                <div>
                    <label for="telefone2" class="block text-sm font-medium text-gray-300 mb-1">Telefone 2</label>
                    <input type="text" id="telefone2" class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" value="${isEditing && vistoriador.telefone2 ? vistoriador.telefone2 : ''}">
                </div>
                <div>
                    <label for="senha" class="block text-sm font-medium text-gray-300 mb-1">Senha</label>
                    <input type="password" id="senha" ${!isEditing ? 'required' : ''} class="w-full bg-gray-700/50 border border-gray-600/50 text-white rounded-lg py-2 px-3" placeholder="${isEditing ? 'Deixe em branco para não alterar' : ''}">
                </div>
            </div>
            <div id="form-error" class="hidden text-red-400 text-sm"></div>
            <div class="flex justify-end pt-4">
                <button type="submit" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition">Salvar</button>
            </div>
        </form>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('vistoriador-form').addEventListener('submit', handleSaveVistoriador);
}

async function handleSaveVistoriador(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('#vistoriador-id').value;
    const isEditing = !!id;

    const body = {
        nome: form.querySelector('#nome').value,
        email: form.querySelector('#email').value,
        telefone1: form.querySelector('#telefone1').value,
        telefone2: form.querySelector('#telefone2').value,
        senha: form.querySelector('#senha').value,
        tipo: 'vistoriador'
    };
    
    if (isEditing && !body.senha) {
        delete body.senha;
    }

    const url = isEditing ? `${API_BASE_URL_ADMIN}/vistoriadores/${id}` : `${API_BASE_URL_ADMIN}/vistoriadores/`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const token = getToken();
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Ocorreu um erro.');

        document.getElementById('generic-modal').classList.add('hidden');
        showToast(`Vistoriador ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
        await fetchAndDisplayVistoriadores();

    } catch (error) {
        document.getElementById('form-error').textContent = error.message;
        document.getElementById('form-error').classList.remove('hidden');
    }
}

async function handleDeleteVistoriador(id, nome) {
    if (!confirm(`Tem certeza que deseja excluir o vistoriador "${nome}"?`)) {
        return;
    }

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_ADMIN}/vistoriadores/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.detail || 'Ocorreu um erro ao excluir.');
        }
        showToast('Vistoriador excluído com sucesso!');
        await fetchAndDisplayVistoriadores();
    } catch (error) {
        showToast(error.message, true);
    }
}


// =================================================================
// --- Funções Auxiliares e de Componentes ---
// =================================================================

function createKpiCard(id, title, bgColor, textColor, svgPath = '', value = 0) {
    return `<div class="${bgColor} p-6 rounded-xl border border-gray-700/50 neon-border"><div class="flex justify-between items-start"><h2 class="text-gray-400 text-sm font-medium">${title}</h2>${svgPath ? `<svg class="h-5 w-5 ${textColor}/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${svgPath}"></path></svg>` : ''}</div><p class="text-3xl font-bold ${textColor} mt-2"><span id="${id}">${value}</span></p></div>`;
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    const bgColor = isError ? 'bg-red-800/90' : 'bg-emerald-800/90';
    const borderColor = isError ? 'border-red-700' : 'border-emerald-700';
    
    toast.className = `fixed bottom-5 right-5 ${bgColor} text-white py-3 px-5 rounded-lg shadow-xl border ${borderColor} backdrop-blur-sm transition-all duration-300 translate-y-20 opacity-0`;
    toast.textContent = message;
    
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-20', 'opacity-0');
    }, 100);

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
