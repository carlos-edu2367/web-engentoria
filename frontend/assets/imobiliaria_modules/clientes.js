import { api } from './api-imob.js';
import { showNotification } from './utils.js';

let currentClientePage = 1;
let clienteSearchTimer = null;
let clientesCache = []; // clientes da página atual, para preencher o modal de edição

export const renderClientesPage = async (container) => {
    container.innerHTML = `
        <div class="fade-in max-w-7xl mx-auto space-y-6">

            <!-- Header e Busca -->
            <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
                <div>
                    <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">
                        Meus Clientes
                    </h1>
                    <p class="text-gray-400 text-sm mt-1">Edite os dados de contato dos seus clientes.</p>
                </div>

                <div class="relative w-full md:w-80 group">
                    <input type="text" id="cliente-search-input"
                        placeholder="Buscar por Nome ou E-mail..."
                        class="w-full bg-gray-900/50 border border-gray-700/50 text-gray-200 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all shadow-lg placeholder-gray-500 group-hover:bg-gray-800/50">
                    <svg class="h-5 w-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                </div>
            </div>

            <!-- Container da Lista -->
            <div class="bg-gray-900/40 border border-gray-700/30 rounded-2xl p-1 backdrop-blur-sm shadow-xl relative overflow-hidden">
                <div class="overflow-x-auto rounded-xl">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-gray-800/60 text-gray-400 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                <th class="py-4 pl-6">Nome</th>
                                <th class="py-4 px-4">E-mail</th>
                                <th class="py-4 px-4">Telefone</th>
                                <th class="py-4 pr-6 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="clientes-list-body" class="text-gray-300 divide-y divide-gray-800/50">
                        </tbody>
                    </table>
                </div>

                <!-- Loading Overlay -->
                <div id="clientes-loading" class="hidden absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                    <div class="flex flex-col items-center">
                        <div class="h-8 w-8 border-t-2 border-b-2 border-cyan-400 rounded-full animate-spin mb-2"></div>
                        <span class="text-cyan-400 text-sm font-medium">Carregando...</span>
                    </div>
                </div>
            </div>

            <!-- Paginação -->
            <div id="clientes-pagination" class="flex justify-center items-center gap-3 pt-2">
                <button id="cli-prev-page-btn" class="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <span id="cli-page-indicator" class="px-4 py-2 bg-gray-800/50 border border-gray-700/50 text-cyan-400 rounded-lg font-mono font-bold text-sm shadow-inner min-w-[3rem] text-center">1</span>
                <button id="cli-next-page-btn" class="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
            </div>
        </div>

        <!-- Modal de Edição -->
        <div id="cliente-edit-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-6 fade-in">
                <div class="flex justify-between items-center mb-5">
                    <h3 class="text-xl font-bold text-white">Editar Cliente</h3>
                    <button type="button" id="cli-modal-close" class="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors">✕</button>
                </div>
                <form id="cliente-edit-form" class="space-y-4">
                    <input type="hidden" id="cli-edit-id">
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Nome</label>
                        <input type="text" id="cli-edit-nome" required
                            class="w-full bg-gray-800/50 border border-gray-700 text-gray-200 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">E-mail</label>
                        <input type="email" id="cli-edit-email" required
                            class="w-full bg-gray-800/50 border border-gray-700 text-gray-200 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Telefone</label>
                        <input type="text" id="cli-edit-telefone1" placeholder="(00) 00000-0000"
                            class="w-full bg-gray-800/50 border border-gray-700 text-gray-200 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Telefone secundário <span class="text-gray-600">(opcional)</span></label>
                        <input type="text" id="cli-edit-telefone2" placeholder="(00) 00000-0000"
                            class="w-full bg-gray-800/50 border border-gray-700 text-gray-200 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all">
                    </div>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button" id="cli-modal-cancel" class="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors text-sm font-medium">Cancelar</button>
                        <button type="submit" id="cli-modal-save" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors text-sm font-medium flex items-center gap-2">
                            Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setupEventListeners();

    currentClientePage = 1;
    await fetchAndDisplayClientes();
};

function setupEventListeners() {
    const searchInput = document.getElementById('cliente-search-input');
    const prevBtn = document.getElementById('cli-prev-page-btn');
    const nextBtn = document.getElementById('cli-next-page-btn');
    const listBody = document.getElementById('clientes-list-body');

    searchInput.addEventListener('input', (e) => {
        clearTimeout(clienteSearchTimer);
        clienteSearchTimer = setTimeout(() => {
            currentClientePage = 1;
            fetchAndDisplayClientes(e.target.value);
        }, 500);
    });

    prevBtn.addEventListener('click', () => {
        if (currentClientePage > 1) {
            currentClientePage--;
            fetchAndDisplayClientes(searchInput.value);
        }
    });

    nextBtn.addEventListener('click', () => {
        currentClientePage++;
        fetchAndDisplayClientes(searchInput.value);
    });

    // Abrir modal de edição (delegação)
    listBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.edit-cliente-btn');
        if (btn) openEditModal(btn.dataset.id);
    });

    // Controles do modal
    document.getElementById('cli-modal-close').addEventListener('click', closeEditModal);
    document.getElementById('cli-modal-cancel').addEventListener('click', closeEditModal);
    document.getElementById('cliente-edit-form').addEventListener('submit', handleSaveCliente);
}

async function fetchAndDisplayClientes(searchTerm = '') {
    const tbody = document.getElementById('clientes-list-body');
    const loading = document.getElementById('clientes-loading');
    const prevBtn = document.getElementById('cli-prev-page-btn');
    const nextBtn = document.getElementById('cli-next-page-btn');
    const pageIndicator = document.getElementById('cli-page-indicator');

    loading.classList.remove('hidden');
    pageIndicator.textContent = currentClientePage;
    prevBtn.disabled = currentClientePage === 1;

    if (currentClientePage === 1 && searchTerm) tbody.innerHTML = '';

    try {
        const response = await api.getMeusClientes(currentClientePage, searchTerm);
        const clientes = response.clientes || [];
        clientesCache = clientes;

        const total = response.total || 0;
        nextBtn.disabled = currentClientePage * 10 >= total;

        if (clientes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-12 text-center">
                        <div class="flex flex-col items-center justify-center text-gray-500">
                            <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z"></path></svg>
                            <p class="text-lg font-medium">Nenhum cliente encontrado.</p>
                            ${searchTerm ? `<p class="text-sm mt-1">Nenhum resultado para "${escapeHtml(searchTerm)}"</p>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = clientes.map(c => `
                <tr class="hover:bg-gray-800/40 transition-colors group border-b border-gray-800/50 last:border-0">
                    <td class="py-4 pl-6 font-medium text-gray-200">${escapeHtml(c.nome)}</td>
                    <td class="py-4 px-4 text-sm text-gray-400">${escapeHtml(c.email)}</td>
                    <td class="py-4 px-4 text-sm text-gray-400 font-mono">${escapeHtml(c.telefone1 || '—')}</td>
                    <td class="py-4 pr-6 text-right">
                        <button data-id="${c.id}"
                            class="edit-cliente-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            <span class="hidden sm:inline">Editar</span>
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="py-8 text-center text-red-400 bg-red-900/10">
                    <p>Erro ao carregar dados.</p>
                    <p class="text-xs text-red-500 mt-1">${escapeHtml(error.message)}</p>
                </td>
            </tr>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

function openEditModal(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('cli-edit-id').value = cliente.id;
    document.getElementById('cli-edit-nome').value = cliente.nome || '';
    document.getElementById('cli-edit-email').value = cliente.email || '';
    document.getElementById('cli-edit-telefone1').value = cliente.telefone1 || '';
    document.getElementById('cli-edit-telefone2').value = cliente.telefone2 || '';

    document.getElementById('cliente-edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('cliente-edit-modal').classList.add('hidden');
}

async function handleSaveCliente(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('cli-modal-save');
    const id = document.getElementById('cli-edit-id').value;

    const data = {
        nome: document.getElementById('cli-edit-nome').value.trim(),
        email: document.getElementById('cli-edit-email').value.trim(),
        telefone1: document.getElementById('cli-edit-telefone1').value.trim() || null,
        telefone2: document.getElementById('cli-edit-telefone2').value.trim() || null,
    };

    if (!data.nome || !data.email) {
        showNotification('Nome e e-mail são obrigatórios.', 'error');
        return;
    }

    const originalContent = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> Salvando...`;

    try {
        await api.updateCliente(id, data);
        showNotification('Cliente atualizado com sucesso!', 'success');
        closeEditModal();
        await fetchAndDisplayClientes(document.getElementById('cliente-search-input').value);
    } catch (error) {
        console.error(error);
        showNotification(error.message || 'Erro ao atualizar cliente.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalContent;
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
