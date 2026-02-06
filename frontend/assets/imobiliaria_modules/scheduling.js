// frontend/assets/imobiliaria_modules/scheduling.js
import { api } from './api-imob.js';
import { openModal, closeModal, showNotification } from './utils.js';

export const renderSchedulingPage = async (container) => {
    // Busca vistoriadores para o filtro
    let vistoriadores = [];
    try {
        vistoriadores = await api.getVistoriadores();
    } catch (e) {
        console.error("Erro ao carregar vistoriadores:", e);
    }

    container.innerHTML = `
        <div class="fade-in max-w-4xl mx-auto">
            <div class="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/20 rounded-2xl p-8 shadow-2xl">
                <div class="flex items-center gap-4 mb-8 border-b border-purple-500/20 pb-6">
                    <div class="p-3 bg-purple-500/20 rounded-xl text-purple-300">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white">Gerar Link de Agendamento</h2>
                        <p class="text-purple-200 text-sm">Crie um link exclusivo para o cliente escolher o melhor horário.</p>
                    </div>
                </div>

                <form id="scheduling-form" class="space-y-6">
                    
                    <!-- Passo 1: Imóvel -->
                    <div class="bg-gray-900/50 p-6 rounded-xl border border-gray-700/50 relative z-20">
                        <div class="flex justify-between items-center mb-4">
                            <label class="text-sm font-bold text-gray-300 uppercase tracking-wide">Imóvel</label>
                            <button type="button" onclick="window.openNewImovelModal()" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                Novo Imóvel
                            </button>
                        </div>
                        <div class="relative">
                            <input type="hidden" name="imovel_id" id="selected-imovel-id" required>
                            <input type="text" id="search-imovel" placeholder="Digite código ou endereço..." autocomplete="off"
                                class="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder-gray-500">
                            <div id="imovel-results" class="absolute w-full bg-gray-800 border border-gray-700 rounded-b-lg shadow-xl hidden max-h-60 overflow-y-auto mt-1"></div>
                        </div>
                        <div id="selected-imovel-display" class="hidden mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded-lg flex justify-between items-center">
                            <span class="text-green-300 text-sm font-medium truncate"></span>
                            <button type="button" class="text-gray-400 hover:text-white" onclick="clearSelection('imovel')">✕</button>
                        </div>
                    </div>

                    <!-- Passo 2: Cliente -->
                    <div class="bg-gray-900/50 p-6 rounded-xl border border-gray-700/50 relative z-10">
                        <div class="flex justify-between items-center mb-4">
                            <label class="text-sm font-bold text-gray-300 uppercase tracking-wide">Cliente</label>
                            <button type="button" onclick="window.openNewClientModal()" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                Novo Cliente
                            </button>
                        </div>
                        <div class="relative">
                            <input type="hidden" name="cliente_id" id="selected-cliente-id" required>
                            <input type="text" id="search-cliente" placeholder="Nome ou E-mail..." autocomplete="off"
                                class="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder-gray-500">
                            <div id="cliente-results" class="absolute w-full bg-gray-800 border border-gray-700 rounded-b-lg shadow-xl hidden max-h-60 overflow-y-auto mt-1"></div>
                        </div>
                        <div id="selected-cliente-display" class="hidden mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded-lg flex justify-between items-center">
                            <span class="text-green-300 text-sm font-medium truncate"></span>
                            <button type="button" class="text-gray-400 hover:text-white" onclick="clearSelection('cliente')">✕</button>
                        </div>
                    </div>

                    <!-- Passo 3: Configurações -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-bold text-gray-300 uppercase tracking-wide mb-2">Tipo de Vistoria</label>
                            <select name="tipo_vistoria" class="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 outline-none cursor-pointer">
                                <option value="ENTRADA">Entrada</option>
                                <option value="SAIDA">Saída</option>
                                <option value="CONFERENCIA">Conferência</option>
                                <option value="AVERIGUACAO">Averiguação</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-300 uppercase tracking-wide mb-2">Vistoriadores Permitidos</label>
                            <div class="relative group">
                                <button type="button" class="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-left text-gray-400 text-sm flex justify-between items-center focus:border-purple-500">
                                    <span>Selecionar (Padrão: Todos)</span>
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                </button>
                                <!-- Dropdown customizado com checkboxes -->
                                <div class="absolute w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 p-2 shadow-xl hidden group-hover:block hover:block z-30">
                                    ${vistoriadores.map(v => `
                                        <label class="flex items-center gap-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                                            <input type="checkbox" name="vistoriadores" value="${v.id}" class="form-checkbox text-purple-500 rounded bg-gray-900 border-gray-600 focus:ring-purple-500">
                                            <span class="text-white text-sm">${v.nome}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button type="submit" class="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg transform transition-all hover:scale-[1.02] flex justify-center items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        Gerar Link Mágico
                    </button>

                </form>
            </div>
        </div>
    `;

    setupSearchHandlers();
    
    document.getElementById('scheduling-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const imovelId = document.getElementById('selected-imovel-id').value;
        const clienteId = document.getElementById('selected-cliente-id').value;
        
        if(!imovelId || !clienteId) {
            showNotification('Selecione Imóvel e Cliente.', 'error');
            return;
        }

        const tipo = e.target.tipo_vistoria.value;
        const checkboxes = document.querySelectorAll('input[name="vistoriadores"]:checked');
        const vistoriadoresIds = Array.from(checkboxes).map(cb => cb.value);

        try {
            const res = await api.gerarLink({
                imovel_id: imovelId,
                cliente_id: clienteId,
                tipo_vistoria: tipo,
                vistoriadores_ids: vistoriadoresIds.length ? vistoriadoresIds : null
            });
            
            showSuccessModal(res.link_completo);
            e.target.reset();
            clearSelection('imovel');
            clearSelection('cliente');

        } catch (err) {
            showNotification(err.message, 'error');
        }
    });
};

// --- Helpers de Busca ---

function setupSearchHandlers() {
    const setupAutocomplete = (inputId, resultsId, apiCall, selectFn) => {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        let debounceTimer;

        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const term = e.target.value;
            
            if(term.length < 3) { 
                results.classList.add('hidden'); 
                return; 
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const data = await apiCall(term);
                    if(data.length === 0) {
                        results.innerHTML = '<div class="p-3 text-gray-500 text-xs">Nenhum resultado.</div>';
                    } else {
                        results.innerHTML = data.map(item => {
                            // Adaptação dependendo se é imóvel ou cliente
                            const id = item.id;
                            const display = item.cod_imovel ? `${item.cod_imovel} - ${item.endereco}` : item.nome;
                            const subDisplay = item.email ? item.email : item.endereco; 
                            
                            // Escapa aspas simples no nome para o onclick
                            const safeDisplay = display.replace(/'/g, "\\'");
                            
                            return `
                                <div class="p-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0 transition-colors" 
                                     onclick="window.selectItem('${inputId}', '${id}', '${safeDisplay}')">
                                    <div class="text-white font-medium">${display}</div>
                                    <div class="text-gray-400 text-xs">${subDisplay || ''}</div>
                                </div>
                            `;
                        }).join('');
                    }
                    results.classList.remove('hidden');
                } catch(e) { console.error(e); }
            }, 300);
        });
        
        // Esconder ao clicar fora
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target)) {
                results.classList.add('hidden');
            }
        });
    };

    setupAutocomplete('search-imovel', 'imovel-results', api.getImoveis, null);
    setupAutocomplete('search-cliente', 'cliente-results', api.getClientes, null);
}

// --- Funções Globais para Callbacks ---

window.selectItem = (inputId, id, display) => {
    const type = inputId.includes('imovel') ? 'imovel' : 'cliente';
    document.getElementById(`selected-${type}-id`).value = id;
    
    const dispEl = document.getElementById(`selected-${type}-display`);
    dispEl.querySelector('span').textContent = display;
    dispEl.classList.remove('hidden');
    
    document.getElementById(inputId).classList.add('hidden');
    document.getElementById(`${type}-results`).classList.add('hidden');
};

window.clearSelection = (type) => {
    document.getElementById(`selected-${type}-id`).value = '';
    document.getElementById(`selected-${type}-display`).classList.add('hidden');
    document.getElementById(`search-${type}`).classList.remove('hidden');
    document.getElementById(`search-${type}`).value = '';
    document.getElementById(`search-${type}`).focus();
};

window.openNewClientModal = () => {
    openModal(`
        <h3 class="text-xl font-bold text-white mb-4">Novo Cliente Rápido</h3>
        <form id="new-client-form" class="space-y-4">
            <input type="text" name="nome" placeholder="Nome Completo" class="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none" required>
            <input type="email" name="email" placeholder="E-mail" class="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none" required>
            <input type="text" name="telefone1" placeholder="Telefone / WhatsApp" class="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none">
            <div class="flex justify-end gap-2 mt-4">
                <button type="button" onclick="window.closeModal()" class="text-gray-400 px-4 py-2 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">Salvar</button>
            </div>
        </form>
    `);
    
    document.getElementById('new-client-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            const data = Object.fromEntries(new FormData(e.target));
            const newClient = await api.createCliente(data);
            showNotification('Cliente criado!', 'success');
            window.closeModal();
            // Simula seleção automática
            window.selectItem('search-cliente', newClient.id, newClient.nome);
        } catch(err) { showNotification(err.message, 'error'); }
    };
};

window.openNewImovelModal = async () => {
    try {
        // Validação de segurança para garantir que o script da API carregou
        if (typeof api.getImobiliarias !== 'function') {
            throw new Error("Função api.getImobiliarias não encontrada. Por favor, limpe o cache do navegador.");
        }

        const imobiliarias = await api.getImobiliarias();
        
        let options = '';
        let hiddenInput = '';
        
        if (imobiliarias.length > 1) {
            options = `<select name="imobiliaria_id" class="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none" required>
                <option value="">Selecione a Imobiliária</option>
                ${imobiliarias.map(i => `<option value="${i.id}">${i.nome}</option>`).join('')}
            </select>`;
        } else if (imobiliarias.length === 1) {
            hiddenInput = `<input type="hidden" name="imobiliaria_id" value="${imobiliarias[0].id}">`;
        } else {
            showNotification('Erro: Nenhuma imobiliária vinculada encontrada.', 'error');
            return;
        }

        openModal(`
            <h3 class="text-xl font-bold text-white mb-4">Novo Imóvel Rápido</h3>
            <form id="new-imovel-form" class="space-y-4">
                ${options}
                ${hiddenInput}
                
                <input type="text" name="cod_imovel" placeholder="Código do Imóvel" class="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none" required>
                <input type="text" name="endereco" placeholder="Endereço Completo" class="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none" required>
                <div class="grid grid-cols-2 gap-4">
                    <input type="number" step="0.01" name="tamanho" placeholder="Tamanho (m²)" class="bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none" required>
                    <select name="mobiliado" class="bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-purple-500 outline-none">
                        <option value="sem_mobilia">Sem Mobília</option>
                        <option value="semi_mobiliado">Semi Mobiliado</option>
                        <option value="mobiliado">Mobiliado</option>
                    </select>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button type="button" onclick="window.closeModal()" class="text-gray-400 px-4 py-2 hover:text-white transition-colors">Cancelar</button>
                    <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">Salvar</button>
                </div>
            </form>
        `);

        document.getElementById('new-imovel-form').onsubmit = async (e) => {
            e.preventDefault();
            
            const clienteId = document.getElementById('selected-cliente-id').value;
            if(!clienteId) {
                showNotification('Por favor, selecione um Cliente na tela anterior primeiro.', 'error');
                return;
            }

            try {
                const data = Object.fromEntries(new FormData(e.target));
                data.cliente_id = clienteId;

                const newImovel = await api.createImovel(data);
                showNotification('Imóvel criado!', 'success');
                window.closeModal();
                window.selectItem('search-imovel', newImovel.id, `${newImovel.cod_imovel} - ${newImovel.endereco}`);
            } catch(err) { showNotification(err.message, 'error'); }
        };
    } catch(e) {
        console.error(e);
        showNotification(e.message || 'Erro ao carregar dados.', 'error');
    }
};

function showSuccessModal(link) {
    openModal(`
        <div class="text-center">
            <div class="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">Link Gerado!</h3>
            <p class="text-gray-400 mb-6">Envie este link para o cliente agendar a vistoria.</p>
            
            <div class="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-gray-700 mb-6">
                <input type="text" value="${link}" id="link-input" readonly class="bg-transparent text-gray-300 text-sm flex-1 outline-none">
                <button onclick="navigator.clipboard.writeText(document.getElementById('link-input').value); this.textContent='Copiado!'" class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-xs transition-colors">
                    Copiar
                </button>
            </div>

            <div class="flex gap-2 justify-center">
                <a href="https://wa.me/?text=${encodeURIComponent('Olá! Aqui está o link para agendar sua vistoria: ' + link)}" target="_blank" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors hover:scale-105 transform">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    WhatsApp
                </a>
                <button onclick="window.closeModal()" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors">Fechar</button>
            </div>
        </div>
    `);
}