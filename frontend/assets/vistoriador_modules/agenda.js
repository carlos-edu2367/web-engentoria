import { api } from './api.js';
import { openModal, closeModal, formatDate, showNotification, sanitizeHTML } from './utils.js';

// Estado local para controle dos filtros
let currentFilter = 'week'; // Padrão: 'week', 'last_15', 'next_15'

export async function renderAgenda(container) {
    // UX MOBILE: Navegação por Pills
    container.innerHTML = `
        <div class="space-y-4 fade-in pb-24 max-w-lg mx-auto md:max-w-4xl">
            
            <!-- Header Fixo e Compacto -->
            <div class="sticky top-0 bg-slate-900/95 backdrop-blur z-20 border-b border-slate-800/50 pt-4 pb-2 px-2 transition-all">
                <div class="flex items-center justify-between mb-3 px-2">
                    <h2 class="text-xl font-bold text-white">Minha Agenda</h2>
                    <button id="refresh-agenda" class="p-2 bg-slate-800 rounded-full text-teal-400 hover:bg-slate-700 transition shadow-sm border border-slate-700 active:scale-90">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                </div>

                <!-- Navegação por Pills (Horizontal Scroll) -->
                <div class="flex gap-3 overflow-x-auto custom-scrollbar pb-2 px-1 select-none" id="filter-container">
                    <button data-filter="last_15" class="filter-pill whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 flex-shrink-0">
                        Últimos 15 dias
                    </button>
                    <button data-filter="week" class="filter-pill whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 flex-shrink-0">
                        Próximos 7 dias
                    </button>
                    <button data-filter="next_15" class="filter-pill whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 flex-shrink-0">
                        Próximos 15 dias
                    </button>
                </div>
            </div>

            <div id="agenda-list-container" class="space-y-6 min-h-[60vh] px-1">
                <!-- Skeleton Loader -->
                <div class="space-y-3 mt-4">
                    <div class="h-4 w-24 bg-slate-800 rounded animate-pulse mb-2"></div>
                    <div class="h-24 bg-slate-800 rounded-xl animate-pulse"></div>
                    <div class="h-24 bg-slate-800 rounded-xl animate-pulse"></div>
                </div>
            </div>
        </div>
    `;

    setupFilters();
    
    document.getElementById('refresh-agenda').onclick = () => loadAgendaList(currentFilter);
    
    // Carrega filtro padrão
    await loadAgendaList(currentFilter);
}

function setupFilters() {
    const pills = document.querySelectorAll('.filter-pill');
    
    const updateActiveState = (selectedFilter) => {
        pills.forEach(btn => {
            const filter = btn.dataset.filter;
            if (filter === selectedFilter) {
                btn.className = 'filter-pill whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border border-teal-500 bg-teal-500/20 text-teal-300 shadow-[0_0_10px_rgba(20,184,166,0.3)] flex-shrink-0 transition-all';
            } else {
                btn.className = 'filter-pill whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 flex-shrink-0 transition-all';
            }
        });
    };

    pills.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.dataset.filter;
            if (currentFilter !== filter) {
                currentFilter = filter;
                updateActiveState(currentFilter);
                loadAgendaList(currentFilter);
            }
        });
    });

    updateActiveState(currentFilter);
}

