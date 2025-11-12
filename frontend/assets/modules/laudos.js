import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

/**
 * Função principal para inicializar o módulo de Laudos.
 * Verifica se deve mostrar a lista ou um detalhe específico.
 */
export async function initLaudos() {
    // Verifica se há um ID de laudo na URL (ex: #laudos?view=UUID)
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const laudoId = params.get('view');

    if (laudoId) {
        await renderLaudoDetails(laudoId);
    } else {
        await renderLaudosPendentesList();
    }
}

/**
 * Busca e renderiza a lista de laudos pendentes de análise.
 */
async function renderLaudosPendentesList() {
    const pageHTML = `
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-cyan-300">Laudos Pendentes de Análise</h1>
        </div>
        <div id="laudos-pendentes-list" class="space-y-4">
            <p class="text-center text-gray-400">Carregando laudos...</p>
        </div>
    `;
    renderPageContent(pageHTML);

    const listContainer = document.getElementById('laudos-pendentes-list');
    try {
        const data = await api.getLaudosPendentes();
        if (data.laudos.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-gray-400 bg-gray-800/50 p-6 rounded-xl neon-border">Nenhum laudo pendente de análise no momento.</p>';
            return;
        }

        listContainer.innerHTML = data.laudos.map(laudo => `
            <div class="bg-gray-800/50 rounded-xl neon-border p-4 flex flex-col sm:flex-row justify-between items-center gap-4 hover:bg-gray-800 transition-colors">
                <div>
                    <p class="font-bold text-white text-lg">Cód. Imóvel: ${sanitizeHTML(laudo.cod_imovel)}</p>
                    <p class="text-sm text-gray-400">${sanitizeHTML(laudo.imobiliaria)}</p>
                    <p class="text-xs text-gray-500 mt-1">Enviado em: ${new Date(laudo.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <button class="view-laudo-btn w-full sm:w-auto px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition" data-id="${laudo.id}">
                    Analisar Laudo
                </button>
            </div>
        `).join('');

        listContainer.querySelectorAll('.view-laudo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const laudoId = e.currentTarget.dataset.id;
                // Navega para a visualização de detalhes
                window.location.hash = `#laudos?view=${laudoId}`;
            });
        });

    } catch (error) {
        showAlert(error.message || 'Erro ao buscar laudos pendentes.', 'error');
        listContainer.innerHTML = `<p class="text-center text-red-400">${error.message}</p>`;
    }
}

/**
 * Renderiza a visualização de detalhes de um laudo (estilo "PDF").
 * @param {string} laudoId - O ID do laudo a ser visualizado.
 */
