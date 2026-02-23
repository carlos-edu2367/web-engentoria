// /assets/modules/agendamento-wizard.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, sanitizeHTML } from '../ui.js';

let wizardState = {};
let calendarRef = null;
let cache = {
    imobiliarias: null,
    imoveis: {} // Cache de imóveis por imobiliária
};

/**
 * Atraso na execução de uma função para evitar chamadas excessivas.
 * Usado na barra de busca para não chamar a API a cada tecla digitada.
 */
function debounce(func, delay = 400) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- Funções de Renderização dos Passos ---

function renderWizard() {
    const stepRenderers = {
        1: renderStep1,
        2: renderStep2,
        3: renderStep3,
        4: renderStep4
    };
    const renderer = stepRenderers[wizardState.step];
    if (renderer) {
        renderer();
    }
}

// --- Componentes Visuais Reutilizáveis do Wizard ---
const wizardHeader = (step, title, icon) => `
    <div class="flex items-center gap-4 mb-8 border-b border-slate-700/60 pb-5">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_20px_rgba(6,182,212,0.3)] relative">
            <div class="absolute inset-0 bg-white/20 rounded-2xl backdrop-blur-sm"></div>
            <svg class="relative z-10 h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icon}</svg>
        </div>
        <div>
            <p class="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">Passo ${step} de 4</p>
            <h3 class="text-3xl font-black text-white tracking-tight leading-none">${title}</h3>
        </div>
    </div>
    
    <div class="flex gap-2 mb-8">
        <div class="h-2 flex-1 rounded-full ${step >= 1 ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-slate-800'} transition-all duration-500"></div>
        <div class="h-2 flex-1 rounded-full ${step >= 2 ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-slate-800'} transition-all duration-500"></div>
        <div class="h-2 flex-1 rounded-full ${step >= 3 ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-slate-800'} transition-all duration-500"></div>
        <div class="h-2 flex-1 rounded-full ${step >= 4 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-800'} transition-all duration-500"></div>
    </div>
`;

async function renderStep1() {
    if (!cache.imobiliarias) {
        cache.imobiliarias = await api.getImobiliarias();
    }
    
    const icon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>';
    
    const wizardHTML = `
        <div id="wizard-content" class="anim-slide-up">
            ${wizardHeader(1, 'Selecionar Imobiliária', icon)}
            
            <div class="relative mb-4 group">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-cyan-400 transition-colors">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input type="text" id="search-imobiliaria" class="w-full bg-slate-900/50 border border-slate-600 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder-slate-500 shadow-inner" placeholder="Pesquisar pelo nome da imobiliária...">
            </div>
            
            <ul id="imobiliaria-list" class="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                ${cache.imobiliarias.map(imob => `
                    <li class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-cyan-900/20 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] cursor-pointer transition-all flex items-center justify-between group" data-id="${imob.id}">
                        <div class="flex items-center gap-3">
                            <div class="h-10 w-10 rounded-xl bg-slate-700/80 flex items-center justify-center text-slate-400 group-hover:bg-cyan-500 group-hover:text-white transition-colors border border-slate-600 group-hover:border-cyan-400 shadow-inner">
                                <span class="font-bold text-sm">${sanitizeHTML(imob.nome).charAt(0).toUpperCase()}</span>
                            </div>
                            <span class="font-medium text-slate-200 group-hover:text-white text-lg">${sanitizeHTML(imob.nome)}</span>
                        </div>
                        <svg class="h-5 w-5 text-slate-500 opacity-0 group-hover:opacity-100 group-hover:text-cyan-400 transform translate-x-[-10px] group-hover:translate-x-0 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </li>
                `).join('')}
            </ul>
        </div>
        <div class="flex justify-end mt-8 pt-5 border-t border-slate-700/60">
            <button id="cancel-wizard" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-600 hover:text-white shadow-lg">Cancelar</button>
        </div>
    `;
    
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = wizardHTML;
    modalContent.className = 'bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-3xl border border-slate-700/60 max-h-[90vh] overflow-y-auto transform transition-all';

    document.getElementById('cancel-wizard').onclick = hideModal;
    const list = document.getElementById('imobiliaria-list');
    
    list.onclick = (e) => {
        const li = e.target.closest('li');
        if (li) {
            wizardState.imobiliaria_id = li.dataset.id;
            wizardState.imobiliaria_nome = li.querySelector('span.font-medium').textContent.trim();
            wizardState.step = 2;
            renderWizard();
        }
    };

    document.getElementById('search-imobiliaria').onkeyup = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        list.querySelectorAll('li').forEach(li => {
            const name = li.querySelector('span.font-medium').textContent.toLowerCase();
            li.style.display = name.includes(searchTerm) ? '' : 'none';
        });
    };
}