async function loadAgendaList(filterType) {
    const container = document.getElementById('agenda-list-container');
    container.style.opacity = '0.5';
    
    try {
        const apiPeriodo = filterType === 'last_15' ? '30dias' : 'mes';
        const rawData = await api.getMinhaAgenda(apiPeriodo);
        container.style.opacity = '1';
        
        const filteredData = filterDataByRange(rawData, filterType);

        if (!filteredData || filteredData.length === 0) {
            renderEmptyState(container, filterType);
            return;
        }

        const grouped = groupEventsByDay(filteredData);
        const sortedDates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
        
        container.innerHTML = sortedDates.map(dateKey => {
            const events = grouped[dateKey];
            const dateObj = new Date(dateKey + 'T00:00:00'); 
            
            const isToday = new Date().toDateString() === dateObj.toDateString();
            const isPast = dateObj < new Date().setHours(0,0,0,0);
            
            const dateLabel = isToday ? 'Hoje' : dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
            const dateFull = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            
            const headerColor = isToday ? 'text-teal-400' : (isPast ? 'text-slate-500' : 'text-white');
            const bgHeader = isToday ? 'bg-slate-900/95 border-l-4 border-teal-500 pl-2' : 'bg-slate-900/90';

            return `
                <div class="animate-fade-in mb-6">
                    <div class="flex items-baseline gap-2 mb-3 sticky top-[100px] ${bgHeader} backdrop-blur py-2 z-10 rounded-r-lg transition-all">
                        <span class="text-lg font-bold ${headerColor} capitalize">${dateLabel}</span>
                        <span class="text-sm text-slate-600 font-medium">${dateFull}</span>
                    </div>
                    <div class="space-y-3">
                        ${events.map(ev => renderCard(ev, isPast)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.agenda-card').forEach(card => {
            card.addEventListener('click', () => {
                const eventData = JSON.parse(decodeURIComponent(card.dataset.event));
                showVistoriaDetails(eventData);
            });
        });

    } catch (error) {
        console.error(error);
        container.style.opacity = '1';
        container.innerHTML = `<div class="p-4 bg-red-900/20 text-red-300 rounded-lg text-center text-sm border border-red-900/30">Erro ao carregar agenda: ${error.message}</div>`;
    }
}

function filterDataByRange(data, filterType) {
    if (!data) return [];
    const today = new Date();
    today.setHours(0,0,0,0);

    return data.filter(item => {
        const itemDate = new Date(item.data + 'T00:00:00');
        const diffTime = itemDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        switch (filterType) {
            case 'last_15': return diffDays >= -15 && diffDays < 0;
            case 'week': return diffDays >= 0 && diffDays <= 6;
            case 'next_15': return diffDays >= 1 && diffDays <= 15;
            default: return true;
        }
    });
}

function renderEmptyState(container, filterType) {
    const messages = {
        'last_15': 'Nenhum histórico nos últimos 15 dias.',
        'week': 'Tudo tranquilo! Nada agendado para esta semana.',
        'next_15': 'Agenda livre para a próxima quinzena.'
    };

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-slate-500 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700 mt-8">
            <svg class="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <p class="text-sm font-medium text-slate-400">${messages[filterType] || 'Nenhum agendamento.'}</p>
        </div>
    `;
}

function groupEventsByDay(events) {
    events.sort((a, b) => new Date(`${a.data}T${a.horario}`) - new Date(`${b.data}T${b.horario}`));
    return events.reduce((groups, ev) => {
        const date = ev.data;
        if (!groups[date]) groups[date] = [];
        groups[date].push(ev);
        return groups;
    }, {});
}

function renderCard(ev, isPast) {
    const isLivre = !ev.imovel;
    const tipoColor = ev.tipo === 'ENTRADA' ? 'text-teal-400 bg-teal-400/10' : 
                      ev.tipo === 'SAIDA' ? 'text-blue-400 bg-blue-400/10' : 
                      'text-slate-400 bg-slate-700/50';
    const opacityClass = isPast ? 'opacity-60 grayscale' : '';

    if (isLivre) {
        return `
            <div class="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 flex items-center justify-between opacity-50 ${isPast ? 'hidden' : ''}">
                <div class="flex items-center gap-3">
                    <span class="text-sm font-mono text-slate-500 font-bold">${ev.horario.substring(0, 5)}</span>
                    <span class="text-sm text-slate-600 italic">Livre</span>
                </div>
                <div class="h-1.5 w-1.5 rounded-full bg-slate-700"></div>
            </div>
        `;
    }

    const jsonEvent = encodeURIComponent(JSON.stringify(ev));
    
    return `
        <div class="agenda-card bg-slate-800 border border-slate-700/60 rounded-xl p-4 shadow-sm active:scale-[0.98] transition-transform cursor-pointer hover:border-teal-500/30 relative overflow-hidden ${opacityClass}" data-event="${jsonEvent}">
            <div class="absolute left-0 top-0 bottom-0 w-1 ${ev.tipo === 'ENTRADA' ? 'bg-teal-500' : 'bg-blue-500'}"></div>
            
            <div class="flex justify-between items-start mb-2 pl-3">
                <span class="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-md ${tipoColor}">${ev.tipo}</span>
                <span class="text-sm font-mono font-bold text-white">${ev.horario.substring(0, 5)}</span>
            </div>
            
            <div class="pl-3">
                <h3 class="text-lg font-bold text-white leading-tight mb-1">CT ${sanitizeHTML(ev.imovel.cod_imovel)}</h3>
                <p class="text-sm text-slate-400 line-clamp-1">${sanitizeHTML(ev.imovel.endereco)}</p>
                
                <div class="flex items-center gap-2 mt-3 text-xs text-slate-500">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    <span class="truncate max-w-[150px]">${sanitizeHTML(ev.imovel.imobiliaria?.nome || ev.imovel.imobiliaria || 'Imobiliária')}</span>
                </div>
            </div>
        </div>
    `;
}

// === DETALHES COMPLETOS (Restaurado) ===
async function showVistoriaDetails(vistoria) {
    if (!vistoria.imovel) return;
    const imovel = vistoria.imovel;
    const cliente = imovel.cliente || {};
    const imobiliaria = imovel.imobiliaria || {};
    const imobiliariaNome = imobiliaria.nome || imobiliaria || 'N/A';

    const modalHTML = `
        <!-- Header Fixo do Modal -->
        <div class="sticky top-0 bg-slate-900 z-30 pb-2 border-b border-slate-800 -mx-4 px-4 md:mx-0 md:px-0 pt-2">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Detalhes</span>
                    <h3 class="text-2xl font-bold text-white">CT ${sanitizeHTML(imovel.cod_imovel)}</h3>
                </div>
                <button id="close-modal-btn" class="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
        </div>

        <!-- Corpo Scrollável com Conteúdo Unificado -->
        <div id="modal-body-content" class="pt-4 pb-24 space-y-6">
            
            <!-- 1. BLOCO DE INFORMAÇÕES -->
            <div class="animate-fade-in space-y-4">
                
                <!-- Status/Horário -->
                <div class="flex gap-2">
                    <div class="flex-1 bg-slate-800 p-3 rounded-xl border border-slate-700/50 text-center">
                        <p class="text-[10px] text-slate-500 uppercase font-bold">Data</p>
                        <p class="text-sm font-bold text-white whitespace-nowrap">${formatDate(vistoria.data)}</p>
                    </div>
                    <div class="flex-1 bg-slate-800 p-3 rounded-xl border border-slate-700/50 text-center">
                        <p class="text-[10px] text-slate-500 uppercase font-bold">Horário</p>
                        <p class="text-sm font-bold text-teal-400 font-mono">${vistoria.horario}</p>
                    </div>
                    <div class="flex-1 bg-slate-800 p-3 rounded-xl border border-slate-700/50 text-center">
                        <p class="text-[10px] text-slate-500 uppercase font-bold">Tipo</p>
                        <p class="text-sm font-bold text-white whitespace-nowrap">${vistoria.tipo}</p>
                    </div>
                </div>

                <!-- Dados do Imóvel -->
                <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <h4 class="text-xs font-bold text-teal-500 uppercase mb-3 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                        Imóvel
                    </h4>
                    <div class="space-y-3">
                        <div>
                            <p class="text-[10px] text-slate-500 uppercase">Endereço</p>
                            <p class="text-sm text-slate-200 leading-snug">${sanitizeHTML(imovel.endereco)}</p>
                            ${imovel.complemento ? `<p class="text-xs text-slate-400 mt-0.5">${sanitizeHTML(imovel.complemento)}</p>` : ''}
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700/50">
                            <div>
                                <p class="text-[10px] text-slate-500 uppercase">Metragem</p>
                                <p class="text-sm text-slate-200 font-medium">${imovel.tamanho ? imovel.tamanho + ' m²' : 'N/D'}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-slate-500 uppercase">Mobília</p>
                                <p class="text-sm text-slate-200 capitalize font-medium">${(imovel.mobiliado || 'N/D').replace('_', ' ')}</p>
                            </div>
                        </div>
                        <div class="pt-2 border-t border-slate-700/50">
                            <p class="text-[10px] text-slate-500 uppercase">Imobiliária</p>
                            <p class="text-sm text-slate-200 font-medium">${sanitizeHTML(imobiliariaNome)}</p>
                        </div>
                    </div>
                </div>

                <!-- Dados do Cliente -->
                <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <h4 class="text-xs font-bold text-blue-400 uppercase mb-3 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        Cliente
                    </h4>
                    <div class="flex items-start gap-3">
                        <div class="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 font-bold shrink-0">
                            ${(cliente.nome || 'C').charAt(0)}
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-white truncate">${sanitizeHTML(cliente.nome || 'Nome não informado')}</p>
                            <p class="text-xs text-slate-400 truncate mt-0.5">${sanitizeHTML(cliente.email || 'Email não informado')}</p>
                            ${cliente.email ? `
                            <a href="mailto:${cliente.email}" class="inline-flex items-center gap-1 mt-2 text-xs bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 rounded text-slate-300 transition-colors">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                                Enviar Email
                            </a>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Observação (Destacada) -->
                ${vistoria.observacao_vistoriador ? `
                <div class="bg-amber-900/10 p-4 rounded-xl border border-amber-500/20 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                    <p class="text-xs text-amber-500 font-bold uppercase mb-1 flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Observação Importante
                    </p>
                    <p class="text-sm text-amber-100/90 leading-relaxed font-medium">
                        "${sanitizeHTML(vistoria.observacao_vistoriador)}"
                    </p>
                </div>` : ''}
            </div>

            <!-- Divisor -->
            <div class="h-px bg-slate-800 w-full my-6"></div>

            <!-- 2. MURAL DE RECADOS (Integrado) -->
            <div class="animate-fade-in">
                <h4 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                    Mural de Recados
                </h4>
                
                <div class="bg-slate-800/30 border border-slate-800 rounded-xl p-3">
                    <div id="mural-list" class="max-h-48 overflow-y-auto custom-scrollbar space-y-3 mb-3 min-h-[60px]">
                        <p class="text-center text-slate-500 text-xs py-4">Carregando...</p>
                    </div>
                    <div class="flex gap-2">
                        <input id="mural-input" type="text" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-teal-500 outline-none transition-colors text-white placeholder-slate-500" placeholder="Digite um recado...">
                        <button id="btn-send-mural" class="bg-teal-600 p-2 rounded-lg text-white hover:bg-teal-500 transition-colors shadow-lg shrink-0">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Divisor -->
            <div class="h-px bg-slate-800 w-full my-6"></div>

            <!-- 3. ANEXOS (Integrado) -->
            <div class="animate-fade-in">
                <h4 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                    Anexos e Documentos
                </h4>

                <div id="docs-list" class="grid grid-cols-1 gap-2 mb-3">
                    <!-- Lista preenchida via JS -->
                </div>

                <label class="flex items-center justify-center gap-2 w-full cursor-pointer bg-slate-800 hover:bg-slate-700 py-3 rounded-xl border border-dashed border-slate-600 transition-colors group">
                    <svg class="w-5 h-5 text-teal-500 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    <span class="text-sm text-slate-300 font-medium">Anexar Documento</span>
                    <input type="file" id="doc-upload" class="hidden">
                </label>
            </div>

        </div>

        <!-- Botão de Ação Flutuante (Sticky Bottom) -->
        <div class="fixed bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-800 md:absolute md:rounded-b-2xl z-20">
            <button id="btn-acessar-laudo" class="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-600 active:from-teal-600 active:to-emerald-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]">
                <span>Acessar Laudo</span>
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                <svg class="animate-spin h-5 w-5 hidden" id="laudo-loading" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
        </div>
    `;

    openModal(modalHTML, 'max-w-md h-full md:h-auto');

    // Carregamento dos dados auxiliares
    loadMural(vistoria.id);
    loadDocs(vistoria.id);

    // --- Lógica do Botão Acessar Laudo ---
    document.getElementById('btn-acessar-laudo').onclick = () => {
        closeModal();
        window.location.hash = `laudo?agendamento_id=${vistoria.id}`;
    };

    document.getElementById('close-modal-btn').onclick = closeModal;
}

// --- Helpers de Carregamento (Mural e Docs) ---
async function loadMural(id) {
    const list = document.getElementById('mural-list');
    if(!list) return;

    try {
        const data = await api.getComentarios(id);
        if(!data.comentarios?.length) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-4 text-slate-500">
                    <p class="text-xs">Nenhum recado ainda.</p>
                </div>
            `;
        } else {
            list.innerHTML = data.comentarios.map(c => `
                <div class="mb-3 flex flex-col ${c.remetente === 'vistoriador' ? 'items-end' : 'items-start'}">
                    <div class="max-w-[90%] px-3 py-2 rounded-2xl text-xs ${c.remetente === 'vistoriador' ? 'bg-teal-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}">
                        ${sanitizeHTML(c.conteudo)}
                    </div>
                    <span class="text-[9px] text-slate-500 mt-1 px-1">
                        ${c.remetente === 'vistoriador' ? 'Você' : 'Admin'} • ${new Date(c.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    </span>
                </div>
            `).join('');
            // Scroll para o final
            setTimeout(() => list.scrollTop = list.scrollHeight, 50);
        }
    } catch(e) { list.innerHTML = '<p class="text-red-400 text-xs text-center">Erro ao carregar.</p>'; }

    // Rebind do envio
    const btnSend = document.getElementById('btn-send-mural');
    const input = document.getElementById('mural-input');
    // Clone para remover listeners antigos
    const newBtn = btnSend.cloneNode(true);
    btnSend.parentNode.replaceChild(newBtn, btnSend);
    
    const sendMessage = async () => {
        if(!input.value.trim()) return;
        try {
            await api.postComentario(id, input.value);
            input.value = '';
            loadMural(id);
        } catch(e) { showNotification('Erro ao enviar', 'error'); }
    };

    newBtn.onclick = sendMessage;
    input.onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };
}

