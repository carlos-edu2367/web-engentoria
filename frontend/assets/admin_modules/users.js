// frontend/assets/admin_modules/users.js
import { api } from '../api-ti.js';
import { openModal, closeModal, showNotification } from './utils.js';

// Variável para armazenar a referência da função de renderização da página
let renderPageRef = null;

export const renderUsersPage = async (pageContent) => {
    // Guarda a referência para usar nos re-renders após ações (create/edit/delete)
    renderPageRef = () => renderUsersPage(pageContent);

    const users = await api.getUsers();

    const rows = users.map(user => `
        <tr class="hover:bg-gray-800/50 transition-colors border-b border-gray-800/50">
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="h-10 w-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-bold text-lg border border-gray-600">
                        ${user.nome.charAt(0).toUpperCase()}
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-white">${user.nome}</div>
                        <div class="text-xs text-gray-500">${user.email}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${user.tipo === 'admin' ? 'bg-purple-100 text-purple-800' : 
                      user.tipo === 'vistoriador' ? 'bg-green-100 text-green-800' : 
                      'bg-blue-100 text-blue-800'}">
                    ${user.tipo ? user.tipo.toUpperCase() : 'CLIENTE'}
                </span>
            </td>
            <td class="px-6 py-4 text-right text-sm font-medium">
                <button class="text-indigo-400 hover:text-indigo-300 mr-4 transition-colors" onclick="window.editUser('${user.table}', '${user.id}', '${user.nome}', '${user.email}', '${user.tipo}')">Editar</button>
                <button class="text-red-400 hover:text-red-300 transition-colors" onclick="window.deleteUser('${user.table}', '${user.id}')">Excluir</button>
            </td>
        </tr>
    `).join('');

    pageContent.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-white">Gestão de Usuários</h2>
                <button onclick="window.openCreateUserModal()" class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow-lg shadow-orange-900/20 transition-all flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    Novo Usuário
                </button>
            </div>
            
            <div class="bg-gray-900/50 rounded-xl border border-gray-800 shadow-xl overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-800">
                        <thead class="bg-gray-900">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Usuário</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Tipo</th>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800/50">
                            ${rows.length ? rows : '<tr><td colspan="3" class="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
};

// --- Funções Globais para Actions (Criação, Edição, Deleção) ---

window.openCreateUserModal = () => {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-6 text-white">Novo Usuário</h2>
        <form id="create-user-form" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Tipo</label>
                <select name="tipo" id="user-tipo-select" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" onchange="window.toggleSenhaField()">
                    <option value="vistoriador">Vistoriador</option>
                    <option value="admin">Administrador (App)</option>
                    <option value="cliente">Cliente (Proprietário/Inquilino)</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Nome Completo</label>
                <input type="text" name="nome" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">E-mail</label>
                <input type="email" name="email" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" required>
            </div>
            <div id="senha-field">
                <label class="block text-sm font-medium text-gray-400 mb-1">Senha</label>
                <input type="password" name="senha" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none">
                <p class="text-xs text-gray-500 mt-1">Obrigatória para Admins e Vistoriadores.</p>
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t border-gray-700/50 mt-6">
                <button type="button" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium transition-colors">Criar Usuário</button>
            </div>
        </form>
    `;
    openModal(modalHTML);
    
    // Init state do toggle senha
    window.toggleSenhaField();

    document.getElementById('create-user-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        try {
            await api.createUser(data);
            showNotification('Usuário criado com sucesso!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    };
};

window.toggleSenhaField = () => {
    const tipo = document.getElementById('user-tipo-select').value;
    const senhaDiv = document.getElementById('senha-field');
    const senhaInput = senhaDiv.querySelector('input');
    if(tipo === 'cliente') {
        senhaDiv.classList.add('hidden');
        senhaInput.required = false;
    } else {
        senhaDiv.classList.remove('hidden');
        senhaInput.required = true;
    }
};

window.editUser = (table, id, nome, email, tipo) => {
    const currentTipo = (table === 'clientes') ? 'cliente' : tipo;

    const modalHTML = `
        <h2 class="text-2xl font-bold mb-6 text-white">Editar Usuário</h2>
        <form id="edit-user-form" class="space-y-4">
            <input type="hidden" name="table" value="${table}">
            <input type="hidden" name="id" value="${id}">
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Tipo</label>
                <select name="tipo" id="edit-tipo-select" class="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-gray-400 cursor-not-allowed" disabled>
                    <option value="vistoriador" ${currentTipo === 'vistoriador' ? 'selected' : ''}>Vistoriador</option>
                    <option value="admin" ${currentTipo === 'admin' ? 'selected' : ''}>Administrador</option>
                    <option value="cliente" ${currentTipo === 'cliente' ? 'selected' : ''}>Cliente</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Nome Completo</label>
                <input type="text" name="nome" value="${nome}" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">E-mail</label>
                <input type="email" name="email" value="${email}" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" required>
            </div>
            
            ${currentTipo !== 'cliente' ? `
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Nova Senha (Opcional)</label>
                <input type="password" name="senha" placeholder="Deixe em branco para manter a atual" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500 outline-none">
            </div>
            ` : ''}

            <div class="flex justify-end gap-3 pt-4 border-t border-gray-700/50 mt-6">
                <button type="button" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">Salvar Alterações</button>
            </div>
        </form>
    `;
    openModal(modalHTML);

    document.getElementById('edit-user-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            nome: formData.get('nome'),
            email: formData.get('email'),
            tipo: currentTipo,
            senha: formData.get('senha') ? formData.get('senha') : null
        };
        
        try {
            await api.updateUser(table, id, data);
            showNotification('Usuário atualizado com sucesso!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    };
};

window.deleteUser = (table, id) => {
    const modalHTML = `
        <h2 class="text-xl font-bold mb-4 text-white">Confirmar Exclusão</h2>
        <p class="text-gray-300 mb-6">Tem certeza que deseja remover este usuário? Ele será enviado para a lixeira.</p>
        <div class="flex justify-end gap-3">
            <button class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white" onclick="window.closeModal()">Cancelar</button>
            <button class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium" id="confirm-delete-btn">Sim, Excluir</button>
        </div>
    `;
    openModal(modalHTML);
    document.getElementById('confirm-delete-btn').onclick = async () => {
        try {
            await api.deleteUser(table, id);
            showNotification('Usuário removido.', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    };
};