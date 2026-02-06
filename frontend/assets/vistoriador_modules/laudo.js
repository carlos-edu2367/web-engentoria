import { api } from './api.js';
import { openModal, closeModal, showNotification, sanitizeHTML, showLoader } from './utils.js';

// Estado Local do Módulo
let state = {
    laudoId: null,
    agendamentoId: null,
    laudoData: null,
    isRecording: false,
    speechRecognition: null,
    activeTextarea: null
};

export async function renderLaudo(container, params) {
    if (!params || !params.agendamento_id) {
        container.innerHTML = '<div class="p-4 text-red-400">Erro: Agendamento não especificado.</div>';
        return;
    }

    state.agendamentoId = params.agendamento_id;
    state.laudoId = params.laudo_id;

    // Estrutura Principal
    container.innerHTML = `
        <div class="flex flex-col h-full bg-slate-900 absolute inset-0 z-50">
            <!-- Header -->
            <header class="flex-none bg-slate-800/90 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center justify-between shadow-lg z-10">
                <button id="back-btn" class="p-2 -ml-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/50 transition">
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                </button>
                <div class="text-center">
                    <h1 id="header-title" class="text-lg font-bold text-white leading-tight">Carregando...</h1>
                    <p id="header-subtitle" class="text-xs text-slate-400 truncate max-w-[200px] mx-auto">...</p>
                </div>
                <div id="header-status" class="w-8"></div>
            </header>

            <!-- Corpo -->
            <main id="laudo-content" class="flex-1 overflow-y-auto custom-scrollbar p-4 pb-24 space-y-6 relative">
                <div id="laudo-loader" class="flex flex-col items-center justify-center h-64">
                    <svg class="animate-spin h-8 w-8 text-teal-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p class="text-slate-500 text-sm">Carregando dados...</p>
                </div>
                
                <div id="laudo-body" class="hidden space-y-6">
                    <div id="obs-container" class="hidden bg-amber-900/20 border border-amber-500/30 p-4 rounded-xl">
                        <h3 class="text-xs font-bold text-amber-500 uppercase mb-1 flex items-center gap-2">Instruções</h3>
                        <p id="obs-text" class="text-sm text-amber-100/80"></p>
                    </div>
                    <div id="pdf-section" class="bg-slate-800/50 border border-slate-700 p-4 rounded-xl"></div>
                    <div id="categorias-list" class="space-y-4"></div>
                    <div class="h-10"></div>
                </div>
            </main>

            <!-- Footer -->
            <footer class="flex-none bg-slate-900 border-t border-slate-800 p-4 safe-area-bottom z-20">
                <div class="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                    <button id="btn-add-categoria" class="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-teal-400 font-bold rounded-xl border border-slate-700 transition-all active:scale-95 disabled:opacity-50">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        Categoria
                    </button>
                    <button id="btn-finalizar" class="flex items-center justify-center gap-2 py-3 px-4 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-lg shadow-teal-900/30 transition-all active:scale-95 disabled:opacity-50">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        Finalizar
                    </button>
                </div>
            </footer>
        </div>
    `;

    setupSpeechRecognition();
    document.getElementById('back-btn').onclick = () => window.history.back();
    document.getElementById('btn-add-categoria').onclick = showAddCategoriaModal;
    document.getElementById('btn-finalizar').onclick = handleToggleStatus;

    await loadData();
}

// ... (loadData, renderInterface, updateFooterState, renderPdfSection, renderCategorias, loadCategoriaContent, renderItemsAndImages mantidos iguais) ...

async function loadData() {
    try {
        if (!state.laudoId) {
            try {
                const info = await api.getLaudoInfo(state.agendamentoId);
                state.laudoId = info.id;
            } catch (e) {
                const novo = await api.createLaudo(state.agendamentoId);
                state.laudoId = novo.id;
            }
        }
        const data = await api.getLaudoInfo(state.agendamentoId);
        state.laudoData = data;
        renderInterface(data);
    } catch (error) {
        document.getElementById('laudo-loader').innerHTML = `<p class="text-red-400 text-center px-4">Erro: ${error.message}</p>`;
    }
}