async function renderLaudoDetails(laudoId) {
    const pageHTML = `
        <button id="back-to-laudos-list" class="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition mb-6">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            Voltar para Lista
        </button>
        <div id="laudo-viewer-container" class="max-w-4xl mx-auto">
            <p class="text-center text-gray-400 text-lg p-8">Carregando detalhes do laudo...</p>
        </div>
    `;
    renderPageContent(pageHTML);

    document.getElementById('back-to-laudos-list').addEventListener('click', () => {
        window.location.hash = '#laudos';
    });

    const viewerContainer = document.getElementById('laudo-viewer-container');
    try {
        const data = await api.getLaudoDetails(laudoId);

        const obsHTML = data.obs ? `
            <div class="mb-6 p-4 bg-yellow-900/50 border border-yellow-700/50 rounded-lg">
                <h4 class="font-bold text-yellow-300 mb-2">Observações de Recusa</h4>
                <p class="text-yellow-200 whitespace-pre-wrap">${sanitizeHTML(data.obs)}</p>
            </div>
        ` : '';

        // *** NOVO: Bloco de HTML para o Laudo Anexado ***
        // (Assume-se que 'api.getLaudoDetails' agora retorna o campo 'documento')
        const pdfHTML = data.documento ? `
            <div class="mb-6 p-4 bg-gray-900/50 border border-cyan-700/50 rounded-lg">
                <h4 class="font-bold text-cyan-300 mb-3">Laudo Anexado (PDF/DOCX)</h4>
                <p class="text-sm text-gray-400 mb-4">Este é o arquivo enviado pelo vistoriador. Use-o como base para aprovar ou recusar o laudo.</p>
                <a href="${data.documento}" target="_blank" class="w-full sm:w-auto inline-block px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg transition-transform transform hover:scale-105">
                    <svg class="w-5 h-5 inline-block -mt-1 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    Abrir Laudo Anexado
                </a>
            </div>
        ` : `
            <div class="mb-6 p-4 bg-gray-700/50 border border-gray-600/50 rounded-lg">
                <h4 class="font-bold text-gray-400 mb-2">Laudo Anexado (PDF/DOCX)</h4>
                <p class="text-sm text-gray-500">Nenhum laudo (PDF ou DOCX) foi anexado pelo vistoriador.</p>
            </div>
        `;
        // *** FIM DO NOVO BLOCO ***

        const actionsHTML = `
            <div class="flex flex-col sm:flex-row justify-center gap-4 p-4 sticky bottom-4 z-20">
                <button id="btn-recusar-laudo" data-id="${data.id}" class="w-full sm:w-auto px-8 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg shadow-lg transition-transform transform hover:scale-105">
                    Recusar Laudo
                </button>
                <button id="btn-aprovar-laudo" data-id="${data.id}" class="w-full sm:w-auto px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg transition-transform transform hover:scale-105">
                    Aprovar Laudo
                </button>
            </div>
        `;

        viewerContainer.innerHTML = `
            <!-- 1. Cabeçalho -->
            <div class="laudo-header p-6 rounded-t-xl neon-border border-b-0">
                <h2 class="text-3xl font-bold text-cyan-300">Laudo de Vistoria</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm">
                    <p><strong>Cód. Imóvel:</strong> ${sanitizeHTML(data.codigo_imovel)}</p>
                    <p><strong>Imobiliária:</strong> ${sanitizeHTML(data.nome_imobiliaria)}</p>
                    <p><strong>Vistoriador:</strong> ${sanitizeHTML(data.nome_vistoriador)}</p>
                    <p><strong>Data:</strong> ${new Date(data.created_at).toLocaleDateString('pt-BR')}</p>
                    <p><strong>Finalizado:</strong> ${data.finalizado ? 'Sim' : 'Não'}</p>
                    <p><strong>Aprovado:</strong> ${data.aprovado ? 'Sim' : 'Não'}</p>
                </div>
            </div>

            <!-- 2. Corpo do Laudo -->
            <div class="bg-gray-800/80 p-6 rounded-b-xl neon-border border-t-0">
                ${obsHTML}
                ${pdfHTML} <!-- <<< ADICIONADO AQUI -->
                <h3 class="text-2xl font-bold text-white mb-6 border-b border-gray-700/50 pb-2">Itens Vistoriados</h3>
                <div id="categorias-container" class="space-y-4">
                    ${data.categorias.map(cat => `
                        <details class="laudo-categoria bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50" data-categoria-id="${cat.id}" data-loaded="false">
                            <summary class="p-4 cursor-pointer flex justify-between items-center">
                                <span class="text-lg font-bold text-cyan-300">${sanitizeHTML(cat.titulo)}</span>
                                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </summary>
                            <div class="categoria-content-loader p-6 text-center text-gray-400">
                                Carregando itens...
                            </div>
                        </details>
                    `).join('')}
                </div>
            </div>

            <!-- 3. Ações (Aprovar/Recusar) -->
            ${!data.aprovado ? actionsHTML : ''}
        `;

        // Adiciona listeners
        document.querySelectorAll('.laudo-categoria').forEach(el => {
            el.addEventListener('toggle', handleCategoryToggle);
        });

        if (!data.aprovado) {
            document.getElementById('btn-aprovar-laudo').addEventListener('click', (e) => handleAprovar(e.currentTarget.dataset.id));
            document.getElementById('btn-recusar-laudo').addEventListener('click', (e) => handleRecusar(e.currentTarget.dataset.id));
        }

    } catch (error) {
        showAlert(error.message || 'Erro ao carregar detalhes do laudo.', 'error');
        viewerContainer.innerHTML = `<p class="text-center text-red-400">${error.message}</p>`;
    }
}

/**
 * Lida com a expansão de uma categoria (lazy loading).
 * @param {Event} event - O evento 'toggle' do elemento <details>.
 */
