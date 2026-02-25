// /assets/modules/improdutivas.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

let improdutivasCache = null; // Cache para evitar re-fetch desnecessário

/**
 * Função principal para inicializar o módulo de improdutivas.
 */
export async function initImprodutivas() {
    const pageHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 class="text-3xl font-bold text-cyan-300">Gestão de Improdutivas</h1>
                <p class="text-gray-400 mt-1 text-sm">Controle de vistorias não realizadas e cobranças de deslocamento.</p>
            </div>
            <button id="refresh-btn" class="bg-gray-800 border border-gray-700 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-lg flex items-center gap-2">
                <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Atualizar Lista
            </button>
        </div>
        
        <div class="bg-gray-800/80 rounded-xl border border-gray-700 shadow-xl overflow-hidden backdrop-blur-sm">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-gray-900/80 border-b border-gray-700">
                        <tr>
                            <th class="p-4 text-sm font-semibold text-gray-300 whitespace-nowrap">Data Original</th>
                            <th class="p-4 text-sm font-semibold text-gray-300 whitespace-nowrap">Cód. Imóvel</th>
                            <th class="p-4 text-sm font-semibold text-gray-300 whitespace-nowrap">Imobiliária</th>
                            <th class="p-4 text-sm font-semibold text-gray-300 whitespace-nowrap">Motivo da Improdutividade</th>
                            <th class="p-4 text-sm font-semibold text-gray-300 whitespace-nowrap">Valores (Cobrança / Comissão)</th>
                            <th class="p-4 text-center text-sm font-semibold text-gray-300">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="improdutivas-table-body" class="divide-y divide-gray-700/50">
                        <tr><td colspan="6" class="text-center py-12 text-gray-500 flex justify-center items-center gap-3">
                            <svg class="animate-spin w-5 h-5 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Carregando registros...
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Paginação Simples (Carregar Mais) -->
        <div class="flex justify-center mt-8 mb-6">
            <button id="load-more-btn" class="hidden px-6 py-2.5 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-cyan-300 font-medium rounded-lg transition-colors shadow-md">Carregar Mais Registros</button>
        </div>
    `;
    renderPageContent(pageHTML);

    document.getElementById('refresh-btn').addEventListener('click', () => refreshImprodutivasList(0, 50, true));
    document.getElementById('load-more-btn').addEventListener('click', handleLoadMore);

    // Carrega a primeira página
    await refreshImprodutivasList();
}

// Variáveis de controle de paginação
let currentSkip = 0;
const LIMIT = 50;

async function refreshImprodutivasList(skip = 0, limit = LIMIT, reset = false) {
    const tableBody = document.getElementById('improdutivas-table-body');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    if (reset) {
        currentSkip = 0;
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-500 flex justify-center items-center gap-3">
            <svg class="animate-spin w-5 h-5 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Atualizando...
        </td></tr>`;
        improdutivasCache = [];
    }

    try {
        const data = await api.getImprodutivas(skip, limit);
        
        if (reset || skip === 0) {
            improdutivasCache = data;
            tableBody.innerHTML = ''; 
        } else {
            improdutivasCache = [...improdutivasCache, ...data];
        }

        if (data.length === 0 && (reset || skip === 0)) {
            tableBody.innerHTML = `
                <tr><td colspan="6" class="text-center py-16">
                    <div class="flex flex-col items-center justify-center text-gray-500">
                        <svg class="w-12 h-12 mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <p class="text-lg">Nenhuma vistoria improdutiva encontrada.</p>
                    </div>
                </td></tr>`;
            loadMoreBtn.classList.add('hidden');
            return;
        }

        // Renderiza as linhas
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-700/30 transition-colors group';
            tr.innerHTML = `
                <td class="p-4 text-sm text-gray-300">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        ${new Date(item.data_vistoria_original).toLocaleDateString('pt-BR')}
                    </div>
                </td>
                <td class="p-4">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-cyan-900/30 text-cyan-300 border border-cyan-800/50">
                        ${sanitizeHTML(item.cod_imovel)}
                    </span>
                </td>
                <td class="p-4 text-sm text-gray-200 font-medium">${sanitizeHTML(item.imobiliaria_nome)}</td>
                <td class="p-4 text-sm text-gray-400">
                    <div class="truncate max-w-xs xl:max-w-md" title="${sanitizeHTML(item.motivo_improdutividade)}">
                        ${sanitizeHTML(item.motivo_improdutividade)}
                    </div>
                </td>
                <td class="p-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-xs text-gray-500 flex items-center justify-between w-32">Cobrança: <strong class="text-green-400 font-mono">R$ ${item.valor_cobranca.toFixed(2)}</strong></span>
                        <span class="text-xs text-gray-500 flex items-center justify-between w-32">Comissão: <strong class="text-yellow-400 font-mono">R$ ${item.valor_para_vistoriador.toFixed(2)}</strong></span>
                    </div>
                </td>
                <td class="p-4">
                    <div class="flex items-center justify-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button class="edit-improdutiva-btn p-2 bg-gray-800 hover:bg-cyan-900/40 text-cyan-400 border border-gray-700 hover:border-cyan-800 rounded-lg transition-all" data-id="${item.id}" title="Editar Valores/Motivo">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                        </button>
                        <button class="revert-improdutiva-btn p-2 bg-gray-800 hover:bg-amber-900/40 text-amber-400 border border-gray-700 hover:border-amber-800 rounded-lg transition-all" data-id="${item.id}" title="Reverter para a Agenda">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Configura os botões de edição
        document.querySelectorAll('.edit-improdutiva-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const item = improdutivasCache.find(i => i.id === id);
                renderEditModal(item);
            });
        });

        // Configura os botões de reversão
        document.querySelectorAll('.revert-improdutiva-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const item = improdutivasCache.find(i => i.id === id);
                renderRevertModal(item);
            });
        });

        // Controle do botão "Carregar Mais"
        if (data.length < limit) {
            loadMoreBtn.classList.add('hidden');
        } else {
            loadMoreBtn.classList.remove('hidden');
        }

    } catch (error) {
        showAlert('Erro ao carregar improdutivas.', 'error');
        console.error(error);
        if (reset || skip === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-400">Erro ao carregar os dados. Verifique sua conexão.</td></tr>`;
        }
    }
}