async function renderStep2() {
    const icon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path>';
    
    const wizardHTML = `
        <div id="wizard-content" class="anim-slide-up">
             ${wizardHeader(2, 'Vincular Cliente', icon)}
            
            <div class="flex flex-col sm:flex-row gap-3 mb-4">
                <div class="relative flex-grow group">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-cyan-400 transition-colors">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input type="text" id="search-cliente" class="w-full bg-slate-900/50 border border-slate-600 rounded-xl pl-10 pr-4 py-3.5 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder-slate-500 shadow-inner" placeholder="Procurar por nome ou e-mail (min. 2 letras)...">
                </div>
                <button id="add-new-cliente" class="w-full sm:w-auto px-6 py-3.5 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 group transform hover:-translate-y-0.5 shadow-lg">
                    <svg class="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Novo Cliente
                </button>
            </div>
            
            <ul id="cliente-list" class="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                <li class="p-8 text-center text-slate-500 border border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20 backdrop-blur-sm">
                    <svg class="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Comece a digitar para procurar na base de dados.
                </li>
            </ul>
        </div>
        <div class="flex justify-between mt-8 pt-5 border-t border-slate-700/60">
            <button id="back-wizard" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-600 hover:text-white shadow-lg">Voltar</button>
            <button id="cancel-wizard" class="px-8 py-3.5 bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-400 hover:text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-red-500/20">Cancelar</button>
        </div>
    `;
    
    document.getElementById('modal-content').innerHTML = wizardHTML;
    
    document.getElementById('back-wizard').onclick = () => { wizardState.step = 1; renderWizard(); };
    document.getElementById('cancel-wizard').onclick = hideModal;
    document.getElementById('add-new-cliente').onclick = renderNewClienteForm;

    const searchInput = document.getElementById('search-cliente');
    const clienteList = document.getElementById('cliente-list');

    const performSearch = async (term) => {
        if (term.length < 2) {
            clienteList.innerHTML = `
                <li class="p-8 text-center text-slate-500 border border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20">
                    Digite pelo menos 2 caracteres.
                </li>`;
            return;
        }
        clienteList.innerHTML = `
            <li class="p-8 text-center text-cyan-500 border border-dashed border-cyan-500/30 rounded-2xl bg-cyan-900/10 flex flex-col items-center justify-center">
                <svg class="w-8 h-8 animate-spin mb-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Procurando Clientes...
            </li>`;

        try {
            const clientes = await api.getClientes(term);
            if (clientes.length === 0) {
                clienteList.innerHTML = `
                    <li class="p-8 text-center text-slate-400 border border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20">
                        Nenhum cliente encontrado com "<span class="text-white font-bold">${sanitizeHTML(term)}</span>".
                    </li>`;
            } else {
                clienteList.innerHTML = clientes.map(c => `
                    <li class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-cyan-900/20 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] cursor-pointer transition-all flex items-center justify-between group" data-id="${c.id}">
                        <div>
                            <p class="font-bold text-slate-200 group-hover:text-cyan-300 transition-colors text-lg">${sanitizeHTML(c.nome)}</p>
                            <p class="text-sm text-slate-400 mt-1 flex items-center gap-1.5">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                                ${sanitizeHTML(c.email)}
                            </p>
                        </div>
                        <div class="h-10 w-10 rounded-full bg-slate-700/80 border border-slate-600 group-hover:bg-cyan-500 group-hover:border-cyan-400 flex items-center justify-center text-white transition-colors shadow-inner">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    </li>
                `).join('');
            }
        } catch (error) {
            clienteList.innerHTML = `<li class="p-4 text-center text-red-400 bg-red-900/20 rounded-xl border border-red-500/30">Erro ao procurar clientes: ${error.message}</li>`;
        }
    };
    
    searchInput.addEventListener('keyup', debounce((e) => {
        performSearch(e.target.value.trim());
    }));

    clienteList.onclick = (e) => {
        const li = e.target.closest('li');
        if (li && li.dataset.id) { 
            wizardState.cliente_id = li.dataset.id;
            wizardState.cliente_nome = li.querySelector('p.font-bold').textContent.trim();
            wizardState.step = 3;
            renderWizard();
        }
    };
}

