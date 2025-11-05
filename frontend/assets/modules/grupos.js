// /assets/modules/grupos.js
// INÍCIO DA PARTE 4: Criação do novo módulo de grupos.
// Este arquivo substitui o antigo 'imobiliarias.js'.

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

let appStateCache = null; // Referência ao cache global (para imobiliárias)
let currentGrupoData = null; // Cache para os detalhes do grupo selecionado

/**
 * Formata um número como moeda brasileira (BRL).
 * @param {number} value - O valor a ser formatado.
 * @returns {string} - A string formatada.
 */
function formatCurrency(value) {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- Funções Principais de Renderização ---

/**
 * Função principal para inicializar o módulo de grupos.
 * Renderiza a lista de grupos.
 */
export async function initGrupos(container, appState) {
    appStateCache = appState; // Salva a referência do cache global

    const pageHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
            <h1 class="text-3xl font-bold text-cyan-300">Gestão de Grupos</h1>
            <!-- <button id="add-grupo-btn" class="..._">+ Novo Grupo</button> -->
        </div>
        <div id="grupos-list" class="space-y-4">
            <p class="text-center text-gray-400">Carregando grupos...</p>
        </div>
    `;
    renderPageContent(pageHTML);
    await renderGrupoList();
}

/**
 * Busca e renderiza a lista de grupos de imobiliárias.
 */
async function renderGrupoList() {
    const listContainer = document.getElementById('grupos-list');
    try {
        const data = await api.getGrupos();
        if (data.grupos.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-gray-400">Nenhum grupo encontrado.</p>';
            return;
        }

        listContainer.innerHTML = data.grupos.map(grupo => `
            <div class="bg-gray-800/50 rounded-xl neon-border p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                    <p class="font-bold text-white text-lg">${sanitizeHTML(grupo.nome)}</p>
                </div>
                <button class="details-btn w-full sm:w-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition" data-id="${grupo.id}">
                    Ver Detalhes
                </button>
            </div>
        `).join('');

        listContainer.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                renderGrupoDetails(e.currentTarget.dataset.id);
            });
        });

    } catch (error) {
        showAlert(error.message || 'Erro ao buscar grupos.', 'error');
        listContainer.innerHTML = `<p class="text-center text-red-400">${error.message}</p>`;
    }
}

/**
 * Renderiza a visualização de detalhes de um grupo específico, com abas.
 * @param {string} grupoId - O ID do grupo.
 */
async function renderGrupoDetails(grupoId) {
    const container = document.getElementById('page-content');
    container.innerHTML = `<p class="text-center text-gray-400">Carregando detalhes do grupo...</p>`;

    try {
        const data = await api.getGrupoDetails(grupoId);
        currentGrupoData = data; // Cache dos detalhes
        
        // CORREÇÃO: Armazena o ID do grupo no cache, pois ele não vem dentro do objeto 'detalhes'.
        currentGrupoData.grupo_id = grupoId; 
        
        // Atualiza o cache global de imobiliárias se necessário (usado por outros módulos)
        if (appStateCache && !appStateCache.imobiliarias) {
            appStateCache.imobiliarias = data.imobiliarias;
        }

        const pageHTML = `
            <button id="back-to-list" class="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition mb-6">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                Voltar para Lista
            </button>
            <h2 class="text-3xl font-bold text-cyan-300 mb-2">${sanitizeHTML(data.detalhes.nome)}</h2>
            <p class="text-gray-400 mb-6">${sanitizeHTML(data.detalhes.email)}</p>

            <!-- Abas de Detalhes do Grupo -->
            <div class="border-b border-gray-700/50 mb-6 overflow-x-auto">
                <nav class="flex space-x-2 sm:space-x-4 -mb-px" id="grupo-tabs" role="tablist">
                    <button data-tab="imobiliarias" class="tab-btn active" role="tab" aria-selected="true">Imobiliárias</button>
                    <button data-tab="resumo" class="tab-btn" role="tab" aria-selected="false">Resumo Mensal</button>
                </nav>
            </div>

            <!-- Conteúdo das Abas -->
            <div id="tab-content-imobiliarias" class="tab-content" role="tabpanel">
                <!-- Conteúdo da Aba Imobiliárias será renderizado aqui -->
            </div>
            <div id="tab-content-resumo" class="tab-content hidden" role="tabpanel">
                <!-- Conteúdo da Aba Resumo Mensal será renderizado aqui -->
            </div>
        `;
        container.innerHTML = pageHTML;

        // Adiciona listeners
        document.getElementById('back-to-list').addEventListener('click', initGrupos);

        document.getElementById('grupo-tabs').addEventListener('click', (e) => {
            const target = e.target.closest('.tab-btn');
            if (!target) return;
            const tabId = target.dataset.tab;

            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            target.classList.add('active');
            target.setAttribute('aria-selected', 'true');

            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
            const contentDiv = document.getElementById(`tab-content-${tabId}`);
            contentDiv.classList.remove('hidden');

            // Carrega o conteúdo da aba dinamicamente
            if (tabId === 'imobiliarias') {
                renderImobiliariasTab(contentDiv, data.imobiliarias);
            } else if (tabId === 'resumo') {
                renderResumoMensalTab(contentDiv, grupoId);
            }
        });

        // Renderiza a primeira aba
        renderImobiliariasTab(document.getElementById('tab-content-imobiliarias'), data.imobiliarias);

    } catch (error) {
        showAlert(error.message || 'Erro ao carregar detalhes do grupo.', 'error');
        container.innerHTML = `<p class="text-center text-red-400">${error.message}</p>`;
    }
}

// --- Funções da Aba "Imobiliárias" (Portado de imobiliarias.js) ---

/**
 * Renderiza o conteúdo da aba de imobiliárias.
 * @param {HTMLElement} container - O elemento container da aba.
 * @param {Array<object>} imobiliarias - A lista de imobiliárias do grupo.
 */
function renderImobiliariasTab(container, imobiliarias) {
    const tableHTML = `
        <div class="flex justify-end mb-4">
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
                        <th class="p-4 hidden sm:table-cell">S/ Mobília</th>
                        <th class="p-4 hidden sm:table-cell">Semi Mobiliado</th>
                        <th class="p-4 hidden sm:table-cell">Mobiliado</th>
                        <th class="p-4"></th>
                    </tr>
                </thead>
                <tbody id="imobiliarias-table-body">
                </tbody>
            </table>
        </div>
    `;
    container.innerHTML = tableHTML;

    // Popula a tabela
    const tableBody = container.querySelector('#imobiliarias-table-body');
    if (imobiliarias.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhuma imobiliária encontrada neste grupo.</td></tr>';
    } else {
        tableBody.innerHTML = imobiliarias.map(imob => `
            <tr class="border-b border-gray-700 hover:bg-gray-800/50">
                <td class="p-4 font-medium">${sanitizeHTML(imob.nome)}</td>
                <td class="p-4 hidden sm:table-cell">R$ ${imob.valor_sem_mobilia.toFixed(2)}</td>
                <td class="p-4 hidden sm:table-cell">R$ ${imob.valor_semi_mobiliado.toFixed(2)}</td>
                <td class="p-4 hidden sm:table-cell">R$ ${imob.valor_mobiliado.toFixed(2)}</td>
                <td class="p-4 text-right">
                    <button class="edit-imob-btn p-2 text-cyan-400 hover:text-cyan-300" data-id="${imob.id}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                    </button>
                    <button class="delete-imob-btn p-2 text-red-500 hover:text-red-400" data-id="${imob.id}" data-nome="${sanitizeHTML(imob.nome)}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Adiciona Listeners
    container.querySelector('#add-imobiliaria-btn').addEventListener('click', () => renderImobiliariaForm());

    container.querySelectorAll('.edit-imob-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const imobId = e.currentTarget.dataset.id;
            const imobiliaria = currentGrupoData.imobiliarias.find(i => i.id === imobId);
            renderImobiliariaForm(imobiliaria);
        });
    });

    container.querySelectorAll('.delete-imob-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const imobId = e.currentTarget.dataset.id;
            const nome = e.currentTarget.dataset.nome;
            renderConfirmDeleteImobiliariaModal(imobId, nome);
        });
    });
}

