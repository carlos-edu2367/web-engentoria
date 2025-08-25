// /assets/modules/clientes.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

/**
 * Atraso na execução de uma função para evitar chamadas excessivas.
 * Usado na barra de busca para não chamar a API a cada tecla digitada.
 * @param {Function} func A função a ser executada.
 * @param {number} [delay=400] O tempo de espera em milissegundos.
 * @returns {Function}
 */
function debounce(func, delay = 400) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

/**
 * Renderiza o formulário para criar ou editar um cliente.
 * @param {object} [cliente=null] - O objeto do cliente para edição.
 */
function renderClienteForm(cliente = null) {
    const isEditing = cliente !== null;
    const title = isEditing ? 'Editar Cliente' : 'Cadastrar Novo Cliente';
    const buttonText = isEditing ? 'Salvar Alterações' : 'Cadastrar';
    const formId = 'cliente-form';

    const formHTML = `
        <h2 class="text-2xl font-bold text-cyan-300 mb-6">${title}</h2>
        <form id="${formId}" class="space-y-4">
            <input type="hidden" id="cliente-id" value="${isEditing ? cliente.id : ''}">
            
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                <input type="text" id="nome" name="nome" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? sanitizeHTML(cliente.nome) : ''}">
            </div>

            <div>
                <label for="email" class="block text-sm font-medium text-gray-300 mb-1">E-mail</label>
                <input type="email" id="email" name="email" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? sanitizeHTML(cliente.email) : ''}">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="telefone1" class="block text-sm font-medium text-gray-300 mb-1">Telefone 1</label>
                    <input type="tel" id="telefone1" name="telefone1" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing && cliente.telefone1 ? sanitizeHTML(cliente.telefone1) : ''}">
                </div>
                <div>
                    <label for="telefone2" class="block text-sm font-medium text-gray-300 mb-1">Telefone 2 (Opcional)</label>
                    <input type="tel" id="telefone2" name="telefone2" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing && cliente.telefone2 ? sanitizeHTML(cliente.telefone2) : ''}">
                </div>
            </div>

            <div class="flex justify-end gap-4 pt-4">
                <button type="button" id="cancel-button" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition">${buttonText}</button>
            </div>
        </form>
    `;
    showModal(formHTML);

    document.getElementById('cancel-button').addEventListener('click', hideModal);
    document.getElementById(formId).addEventListener('submit', handleFormSubmit);
}

/**
 * Lida com a submissão do formulário de cliente.
 * @param {Event} event
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('#cliente-id').value;
    const isEditing = id !== '';

    const data = {
        nome: form.querySelector('#nome').value,
        email: form.querySelector('#email').value,
        telefone1: form.querySelector('#telefone1').value,
        telefone2: form.querySelector('#telefone2').value,
    };

    try {
        if (isEditing) {
            await api.updateCliente(id, data);
            showAlert('Cliente atualizado com sucesso!');
        } else {
            await api.createCliente(data);
            showAlert('Cliente cadastrado com sucesso!');
        }
        hideModal();
        // Atualiza a lista para refletir as mudanças
        const currentSearch = document.getElementById('search-cliente-input')?.value || '';
        await refreshClientesList(currentSearch);
    } catch (error) {
        showAlert(error.message || 'Não foi possível salvar o cliente.', 'error');
    }
}

/**
 * Renderiza o modal de confirmação de exclusão.
 * @param {string} id
 * @param {string} nome
 */
function renderConfirmDeleteModal(id, nome) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-red-400 mb-4">Confirmar Exclusão</h2>
        <p class="text-gray-300 mb-6">Você tem certeza que deseja excluir o cliente "<strong>${sanitizeHTML(nome)}</strong>"?</p>
        <div class="flex justify-end gap-4">
            <button id="cancel-delete" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="confirm-delete" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition">Excluir</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-delete').addEventListener('click', hideModal);
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
            await api.deleteCliente(id);
            showAlert('Cliente excluído com sucesso!');
            hideModal();
            const currentSearch = document.getElementById('search-cliente-input')?.value || '';
            await refreshClientesList(currentSearch);
        } catch (error) {
            showAlert(error.message || 'Não foi possível excluir o cliente.', 'error');
        }
    });
}