async function renderStep3() {
    if (!cache.imoveis[wizardState.imobiliaria_id]) {
        const todosImoveis = await api.getImoveis();
        cache.imoveis[wizardState.imobiliaria_id] = todosImoveis;
    }
    const imoveis = cache.imoveis[wizardState.imobiliaria_id].filter(i => i.imobiliaria.id === wizardState.imobiliaria_id);
    
    const icon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>';

    const wizardHTML = `
        <div id="wizard-content" class="anim-slide-up">
            ${wizardHeader(3, 'Identificar Imóvel', icon)}
            
            <div class="flex flex-col sm:flex-row gap-3 mb-4">
                <div class="relative flex-grow group">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-cyan-400 transition-colors">
                        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input type="text" id="search-imovel" class="w-full bg-slate-900/50 border border-slate-600 rounded-xl pl-10 pr-4 py-3.5 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder-slate-500 shadow-inner" placeholder="Procurar por código ou morada...">
                </div>
                <button id="add-new-imovel" class="w-full sm:w-auto px-6 py-3.5 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 group transform hover:-translate-y-0.5 shadow-lg">
                    <svg class="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Novo Imóvel
                </button>
            </div>
            
            <ul id="imovel-list" class="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                ${imoveis.length > 0 ? imoveis.map(i => `
                    <li class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-cyan-900/20 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] cursor-pointer transition-all flex items-center justify-between group" data-id="${i.id}">
                        <div class="overflow-hidden pr-4">
                            <div class="flex items-center gap-2 mb-1.5">
                                <span class="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-400 font-bold tracking-wide shadow-inner">CT ${sanitizeHTML(i.cod_imovel)}</span>
                                <span class="text-[10px] text-slate-500 font-bold uppercase truncate tracking-widest">${sanitizeHTML(i.cliente.nome)}</span>
                            </div>
                            <p class="text-sm text-slate-300 group-hover:text-white truncate font-medium" title="${sanitizeHTML(i.endereco)}">${sanitizeHTML(i.endereco)}</p>
                        </div>
                        <div class="h-10 w-10 flex-shrink-0 rounded-full bg-slate-700/80 border border-slate-600 group-hover:bg-cyan-500 group-hover:border-cyan-400 flex items-center justify-center text-white transition-colors shadow-inner">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    </li>
                `).join('') : `
                    <li class="p-8 text-center text-slate-500 border border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20">
                        <svg class="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                        Nenhum imóvel registado para <strong>${sanitizeHTML(wizardState.imobiliaria_nome)}</strong>.
                    </li>
                `}
            </ul>
        </div>
        <div class="flex justify-between mt-8 pt-5 border-t border-slate-700/60">
            <button id="back-wizard" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-600 hover:text-white shadow-lg">Voltar</button>
            <button id="cancel-wizard" class="px-8 py-3.5 bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-400 hover:text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-red-500/20">Cancelar</button>
        </div>
    `;
    
    document.getElementById('modal-content').innerHTML = wizardHTML;
    
    document.getElementById('back-wizard').onclick = () => { wizardState.step = 2; renderWizard(); };
    document.getElementById('cancel-wizard').onclick = hideModal;
    document.getElementById('add-new-imovel').onclick = renderNewImovelForm;

    const list = document.getElementById('imovel-list');
    list.onclick = (e) => {
        const li = e.target.closest('li');
        if (li) {
            wizardState.imovel_id = li.dataset.id;
            wizardState.imovel_cod = li.querySelector('span.font-mono').textContent.trim();
            wizardState.step = 4;
            renderWizard();
        }
    };
    
    document.getElementById('search-imovel').onkeyup = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        list.querySelectorAll('li').forEach(li => {
            const textContent = li.textContent.toLowerCase();
            li.style.display = textContent.includes(searchTerm) ? '' : 'none';
        });
    };
}

