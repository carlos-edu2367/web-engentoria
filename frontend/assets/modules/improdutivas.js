// /assets/modules/improdutivas.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

let improdutivasCache = null; // Cache para evitar re-fetch desnecessário se implementarmos paginação local

/**
 * Função principal para inicializar o módulo de improdutivas.
 */
export async function initImprodutivas() {
    const pageHTML = `
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-cyan-300">Gestão de Vistorias Improdutivas</h1>
            <button id="refresh-btn" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Atualizar
            </button>
        </div>
        
        <div class="bg-gray-800/50 rounded-xl neon-border overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-gray-900/50">
                        <tr>
                            <th class="p-4 whitespace-nowrap">Data Original</th>
                            <th class="p-4 whitespace-nowrap">Cód. Imóvel</th>
                            <th class="p-4 whitespace-nowrap">Imobiliária</th>
                            <th class="p-4 whitespace-nowrap">Motivo</th>
                            <th class="p-4 whitespace-nowrap">Valor Cobrança</th>
                            <th class="p-4 whitespace-nowrap">Valor Vistoriador</th>
                            <th class="p-4 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="improdutivas-table-body">
                        <tr><td colspan="7" class="text-center py-8 text-gray-500">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Paginação Simples (Carregar Mais) -->
        <div class="flex justify-center mt-6">
            <button id="load-more-btn" class="hidden px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition">Carregar Mais</button>
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

async function refreshImprodutivasList(skip = 0, limit = 50, reset = false) {
    const tableBody = document.getElementById('improdutivas-table-body');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    if (reset) {
        currentSkip = 0;
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Atualizando...</td></tr>';
        improdutivasCache = [];
    }

    try {
        const data = await api.getImprodutivas(skip, limit);
        
        if (reset || skip === 0) {
            improdutivasCache = data;
            tableBody.innerHTML = ''; // Limpa se for a primeira carga ou reset
        } else {
            improdutivasCache = [...improdutivasCache, ...data];
        }

        if (data.length === 0 && (reset || skip === 0)) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Nenhuma vistoria improdutiva encontrada.</td></tr>';
            loadMoreBtn.classList.add('hidden');
            return;
        }

        // Renderiza as linhas
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-700 hover:bg-gray-800/50 transition-colors';
            tr.innerHTML = `
                <td class="p-4 text-sm text-gray-300">${new Date(item.data_vistoria_original).toLocaleDateString('pt-BR')}</td>
                <td class="p-4 font-mono text-cyan-300 text-sm">${sanitizeHTML(item.cod_imovel)}</td>
                <td class="p-4 text-sm">${sanitizeHTML(item.imobiliaria_nome)}</td>
                <td class="p-4 text-sm truncate max-w-xs" title="${sanitizeHTML(item.motivo_improdutividade)}">${sanitizeHTML(item.motivo_improdutividade)}</td>
                <td class="p-4 font-mono text-green-400 text-sm">R$ ${item.valor_cobranca.toFixed(2)}</td>
                <td class="p-4 font-mono text-yellow-400 text-sm">R$ ${item.valor_para_vistoriador.toFixed(2)}</td>
                <td class="p-4 text-center">
                    <button class="edit-improdutiva-btn p-2 text-cyan-400 hover:text-cyan-300 transition" data-id="${item.id}" title="Editar Valores/Motivo">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Configura os botões de edição desta leva
        document.querySelectorAll('.edit-improdutiva-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const item = improdutivasCache.find(i => i.id === id);
                renderEditModal(item);
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
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Erro ao carregar dados.</td></tr>';
        }
    }
}

async function handleLoadMore() {
    currentSkip += LIMIT;
    const btn = document.getElementById('load-more-btn');
    btn.disabled = true;
    btn.textContent = 'Carregando...';
    
    await refreshImprodutivasList(currentSkip, LIMIT, false);
    
    btn.disabled = false;
    btn.textContent = 'Carregar Mais';
}

/**
 * Renderiza o modal de edição de improdutiva.
 * @param {object} item - O objeto da improdutiva.
 */
function renderEditModal(item) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-cyan-300 mb-6">Editar Vistoria Improdutiva</h2>
        
        <div class="mb-4 text-sm text-gray-400 bg-gray-900/50 p-3 rounded-lg">
            <p><strong>Imóvel:</strong> ${sanitizeHTML(item.cod_imovel)}</p>
            <p><strong>Data Original:</strong> ${new Date(item.data_vistoria_original).toLocaleDateString('pt-BR')}</p>
            <p><strong>Imobiliária:</strong> ${sanitizeHTML(item.imobiliaria_nome)}</p>
        </div>

        <form id="form-edit-improdutiva" class="space-y-4">
            <input type="hidden" id="improdutiva-id" value="${item.id}">
            
            <div>
                <label for="valor_cobranca" class="block text-sm font-medium text-gray-300 mb-1">Valor Cobrança (R$)</label>
                <input type="number" step="0.01" id="valor_cobranca" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400" value="${item.valor_cobranca}">
                <p class="text-xs text-gray-500 mt-1">Valor que será cobrado da imobiliária.</p>
            </div>

            <div>
                <label for="valor_para_vistoriador" class="block text-sm font-medium text-gray-300 mb-1">Valor para Vistoriador (R$)</label>
                <input type="number" step="0.01" id="valor_para_vistoriador" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400" value="${item.valor_para_vistoriador}">
                <p class="text-xs text-gray-500 mt-1">Comissão fixa a ser paga ao vistoriador.</p>
            </div>

            <div>
                <label for="motivo_improdutividade" class="block text-sm font-medium text-gray-300 mb-1">Motivo</label>
                <textarea id="motivo_improdutividade" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400">${sanitizeHTML(item.motivo_improdutividade)}</textarea>
            </div>

            <div class="flex justify-end gap-4 pt-4">
                <button type="button" id="cancel-edit-btn" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition">Salvar Alterações</button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-edit-btn').addEventListener('click', hideModal);
    document.getElementById('form-edit-improdutiva').addEventListener('submit', handleUpdateSubmit);
}

/**
 * Lida com o envio do formulário de edição.
 */
async function handleUpdateSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('improdutiva-id').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const data = {
        valor_cobranca: parseFloat(document.getElementById('valor_cobranca').value),
        valor_para_vistoriador: parseFloat(document.getElementById('valor_para_vistoriador').value),
        motivo_improdutividade: document.getElementById('motivo_improdutividade').value
    };

    try {
        await api.updateImprodutiva(id, data);
        showAlert('Atualizado com sucesso!', 'success');
        hideModal();
        
        // Atualiza a lista localmente para refletir a mudança sem recarregar tudo
        // ou recarrega a lista para garantir consistência. Vamos recarregar a lista atual (reset).
        refreshImprodutivasList(0, 50, true);

    } catch (error) {
        showAlert(error.message || 'Erro ao atualizar.', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}