function renderInterface(data) {
    document.getElementById('laudo-loader').classList.add('hidden');
    document.getElementById('laudo-body').classList.remove('hidden');

    document.getElementById('header-title').textContent = `CT ${data.codigo_imovel || '...'}`;
    document.getElementById('header-subtitle').textContent = data.nome_imobiliaria || 'Imobiliária';
    
    const statusDiv = document.getElementById('header-status');
    if (data.aprovado) statusDiv.innerHTML = '<span class="block w-3 h-3 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e]"></span>';
    else if (data.finalizado) statusDiv.innerHTML = '<span class="block w-3 h-3 bg-yellow-500 rounded-full shadow-[0_0_10px_#eab308]"></span>';
    else statusDiv.innerHTML = '<span class="block w-3 h-3 bg-teal-500 rounded-full shadow-[0_0_10px_#14b8a6]"></span>';

    if (data.obs) {
        document.getElementById('obs-text').textContent = data.obs;
        document.getElementById('obs-container').classList.remove('hidden');
    }
    renderPdfSection(data);
    renderCategorias(data.categorias);
    updateFooterState(data);
}

function updateFooterState(data) {
    const btnAdd = document.getElementById('btn-add-categoria');
    const btnFinalizar = document.getElementById('btn-finalizar');

    if (data.finalizado) {
        btnAdd.disabled = true;
        btnFinalizar.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Reabrir`;
        btnFinalizar.className = btnFinalizar.className.replace('bg-teal-600', 'bg-yellow-600').replace('bg-green-600', 'bg-yellow-600');
    } else {
        btnAdd.disabled = false;
        btnFinalizar.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Finalizar`;
        btnFinalizar.className = btnFinalizar.className.replace('bg-yellow-600', 'bg-green-600').replace('bg-teal-600', 'bg-green-600');
    }

    if (data.aprovado) {
        btnAdd.disabled = true;
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = "Aprovado";
    }
}

function renderPdfSection(data) {
    const container = document.getElementById('pdf-section');
    if (data.documento) {
        container.innerHTML = `
            <h3 class="text-xs font-bold text-slate-400 uppercase mb-3">Laudo Anexado</h3>
            <div class="flex gap-2">
                <a href="${data.documento}" target="_blank" class="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 transition">
                    Ver Arquivo
                </a>
                ${!data.finalizado ? `<button id="btn-del-pdf" class="p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
            </div>
        `;
        if(!data.finalizado) document.getElementById('btn-del-pdf').onclick = handleDeletePdf;
    } else if (!data.finalizado) {
        container.innerHTML = `
            <label class="flex items-center justify-center gap-3 p-4 border border-dashed border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700/30 transition group">
                <div class="p-2 bg-slate-700 rounded-full group-hover:bg-slate-600 transition">
                    <svg class="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </div>
                <div class="text-left">
                    <p class="text-sm font-bold text-slate-300">Anexar Laudo (PDF/DOCX)</p>
                </div>
                <input type="file" id="upload-pdf-input" class="hidden" accept=".pdf,.docx">
            </label>
        `;
        document.getElementById('upload-pdf-input').onchange = handleUploadPdf;
    } else {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center italic">Nenhum laudo anexado.</p>`;
    }
}