/**
 * Renderiza o formulário para criar/editar imobiliária (Modal).
 * Portado de 'imobiliarias.js'.
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
    document.getElementById(formId).addEventListener('submit', handleImobiliariaFormSubmit);
}

/**
 * Lida com o submit do formulário de imobiliária.
 * Portado de 'imobiliarias.js'.
 */
async function handleImobiliariaFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('#imobiliaria-id').value;
    const isEditing = id !== '';

    const data = {
        nome: form.querySelector('#nome').value,
        valor_sem_mobilia: parseFloat(form.querySelector('#valor_sem_mobilia').value),
        valor_semi_mobiliado: parseFloat(form.querySelector('#valor_semi_mobiliado').value),
        valor_mobiliado: parseFloat(form.querySelector('#valor_mobiliado').value),
        // Adiciona o grupo_id se for um novo cadastro
        grupo_id: isEditing ? undefined : currentGrupoData.grupo_id 
    };

    try {
        if (isEditing) {
            await api.updateImobiliaria(id, data);
            showAlert('Imobiliária atualizada com sucesso!');
        } else {
            // TODO: A API de criação de imobiliária precisa aceitar 'grupo_id'
            // Assumindo que a API foi atualizada conforme o plano (embora não tenhamos acesso)
            await api.createImobiliaria(data); 
            showAlert('Imobiliária cadastrada com sucesso!');
        }
        hideModal();
        // Recarrega os detalhes do grupo para atualizar a lista
        renderGrupoDetails(currentGrupoData.grupo_id); 
    } catch (error) {
        console.error('Erro ao salvar imobiliária:', error);
        showAlert(error.message || 'Não foi possível salvar a imobiliária.', 'error');
    }
}