async function loadDocs(id) {
    const list = document.getElementById('docs-list');
    if(!list) return;

    try {
        const data = await api.getDocumentos(id);
        if(!data.documentos?.length) {
            list.innerHTML = ''; // Limpa para não mostrar mensagem de vazio redundante, o botão anexar já está visível
        } else {
            list.innerHTML = data.documentos.map(d => `
                <div class="flex items-center gap-3 bg-slate-800 p-2 px-3 rounded-lg border border-slate-700/50">
                    <div class="h-8 w-8 rounded bg-slate-700 flex items-center justify-center text-teal-400 shrink-0">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <a href="${d.link}" target="_blank" class="block text-xs font-medium text-white truncate hover:text-teal-400 transition-colors">
                            ${sanitizeHTML(d.nome || d.file_path)}
                        </a>
                        <p class="text-[10px] text-slate-500">Documento</p>
                    </div>
                    <button class="p-1.5 text-slate-500 hover:text-red-400 transition-colors" onclick="window.deleteDoc('${d.id}', '${id}')">
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `).join('');
        }
    } catch(e) { list.innerHTML = '<p class="text-red-400 text-xs text-center">Erro ao carregar docs.</p>'; }

    // Global delete helper
    window.deleteDoc = async (docId, agendaId) => {
        if(confirm('Tem certeza que deseja excluir este anexo?')) {
            try { await api.deleteDocumento(docId); loadDocs(agendaId); }
            catch(e) { showNotification('Erro ao excluir', 'error'); }
        }
    };

    // Bind Upload
    const input = document.getElementById('doc-upload');
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.onchange = async () => {
        if(!newInput.files.length) return;
        const fd = new FormData();
        fd.append('file', newInput.files[0]);
        fd.append('id_agendamento', id);
        try {
            showNotification('Enviando anexo...', 'info');
            await api.uploadDocumento(fd);
            showNotification('Enviado com sucesso');
            loadDocs(id);
        } catch(e) { showNotification('Erro no upload', 'error'); }
    };
}