async function renderStep4() {
    const imovel = wizardState.imovel_completo || (cache.imoveis[wizardState.imobiliaria_id]?.find(i => i.id === wizardState.imovel_id));
    
    if (imovel && imovel.imobiliaria && imovel.imobiliaria.id !== wizardState.imobiliaria_id) {
        wizardState.imobiliaria_id = imovel.imobiliaria.id;
        wizardState.imobiliaria_nome = imovel.imobiliaria.nome || wizardState.imobiliaria_nome;
    }

    const necessitaHorarioDuplo = imovel ? (imovel.tamanho >= 100 || imovel.mobiliado === 'mobiliado') : false;
    
    // Agora confiamos exclusivamente na FLAG is_external para formatar a UI do passo 4
    const isExternalRequest = !!wizardState.is_external; 
    
    const icon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>';

    const wizardHTML = `
        <div id="wizard-content" class="anim-slide-up">
            ${wizardHeader(4, 'Revisão & Confirmação', icon)}
            
            ${isExternalRequest ? `
            <div class="mb-5 p-4 bg-gradient-to-r from-purple-900/30 to-blue-900/20 border border-purple-500/30 rounded-2xl flex items-center gap-4">
                <div class="bg-purple-500/20 p-2 rounded-xl border border-purple-500/30 text-purple-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                </div>
                <div>
                    <h4 class="text-white font-bold text-sm">Agendamento via Link Externo</h4>
                    <p class="text-slate-400 text-xs mt-0.5">Os dados abaixo foram fornecidos pelo cliente/imobiliária e estão bloqueados para alteração nesta etapa.</p>
                </div>
            </div>` : ''}

            <!-- DESTAQUE VISUAL PREMIUM DO HORÁRIO -->
            <div class="mb-5 p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] relative overflow-hidden anim-scale-in">
                <div class="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <div class="flex items-center gap-4 relative z-10">
                    <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
                        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                    <div class="flex-grow">
                        <p class="text-[10px] uppercase font-bold text-emerald-400 tracking-widest mb-1">Confirmação de Horário</p>
                        <p class="text-lg sm:text-xl font-black text-white leading-tight capitalize">${wizardState.horario_selecionado_str}</p>
                        <div class="flex flex-wrap items-center gap-2 mt-2">
                            <span class="px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shadow-inner capitalize">${sanitizeHTML((wizardState.tipo || 'Vistoria').replace('_', ' '))}</span>
                            <span class="text-xs text-slate-400 font-medium flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span> Vistoriador: ${sanitizeHTML(wizardState.vistoriador_nome)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <!-- Card Imobiliária -->
                <div class="relative overflow-hidden rounded-2xl border ${isExternalRequest ? 'border-cyan-500/50 bg-slate-800/60' : 'border-slate-600 bg-slate-800/40'} p-5 transition-all shadow-inner" id="imob-confirm-card">
                    <div class="absolute left-0 top-0 h-full w-1 ${isExternalRequest ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]' : 'bg-slate-500'} transition-all"></div>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-3 ml-2 flex items-center gap-2">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        Imobiliária
                    </p>
                    <div class="flex items-center gap-3 ml-2">
                        <div class="relative flex items-center justify-center">
                            <input type="checkbox" id="confirm-imobiliaria" class="peer appearance-none w-6 h-6 border-2 border-slate-500 rounded-md bg-slate-900 checked:bg-cyan-500 checked:border-cyan-500 cursor-pointer transition-all ${isExternalRequest ? 'checked' : ''}" ${isExternalRequest ? 'checked disabled' : ''}>
                            <svg class="absolute w-4 h-4 text-slate-900 pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <label for="confirm-imobiliaria" class="text-base font-black text-white cursor-pointer select-none tracking-tight truncate w-full" title="${sanitizeHTML(wizardState.imobiliaria_nome)}">${sanitizeHTML(wizardState.imobiliaria_nome)}</label>
                    </div>
                </div>

                <!-- Resumo Cliente & Imóvel -->
                <div class="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-800/60 transition-colors">
                    <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> Cliente & Imóvel</p>
                    <p class="text-base font-bold text-slate-200 truncate mb-1" title="${sanitizeHTML(wizardState.cliente_nome)}">${sanitizeHTML(wizardState.cliente_nome)}</p>
                    <p class="text-sm font-mono text-cyan-400 font-bold bg-slate-900/50 inline-block px-2.5 py-1 rounded border border-slate-700/50">${sanitizeHTML(wizardState.imovel_cod)}</p>
                </div>
            </div>

            ${necessitaHorarioDuplo ? `
            <div class="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex gap-4 anim-scale-in">
                <div class="text-amber-500 flex-shrink-0 mt-1"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>
                <div>
                    <p class="text-sm text-amber-200 font-bold mb-1">Aviso de Dimensionamento</p>
                    <p class="text-xs text-amber-200/80 mb-3 leading-relaxed">As características deste imóvel exigem a reserva de 2 blocos de horário.</p>
                    <label class="flex items-center gap-2 cursor-pointer group w-fit">
                        <input type="checkbox" id="force-single" class="w-4 h-4 rounded border-slate-500 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900 cursor-pointer transition-colors">
                        <span class="text-xs text-slate-400 group-hover:text-amber-300 transition-colors font-medium">Ignorar regra e forçar slot único</span>
                    </label>
                </div>
            </div>` : ''}
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label for="tipo_vistoria" class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Vistoria</label>
                    <select id="tipo_vistoria" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3.5 text-white focus:ring-2 focus:ring-cyan-500 outline-none appearance-none cursor-pointer text-sm font-bold shadow-inner ${isExternalRequest ? 'opacity-70 pointer-events-none' : ''}" ${isExternalRequest ? 'disabled' : ''}>
                        <option value="ENTRADA" ${wizardState.tipo === 'ENTRADA' ? 'selected' : ''}>Entrada</option>
                        <option value="SAIDA" ${wizardState.tipo === 'SAIDA' ? 'selected' : ''}>Saída</option>
                        <option value="CONFERENCIA" ${wizardState.tipo === 'CONFERENCIA' ? 'selected' : ''}>Conferência</option>
                        <option value="AVERIGUACAO" ${wizardState.tipo === 'AVERIGUACAO' ? 'selected' : ''}>Averiguação</option>
                        <option value="COMPLEMENTO_VISITA" ${wizardState.tipo === 'COMPLEMENTO_VISITA' ? 'selected' : ''}>Complemento/Visita</option>
                    </select>
                </div>
                <div>
                    <label for="observacao_vistoriador" class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
                        <span>Observações (Vistoriador)</span>
                        <span class="font-normal opacity-50">Opcional</span>
                    </label>
                    <textarea id="observacao_vistoriador" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none resize-none h-12 shadow-inner transition-all placeholder-slate-600" placeholder="Ex: Chave na portaria..."></textarea>
                </div>
            </div>
            
            ${wizardState.observacao_privada ? `
                <div class="mt-5 p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl relative overflow-hidden">
                     <div class="absolute left-0 top-0 h-full w-1 bg-purple-500"></div>
                    <p class="text-[10px] uppercase text-purple-400 font-bold mb-1.5 tracking-widest ml-1">Nota Privada Automática</p>
                    <p class="text-sm text-slate-300 italic ml-1 leading-relaxed">${sanitizeHTML(wizardState.observacao_privada)}</p>
                </div>
            ` : ''}

        </div>
        <div class="flex justify-between mt-8 pt-5 border-t border-slate-700/60">
            <button id="back-wizard" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-600 hover:text-white">Voltar</button>
            <button id="confirm-agendamento" class="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transform hover:-translate-y-1 flex items-center gap-2 ${!isExternalRequest ? 'opacity-50 cursor-not-allowed' : ''}" ${!isExternalRequest ? 'disabled' : ''}>
                Finalizar Agendamento
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
            </button>
        </div>
    `;
    
    // Configura o visual do Modal para o Wizard
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = wizardHTML;
    modalContent.className = 'bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-3xl border border-slate-700/60 max-h-[90vh] overflow-y-auto transform transition-all';
    
    const confirmCheckbox = document.getElementById('confirm-imobiliaria');
    const confirmBtn = document.getElementById('confirm-agendamento');
    const card = document.getElementById('imob-confirm-card');
    
    if (!isExternalRequest) {
        confirmCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                card.classList.replace('border-slate-600', 'border-cyan-500/50');
                card.querySelector('.absolute').classList.replace('bg-slate-500', 'bg-cyan-500');
            } else {
                confirmBtn.disabled = true;
                confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
                card.classList.replace('border-cyan-500/50', 'border-slate-600');
                card.querySelector('.absolute').classList.replace('bg-cyan-500', 'bg-slate-500');
            }
        });
    }

    document.getElementById('back-wizard').onclick = () => { 
        // Usa a flag correta para cancelar ou retornar passo
        if (wizardState.is_external) {
            hideModal();
            showAlert('Processo de agendamento cancelado. Pode iniciar novamente na aba de Pendentes.', 'info');
        } else {
            wizardState.step = 3; 
            renderWizard(); 
        }
    };
    
    confirmBtn.onclick = async () => {
        if (!confirmCheckbox.checked) return; 
        
        const origText = confirmBtn.innerHTML;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<svg class="w-6 h-6 animate-spin mx-auto text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

        const observacao = document.getElementById('observacao_vistoriador').value;
        const data = {
            horario_id: wizardState.horario_id,
            imovel_id: wizardState.imovel_id,
            imobiliaria_id: wizardState.imobiliaria_id, 
            tipo: document.getElementById('tipo_vistoria').value,
            force_single_slot: document.getElementById('force-single')?.checked || false,
            observacao_vistoriador: observacao
        };
        
        if (wizardState.observacao_privada) {
            data.observacao_privada = wizardState.observacao_privada;
        }

        // ADIÇÃO IMPORTANTE: Propaga o ID da solicitação caso seja um fluxo de pendência
        if (wizardState.solicitacao_id) {
            data.solicitacao_id = wizardState.solicitacao_id;
        }

        try {
            // Cria na Agenda
            const resultado = await api.scheduleVistoria(data);
            hideModal();
            if(calendarRef) calendarRef.refetchEvents();
            
            // Retorna o objeto pra quem chamou
            if (wizardState.onSuccessCallback && typeof wizardState.onSuccessCallback === 'function') {
                const cachedImovel = cache.imoveis[wizardState.imobiliaria_id]?.find(i => i.id === wizardState.imovel_id) || wizardState.imovel_completo || {};
                
                const agendamentoCompleto = {
                    ...resultado,
                    data: resultado.data || wizardState.rawDate.toISOString().split('T')[0],
                    horario: resultado.horario || wizardState.horario_selecionado_str.split(' ')[1],
                    vistoriador: resultado.vistoriador || { nome: wizardState.vistoriador_nome },
                    imovel: resultado.imovel || {
                        ...cachedImovel,
                        cod_imovel: wizardState.imovel_cod.replace('CT ', ''),
                        cliente: cachedImovel.cliente || { nome: wizardState.cliente_nome } 
                    }
                };

                wizardState.onSuccessCallback(agendamentoCompleto);
            }

        } catch (error) {
            showAlert(error.message || 'Não foi possível agendar.', 'error');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = origText;
        }
    };
}

