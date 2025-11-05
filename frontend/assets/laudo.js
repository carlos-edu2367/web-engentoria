// assets/laudo.js

// Lógica de API (adaptada para os endpoints de laudo)
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isLocal ? 'http://127.0.0.1:8000/api/v1' : '/api/v1';

// --- Variáveis de Estado Globais ---
let laudoId = null;
let agendamentoId = null;
let laudoData = null; // Armazena o objeto completo do laudo
let isRecording = false;
let speechRecognition = null;
let currentItemTextarea = null; // Referência ao textarea do item sendo gravado
let toastTimeout = null; // Referência para o timeout do toast

// --- Inicialização ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Protege a página
    if (typeof protectVistoriadorPage !== 'function') {
        console.error("Erro: auth.js não carregado ou protectVistoriadorPage não definida.");
        window.location.href = 'index.html';
        return;
    }
    protectVistoriadorPage();

    // 2. Obtém IDs da URL
    const urlParams = new URLSearchParams(window.location.search);
    laudoId = urlParams.get('laudo_id');
    agendamentoId = urlParams.get('agendamento_id');

    if (!laudoId || !agendamentoId) {
        showToast("IDs de laudo ou agendamento ausentes.", "error");
        setTimeout(() => window.location.href = 'agenda.html', 2000);
        return;
    }

    // 3. Inicializa a página
    loadLaudoPage();

    // 4. Listeners dos botões fixos (footer)
    document.getElementById('add-categoria-btn').addEventListener('click', showAddCategoriaModal);
    document.getElementById('toggle-finalizado-btn').addEventListener('click', handleToggleFinalizado);
    
    // 5. Inicializa a API de Reconhecimento de Voz
    setupSpeechRecognition();

    // 6. (NOVO) Listener de clique global para visualização de imagem
    document.getElementById('main-container').addEventListener('click', (e) => {
        const thumbnail = e.target.closest('.image-thumbnail');
        if (thumbnail) {
            e.preventDefault();
            // Pega a URL do background-image (ex: "url(\"http:...\")")
            // A mágica do slice(5, -2) remove o 'url("' do início e o '")' do fim.
            const url = thumbnail.style.backgroundImage.slice(5, -2);
            showImageModal(url);
        }
    });
});

/**
 * Configura a API de Reconhecimento de Voz (SpeechRecognition)
 */
function setupSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (window.SpeechRecognition) {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'pt-BR';

        speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            if (currentItemTextarea) {
                // Combina o texto existente com o novo transcrito final
                const textoExistente = currentItemTextarea.value;
                const separador = (textoExistente.trim() && finalTranscript) ? ' ' : '';
                
                // Atualiza com o interino para feedback em tempo real
                // Adiciona o final e o interino para uma experiência mais fluida
                currentItemTextarea.value = textoExistente + separador + finalTranscript + interimTranscript;
            }
        };

        speechRecognition.onerror = (event) => {
            console.error('Erro no reconhecimento de voz:', event.error);
            if(event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                showToast("Permissão para microfone negada.", "error");
            } else {
                showToast("Erro no microfone.", "error");
            }
            stopRecording();
        };

        speechRecognition.onend = () => {
            if (isRecording) {
                // Reinicia automaticamente se a gravação ainda estiver ativa
                try {
                    speechRecognition.start();
                } catch (e) {
                    console.error("Erro ao reiniciar gravação:", e);
                    stopRecording();
                }
            }
        };
    } else {
        console.warn("API de Reconhecimento de Voz não suportada neste navegador.");
    }
}


// --- Funções Principais de Carregamento e Renderização ---

/**
 * Carrega todos os dados do laudo e renderiza a página.
 */