async function handleCategoryToggle(event) {
    const details = event.target;
    const categoriaId = details.dataset.categoriaId;
    const isLoaded = details.dataset.loaded === "true";

    if (details.open && !isLoaded) {
        const loader = details.querySelector('.categoria-content-loader');
        
        try {
            const data = await api.getLaudoCategoriaDetails(categoriaId);
            details.dataset.loaded = "true";
            
            const itensHTML = data.itens.length > 0 ? data.itens.map(item => `
                <div class="laudo-item p-3 rounded-md">
                    <p class="text-gray-200 whitespace-pre-wrap break-words">${sanitizeHTML(item.descricao)}</p>
                </div>
            `).join('') : '<p class="text-sm text-gray-500 mb-2">Nenhum item adicionado.</p>';

            const imagensHTML = data.imagens.length > 0 ? data.imagens.map(img => `
                <div class="laudo-image-thumbnail" style="background-image: url('${img.link}')" data-img-src="${img.link}" title="Clique para ampliar"></div>
            `).join('') : '<p class="text-sm text-gray-500 mb-2">Nenhuma imagem adicionada.</p>';

            loader.innerHTML = `
                <h4 class="text-base font-semibold text-white mb-3">Itens</h4>
                <div class="space-y-2 mb-4">${itensHTML}</div>
                
                <h4 class="text-base font-semibold text-white mt-4 mb-3">Imagens</h4>
                <div class="laudo-image-grid">${imagensHTML}</div>
            `;

            // Adiciona listener para visualização de imagem
            loader.querySelectorAll('.laudo-image-thumbnail').forEach(thumb => {
                thumb.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showImageViewer(e.currentTarget.dataset.imgSrc);
                });
            });

        } catch (error) {
            loader.innerHTML = `<p class="text-red-400">Erro ao carregar: ${error.message}</p>`;
        }
    }
}

/**
 * Exibe o modal para visualização de imagem em tela cheia.
 * @param {string} src - A URL da imagem.
 */
function showImageViewer(src) {
    const viewer = document.getElementById('laudo-image-viewer');
    const img = viewer.querySelector('img');
    img.src = src;
    viewer.classList.remove('hidden');
    setTimeout(() => viewer.classList.remove('opacity-0'), 10);
}


/**
 * Lida com a ação de aprovar um laudo.
 * @param {string} laudoId
 */
function handleAprovar(laudoId) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-green-400 mb-4">Aprovar Laudo</h2>
        <p class="text-gray-300 mb-6">Tem certeza que deseja aprovar este laudo? Esta ação não pode ser desfeita.</p>
        <div id="modal-error" class="text-red-400 text-sm hidden mb-4"></div>
        <div class="flex justify-end gap-4">
            <button id="btn-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="btn-confirm" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition">Sim, Aprovar</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');
    document.getElementById('btn-cancel').onclick = hideModal;
    document.getElementById('btn-confirm').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Aprovando...';
        try {
            await api.updateLaudoStatus({ laudo_id: laudoId, aprovado: true });
            showAlert('Laudo aprovado com sucesso!');
            hideModal();
            window.location.hash = '#laudos'; // Volta para a lista
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Sim, Aprovar';
        }
    };
}

/**
 * Lida com a ação de recusar um laudo, abrindo um modal para observações.
 * @param {string} laudoId
 */
function handleRecusar(laudoId) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-yellow-400 mb-4">Recusar Laudo</h2>
        <p class="text-gray-300 mb-4">Por favor, descreva abaixo as observações e o que precisa ser corrigido pelo vistoriador.</p>
        <form id="form-recusar-laudo">
            <textarea id="laudo-obs-adm" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 h-32" required placeholder="Ex: Faltam fotos da área de serviço; Descrever melhor o estado do sofá..."></textarea>
            <div id="modal-error" class="text-red-400 text-sm hidden mt-4"></div>
            <div class="flex justify-end gap-4 mt-6">
                <button type="button" id="btn-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg transition">Confirmar Recusa</button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-lg');
    document.getElementById('btn-cancel').onclick = hideModal;
    document.getElementById('form-recusar-laudo').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const obs = document.getElementById('laudo-obs-adm').value;
        if (!obs.trim()) {
            document.getElementById('modal-error').textContent = 'O campo de observações é obrigatório para recusar.';
            document.getElementById('modal-error').classList.remove('hidden');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Recusando...';
        
        try {
            await api.updateLaudoStatus({ laudo_id: laudoId, aprovado: false, obs: obs });
            showAlert('Laudo recusado e devolvido ao vistoriador.');
            hideModal();
            window.location.hash = '#laudos'; // Volta para a lista
        } catch (error) {
            document.getElementById('modal-error').textContent = error.message;
            document.getElementById('modal-error').classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Confirmar Recusa';
        }
    };
}