// --- Funções para Novos Cadastros (In-Wizard) ---

function renderNewClienteForm() {
    const icon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>';
    
    const formHTML = `
        <div id="wizard-content" class="anim-scale-in">
            ${wizardHeader('+', 'Adicionar Cliente', icon)}
            
            <form id="form-new-cliente" class="space-y-4">
                <div>
                    <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Nome Completo *</label>
                    <input type="text" name="nome" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">E-mail *</label>
                    <input type="email" name="email" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                         <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Telemóvel 1</label>
                        <input type="tel" name="telefone1" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                    </div>
                    <div>
                         <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Telemóvel 2</label>
                        <input type="tel" name="telefone2" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                    </div>
                </div>
                <div class="flex justify-between pt-6 border-t border-slate-700/60 mt-6">
                    <button type="button" id="back-to-wizard" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors border border-slate-600 shadow-lg hover:text-white">Cancelar</button>
                    <button type="submit" class="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/30 transform hover:-translate-y-1">Gravar Cliente</button>
                </div>
            </form>
        </div>
    `;
    document.getElementById('modal-content').innerHTML = formHTML;
    document.getElementById('back-to-wizard').onclick = renderStep2;
    document.getElementById('form-new-cliente').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const origText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.innerHTML = '<svg class="w-5 h-5 animate-spin mx-auto text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

        const data = {
            nome: form.nome.value, email: form.email.value,
            telefone1: form.telefone1.value, telefone2: form.telefone2.value
        };
        try {
            const novoCliente = await api.createCliente(data);
            showAlert('Cliente adicionado à base de dados!', 'success');
            wizardState.cliente_id = novoCliente.id;
            wizardState.cliente_nome = novoCliente.nome;
            wizardState.step = 3;
            renderWizard();
        } catch (error) {
            showAlert(error.message || 'Erro ao criar cliente.', 'error');
            submitButton.disabled = false;
            submitButton.textContent = origText;
        }
    };
}