/**
 * Renderiza a tabela de clientes.
 * @param {Array<object>} clientes
 */
function renderClientesTable(clientes) {
    const tableBody = document.getElementById('clientes-table-body');
    if (!tableBody) return;

    if (clientes.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">Nenhum cliente encontrado.</td></tr>';
        return;
    }

    tableBody.innerHTML = clientes.map(cliente => `
        <tr class="border-b border-gray-700 hover:bg-gray-800/50">
            <td class="p-4 font-medium">${sanitizeHTML(cliente.nome)}</td>
            <td class="p-4">${sanitizeHTML(cliente.email)}</td>
            <td class="p-4">${sanitizeHTML(cliente.telefone1) || '---'}</td>
            <td class="p-4 text-right">
                <button class="edit-btn p-2 text-cyan-400 hover:text-cyan-300" data-cliente='${JSON.stringify(cliente)}'>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                </button>
                <button class="delete-btn p-2 text-red-500 hover:text-red-400" data-id="${cliente.id}" data-nome="${sanitizeHTML(cliente.nome)}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Busca os dados da API com base no termo de busca e renderiza a tabela.
 * @param {string} [searchTerm=''] - O termo para buscar.
 */
async function refreshClientesList(searchTerm = '') {
    const tableBody = document.getElementById('clientes-table-body');
    if(tableBody) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">Buscando...</td></tr>';
    }

    try {
        const clientes = await api.getClientes(searchTerm);
        renderClientesTable(clientes);
    } catch (error) {
        showAlert('Não foi possível carregar a lista de clientes.', 'error');
        if(tableBody) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-400">Erro ao carregar dados.</td></tr>';
        }
    }
}

/**
 * Lida com cliques nos botões de ação (Editar, Excluir).
 * @param {Event} event
 */
function handleActions(event) {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.classList.contains('edit-btn')) {
        const clienteData = JSON.parse(target.dataset.cliente);
        renderClienteForm(clienteData);
    } else if (target.classList.contains('delete-btn')) {
        const id = target.dataset.id;
        const nome = target.dataset.nome;
        renderConfirmDeleteModal(id, nome);
    }
}

/**
 * Função principal para inicializar o módulo de clientes.
 */
export async function initClientes() {
    const pageHTML = `
        <div class="flex justify-between items-center mb-8 flex-wrap gap-4">
            <h1 class="text-3xl font-bold text-cyan-300">Gestão de Clientes</h1>
            <div class="flex items-center gap-4">
                <input type="text" id="search-cliente-input" class="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" placeholder="Buscar por nome ou e-mail...">
                <button id="add-cliente-btn" class="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-2 px-4 rounded-lg transition flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Cadastrar Novo
                </button>
            </div>
        </div>
        <div class="bg-gray-800/50 rounded-xl neon-border overflow-hidden">
            <table class="w-full text-left">
                <thead class="bg-gray-900/50">
                    <tr>
                        <th class="p-4">Nome</th>
                        <th class="p-4">E-mail</th>
                        <th class="p-4">Telefone</th>
                        <th class="p-4"></th>
                    </tr>
                </thead>
                <tbody id="clientes-table-body">
                    <tr><td colspan="4" class="text-center py-8 text-gray-500">Carregando...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    renderPageContent(pageHTML);

    document.getElementById('add-cliente-btn').addEventListener('click', () => renderClienteForm());
    document.getElementById('page-content').addEventListener('click', handleActions);
    
    const searchInput = document.getElementById('search-cliente-input');
    searchInput.addEventListener('keyup', debounce((e) => {
        refreshClientesList(e.target.value.trim());
    }));

    // Carga inicial dos primeiros clientes
    await refreshClientesList();
}