function renderCategorias(categorias) {
    const list = document.getElementById('categorias-list');
    list.innerHTML = '';
    if (categorias.length === 0) {
        list.innerHTML = `<div class="text-center py-8 opacity-50"><p class="text-sm text-slate-400">Nenhuma categoria.</p></div>`;
        return;
    }
    categorias.forEach(cat => {
        const details = document.createElement('details');
        details.className = 'group bg-slate-800 rounded-xl border border-slate-700 overflow-hidden transition-all duration-300 open:pb-4';
        details.dataset.id = cat.id;
        
        details.innerHTML = `
            <summary class="flex items-center justify-between p-4 cursor-pointer select-none bg-slate-800 hover:bg-slate-750 transition-colors">
                <h4 class="font-bold text-white group-open:text-teal-400 transition-colors">${sanitizeHTML(cat.titulo)}</h4>
                <div class="flex items-center gap-3">
                    ${!state.laudoData.finalizado ? `<button class="btn-del-cat p-1.5 text-slate-500 hover:text-red-400 transition" data-id="${cat.id}"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                    <svg class="w-5 h-5 text-slate-500 transform group-open:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
            </summary>
            <div class="px-4 pt-2 content-area">
                <div class="loader hidden text-center py-4"><svg class="animate-spin h-5 w-5 mx-auto text-teal-500" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                <div class="items-container space-y-3"></div>
                ${!state.laudoData.finalizado ? `<button class="btn-add-item mt-4 w-full py-3 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:text-white transition flex items-center justify-center gap-2 text-sm font-medium" data-id="${cat.id}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>Adicionar Item ou Foto</button>` : ''}
            </div>
        `;
        details.addEventListener('toggle', (e) => {
            if (details.open && !details.dataset.loaded) loadCategoriaContent(cat.id, details);
        });
        const btnDel = details.querySelector('.btn-del-cat');
        if(btnDel) btnDel.onclick = (e) => { e.preventDefault(); handleDeleteCategoria(cat.id); };
        const btnAdd = details.querySelector('.btn-add-item');
        if(btnAdd) btnAdd.onclick = () => showAddItemModal(cat.id);
        list.appendChild(details);
    });
}

async function loadCategoriaContent(catId, detailsElement) {
    const loader = detailsElement.querySelector('.loader');
    const container = detailsElement.querySelector('.items-container');
    loader.classList.remove('hidden');
    try {
        const data = await api.getCategoriaContent(catId);
        detailsElement.dataset.loaded = "true";
        renderItemsAndImages(container, data, catId);
    } catch (e) {
        container.innerHTML = `<p class="text-red-400 text-xs">Erro ao carregar itens.</p>`;
    } finally {
        loader.classList.add('hidden');
    }
}

function renderItemsAndImages(container, data, catId) {
    let html = '';
    if (data.itens && data.itens.length > 0) {
        html += `<div class="space-y-2 mb-4">`;
        data.itens.forEach(item => {
            html += `
                <div class="bg-slate-700/50 p-3 rounded-lg border border-slate-700 flex justify-between items-start gap-3">
                    <p class="text-sm text-slate-200 whitespace-pre-wrap flex-1 leading-relaxed">${sanitizeHTML(item.descricao)}</p>
                    ${!state.laudoData.finalizado ? `<button class="text-slate-500 hover:text-red-400 transition p-1" onclick="window.deleteItem('${item.id}', '${catId}')"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                </div>`;
        });
        html += `</div>`;
    }
    if (data.imagens && data.imagens.length > 0) {
        html += `<div class="grid grid-cols-3 sm:grid-cols-4 gap-2">`;
        data.imagens.forEach(img => {
            html += `
                <div class="relative aspect-square bg-slate-700 rounded-lg overflow-hidden group cursor-pointer" onclick="window.viewImage('${img.link}')">
                    <img src="${img.link}" class="w-full h-full object-cover transition transform group-hover:scale-110" loading="lazy">
                    ${!state.laudoData.finalizado ? `<button class="absolute top-1 right-1 bg-red-500/90 text-white rounded-full p-1 shadow hover:bg-red-600 transition" onclick="event.stopPropagation(); window.deleteImage('${img.id}', '${catId}')"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>` : ''}
                </div>`;
        });
        html += `</div>`;
    }
    if (!html) html = '<p class="text-xs text-slate-500 italic text-center py-2">Categoria vazia.</p>';
    container.innerHTML = html;
}