function renderNewImovelForm() {
    const icon = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>';
    
    const formHTML = `
        <div id="wizard-content" class="anim-scale-in">
            ${wizardHeader('+', 'Adicionar Imóvel', icon)}
            
            <form id="form-new-imovel" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Código (Ex: CT123) *</label>
                        <input type="text" name="cod_imovel" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-cyan-300 font-mono focus:ring-2 focus:ring-cyan-500 outline-none transition-all uppercase shadow-inner">
                    </div>
                    <div>
                         <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Mobília *</label>
                         <select name="mobiliado" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none appearance-none shadow-inner cursor-pointer font-medium">
                            <option value="sem_mobilia">Sem Mobília</option>
                            <option value="semi_mobiliado">Semi Mobiliado</option>
                            <option value="mobiliado">Mobiliado Completo</option>
                        </select>
                    </div>
                </div>
                
                <div>
                     <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Morada Completa *</label>
                    <input type="text" name="endereco" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                         <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Código Postal</label>
                        <input type="text" name="cep" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                    </div>
                    <div>
                         <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Área (m²) *</label>
                        <input type="number" step="0.01" name="tamanho" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                    </div>
                </div>
                
                <div>
                     <label class="block text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1.5">Ponto de Referência</label>
                    <input type="text" name="referencia" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all shadow-inner">
                </div>
                
                <div class="flex justify-between pt-6 border-t border-slate-700/60 mt-6">
                    <button type="button" id="back-to-wizard" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors border border-slate-600 shadow-lg hover:text-white">Cancelar</button>
                    <button type="submit" class="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/30 transform hover:-translate-y-1">Gravar Imóvel</button>
                </div>
            </form>
        </div>
    `;
    document.getElementById('modal-content').innerHTML = formHTML;
    document.getElementById('back-to-wizard').onclick = renderStep3;
    document.getElementById('form-new-imovel').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const origText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.innerHTML = '<svg class="w-5 h-5 animate-spin mx-auto text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

        const data = {
            cod_imovel: form.cod_imovel.value.toUpperCase(),
            endereco: form.endereco.value,
            tamanho: parseFloat(form.tamanho.value),
            mobiliado: form.mobiliado.value,
            cep: form.cep.value,
            referencia: form.referencia.value,
            cliente_id: wizardState.cliente_id,
            imobiliaria_id: wizardState.imobiliaria_id
        };
        try {
            const novoImovel = await api.createImovel(data);
            showAlert('Imóvel registado com sucesso!', 'success');
            
            if (cache.imoveis[wizardState.imobiliaria_id]) {
                cache.imoveis[wizardState.imobiliaria_id].push(novoImovel);
            } else {
                cache.imoveis[wizardState.imobiliaria_id] = [novoImovel];
            }

            wizardState.imovel_id = novoImovel.id;
            wizardState.imovel_cod = `CT ${novoImovel.cod_imovel}`;
            wizardState.step = 4;
            renderWizard();
        } catch (error) {
            showAlert(error.message || 'Erro ao registar imóvel.', 'error');
            submitButton.disabled = false;
            submitButton.textContent = origText;
        }
    };
}