async function handleLoadMore() {
    currentSkip += LIMIT;
    const btn = document.getElementById('load-more-btn');
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin w-4 h-4 inline-block mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Carregando...`;
    
    await refreshImprodutivasList(currentSkip, LIMIT, false);
    
    btn.disabled = false;
    btn.innerHTML = 'Carregar Mais Registros';
}

/**
 * Renderiza o modal de edição de improdutiva.
 */
function renderEditModal(item) {
    const modalHTML = `
        <div class="flex items-center gap-3 mb-6">
            <div class="p-3 bg-cyan-500/20 text-cyan-400 rounded-lg">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </div>
            <h2 class="text-2xl font-bold text-cyan-300">Editar Improdutiva</h2>
        </div>
        
        <div class="mb-5 text-sm text-gray-300 bg-gray-800/80 border border-gray-700 p-4 rounded-xl shadow-inner">
            <div class="grid grid-cols-2 gap-2">
                <p><span class="text-gray-500">Imóvel:</span> <br/><strong class="text-cyan-300 font-mono">${sanitizeHTML(item.cod_imovel)}</strong></p>
                <p><span class="text-gray-500">Data Original:</span> <br/><strong class="text-white">${new Date(item.data_vistoria_original).toLocaleDateString('pt-BR')}</strong></p>
                <p class="col-span-2 mt-2"><span class="text-gray-500">Imobiliária:</span> <br/><strong class="text-white">${sanitizeHTML(item.imobiliaria_nome)}</strong></p>
            </div>
        </div>

        <form id="form-edit-improdutiva" class="space-y-4">
            <input type="hidden" id="improdutiva-id" value="${item.id}">
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label for="valor_cobranca" class="block text-sm font-medium text-gray-300 mb-1">Cobrança (R$)</label>
                    <input type="number" step="0.01" id="valor_cobranca" required class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white font-mono focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all" value="${item.valor_cobranca}">
                </div>

                <div>
                    <label for="valor_para_vistoriador" class="block text-sm font-medium text-gray-300 mb-1">Comissão (R$)</label>
                    <input type="number" step="0.01" id="valor_para_vistoriador" required class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white font-mono focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all" value="${item.valor_para_vistoriador}">
                </div>
            </div>

            <div>
                <label for="motivo_improdutividade" class="block text-sm font-medium text-gray-300 mb-1">Motivo / Justificativa</label>
                <textarea id="motivo_improdutividade" rows="3" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all">${sanitizeHTML(item.motivo_improdutividade)}</textarea>
            </div>

            <div class="flex justify-end gap-3 pt-5 border-t border-gray-800 mt-6">
                <button type="button" id="cancel-edit-btn" class="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors">Cancelar</button>
                <button type="submit" class="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-cyan-900/20">Salvar Alterações</button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-edit-btn').addEventListener('click', hideModal);
    document.getElementById('form-edit-improdutiva').addEventListener('submit', handleUpdateSubmit);
}