/**
 * Renderiza o modal de confirmação de exclusão da imobiliária.
 * Portado de 'imobiliarias.js'.
 */
function renderConfirmDeleteImobiliariaModal(id, nome) {
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
            renderGrupoDetails(currentGrupoData.grupo_id); // Recarrega
        } catch (error) {
            console.error('Erro ao excluir imobiliária:', error);
            showAlert(error.message || 'Não foi possível excluir a imobiliária.', 'error');
        }
    });
}


// --- Funções da Aba "Resumo Mensal" ---

/**
 * Renderiza o conteúdo inicial da aba "Resumo Mensal" (seletor de data).
 * @param {HTMLElement} container - O elemento container da aba.
 * @param {string} grupoId - O ID do grupo.
 */
function renderResumoMensalTab(container, grupoId) {
    const today = new Date().toISOString().slice(0, 7); // YYYY-MM
    const tabHTML = `
        <div class="bg-gray-800/50 p-4 rounded-lg neon-border">
            <h3 class="text-lg font-bold text-white mb-4">Selecionar Resumo Mensal</h3>
            <div class="flex flex-col sm:flex-row items-center gap-4">
                <input type="month" id="resumo-month-input" class="w-full sm:w-auto bg-gray-700 rounded p-2 border border-gray-600" value="${today}">
                <button id="search-resumo-btn" class="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition">
                    Buscar Resumo
                </button>
            </div>
        </div>
        <div id="resumo-content-container" class="mt-6">
            <!-- O conteúdo do resumo (chat/docs) será carregado aqui -->
        </div>
    `;
    container.innerHTML = tabHTML;

    container.querySelector('#search-resumo-btn').addEventListener('click', () => {
        const monthInput = container.querySelector('#resumo-month-input').value;
        const [ano, mes] = monthInput.split('-');
        handleResumoSearch(grupoId, parseInt(mes), parseInt(ano));
    });
}

/**
 * Busca e renderiza o conteúdo do resumo mensal (Chat e Documentos).
 * @param {string} grupoId
 * @param {number} mes
 * @param {number} ano
 */