async function loadLaudoPage() {
    const loader = document.getElementById('laudo-loader');
    loader.classList.remove('hidden');
    loader.innerHTML = `
        <svg class="h-8 w-8 text-cyan-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="mt-2 text-gray-400">Carregando dados do laudo...</p>
    `;

    try {
        const data = await apiFetch(`/agenda/laudos/laudo/${agendamentoId}`);
        laudoData = data; // Salva no estado global
        
        renderHeader(data);
        renderStatus(data);
        renderCategorias(data.categorias);
        
        const obsAdmContainer = document.getElementById('obs-adm-container');
        
        if (data.obs) {
            document.getElementById('obs-adm-text').textContent = data.obs;
            obsAdmContainer.classList.remove('hidden');
        } else {
            obsAdmContainer.classList.add('hidden');
        }

        loader.classList.add('hidden');

    } catch (error) {
        console.error("Erro ao carregar laudo:", error);
        showToast(error.message, "error");
        loader.innerHTML = `<p class="text-red-400 p-4 bg-red-900/30 rounded-md">${error.message}</p>`;
    }
}

/**
 * Renderiza o cabeçalho com informações do imóvel.
 */
function renderHeader(data) {
    document.getElementById('header-cod-imovel').textContent = `CT ${data.codigo_imovel || 'N/A'}`;
    document.getElementById('header-imobiliaria').textContent = data.nome_imobiliaria || 'Imobiliária N/A';
}

/**
 * Atualiza os botões e status (Finalizado/Aprovado).
 */
function renderStatus(data) {
    const statusDiv = document.getElementById('header-status');
    const toggleBtn = document.getElementById('toggle-finalizado-btn');
    const addCatBtn = document.getElementById('add-categoria-btn');

    let statusText = '';
    let statusClass = '';

    if (data.aprovado) {
        statusText = 'Aprovado';
        statusClass = 'bg-green-500/30 text-green-300 border border-green-500/50';
    } else if (data.finalizado) {
        statusText = 'Finalizado';
        statusClass = 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50';
    } else {
        statusText = 'Em Andamento';
        statusClass = 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50';
    }
    
    statusDiv.textContent = statusText;
    statusDiv.className = `text-xs font-bold px-2 py-1 rounded transition-all duration-300 ${statusClass}`;

    // Configura o botão de Finalizar/Reabrir
    if (data.finalizado) {
        toggleBtn.innerHTML = `
            <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            Reabrir Laudo
        `;
        toggleBtn.className = "btn py-3 px-4 rounded-lg font-bold shadow-lg flex items-center justify-center bg-yellow-600 hover:bg-yellow-700 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none";
        addCatBtn.disabled = true;
    } else {
        toggleBtn.innerHTML = `
            <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Finalizar Laudo
        `;
        toggleBtn.className = "btn py-3 px-4 rounded-lg font-bold shadow-lg flex items-center justify-center bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none";
        addCatBtn.disabled = false;
    }
    
    // Se está aprovado, desabilita tudo
    toggleBtn.disabled = data.aprovado;
    if (data.aprovado) {
        addCatBtn.disabled = true;
    }
}

/**
 * Renderiza a lista de categorias (acordeões).
 */