// CORREÇÃO DO MODAL AQUI
function showAddCategoriaModal() {
    // ATENÇÃO: Removemos onclick="closeModal()" da string e adicionamos IDs para vincular eventos
    openModal(`
        <h3 class="text-xl font-bold text-white mb-4">Nova Categoria</h3>
        <input type="text" id="new-cat-name" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-teal-500 outline-none mb-6" placeholder="Ex: Cozinha, Quarto 1...">
        <div class="flex gap-3">
            <button id="btn-cancel-cat" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition">Cancelar</button>
            <button id="confirm-add-cat" class="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold transition shadow-lg">Adicionar</button>
        </div>
    `);

    setTimeout(() => document.getElementById('new-cat-name').focus(), 100);

    // Vínculo correto de eventos
    document.getElementById('btn-cancel-cat').onclick = closeModal;
    
    document.getElementById('confirm-add-cat').onclick = async () => {
        const title = document.getElementById('new-cat-name').value.trim();
        if (!title) return;
        try {
            await api.addCategoria(state.laudoId, title);
            closeModal();
            loadData();
            showNotification('Categoria criada!');
        } catch (e) {
            showNotification(e.message, 'error');
        }
    };
}

function showAddItemModal(catId) {
    // Mesma lógica: Botão Cancelar caso adicione futuramente precisaria de ID
    // O modal atual não tem botão cancelar explícito, apenas fecha no click fora ou no salvar
    openModal(`
        <h3 class="text-xl font-bold text-white mb-4">Adicionar Item</h3>
        <div class="flex mb-4 bg-slate-700/50 p-1 rounded-lg">
            <button class="flex-1 py-2 text-sm font-bold bg-slate-600 rounded-md text-white shadow">Descrição</button>
            <button class="flex-1 py-2 text-sm font-medium text-slate-400" disabled>Mídia (Abaixo)</button>
        </div>
        <div class="relative mb-4">
            <textarea id="item-desc" rows="4" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-teal-500 outline-none resize-none" placeholder="Descreva o item..."></textarea>
            <button id="btn-mic" class="absolute bottom-3 right-3 p-2 bg-slate-700 rounded-full text-slate-300 hover:text-red-400 hover:bg-slate-600 transition shadow-lg border border-slate-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
            </button>
        </div>
        <button id="btn-save-item" class="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl mb-6 shadow-lg">Salvar Descrição</button>
        <div class="border-t border-slate-700 pt-4">
            <p class="text-xs text-slate-400 font-bold uppercase mb-3 text-center">Ou adicione mídia</p>
            <div class="grid grid-cols-2 gap-3">
                <label class="flex flex-col items-center justify-center p-4 bg-slate-700/30 hover:bg-slate-700/50 border border-dashed border-slate-600 rounded-xl cursor-pointer transition">
                    <svg class="w-6 h-6 text-teal-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l-1.586-1.586a2 2 0 00-2.828 0L6 14m6-6l.01.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span class="text-xs text-slate-300">Galeria</span>
                    <input type="file" class="hidden modal-upload" accept="image/*" data-cat="${catId}">
                </label>
                <label class="flex flex-col items-center justify-center p-4 bg-slate-700/30 hover:bg-slate-700/50 border border-dashed border-slate-600 rounded-xl cursor-pointer transition">
                    <svg class="w-6 h-6 text-teal-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span class="text-xs text-slate-300">Câmera</span>
                    <input type="file" class="hidden modal-upload" accept="image/*" capture="camera" data-cat="${catId}">
                </label>
            </div>
        </div>
    `);

    const micBtn = document.getElementById('btn-mic');
    const textarea = document.getElementById('item-desc');
    micBtn.onclick = () => toggleRecording(micBtn, textarea);

    document.getElementById('btn-save-item').onclick = async () => {
        const text = textarea.value.trim();
        if(!text) return;
        try {
            await api.addItem(catId, text);
            closeModal();
            refreshCategory(catId);
            showNotification('Item salvo!');
        } catch(e) { showNotification(e.message, 'error'); }
    };

    document.querySelectorAll('.modal-upload').forEach(input => {
        input.onchange = async () => {
            if(!input.files.length) return;
            const fd = new FormData();
            fd.append('id_categoria', catId);
            fd.append('imagem', input.files[0]);
            showNotification('Enviando imagem...', 'info');
            closeModal(); 
            try {
                await api.uploadImagemCategoria(fd);
                refreshCategory(catId);
                showNotification('Imagem salva!', 'success');
            } catch(e) { showNotification(e.message, 'error'); }
        };
    });
}

