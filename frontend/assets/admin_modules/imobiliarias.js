// frontend/assets/admin_modules/imobiliarias.js
import { api } from '../api-ti.js';
import { openModal, closeModal, showNotification } from './utils.js';

let renderPageRef = null;
let gruposPorId = {};

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Permissões de um login de imobiliária: financeiro (fechamento mensal) e vistorias (agenda, solicitações, laudos)
const permissoesBadges = (u) => `
    ${u.acesso_financeiro ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">Financeiro</span>' : ''}
    ${u.acesso_vistorias ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Vistorias</span>' : ''}
`;

const permissoesCampos = (financeiro = true, vistorias = true) => `
    <fieldset class="space-y-2 bg-gray-900/50 border border-gray-700 rounded p-3">
        <legend class="text-sm text-gray-400 px-1">Permissões</legend>
        <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="acesso_financeiro" class="mt-1 accent-purple-600" ${financeiro ? 'checked' : ''}>
            <span><span class="text-white text-sm">Acesso financeiro</span><span class="block text-xs text-gray-500">Fechamento mensal e relatórios</span></span>
        </label>
        <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="acesso_vistorias" class="mt-1 accent-purple-600" ${vistorias ? 'checked' : ''}>
            <span><span class="text-white text-sm">Vistorias</span><span class="block text-xs text-gray-500">Agenda, solicitações e laudos</span></span>
        </label>
    </fieldset>
`;

// Lê as permissões do formulário; null se nenhuma estiver marcada
const lerPermissoes = (form) => {
    const permissoes = {
        acesso_financeiro: form.get('acesso_financeiro') === 'on',
        acesso_vistorias: form.get('acesso_vistorias') === 'on',
    };
    if (!permissoes.acesso_financeiro && !permissoes.acesso_vistorias) {
        showNotification('Marque ao menos uma permissão.', 'error');
        return null;
    }
    return permissoes;
};

const editIcon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>';
const trashIcon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';

const usuariosHTML = (grupo) => {
    const usuarios = grupo.usuarios || [];
    return `
    <div class="border-t border-gray-700/50 p-3 bg-gray-900/30">
        <div class="flex justify-between items-center mb-2 px-1">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuários de acesso (${usuarios.length + 1})</p>
            <button class="text-xs text-purple-400 hover:text-purple-300 font-medium" onclick="window.createUsuarioGrupoModal('${grupo.id}')">+ Novo usuário</button>
        </div>
        <ul class="space-y-1">
            <li class="flex flex-wrap justify-between items-center gap-2 p-2 rounded hover:bg-gray-700/30 text-sm">
                <div class="min-w-0">
                    <span class="text-white">${esc(grupo.email)}</span>
                    <span class="ml-1 text-[10px] uppercase font-bold text-gray-500">Login principal</span>
                </div>
                <div class="flex items-center gap-2">
                    ${permissoesBadges(grupo)}
                    <button class="p-1 text-gray-400 hover:text-white" onclick="window.editGrupo('${grupo.id}')" title="Editar login principal">${editIcon}</button>
                </div>
            </li>
            ${usuarios.map(u => `
            <li class="flex flex-wrap justify-between items-center gap-2 p-2 rounded hover:bg-gray-700/30 text-sm">
                <div class="min-w-0">
                    <span class="text-white">${esc(u.nome)}</span>
                    <span class="text-gray-500 text-xs ml-1">${esc(u.email)}</span>
                </div>
                <div class="flex items-center gap-2">
                    ${permissoesBadges(u)}
                    <button class="p-1 text-gray-400 hover:text-white" onclick="window.editUsuarioGrupo('${grupo.id}', '${u.id}')" title="Editar usuário">${editIcon}</button>
                    <button class="p-1 text-red-400 hover:text-red-300" onclick="window.deleteUsuarioGrupo('${grupo.id}', '${u.id}')" title="Remover usuário">${trashIcon}</button>
                </div>
            </li>`).join('')}
        </ul>
    </div>`;
};

