// /assets/modules/imobiliarias.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

// Guarda o estado atual das imobiliárias para evitar múltiplas chamadas à API
let imobiliariasCache = null;

/**
 * Renderiza o formulário para criar ou editar uma imobiliária dentro de um modal.
 * @param {object} [imobiliaria=null] - O objeto da imobiliária para edição. Se nulo, renderiza um formulário de criação.
 */
function renderImobiliariaForm(imobiliaria = null) {
    const isEditing = imobiliaria !== null;
    const title = isEditing ? 'Editar Imobiliária' : 'Cadastrar Nova Imobiliária';
    const buttonText = isEditing ? 'Salvar Alterações' : 'Cadastrar';
    const formId = 'imobiliaria-form';

    const formHTML = `
        <h2 class="text-2xl font-bold text-cyan-300 mb-6">${title}</h2>
        <form id="${formId}" class="space-y-4">
            <input type="hidden" id="imobiliaria-id" value="${isEditing ? imobiliaria.id : ''}">
            
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome da Imobiliária</label>
                <input type="text" id="nome" name="nome" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? sanitizeHTML(imobiliaria.nome) : ''}">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="valor_sem_mobilia" class="block text-sm font-medium text-gray-300 mb-1">Valor (Sem Mobília)</label>
                    <input type="number" step="0.01" id="valor_sem_mobilia" name="valor_sem_mobilia" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? imobiliaria.valor_sem_mobilia : ''}">
                </div>
                <div>
                    <label for="valor_semi_mobiliado" class="block text-sm font-medium text-gray-300 mb-1">Valor (Semi Mobiliado)</label>
                    <input type="number" step="0.01" id="valor_semi_mobiliado" name="valor_semi_mobiliado" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? imobiliaria.valor_semi_mobiliado : ''}">
                </div>
                <div>
                    <label for="valor_mobiliado" class="block text-sm font-medium text-gray-300 mb-1">Valor (Mobiliado)</label>
                    <input type="number" step="0.01" id="valor_mobiliado" name="valor_mobiliado" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? imobiliaria.valor_mobiliado : ''}">
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
 * Lida com a submissão do formulário de criação/edição.
 * @param {Event} event - O evento de submissão do formulário.
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('#imobiliaria-id').value;
    const isEditing = id !== '';

    const data = {
        nome: form.querySelector('#nome').value,
        valor_sem_mobilia: parseFloat(form.querySelector('#valor_sem_mobilia').value),
        valor_semi_mobiliado: parseFloat(form.querySelector('#valor_semi_mobiliado').value),
        valor_mobiliado: parseFloat(form.querySelector('#valor_mobiliado').value),
    };

    try {
        if (isEditing) {
            await api.updateImobiliaria(id, data);
            showAlert('Imobiliária atualizada com sucesso!');
        } else {
            await api.createImobiliaria(data);
            showAlert('Imobiliária cadastrada com sucesso!');
        }
        hideModal();
        await refreshImobiliariasList(); // Força a atualização da lista
    } catch (error) {
        console.error('Erro ao salvar imobiliária:', error);
        showAlert(error.message || 'Não foi possível salvar a imobiliária.', 'error');
    }
}

/**
 * Renderiza o modal de confirmação de exclusão.
 * @param {string} id - O ID da imobiliária a ser excluída.
 * @param {string} nome - O nome da imobiliária.
 */
function renderConfirmDeleteModal(id, nome) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-red-400 mb-4">Confirmar Exclusão</h2>
        <p class="text-gray-300 mb-6">Você tem certeza que deseja excluir a imobiliária "<strong>${sanitizeHTML(nome)}</strong>"? Esta ação não pode ser desfeita.</p>
        <div class="flex justify-end gap-4">
            <button id="cancel-delete" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="confirm-delete" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition">Excluir</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-delete').addEventListener('click', hideModal);
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
            await api.deleteImobiliaria(id);
            showAlert('Imobiliária excluída com sucesso!');
            hideModal();
            await refreshImobiliariasList();
        } catch (error) {
            console.error('Erro ao excluir imobiliária:', error);
            showAlert(error.message || 'Não foi possível excluir a imobiliária.', 'error');
        }
    });
}

/**
 * Renderiza a tabela de imobiliárias.
 * @param {Array<object>} imobiliarias - A lista de imobiliárias.
 */
function renderImobiliariasTable(imobiliarias) {
    const tableBody = document.getElementById('imobiliarias-table-body');
    if (!tableBody) return;

    if (imobiliarias.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhuma imobiliária encontrada.</td></tr>';
        return;
    }

    tableBody.innerHTML = imobiliarias.map(imob => `
        <tr class="border-b border-gray-700 hover:bg-gray-800/50">
            <td class="p-4 font-medium">${sanitizeHTML(imob.nome)}</td>
            <td class="p-4">R$ ${imob.valor_sem_mobilia.toFixed(2)}</td>
            <td class="p-4">R$ ${imob.valor_semi_mobiliado.toFixed(2)}</td>
            <td class="p-4">R$ ${imob.valor_mobiliado.toFixed(2)}</td>
            <td class="p-4 text-right">
                <button class="edit-btn p-2 text-cyan-400 hover:text-cyan-300" data-id="${imob.id}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                </button>
                <button class="delete-btn p-2 text-red-500 hover:text-red-400" data-id="${imob.id}" data-nome="${sanitizeHTML(imob.nome)}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Busca os dados da API e renderiza a tabela.
 */
async function refreshImobiliariasList() {
    try {
        const imobiliarias = await api.getImobiliarias();
        imobiliariasCache = imobiliarias; // Atualiza o cache
        renderImobiliariasTable(imobiliarias);
    } catch (error) {
        console.error('Erro ao buscar imobiliárias:', error);
        showAlert('Não foi possível carregar a lista de imobiliárias.', 'error');
    }
}

/**
 * Lida com cliques nos botões de ação (editar, excluir).
 * @param {Event} event - O evento de clique.
 */
function handleActions(event) {
    const target = event.target.closest('button');
    if (!target) return;

    const id = target.dataset.id;
    if (target.classList.contains('edit-btn')) {
        const imobiliariaToEdit = imobiliariasCache.find(imob => imob.id === id);
        if (imobiliariaToEdit) {
            renderImobiliariaForm(imobiliariaToEdit);
        }
    } else if (target.classList.contains('delete-btn')) {
        const nome = target.dataset.nome;
        renderConfirmDeleteModal(id, nome);
    }
}

/**
 * Função principal para inicializar o módulo de imobiliárias.
 */
export async function initImobiliarias() {
    const pageHTML = `
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-cyan-300">Gestão de Imobiliárias</h1>
            <button id="add-imobiliaria-btn" class="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-2 px-4 rounded-lg transition flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                Cadastrar Nova
            </button>
        </div>
        <div class="bg-gray-800/50 rounded-xl neon-border overflow-hidden">
            <table class="w-full text-left">
                <thead class="bg-gray-900/50">
                    <tr>
                        <th class="p-4">Nome</th>
                        <th class="p-4">S/ Mobília</th>
                        <th class="p-4">Semi Mobiliado</th>
                        <th class="p-4">Mobiliado</th>
                        <th class="p-4"></th>
                    </tr>
                </thead>
                <tbody id="imobiliarias-table-body">
                    <tr><td colspan="5" class="text-center py-8 text-gray-500">Carregando...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    renderPageContent(pageHTML);

    document.getElementById('add-imobiliaria-btn').addEventListener('click', () => renderImobiliariaForm());
    document.getElementById('page-content').addEventListener('click', handleActions);

    await refreshImobiliariasList();
}
