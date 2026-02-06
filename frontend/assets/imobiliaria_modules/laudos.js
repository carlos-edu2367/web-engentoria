import { api } from './api-imob.js';
import { showNotification } from './utils.js';

let currentLaudoPage = 1;
let laudoSearchTimer = null;

export const renderLaudosPage = async (container) => {
    // Layout Base (Inspirado no Antigo Front + Modernizações)
    container.innerHTML = `
        <div class="fade-in max-w-7xl mx-auto space-y-6">
            
            <!-- Header e Busca -->
            <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
                <div>
                    <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">
                        Laudos Aprovados
                    </h1>
                    <p class="text-gray-400 text-sm mt-1">Histórico de laudos finalizados e entregues.</p>
                </div>
                
                <div class="relative w-full md:w-80 group">
                    <input type="text" id="laudo-search-input" 
                        placeholder="Buscar por Endereço ou Código..." 
                        class="w-full bg-gray-900/50 border border-gray-700/50 text-gray-200 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all shadow-lg placeholder-gray-500 group-hover:bg-gray-800/50">
                    <svg class="h-5 w-5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                </div>
            </div>
            
            <!-- Container da Lista (Estilo Neon/Glass) -->
            <div class="bg-gray-900/40 border border-gray-700/30 rounded-2xl p-1 backdrop-blur-sm shadow-xl relative overflow-hidden">
                <div class="overflow-x-auto rounded-xl">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-gray-800/60 text-gray-400 text-xs uppercase tracking-wider font-semibold">
                            <tr>
                                <th class="py-4 pl-6">Data Entrega</th>
                                <th class="py-4 px-4">Imóvel</th>
                                <th class="py-4 px-4">Código</th>
                                <th class="py-4 pr-6 text-right">Documento</th>
                            </tr>
                        </thead>
                        <tbody id="laudos-list-body" class="text-gray-300 divide-y divide-gray-800/50">
                            <!-- Conteúdo injetado via JS -->
                        </tbody>
                    </table>
                </div>
                
                <!-- Loading Overlay -->
                <div id="laudos-loading" class="hidden absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                    <div class="flex flex-col items-center">
                        <div class="h-8 w-8 border-t-2 border-b-2 border-cyan-400 rounded-full animate-spin mb-2"></div>
                        <span class="text-cyan-400 text-sm font-medium">Carregando...</span>
                    </div>
                </div>
            </div>
            
            <!-- Paginação -->
            <div id="laudos-pagination" class="flex justify-center items-center gap-3 pt-2">
                <button id="prev-page-btn" class="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <span id="page-indicator" class="px-4 py-2 bg-gray-800/50 border border-gray-700/50 text-cyan-400 rounded-lg font-mono font-bold text-sm shadow-inner min-w-[3rem] text-center">1</span>
                <button id="next-page-btn" class="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
            </div>
        </div>
    `;

    // Event Listeners
    setupEventListeners();

    // Carregamento Inicial
    currentLaudoPage = 1;
    await fetchAndDisplayLaudos();
};

function setupEventListeners() {
    const searchInput = document.getElementById('laudo-search-input');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const listBody = document.getElementById('laudos-list-body');

    // Busca com Debounce
    searchInput.addEventListener('input', (e) => {
        clearTimeout(laudoSearchTimer);
        laudoSearchTimer = setTimeout(() => {
            currentLaudoPage = 1; // Reseta paginação ao buscar
            fetchAndDisplayLaudos(e.target.value);
        }, 500);
    });

    // Paginação
    prevBtn.addEventListener('click', () => {
        if (currentLaudoPage > 1) {
            currentLaudoPage--;
            fetchAndDisplayLaudos(searchInput.value);
        }
    });

    nextBtn.addEventListener('click', () => {
        currentLaudoPage++;
        fetchAndDisplayLaudos(searchInput.value);
    });

    // Delegação de Eventos para Botão de Visualizar PDF
    listBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.view-pdf-btn');
        if (btn) {
            const id = btn.dataset.id;
            await handleViewPDF(id, btn);
        }
    });
}

async function fetchAndDisplayLaudos(searchTerm = '') {
    const tbody = document.getElementById('laudos-list-body');
    const loading = document.getElementById('laudos-loading');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const pageIndicator = document.getElementById('page-indicator');

    // UI Updates
    loading.classList.remove('hidden');
    pageIndicator.textContent = currentLaudoPage;
    prevBtn.disabled = currentLaudoPage === 1;
    
    // Se for uma nova busca, limpa a tabela visualmente antes
    if(currentLaudoPage === 1 && searchTerm) tbody.innerHTML = '';

    try {
        const response = await api.getLaudos(currentLaudoPage, searchTerm);
        const laudos = response.laudos || [];
        
        // Lógica simples de paginação (assumindo 10 itens por página)
        nextBtn.disabled = laudos.length < 10; 

        if (laudos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-12 text-center">
                        <div class="flex flex-col items-center justify-center text-gray-500">
                            <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            <p class="text-lg font-medium">Nenhum laudo encontrado.</p>
                            ${searchTerm ? `<p class="text-sm mt-1">Nenhum resultado para "${searchTerm}"</p>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = laudos.map(l => `
                <tr class="hover:bg-gray-800/40 transition-colors group border-b border-gray-800/50 last:border-0">
                    <td class="py-4 pl-6 font-mono text-sm text-emerald-400">
                        ${new Date(l.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td class="py-4 px-4 font-medium text-gray-200">
                        ${l.endereco}
                    </td>
                    <td class="py-4 px-4 text-sm text-gray-500 font-mono">
                        ${l.cod_imovel}
                    </td>
                    <td class="py-4 pr-6 text-right">
                        <button data-id="${l.id}" 
                            class="view-pdf-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all shadow-lg shadow-blue-900/0 hover:shadow-blue-900/30">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            <span class="hidden sm:inline">Visualizar</span>
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
                    <p class="text-xs text-red-500 mt-1">${error.message}</p>
                </td>
            </tr>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

async function handleViewPDF(id, btnElement) {
    // Feedback visual no botão
    const originalContent = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = `<div class="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>`;

    try {
        showNotification('Obtendo documento seguro...', 'info');
        const detalhes = await api.getLaudoDetalhes(id);
        
        if (detalhes.documento) {
            window.open(detalhes.documento, '_blank');
            showNotification('Documento aberto em nova aba.', 'success');
        } else {
            showNotification('Link do documento indisponível.', 'warning');
        }
    } catch (e) {
        console.error(e);
        showNotification('Erro ao abrir laudo: ' + e.message, 'error');
    } finally {
        // Restaura botão
        btnElement.innerHTML = originalContent;
        btnElement.disabled = false;
    }
}