export const renderImobiliariasPage = async (pageContent) => {
    renderPageRef = () => renderImobiliariasPage(pageContent);
    const grupos = await api.getGrupos();
    const imobiliarias = await api.getImobiliarias();
    gruposPorId = Object.fromEntries(grupos.map(g => [g.id, g]));

    const imobiliariasSemGrupo = imobiliarias.filter(i => !i.grupo);

    let gruposHTML = grupos.map(grupo => {
        const imobs = grupo.imobiliarias || [];
        return `
        <div class="bg-gray-800/40 rounded-xl border border-gray-700/50 mb-4 overflow-hidden">
            <div class="p-4 flex items-center justify-between bg-gray-800/80">
                <div>
                    <h3 class="font-bold text-white text-lg">${grupo.nome}</h3>
                    <p class="text-xs text-gray-500">${grupo.email} • ${imobs.length} filiais</p>
                </div>
                <div class="flex gap-2">
                     <button class="p-2 text-gray-400 hover:text-white" onclick="window.editGrupo('${grupo.id}')" title="Editar Grupo">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    <button class="p-2 text-red-400 hover:text-red-300" onclick="window.deleteGrupo('${grupo.id}')" title="Excluir Grupo">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
            ${usuariosHTML(grupo)}
            ${imobs.length > 0 ? `
            <div class="border-t border-gray-700/50 p-2 bg-gray-900/20">
                <ul class="space-y-1">
                    ${imobs.map(imob => `
                        <li class="flex justify-between items-center p-2 rounded hover:bg-gray-700/30 text-sm text-gray-300 ml-4 border-l-2 border-gray-700 pl-3">
                            <span>${imob.nome}</span>
                            <div class="flex gap-2 text-xs">
                                <button class="text-indigo-400 hover:underline" onclick="window.editImobiliaria('${imob.id}')">Gerenciar</button>
                                <button class="text-gray-500 hover:text-red-400" onclick="window.unlinkImobiliaria('${imob.id}', '${imob.nome}')">Desvincular</button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>` : ''}
        </div>`;
    }).join('');

    const semGrupoHTML = imobiliariasSemGrupo.length > 0 ? `
        <div class="mt-8">
            <h3 class="text-lg font-bold text-gray-400 mb-4 border-b border-gray-700 pb-2">Imobiliárias Independentes (Sem Grupo)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${imobiliariasSemGrupo.map(imob => `
                    <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center">
                        <span class="text-white font-medium">${imob.nome}</span>
                        <div class="flex gap-2">
                            <button class="text-gray-400 hover:text-white" onclick="window.editImobiliaria('${imob.id}')">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                            <button class="text-blue-400 hover:text-blue-300" onclick="window.linkImobiliariaModal('${imob.id}', '${imob.nome}')" title="Vincular a Grupo">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    pageContent.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-white">Grupos & Imobiliárias</h2>
                <div class="flex gap-3">
                     <button onclick="window.createImobiliariaModal()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm">
                        Nova Imobiliária
                    </button>
                    <button onclick="window.createGrupoModal()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg shadow-purple-900/20 transition-colors flex items-center gap-2 text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        Novo Grupo
                    </button>
                </div>
            </div>
            
            ${gruposHTML || '<p class="text-gray-500 italic">Nenhum grupo cadastrado.</p>'}
            ${semGrupoHTML}
        </div>
    `;
};

// --- Ações Globais Imobiliárias ---

window.createGrupoModal = () => {
    const modalHTML = `
        <h2 class="text-xl font-bold mb-4 text-white">Novo Grupo</h2>
        <form id="create-grupo-form" class="space-y-4">
            <input type="text" name="nome" placeholder="Nome do Grupo" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="email" name="email" placeholder="E-mail de Login" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="password" name="senha" placeholder="Senha" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <div class="flex justify-end gap-2 pt-4">
                <button type="button" class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Criar</button>
            </div>
        </form>
    `;
    openModal(modalHTML);
    document.getElementById('create-grupo-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            const data = Object.fromEntries(new FormData(e.target));
            await api.createGrupo(data);
            showNotification('Grupo criado!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch(e) { showNotification(e.message, 'error'); }
    };
};

window.editGrupo = (id) => {
     const grupo = gruposPorId[id];
     const modalHTML = `
        <h2 class="text-xl font-bold mb-4 text-white">Editar Grupo</h2>
        <form id="edit-grupo-form" class="space-y-4">
            <input type="text" name="nome" value="${esc(grupo.nome)}" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="email" name="email" value="${esc(grupo.email)}" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="password" name="senha" placeholder="Nova Senha (opcional)" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white">
            ${permissoesCampos(grupo.acesso_financeiro, grupo.acesso_vistorias)}
            <div class="flex justify-end gap-2 pt-4">
                <button type="button" class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Salvar</button>
            </div>
        </form>
    `;
    openModal(modalHTML);
    document.getElementById('edit-grupo-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        const permissoes = lerPermissoes(form);
        if (!permissoes) return;
        const data = { nome: form.get('nome'), email: form.get('email'), ...permissoes };
        if(form.get('senha')) data.senha = form.get('senha');
        try {
            await api.updateGrupo(id, data);
            showNotification('Grupo atualizado!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch(e) { showNotification(e.message, 'error'); }
    };
};

// --- Usuários adicionais do grupo ---

window.createUsuarioGrupoModal = (grupoId) => {
    openModal(`
        <h2 class="text-xl font-bold mb-1 text-white">Novo Usuário</h2>
        <p class="text-sm text-gray-400 mb-4">${esc(gruposPorId[grupoId].nome)}</p>
        <form id="create-usuario-grupo-form" class="space-y-4">
            <input type="text" name="nome" placeholder="Nome" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="email" name="email" placeholder="E-mail de Login" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="password" name="senha" placeholder="Senha (mín. 6 caracteres)" minlength="6" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            ${permissoesCampos()}
            <div class="flex justify-end gap-2 pt-4">
                <button type="button" class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Criar</button>
            </div>
        </form>
    `);
    document.getElementById('create-usuario-grupo-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        const permissoes = lerPermissoes(form);
        if (!permissoes) return;
        try {
            await api.createUsuarioGrupo(grupoId, { nome: form.get('nome'), email: form.get('email'), senha: form.get('senha'), ...permissoes });
            showNotification('Usuário criado!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch(e) { showNotification(e.message, 'error'); }
    };
};

window.editUsuarioGrupo = (grupoId, usuarioId) => {
    const usuario = gruposPorId[grupoId].usuarios.find(u => u.id === usuarioId);
    openModal(`
        <h2 class="text-xl font-bold mb-4 text-white">Editar Usuário</h2>
        <form id="edit-usuario-grupo-form" class="space-y-4">
            <input type="text" name="nome" value="${esc(usuario.nome)}" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="email" name="email" value="${esc(usuario.email)}" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <input type="password" name="senha" placeholder="Nova Senha (opcional)" minlength="6" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white">
            ${permissoesCampos(usuario.acesso_financeiro, usuario.acesso_vistorias)}
            <div class="flex justify-end gap-2 pt-4">
                <button type="button" class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Salvar</button>
            </div>
        </form>
    `);
    document.getElementById('edit-usuario-grupo-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        const permissoes = lerPermissoes(form);
        if (!permissoes) return;
        const data = { nome: form.get('nome'), email: form.get('email'), ...permissoes };
        if(form.get('senha')) data.senha = form.get('senha');
        try {
            await api.updateUsuarioGrupo(usuarioId, data);
            showNotification('Usuário atualizado!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch(e) { showNotification(e.message, 'error'); }
    };
};

window.deleteUsuarioGrupo = (grupoId, usuarioId) => {
    const usuario = gruposPorId[grupoId].usuarios.find(u => u.id === usuarioId);
    openModal(`
        <h2 class="text-lg font-bold text-white mb-2">Remover usuário?</h2>
        <p class="text-gray-400 mb-4">${esc(usuario.nome)} (${esc(usuario.email)}) perde o acesso ao portal da imobiliária.</p>
        <div class="flex justify-end gap-2">
             <button class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
             <button class="px-4 py-2 bg-red-600 text-white rounded" onclick="window.confirmDeleteUsuarioGrupo('${usuarioId}')">Remover</button>
        </div>
    `);
};

window.confirmDeleteUsuarioGrupo = async (usuarioId) => {
    try {
        await api.deleteUsuarioGrupo(usuarioId);
        showNotification('Usuário removido.', 'success');
        closeModal();
        if(renderPageRef) renderPageRef();
    } catch(e) { showNotification(e.message, 'error'); }
};

window.deleteGrupo = (id) => {
    openModal(`
        <h2 class="text-lg font-bold text-white mb-2">Excluir Grupo?</h2>
        <p class="text-gray-400 mb-4">Você só pode excluir grupos que não tenham imobiliárias vinculadas.</p>
        <div class="flex justify-end gap-2">
             <button class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
             <button class="px-4 py-2 bg-red-600 text-white rounded" onclick="window.confirmDeleteGrupo('${id}')">Excluir</button>
        </div>
    `);
};

window.confirmDeleteGrupo = async (id) => {
    try {
        await api.deleteGrupo(id);
        showNotification('Grupo excluído.', 'success');
        closeModal();
        if(renderPageRef) renderPageRef();
    } catch(e) { showNotification(e.message, 'error'); }
};

window.createImobiliariaModal = () => {
    const modalHTML = `
        <h2 class="text-xl font-bold mb-4 text-white">Nova Imobiliária</h2>
        <form id="create-imob-form" class="space-y-4">
            <input type="text" name="nome" placeholder="Nome Fantasia" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white" required>
            <div class="grid grid-cols-3 gap-2">
                <input type="number" step="0.01" name="valor_sem_mobilia" placeholder="R$ S/ Mobilia" class="bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm" required>
                <input type="number" step="0.01" name="valor_semi_mobiliado" placeholder="R$ Semi" class="bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm" required>
                <input type="number" step="0.01" name="valor_mobiliado" placeholder="R$ Mobiliado" class="bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm" required>
            </div>
            <div class="flex justify-end gap-2 pt-4">
                <button type="button" class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
                <button type="submit" class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-500">Criar</button>
            </div>
        </form>
    `;
    openModal(modalHTML);
    document.getElementById('create-imob-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await api.createImobiliaria(Object.fromEntries(new FormData(e.target)));
            showNotification('Imobiliária criada!', 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch(e) { showNotification(e.message, 'error'); }
    };
};

window.linkImobiliariaModal = async (imobiliariaId, imobiliariaNome) => {
    const grupos = await api.getGrupos();
    const options = grupos.map(g => `<option value="${g.id}">${g.nome}</option>`).join('');
    
    openModal(`
        <h2 class="text-lg font-bold text-white mb-4">Vincular ${imobiliariaNome}</h2>
        <select id="grupo-select" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white mb-4">
            <option value="">Selecione um Grupo...</option>
            ${options}
        </select>
        <div class="flex justify-end gap-2">
            <button class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
            <button class="px-4 py-2 bg-blue-600 text-white rounded" onclick="window.confirmLink('${imobiliariaId}')">Salvar Vínculo</button>
        </div>
    `);
};

window.confirmLink = async (id) => {
    const grupoId = document.getElementById('grupo-select').value;
    if(!grupoId) return;
    try {
        await api.linkImobiliariaToGroup(id, { grupo_id: grupoId });
        showNotification('Vinculado com sucesso!', 'success');
        closeModal();
        if(renderPageRef) renderPageRef();
    } catch(e) { showNotification(e.message, 'error'); }
};

window.unlinkImobiliaria = async (id, nome) => {
    if(confirm(`Desvincular ${nome} do grupo atual?`)) {
        try {
            await api.linkImobiliariaToGroup(id, { grupo_id: null }); // Envia null para remover
            showNotification('Desvinculado!', 'success');
            if(renderPageRef) renderPageRef();
        } catch(e) { showNotification(e.message, 'error'); }
    }
};

window.editImobiliaria = (id) => {
    showNotification("Edição de imobiliária ainda não implementada na UI.", "info");
};