/**
 * Renderiza o modal de reversão da improdutiva para a agenda.
 */
function renderRevertModal(item) {
    const modalHTML = `
        <div class="flex items-center gap-3 mb-6">
            <div class="p-3 bg-amber-500/20 text-amber-400 rounded-lg">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
            </div>
            <h2 class="text-2xl font-bold text-amber-400">Reverter para a Agenda</h2>
        </div>
        
        <p class="text-gray-300 mb-5 text-sm leading-relaxed">
            Esta ação <strong class="text-white">excluirá</strong> este registro de improdutiva e <strong class="text-white">devolverá</strong> o imóvel para o horário original na agenda.
        </p>

        <div class="mb-5 text-sm text-gray-300 bg-gray-800 border border-gray-700 p-4 rounded-xl shadow-inner">
            <div class="grid grid-cols-2 gap-2">
                <p><span class="text-gray-500">Imóvel:</span> <br/><strong class="text-cyan-300 font-mono">${sanitizeHTML(item.cod_imovel)}</strong></p>
                <p><span class="text-gray-500">Data Original:</span> <br/><strong class="text-white">${new Date(item.data_vistoria_original).toLocaleDateString('pt-BR')}</strong></p>
                <p class="col-span-2 mt-2"><span class="text-gray-500">Imobiliária:</span> <br/><strong class="text-white">${sanitizeHTML(item.imobiliaria_nome)}</strong></p>
            </div>
        </div>

        <form id="form-revert-improdutiva" class="space-y-4">
            <input type="hidden" id="revert-improdutiva-id" value="${item.id}">
            
            <div>
                <label for="tipo_vistoria" class="block text-sm font-medium text-gray-300 mb-1">Tipo de Vistoria Original <span class="text-red-400">*</span></label>
                <select id="tipo_vistoria" required class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow">
                    <option value="">Selecione o tipo original...</option>
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                    <option value="CONFERENCIA">Conferência</option>
                    <option value="AVERIGUACAO">Averiguação</option>
                    <option value="COMPLEMENTO_VISITA">Complemento de Visita</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">Necessário para recalcular os valores exatos de cobrança e comissão na agenda.</p>
            </div>

            <div>
                <label for="observacao" class="block text-sm font-medium text-gray-300 mb-1">Observação Interna (Opcional)</label>
                <textarea id="observacao" rows="2" class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow" placeholder="Ex: Revertido após alinhamento com a imobiliária..."></textarea>
            </div>

            <div class="flex justify-end gap-3 pt-5 border-t border-gray-800 mt-6">
                <button type="button" id="cancel-revert-btn" class="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors">Cancelar</button>
                <button type="submit" class="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-amber-900/20 flex items-center gap-2">
                    Confirmar Reversão
                </button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-revert-btn').addEventListener('click', hideModal);
    document.getElementById('form-revert-improdutiva').addEventListener('submit', handleRevertSubmit);
}

/**
 * Lida com o envio do formulário de edição de valores.
 */
async function handleUpdateSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('improdutiva-id').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    const data = {
        valor_cobranca: parseFloat(document.getElementById('valor_cobranca').value),
        valor_para_vistoriador: parseFloat(document.getElementById('valor_para_vistoriador').value),
        motivo_improdutividade: document.getElementById('motivo_improdutividade').value
    };

    try {
        await api.updateImprodutiva(id, data);
        showAlert('Valores atualizados com sucesso!', 'success');
        hideModal();
        
        // Recarrega a lista para garantir consistência
        refreshImprodutivasList(0, LIMIT, true);

    } catch (error) {
        showAlert(error.message || 'Erro ao atualizar.', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * Lida com a reversão de uma improdutiva de volta para a agenda.
 */
async function handleRevertSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('revert-improdutiva-id').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin w-4 h-4 mr-2 inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processando...`;

    const payload = {
        tipo_vistoria: document.getElementById('tipo_vistoria').value,
        observacao: document.getElementById('observacao').value || null
    };

    try {
        await api.reverterImprodutiva(id, payload);
        showAlert('Imóvel devolvido para a agenda original com sucesso!', 'success');
        hideModal();
        
        // Recarrega a lista para remover o registro que acabou de ser revertido
        refreshImprodutivasList(0, LIMIT, true);

    } catch (error) {
        showAlert(error.message || 'Erro ao tentar reverter a vistoria.', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}