function renderCategorias(categorias) {
    const container = document.getElementById('categorias-container');
    container.innerHTML = ''; // Limpa o container
    
    if (categorias.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 my-10">Nenhuma categoria adicionada. Comece clicando em "+ Categoria".</p>';
        return;
    }

    categorias.forEach(cat => {
        const details = document.createElement('details');
        details.className = 'categoria-details';
        details.dataset.categoriaId = cat.id;
        details.dataset.loaded = "false";

        details.innerHTML = `
            <summary class="flex justify-between items-center group">
                <span class="text-lg font-bold text-cyan-300">${sanitizeHTML(cat.titulo)}</span>
                <div class="flex items-center gap-2">
                    ${!laudoData.finalizado ? `
                    <button class="delete-categoria-btn p-2 text-red-500 hover:text-red-400 rounded-full hover:bg-red-500/20 btn" data-id="${cat.id}" data-nome="${sanitizeHTML(cat.titulo)}" title="Excluir Categoria">
                        <svg class="h-5 w-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                    ` : ''}
                    <svg class="chevron h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </summary>
            <div class="categoria-content">
                <!-- BOTÃO DE ADICIONAR (NOVO) -->
                ${!laudoData.finalizado ? `
                <div class="add-item-container p-4 border-b border-gray-700/50">
                    <button class="add-item-modal-btn btn w-full py-3 px-4 rounded-lg font-bold bg-cyan-600/50 hover:bg-cyan-500/50 text-white shadow-md flex items-center justify-center">
                        <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        Adicionar Item ou Mídia
                    </button>
                </div>
                ` : ''}
                
                <div class="content-loader text-center text-gray-400 p-6">Carregando itens...</div>
                
                <!-- Conteúdo (itens e imagens) será carregado aqui -->
                <div class="items-images-container p-4" style="display: none;">
                    <!-- Renderizado pelo JS -->
                </div>
            </div>
        `;
        
        // Listener para carregar conteúdo ao abrir (lazy loading)
        details.addEventListener('toggle', handleCategoryToggle);
        
        // Listener para o botão de deletar
        const deleteBtn = details.querySelector('.delete-categoria-btn');
        if (deleteBtn) {
            
            // *** CORREÇÃO DO BUG ***
            // Capturamos os dados ANTES de adicionar o listener
            // para evitar qualquer problema de escopo com 'e.currentTarget'
            // no callback do 'showConfirmModal'.
            const catId = deleteBtn.dataset.id;
            const catNome = deleteBtn.dataset.nome;

            deleteBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Impede o 'toggle' de disparar
                e.stopPropagation(); // Impede outros eventos
                
                showConfirmModal(
                    'Excluir Categoria',
                    `Tem certeza que deseja excluir a categoria "${catNome}"? Todos os itens e imagens serão perdidos.`,
                    () => handleDeleteCategoria(catId) // Usa as variáveis seguras 'catId' e 'catNome'
                );
            });
        }
        
        // Listener para o botão de adicionar
        const addItemBtn = details.querySelector('.add-item-modal-btn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showAddItemModal(cat.id); // Chama o novo modal
            });
        }
        
        container.appendChild(details);
    });
}

/**
 * Carrega o conteúdo de uma categoria quando ela é aberta.
 */
async function handleCategoryToggle(event) {
    const details = event.target;
    const categoriaId = details.dataset.categoriaId;
    const isLoaded = details.dataset.loaded === "true";

    if (details.open && !isLoaded) {
        const contentDiv = details.querySelector('.categoria-content');
        const loader = contentDiv.querySelector('.content-loader');
        const container = contentDiv.querySelector('.items-images-container');

        try {
            const data = await apiFetch(`/agenda/laudos/categoria/${categoriaId}`);
            renderCategoriaContent(container, categoriaId, data);
            details.dataset.loaded = "true";
            loader.style.display = 'none'; // Esconde o loader
            container.style.display = 'block'; // Mostra o conteúdo
        } catch (error) {
            loader.innerHTML = `<p class="text-red-400">Erro ao carregar itens: ${error.message}</p>`;
        }
    }
}

/**
 * Renderiza o conteúdo interno de uma categoria (itens, imagens, formulários).
 */
function renderCategoriaContent(container, categoriaId, data) {
    // 1. Renderiza Itens de Texto
    let itensHTML = data.itens.map(item => `
        <div class="laudo-item p-3 rounded-md flex justify-between items-start gap-2 mb-2">
            <p class="text-gray-200 whitespace-pre-wrap flex-1 break-words">${sanitizeHTML(item.descricao)}</p>
            ${!laudoData.finalizado ? `
            <button class="delete-item-btn p-1 text-red-500 hover:text-red-400 btn shrink-0" data-id="${item.id}" title="Excluir item">
                <svg class="h-4 w-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            ` : ''}
        </div>
    `).join('');
    if (data.itens.length === 0) {
        itensHTML = '<p class="text-sm text-center text-gray-500 mb-2">Nenhum item adicionado.</p>';
    }

    // 2. Renderiza Imagens
    let imagensHTML = data.imagens.map(img => `
        <div class="image-thumbnail" style="background-image: url('${img.link}')" title="Clique para ampliar">
            ${!laudoData.finalizado ? `
            <button class="delete-img-btn" data-id="${img.id}" title="Excluir imagem">
                <svg class="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            ` : ''}
        </div>
    `).join('');
    if (data.imagens.length === 0 && data.itens.length > 0) {
         imagensHTML = '<p class="text-sm text-center text-gray-500 mb-2">Nenhuma imagem adicionada.</p>';
    }

    // 3. Combina tudo e insere no container
    container.innerHTML = `
        <h4 class="text-base font-semibold text-white mb-3">Itens</h4>
        <div class="space-y-2">${itensHTML}</div>
        
        <h4 class="text-base font-semibold text-white mt-4 mb-3">Imagens</h4>
        <div class="image-grid">${imagensHTML}</div>
    `;

    // 5. Adiciona listeners (apenas para delete)
    container.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            showConfirmModal('Excluir Item', 'Tem certeza?', () => handleDeleteItem(id, categoriaId));
        });
    });
    container.querySelectorAll('.delete-img-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Impede de abrir o modal de imagem
            const id = e.currentTarget.dataset.id;
            showConfirmModal('Excluir Imagem', 'Tem certeza?', () => handleDeleteImage(id, categoriaId));
        });
    });
}


// --- Funções de Ação (Adicionar, Deletar, etc.) ---

/**
 * Recarrega o conteúdo de uma categoria específica.
 */
async function refreshCategoriaContent(categoriaId) {
    const details = document.querySelector(`details[data-categoria-id="${categoriaId}"]`);
    if (!details) return;
    
    const container = details.querySelector('.items-images-container');
    const loader = details.querySelector('.content-loader');
    
    // Mostra o loader
    loader.style.display = 'block';
    loader.innerHTML = '<p class="text-center text-gray-400 py-4">Atualizando itens...</p>';
    container.style.display = 'none'; // Esconde o conteúdo
    
    try {
        const data = await apiFetch(`/agenda/laudos/categoria/${categoriaId}`);
        renderCategoriaContent(container, categoriaId, data);
        details.dataset.loaded = "true"; // Marca como carregado
        loader.style.display = 'none'; // Esconde o loader
        container.style.display = 'block'; // Mostra o conteúdo
    } catch (error) {
        loader.innerHTML = `<p class="text-red-400">Erro ao atualizar: ${error.message}</p>`;
    }
}

/**
 * Exibe o modal para adicionar item ou mídia.
 */
function showAddItemModal(categoriaId) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-cyan-300 mb-5">Adicionar à Categoria</h2>
        
        <!-- Formulário de Adicionar Item (Texto/Voz) -->
        <div class="mb-5 pb-5 border-b border-gray-700/50">
            <label class="block text-sm font-medium text-gray-300 mb-2">Adicionar Item (Descrição)</label>
            <form id="modal-add-item-form" class="space-y-3" data-categoria-id="${categoriaId}">
                <textarea name="descricao" rows="4" class="w-full form-input" placeholder="Descreva o item..."></textarea>
                <div class="flex gap-3">
                    <button type="submit" class="btn flex-1 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm shadow-md">Adicionar Descrição</button>
                    <button type="button" class="modal-record-btn btn p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-md" title="Gravar voz">
                        <svg class="h-5 w-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93V17h-2v-2.07A5 5 0 015 11v-1h2v1a3 3 0 006 0v-1h2v1a5 5 0 01-4 4.93z" clip-rule="evenodd"></path></svg>
                    </button>
                </div>
            </form>
        </div>
        
        <!-- Formulário de Adicionar Imagem -->
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-3">Adicionar Mídia</label>
            <div class="grid grid-cols-2 gap-3">
                <label class="upload-btn p-4 rounded-lg flex flex-col items-center justify-center text-center text-sm text-gray-300">
                    <svg class="h-6 w-6 mb-1 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l-1.586-1.586a2 2 0 00-2.828 0L6 14m6-6l.01.01"></path></svg>
                    Galeria
                    <input type="file" class="hidden modal-image-upload" accept="image/*" data-categoria-id="${categoriaId}">
                </label>
                <label class="upload-btn p-4 rounded-lg flex flex-col items-center justify-center text-center text-sm text-gray-300">
                    <svg class="h-6 w-6 mb-1 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Câmera
                    <input type="file" class="hidden modal-image-upload" accept="image/*" capture="camera" data-categoria-id="${categoriaId}">
                </label>
            </div>
        </div>
        
        <div id="modal-error" class="text-red-400 text-sm mt-3 hidden"></div>
        
        <div class="flex justify-end pt-5 mt-5 border-t border-gray-700/50">
            <button type="button" class="btn px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg" onclick="hideModal()">Fechar</button>
        </div>
    `;
    showModal(modalHTML);
    
    // Adiciona listeners para os elementos DENTRO do modal
    document.getElementById('modal-add-item-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleAddItem(e.target); 
    });
    
    document.querySelector('.modal-record-btn').addEventListener('click', (e) => {
        currentItemTextarea = e.currentTarget.closest('form').querySelector('textarea[name="descricao"]');
        toggleRecording(e.currentTarget);
    });
    
    document.querySelectorAll('.modal-image-upload').forEach(input => {
        input.addEventListener('change', (e) => {
            handleImageUpload(e);
        });
    });
}


/**
 * Exibe o modal para adicionar uma nova categoria.
 */
function showAddCategoriaModal() {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-cyan-300 mb-4">Nova Categoria</h2>
        <form id="form-add-categoria">
            <div>
                <label for="categoria-titulo" class="block text-sm font-medium text-gray-300 mb-2">Nome da Categoria</label>
                <input type="text" id="categoria-titulo" name="titulo" required class="w-full form-input" placeholder="Ex: Cozinha, Quarto 1, Banheiro...">
            </div>
            <div id="modal-error" class="text-red-400 text-sm mt-2 hidden"></div>
            <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
                <button type="button" class="btn px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="btn px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg">Adicionar</button>
            </div>
        </form>
    `;
    showModal(modalHTML);

    document.getElementById('form-add-categoria').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const errorDiv = form.querySelector('#modal-error');
        const titulo = form.titulo.value;

        btn.disabled = true;
        btn.textContent = 'Adicionando...';
        errorDiv.classList.add('hidden');

        try {
            await apiFetch(`/agenda/laudos/${laudoId}/categoria?titulo=${encodeURIComponent(titulo)}`, 'POST');
            showToast('Categoria adicionada com sucesso!', 'success');
            hideModal();
            loadLaudoPage(); // Recarrega a página inteira
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Adicionar';
        }
    });
}

/**
 * Lida com a submissão do formulário de novo item (via modal).
 */
async function handleAddItem(form) {
    const categoriaId = form.dataset.categoriaId;
    const textarea = form.querySelector('textarea[name="descricao"]');
    const btn = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('modal-error'); // Erro dentro do modal
    const descricao = textarea.value.trim();

    if (!descricao) {
        errorDiv.textContent = 'Por favor, insira uma descrição.';
        errorDiv.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';
    errorDiv.classList.add('hidden');

    try {
        await apiFetch(`/agenda/laudos/categoria/${categoriaId}/item?descricao=${encodeURIComponent(descricao)}`, 'POST');
        await refreshCategoriaContent(categoriaId);
        textarea.value = '';
        showToast('Item adicionado!', 'success');
        textarea.focus(); // Permite adicionar outro item rapidamente
        
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Adicionar Descrição';
    }
}

/**
 * Lida com o upload de imagem (tanto da galeria quanto da câmera).
 */
async function handleImageUpload(event) {
    const input = event.target;
    const file = input.files[0];
    const categoriaId = input.dataset.categoriaId;
    const errorDiv = document.getElementById('modal-error');
    const uploadLabels = document.querySelectorAll('.upload-btn');

    if (!file) return;

    const formData = new FormData();
    formData.append('id_categoria', categoriaId);
    formData.append('imagem', file, file.name);

    showToast('Enviando imagem...', 'info');
    errorDiv.classList.add('hidden');
    uploadLabels.forEach(label => label.classList.add('opacity-50', 'cursor-not-allowed'));
    document.querySelectorAll('.modal-image-upload').forEach(i => i.disabled = true);
    
    try {
        await apiFetch(`/agenda/laudos/categoria/imagem`, 'POST', formData, true); // true para FormData
        await refreshCategoriaContent(categoriaId);
        showToast('Imagem adicionada!', 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        input.value = ''; // Limpa o input
        uploadLabels.forEach(label => label.classList.remove('opacity-50', 'cursor-not-allowed'));
        document.querySelectorAll('.modal-image-upload').forEach(i => i.disabled = false);
    }
}

/**
 * Lida com a exclusão de uma categoria.
 */
async function handleDeleteCategoria(categoriaId) {
    try {
        await apiFetch(`/agenda/laudos/categoria/${categoriaId}`, 'DELETE');
        showToast('Categoria excluída.', 'success');
        
        // Remove o elemento do DOM com animação
        const el = document.querySelector(`details[data-categoria-id="${categoriaId}"]`);
        if (el) {
            el.style.transition = 'opacity 0.3s ease, transform 0.3s ease, margin 0.3s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(-20px)';
            el.style.marginBottom = `-${el.offsetHeight}px`;
            setTimeout(() => {
                el.remove();
                if (document.getElementById('categorias-container').children.length === 0) {
                     renderCategorias([]); // Mostra msg de "nenhuma categoria"
                }
            }, 300);
        } else {
            loadLaudoPage(); // Fallback
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Lida com a exclusão de um item de texto.
 */
async function handleDeleteItem(itemId, categoriaId) {
    try {
        await apiFetch(`/agenda/laudos/item/${itemId}`, 'DELETE');
        await refreshCategoriaContent(categoriaId); // Apenas recarrega a categoria
        showToast('Item excluído.', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Lida com a exclusão de uma imagem.
 */
async function handleDeleteImage(imagemId, categoriaId) {
    try {
        await apiFetch(`/agenda/laudos/imagem/${imagemId}`, 'DELETE');
        await refreshCategoriaContent(categoriaId); // Apenas recarrega a categoria
        showToast('Imagem excluída.', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Lida com o clique no botão Finalizar/Reabrir Laudo.
 */
function handleToggleFinalizado() {
    const isFinalizando = !laudoData.finalizado;
    const title = isFinalizando ? 'Finalizar Laudo?' : 'Reabrir Laudo?';
    const message = isFinalizando 
        ? 'Após finalizar, você não poderá editar o laudo até que o reabra.'
        : 'O laudo voltará ao status "Em Andamento" e poderá ser editado.';
    
    showConfirmModal(title, message, async () => {
        try {
            await apiFetch(`/agenda/laudos/laudo/status?id_laudo=${laudoId}&finalizado=${isFinalizando}`, 'PUT');
            showToast(`Laudo ${isFinalizando ? 'finalizado' : 'reaberto'}.`, 'success');
            loadLaudoPage(); // Recarrega tudo
        } catch (error) {
            showToast(error.message, 'error');
            throw error; // Propaga o erro para o modal de confirmação
        }
    });
}

/**
 * Lida com o clique no botão de gravação de voz.
 */
function toggleRecording(recordBtn) {
    if (!speechRecognition) {
        showToast("Reconhecimento de voz não é suportado neste navegador.", "error");
        return;
    }

    if (isRecording) {
        stopRecording();
    } else {
        startRecording(recordBtn);
    }
}

function startRecording(recordBtn) {
    try {
        speechRecognition.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.title = "Parar gravação";
        showToast("Microfone ativado. Comece a falar.", "info");
    } catch (e) {
        console.error("Erro ao iniciar gravação:", e);
        if (e.name === 'InvalidStateError') {
            // Ignora se já estiver iniciando
        } else {
            showToast("Erro ao iniciar microfone.", "error");
        }
    }
}

function stopRecording() {
    if (speechRecognition && isRecording) {
        speechRecognition.stop();
    }
    isRecording = false;
    document.querySelectorAll('.record-btn, .modal-record-btn').forEach(btn => {
        btn.classList.remove('recording');
        btn.title = "Gravar voz";
    });
    // Não limpa o currentItemTextarea aqui, 
    // pois o speechRecognition.onend pode precisar dele
    showToast("Gravação parada.", "info");
}


// --- Funções Auxiliares de API e UI ---

/**
 * Função genérica para chamadas à API do vistoriador.
 */
async function apiFetch(endpoint, method = 'GET', body = null, isFormData = false) {
    const token = getToken(); // auth.js
    const headers = new Headers({ 'Authorization': `Bearer ${token}` });
    
    const config = { method, headers };

    if (body) {
        if (isFormData) {
            config.body = body;
        } else {
            headers.append('Content-Type', 'application/json');
            config.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (response.status === 401) {
            logout(); // auth.js
            throw new Error("Sessão expirada. Faça login novamente.");
        }
        
        const text = await response.text();
        const data = text ? JSON.parse(text) : { success: true };

        if (!response.ok) {
            throw new Error(data.detail || `Erro ${response.status}`);
        }
        
        return data;

    } catch (error) {
        console.error(`Erro na API (${endpoint}):`, error);
        throw error;
    }
}

/**
 * Sanitiza HTML para evitar XSS.
 */
function sanitizeHTML(str) {
    if (str === null || str === undefined) return '';
    const temp = document.createElement('div');
    temp.textContent = String(str);
    return temp.innerHTML;
}

/**
 * Exibe o modal genérico com animação.
 */
function showModal(html, size = 'max-w-md') {
    const modal = document.getElementById('generic-modal');
    const modalContent = modal.querySelector('div');
    
    modalContent.className = `bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl p-6 w-full ${size} border border-gray-700/50`;
    modalContent.innerHTML = html;
    
    modal.classList.remove('hidden');
    setTimeout(() => { // Permite ao browser renderizar o 'hidden'
        modal.classList.add('modal-visible');
        modalContent.classList.add('modal-content-visible');
    }, 10);
}

/**
 * Esconde o modal genérico com animação.
 */
function hideModal() {
    const modal = document.getElementById('generic-modal');
    const modalContent = modal.querySelector('div');
    
    modal.classList.remove('modal-visible');
    modalContent.classList.remove('modal-content-visible');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modalContent.innerHTML = ''; // Limpa o conteúdo
    }, 300); // Tempo da animação
}

/**
 * (NOVO) Exibe o modal de imagem.
 */
function showImageModal(src) {
    const modal = document.getElementById('image-modal');
    const modalContent = modal.querySelector('div');
    const img = document.getElementById('modal-image-src');
    
    img.src = src;
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('modal-visible');
        modalContent.classList.add('modal-content-visible');
    }, 10);
}

/**
 * (NOVO) Esconde o modal de imagem.
 */
function hideImageModal() {
    const modal = document.getElementById('image-modal');
    const modalContent = modal.querySelector('div');
    
    modal.classList.remove('modal-visible');
    modalContent.classList.remove('modal-content-visible');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('modal-image-src').src = ''; // Limpa
    }, 300);
}


/**
 * Exibe um modal de confirmação.
 */
function showConfirmModal(title, message, onConfirm) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-yellow-300 mb-4">${sanitizeHTML(title)}</h2>
        <p class="text-gray-300 mb-6">${sanitizeHTML(message)}</p>
        <div id="modal-error" class="text-red-400 text-sm mt-2 hidden"></div>
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" class="btn px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg" onclick="hideModal()">Cancelar</button>
            <button type="button" id="confirm-action-btn" class="btn px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg">Confirmar</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');
    
    const modalContent = document.getElementById('generic-modal').querySelector('div');
    const confirmBtn = modalContent.querySelector('#confirm-action-btn');
    const errorDiv = modalContent.querySelector('#modal-error');

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Aguarde...';
            if (errorDiv) errorDiv.classList.add('hidden');
            
            try {
                await onConfirm();
                hideModal();
            } catch (error) {
                if (errorDiv) {
                    errorDiv.textContent = error.message;
                    errorDiv.classList.remove('hidden');
                }
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirmar';
            }
        });
    }
}

/**
 * Exibe uma notificação toast (com animação melhorada).
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notification');
    const messageEl = document.getElementById('toast-message');

    // Limpa timeout anterior se houver
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    let bgColor = 'bg-green-600'; // success
    if (type === 'error') bgColor = 'bg-red-600';
    if (type === 'info') bgColor = 'bg-blue-600';

    toast.className = `fixed top-0 left-1/2 z-[150] p-3 rounded-lg text-white shadow-lg transition-all duration-300 ease-out ${bgColor}`;
    messageEl.textContent = message;

    // Entra
    requestAnimationFrame(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-visible');
    });

    // Sai
    toastTimeout = setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-exit');
        // Reseta para a próxima
        setTimeout(() => {
            toast.classList.remove('toast-exit');
            toast.classList.add('toast-enter');
        }, 300);
    }, 3000);
}