// --- Função de Inicialização Totalmente Blindada ---
export function startAgendamentoWizard(horario, calendarInstance, onSuccessCallback = null, initialData = null) {
    wizardState = {
        horario_id: horario.id,
        vistoriador_id: horario.extendedProps.vistoriador.id,
        vistoriador_nome: horario.extendedProps.vistoriador.nome,
        horario_selecionado_str: horario.start.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }),
        rawDate: horario.start, 
        step: 1, // Default inicial
        onSuccessCallback: onSuccessCallback
    };

    // CORREÇÃO DE BUG + FLAG EXPLÍCITA:
    // Agora o Wizard mapeia com segurança baseado na propriedade 'is_external' passada pela agenda.js
    if (initialData && initialData.is_external === true) {
        wizardState.is_external = true;
        
        // ADIÇÃO IMPORTANTE: Captura o ID da solicitação pendente para enviar à API
        wizardState.solicitacao_id = initialData.id || initialData.solicitacao_id;
        
        wizardState.imobiliaria_id = initialData.imobiliaria?.id || initialData.imobiliaria_id;
        wizardState.imobiliaria_nome = initialData.imobiliaria?.nome || 'Imobiliária Automática';
        
        wizardState.cliente_id = initialData.cliente?.id || initialData.cliente_id;
        wizardState.cliente_nome = initialData.cliente?.nome || 'Cliente Automático';
        
        wizardState.imovel_id = initialData.imovel?.id || initialData.imovel_id;
        wizardState.imovel_cod = initialData.imovel?.cod_imovel ? `CT ${initialData.imovel.cod_imovel}` : 'Cód. Automático';
        
        wizardState.imovel_completo = initialData.imovel || {}; 
        
        wizardState.tipo = initialData.tipo_vistoria || 'ENTRADA';
        wizardState.observacao_privada = initialData.observacao ? `Solicitação externa. Obs original: ${initialData.observacao}` : 'Agendamento via solicitação externa pendente.';
        
        // Pulo forçado: ignora a UI dos passos 1, 2 e 3
        wizardState.step = 4; 
    }

    calendarRef = calendarInstance;
    
    document.getElementById('generic-modal').classList.remove('hidden');
    document.getElementById('generic-modal').classList.add('flex');
    
    renderWizard();
}