// Global helpers (mantidos para garantir compatibilidade com código legado se houver)
async function refreshCategory(catId) {
    const details = document.querySelector(`details[data-id="${catId}"]`);
    if(details) loadCategoriaContent(catId, details);
}
window.deleteCategoria = async (id) => {
    if(confirm('Excluir categoria e todo conteúdo?')) {
        try {
            await api.deleteCategoria(id);
            loadData(); 
            showNotification('Categoria excluída.');
        } catch(e) { showNotification(e.message, 'error'); }
    }
};
window.deleteItem = async (itemId, catId) => {
    if(confirm('Excluir item?')) {
        try {
            await api.deleteItem(itemId);
            refreshCategory(catId);
        } catch(e) { showNotification(e.message, 'error'); }
    }
};
window.deleteImage = async (imgId, catId) => {
    if(confirm('Excluir imagem?')) {
        try {
            await api.deleteImagemCategoria(imgId);
            refreshCategory(catId);
        } catch(e) { showNotification(e.message, 'error'); }
    }
};
window.viewImage = (url) => {
    openModal(`
        <img src="${url}" class="w-full h-auto rounded-lg shadow-2xl">
        <button id="btn-close-img" class="mt-4 w-full py-3 bg-slate-800 text-white rounded-xl">Fechar</button>
    `, 'max-w-4xl p-0 bg-transparent shadow-none border-none');
    document.getElementById('btn-close-img').onclick = closeModal;
};

async function handleUploadPdf(e) {
    const file = e.target.files[0];
    if(!file) return;
    const fd = new FormData();
    fd.append('id_laudo', state.laudoId);
    fd.append('file', file);
    showNotification('Enviando PDF...', 'info');
    try {
        await api.uploadLaudoPdf(fd);
        loadData();
        showNotification('Laudo anexado!', 'success');
    } catch(err) { showNotification(err.message, 'error'); }
}

async function handleDeletePdf() {
    if(confirm('Remover o laudo PDF anexado?')) {
        try {
            await api.deleteLaudoPdf(state.laudoId);
            loadData();
            showNotification('Anexo removido.');
        } catch(err) { showNotification(err.message, 'error'); }
    }
}

async function handleToggleStatus() {
    const isFinalizing = !state.laudoData.finalizado;
    const msg = isFinalizing ? 'Finalizar laudo? Isso bloqueará edições.' : 'Reabrir laudo para edições?';
    if(confirm(msg)) {
        try {
            await api.updateStatusLaudo(state.laudoId, isFinalizing);
            loadData();
            showNotification(isFinalizing ? 'Laudo Finalizado!' : 'Laudo Reaberto!');
        } catch(err) { showNotification(err.message, 'error'); }
    }
}

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        state.speechRecognition = new SpeechRecognition();
        state.speechRecognition.lang = 'pt-BR';
        state.speechRecognition.interimResults = true;
        state.speechRecognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            }
            if (state.activeTextarea && finalTranscript) {
                const current = state.activeTextarea.value;
                state.activeTextarea.value = current + (current ? ' ' : '') + finalTranscript;
            }
        };
        state.speechRecognition.onend = () => {
            if(state.isRecording) state.speechRecognition.start(); 
            else stopRecordingUI();
        };
    }
}

function toggleRecording(btn, textarea) {
    if (!state.speechRecognition) {
        showNotification('Seu navegador não suporta voz.', 'error');
        return;
    }
    state.activeTextarea = textarea;
    if (state.isRecording) {
        state.isRecording = false;
        state.speechRecognition.stop();
        stopRecordingUI(btn);
    } else {
        state.isRecording = true;
        state.speechRecognition.start();
        btn.classList.add('bg-red-600', 'animate-pulse', 'text-white');
        btn.classList.remove('bg-slate-700', 'text-slate-300');
        showNotification('Gravando... Fale agora.', 'info');
    }
}

function stopRecordingUI(btn) {
    const el = btn || document.getElementById('btn-mic');
    if(el) {
        el.classList.remove('bg-red-600', 'animate-pulse', 'text-white');
        el.classList.add('bg-slate-700', 'text-slate-300');
    }
}