async function handleResumoSearch(grupoId, mes, ano) {
    const container = document.getElementById('resumo-content-container');
    container.innerHTML = `<p class="text-center text-gray-400">Buscando resumo...</p>`;
    
    try {
        const infoStatus = await api.getInfoMensal(mes, ano, grupoId);
        
        let statusText, statusColor;
        if (infoStatus.accepted) {
            statusText = "Relatório Aprovado"; statusColor = "text-emerald-400";
        } else {
            statusText = "Aguardando Aprovação / Ajustes"; statusColor = "text-yellow-400";
        }

        const resumoHTML = `
            <div class="bg-gray-800/50 p-4 rounded-lg neon-border">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                    <div>
                        <h3 class="text-xl font-bold text-purple-300">Acompanhamento (Mês ${mes}/${ano})</h3>
                        <p class="text-2xl font-bold text-white mt-1">${formatCurrency(infoStatus.total)}</p>
                    </div>
                    <span class="font-bold ${statusColor} text-right">${statusText}</span>
                </div>

                <!-- Sub-Abas (Chat / Documentos) -->
                <div class="border-b border-gray-700/50 mb-4 overflow-x-auto">
                    <nav class="flex space-x-2 sm:space-x-4 -mb-px" id="info-tabs" role="tablist">
                        <button data-tab="chat" class="tab-btn active" role="tab">Chat</button>
                        <button data-tab="documentos" class="tab-btn" role="tab">Documentos</button>
                    </nav>
                </div>
                
                <div id="tab-content-chat" class="tab-content" role="tabpanel"></div>
                <div id="tab-content-documentos" class="tab-content hidden" role="tabpanel"></div>
            </div>
        `;
        container.innerHTML = resumoHTML;

        // Adiciona listeners para as sub-abas
        document.getElementById('info-tabs').addEventListener('click', (e) => {
            const target = e.target.closest('.tab-btn');
            if (!target) return;
            const tabId = target.dataset.tab;
            
            document.querySelectorAll('#info-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            
            document.querySelectorAll('#resumo-content-container .tab-content').forEach(c => c.classList.add('hidden'));
            const contentDiv = document.getElementById(`tab-content-${tabId}`);
            contentDiv.classList.remove('hidden');

            // Carrega dinamicamente se for o primeiro clique
            if (contentDiv.innerHTML === "") {
                if (tabId === 'chat') {
                    renderInfoMensalChat(infoStatus, 'tab-content-chat');
                } else if (tabId === 'documentos') {
                    renderInfoMensalDocumentos(infoStatus, 'tab-content-documentos');
                }
            }
        });

        // Carrega a primeira sub-aba (Chat)
        renderInfoMensalChat(infoStatus, 'tab-content-chat');

    } catch (error) {
        if (error.message.includes('404')) {
            container.innerHTML = `<p class="text-center text-gray-400">Nenhum resumo mensal encontrado para ${mes}/${ano}.</p>`;
        } else {
            container.innerHTML = `<p class="text-center text-red-400">${error.message}</p>`;
        }
    }
}

/**
 * Renderiza o Chat do Resumo Mensal (adaptado de agenda.js)
 * @param {object} infoStatus - O objeto de status vindo da API.
 * @param {string} containerId - O ID do container da aba.
 */
async function renderInfoMensalChat(infoStatus, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const remetente = "admin";
    const comentariosHTML = infoStatus.mensagens.map(c => `
        <div class="p-3 rounded-lg ${c.remetente === remetente ? 'bg-purple-900/50 ml-auto' : 'bg-gray-700/50 mr-auto'}" style="max-width: 80%;">
            <p class="text-sm text-gray-200 whitespace-pre-wrap">${sanitizeHTML(c.conteudo)}</p>
            <p class="text-xs text-gray-400 text-right mt-1 capitalize">${sanitizeHTML(c.remetente)} - ${new Date(c.created_at).toLocaleString('pt-BR')}</p>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="space-y-3 max-h-64 overflow-y-auto mb-4 p-2 bg-gray-900/50 rounded-lg custom-scrollbar">${comentariosHTML || '<p class="text-gray-400 text-center">Nenhuma mensagem ainda.</p>'}</div>
        <div class="flex flex-col sm:flex-row gap-2">
            <textarea id="info-mural-textarea" rows="2" class="w-full p-2 bg-gray-700/50 border border-gray-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="Escreva seu comentário..."></textarea>
            <button id="info-mural-submit-btn" class="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors">Enviar</button>
        </div>
        <div id="info-mural-error" class="text-red-400 text-sm mt-2 hidden"></div>
    `;

    container.querySelector('#info-mural-submit-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const textarea = container.querySelector('#info-mural-textarea');
        const errorDiv = container.querySelector('#info-mural-error');
        const comentario = textarea.value.trim();
        
        if (comentario) {
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            try {
                await api.postInfoMensalMensagem(infoStatus.id, comentario);
                // CORREÇÃO: Usar o 'currentGrupoData.grupo_id' cacheado em vez de '...detalhes.id'
                const novoInfoStatus = await api.getInfoMensal(infoStatus.month, infoStatus.year, currentGrupoData.grupo_id);
                renderInfoMensalChat(novoInfoStatus, containerId); 
            } catch (e) { 
                errorDiv.textContent = e.message;
                errorDiv.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Enviar';
            }
        }
    });
}

/**
 * Renderiza os Documentos do Resumo Mensal (adaptado de agenda.js)
 * @param {object} infoStatus - O objeto de status vindo da API.
 * @param {string} containerId - O ID do container da aba.
 */
async function renderInfoMensalDocumentos(infoStatus, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const documentosHTML = infoStatus.documentos.map(d => `
        <div class="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
            <a href="${d.link}" target="_blank" class="text-cyan-400 hover:underline truncate" title="${sanitizeHTML(d.file_path)}">
                <svg class="h-5 w-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                ${sanitizeHTML(d.file_path)}
            </a>
            <button class="info-delete-doc-btn text-red-500 hover:text-red-400" data-doc-id="${d.id}" aria-label="Deletar ${sanitizeHTML(d.file_path)}">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="space-y-3 max-h-64 overflow-y-auto mb-4 p-2 bg-gray-900/50 rounded-lg custom-scrollbar">${documentosHTML || '<p class="text-gray-400 text-center">Nenhum documento anexado.</p>'}</div>
        <form id="info-doc-upload-form" class="flex flex-col sm:flex-row gap-2">
            <input type="file" name="file" required class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600/50 file:text-purple-100 hover:file:bg-purple-600 transition-colors">
            <input type="hidden" name="id_info" value="${infoStatus.id}">
            <button type="submit" class="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors">Anexar</button>
        </form>
        <div id="info-doc-error" class="text-red-400 text-sm mt-2 hidden"></div>
    `;

    container.querySelector('#info-doc-upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector('button[type="submit"]');
        const input = form.querySelector('input[type="file"]');
        const errorDiv = container.querySelector('#info-doc-error');
        
        if (input.files.length > 0) {
            const formData = new FormData(form);
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            try {
                await api.postInfoMensalDocumento(formData);
                // CORREÇÃO: Usar o 'currentGrupoData.grupo_id' cacheado em vez de '...detalhes.id'
                const novoInfoStatus = await api.getInfoMensal(infoStatus.month, infoStatus.year, currentGrupoData.grupo_id);
                renderInfoMensalDocumentos(novoInfoStatus, containerId); // Recarrega
            } catch (e) { 
                errorDiv.textContent = e.message;
                errorDiv.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Anexar';
            }
        } else {
            errorDiv.textContent = 'Por favor, selecione um arquivo.';
            errorDiv.classList.remove('hidden');
        }
    });

    // INÍCIO DA CORREÇÃO: Substituir confirm() por modal customizado
    container.querySelectorAll('.info-delete-doc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { // Removido async
            const docId = e.currentTarget.dataset.docId;
            const fileName = e.currentTarget.closest('.flex').querySelector('a').title || 'este documento';

            // 1. Cria o HTML do modal de confirmação
            const modalHTML = `
                <h2 class="text-2xl font-bold text-red-400 mb-4">Confirmar Exclusão</h2>
                <p class="text-gray-300 mb-2">Tem certeza que deseja excluir o documento:</p>
                <p class="text-gray-100 font-medium mb-6 truncate" title="${sanitizeHTML(fileName)}">${sanitizeHTML(fileName)}</p>
                <p class="text-sm text-gray-400 mt-2">Esta ação não pode ser desfeita.</p>
                <div id="delete-doc-error" class="text-red-400 text-sm hidden mt-2"></div>
                <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
                    <button type="button" id="cancel-delete-doc-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
                    <button type="button" id="confirm-delete-doc-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 transition-all">Sim, Excluir</button>
                </div>
            `;
            
            // 2. Exibe o modal
            showModal(modalHTML, 'max-w-md');

            // 3. Adiciona listeners ao modal
            document.getElementById('cancel-delete-doc-btn').onclick = hideModal;
            
            document.getElementById('confirm-delete-doc-btn').onclick = async () => {
                const deleteBtn = document.getElementById('confirm-delete-doc-btn');
                const errorDivModal = document.getElementById('delete-doc-error');
                deleteBtn.disabled = true;
                deleteBtn.textContent = 'Excluindo...';
                errorDivModal.classList.add('hidden');

                try {
                    await api.deleteInfoMensalDocumento(docId);
                    showAlert('Documento excluído com sucesso!');
                    hideModal();
                    // Recarrega a aba de documentos
                    const novoInfoStatus = await api.getInfoMensal(infoStatus.month, infoStatus.year, currentGrupoData.grupo_id);
                    renderInfoMensalDocumentos(novoInfoStatus, containerId); // Recarrega
                } catch (e) { 
                    // Exibe o erro dentro do modal
                    errorDivModal.textContent = e.message;
                    errorDivModal.classList.remove('hidden');
                    deleteBtn.disabled = false;
                    deleteBtn.textContent = 'Sim, Excluir';
                }
            };
        });
    });
    // FIM DA CORREÇÃO
}
// --- FIM DA PARTE 4 ---

