import { api } from '../api.js';
import { renderPageContent, sanitizeHTML, showModal, hideModal, showAlert } from '../ui.js';

async function renderPendentesList() {
    const listContainer = document.getElementById('vistorias-pendentes-list');

    try {
        const solicitacoes = await api.getVistoriasPendentes();

        if (!solicitacoes || solicitacoes.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center bg-slate-800/40 p-10 rounded-3xl border border-slate-700/50 backdrop-blur-sm shadow-inner">
                    <div class="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-700 shadow-lg">
                        <svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    </div>
                    <p class="text-slate-300 font-bold text-lg">Caixa de Entrada Vazia</p>
                    <p class="text-slate-500 text-sm mt-1">Nenhuma solicitação externa pendente no momento.</p>
                </div>`;
            return;
        }

        // Regra solicitada: Ordenação do mais antigo para o mais recente
        const solicitacoesOrdenadas = solicitacoes.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        listContainer.innerHTML = solicitacoesOrdenadas.map(solic => {
            const dataSolicitacao = new Date(solic.created_at);
            const hoje = new Date();
            const isHoje = dataSolicitacao.toDateString() === hoje.toDateString();
            const dataLabel = isHoje ? 'Hoje, ' + dataSolicitacao.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : dataSolicitacao.toLocaleDateString('pt-BR');

            return `
            <div class="group relative bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-800/80 hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 overflow-hidden">
                <div class="absolute top-0 left-0 w-1 h-full bg-slate-600 group-hover:bg-cyan-500 transition-colors duration-300 shadow-[0_0_10px_rgba(6,182,212,0)] group-hover:shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pl-2">
                    <div class="w-full sm:w-auto flex-grow">
                        <div class="flex items-center gap-3 mb-2.5">
                            <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-widest shadow-inner">
                                ${sanitizeHTML(solic.tipo_vistoria)}
                            </span>
                            <span class="text-xs text-slate-400 font-medium flex items-center gap-1.5 bg-slate-900/50 px-2 py-1 rounded-md border border-slate-700/50">
                                <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                ${dataLabel}
                            </span>
                            ${solic.status === 'PENDENTE_ADMIN' ? '<span class="flex h-2 w-2 relative"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span></span>' : ''}
                        </div>
                        
                        <div class="flex items-baseline gap-2 mb-1">
                            <h3 class="font-black text-white text-xl tracking-tight">CT ${sanitizeHTML(solic.imovel?.cod_imovel || '---')}</h3>
                            <span class="text-sm text-slate-500 font-medium">| ${sanitizeHTML(solic.imobiliaria?.nome || 'Imobiliária não identificada')}</span>
                        </div>
                        <p class="text-sm text-slate-300 flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            ${sanitizeHTML(solic.cliente?.nome || 'N/A')}
                        </p>
                    </div>
                    
                    <button class="btn-ver-detalhes w-full sm:w-auto px-6 py-3 bg-slate-700/80 hover:bg-cyan-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-cyan-500/25 flex items-center justify-center gap-2 transform hover:-translate-y-1 border border-slate-600 hover:border-cyan-500" data-id='${solic.id}'>
                        Exibir Detalhes
                        <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.btn-ver-detalhes').forEach(btn => {
            btn.addEventListener('click', (e) => abrirModalDetalhes(e.currentTarget.dataset.id));
        });

    } catch (error) {
        showAlert(error.message || 'Erro ao buscar vistorias pendentes.', 'error');
        listContainer.innerHTML = `<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-red-400 text-sm font-medium"><p>${error.message}</p></div>`;
    }
}

async function abrirModalDetalhes(solicitacaoId) {
    // Skeleton loader premium
    showModal(`
        <div class="flex flex-col items-center justify-center py-12">
            <div class="relative w-16 h-16 mb-4">
                <div class="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                <div class="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p class="text-cyan-400 font-bold tracking-widest uppercase text-xs animate-pulse">Sincronizando Dados...</p>
        </div>
    `, 'max-w-sm');

    try {
        const fullData = await api.getSolicitacaoInfo(solicitacaoId);

        const cardSection = (title, icon, content, colorClass) => `
            <div class="relative overflow-hidden bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4 transition-all hover:bg-slate-800/60 hover:border-${colorClass}-500/30">
                <div class="absolute top-0 left-0 w-1 h-full bg-${colorClass}-500 opacity-50"></div>
                <h4 class="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-${colorClass}-400 mb-3 ml-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icon}</svg>
                    ${title}
                </h4>
                <div class="ml-2 space-y-1.5">
                    ${content}
                </div>
            </div>
        `;

        const modalHTML = `
            <div class="anim-slide-up">
                <!-- Header do Modal -->
                <div class="flex items-center justify-between gap-3 mb-6 border-b border-slate-700/60 pb-5">
                    <div class="flex items-center gap-4">
                        <div class="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                            <div class="absolute inset-0 bg-white/20 rounded-2xl backdrop-blur-sm"></div>
                            <svg class="relative z-10 h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        </div>
                        <div>
                            <h3 class="text-2xl font-black text-white tracking-tight leading-none mb-1">Análise de Solicitação</h3>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Protocolo #${fullData.id.split('-')[0]}</p>
                        </div>
                    </div>
                    <button id="btn-close-modal-top" class="text-slate-500 hover:text-white transition-colors p-2 bg-slate-800 rounded-full border border-slate-700 hover:bg-slate-700">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <!-- Grid de 4 Seções -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    
                    <!-- 1. Cliente -->
                    ${cardSection('Dados do Cliente', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>', `
                        <p class="text-base font-bold text-white leading-tight">${sanitizeHTML(fullData.cliente?.nome || 'Não informado')}</p>
                        <p class="text-sm text-slate-400 truncate">${sanitizeHTML(fullData.cliente?.email || 'Sem e-mail')}</p>
                        <p class="text-sm text-slate-400">${sanitizeHTML(fullData.cliente?.telefone1 || fullData.cliente?.telefone2 || 'Sem telefone')}</p>
                    `, 'purple')}

                    <!-- 2. Imóvel -->
                    ${cardSection('Informações do Imóvel', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>', `
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="text-base font-bold text-white mb-0.5">CT ${sanitizeHTML(fullData.imovel?.cod_imovel || 'N/A')}</p>
                                <p class="text-xs text-slate-400 leading-snug truncate max-w-[200px]" title="${sanitizeHTML(fullData.imovel?.endereco || '')}">${sanitizeHTML(fullData.imovel?.endereco || 'Endereço não informado')}</p>
                            </div>
                            <div class="text-right">
                                <span class="bg-slate-900 px-2.5 py-1 rounded text-[10px] font-bold text-slate-300 border border-slate-700 block mb-1 whitespace-nowrap">${fullData.imovel?.tamanho || 0} m²</span>
                                <span class="bg-slate-900 px-2.5 py-1 rounded text-[10px] font-bold text-slate-300 border border-slate-700 block capitalize whitespace-nowrap">${sanitizeHTML((fullData.imovel?.mobiliado || 'N/A').replace('_', ' '))}</span>
                            </div>
                        </div>
                    `, 'cyan')}

                    <!-- 3. Imobiliária -->
                    ${cardSection('Imobiliária Solicitante', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>', `
                        <p class="text-base font-bold text-white mb-1">${sanitizeHTML(fullData.imobiliaria?.nome || 'Não identificada')}</p>
                        <p class="text-xs text-slate-500 font-medium">Link originado do portal externo</p>
                    `, 'blue')}

                    <!-- 4. Solicitação -->
                    ${cardSection('Detalhes do Serviço', '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>', `
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">${sanitizeHTML(fullData.tipo_vistoria)}</span>
                            <span class="text-[10px] text-slate-500 font-medium">${new Date(fullData.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        ${fullData.observacao ? `
                            <p class="text-xs text-slate-300 italic bg-slate-900/50 p-2 rounded-lg border border-slate-700/50 line-clamp-2" title="${sanitizeHTML(fullData.observacao)}">"${sanitizeHTML(fullData.observacao)}"</p>
                        ` : '<p class="text-xs text-slate-500 italic">Nenhuma observação enviada.</p>'}
                    `, 'emerald')}

                </div>

                <!-- Ações -->
                <div class="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-700/60">
                    <button id="btn-fechar-detalhes" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors border border-slate-600">Cancelar</button>
                    <button id="btn-ir-agenda" class="px-8 py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transform hover:-translate-y-1 flex items-center justify-center gap-2 border border-emerald-400/50">
                        Agendar Vistoria
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </button>
                </div>
            </div>
        `;

        showModal(modalHTML, 'max-w-3xl');

        document.getElementById('btn-close-modal-top').onclick = hideModal;
        document.getElementById('btn-fechar-detalhes').onclick = hideModal;
        
        document.getElementById('btn-ir-agenda').onclick = () => {
            // Guarda TODA a informação carregada para o wizard
            sessionStorage.setItem('agendamentoPendenteState', JSON.stringify(fullData));
            hideModal();
            window.location.hash = '#agenda'; // Aciona o router principal para mudar de tela
        };

    } catch (error) {
        showModal(`
            <div class="text-center py-8 anim-scale-in">
                <div class="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-500/10 border-2 border-red-500/20 mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                    <svg class="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-2xl font-black text-white mb-2">Erro de Sincronização</h3>
                <p class="text-slate-400 mb-8 font-medium">${error.message || 'Não foi possível buscar os dados da solicitação do servidor.'}</p>
                <button onclick="hideModal()" class="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors border border-slate-600">Fechar Janela</button>
            </div>
        `, 'max-w-md');
    }
}

export async function initVistoriasPendentes() {
    const pageHTML = `
        <div class="flex flex-col mb-8 anim-fade-in relative">
            <div class="absolute -top-10 left-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 tracking-tight z-10">Vistorias Pendentes</h1>
            <p class="text-slate-400 text-sm mt-2 font-medium z-10 flex items-center gap-2">
                <svg class="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Solicitações externas aguardando validação e alocação no calendário
            </p>
        </div>
        
        <div id="vistorias-pendentes-list" class="space-y-4 anim-slide-up relative z-10">
            <!-- Loading State -->
            <div class="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-slate-700/30 rounded-3xl backdrop-blur-sm">
                <div class="relative w-16 h-16 mb-4">
                    <div class="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p class="text-cyan-400 font-bold tracking-widest uppercase text-xs animate-pulse">Carregando Solicitações...</p>
            </div>
        </div>
    `;
    renderPageContent(pageHTML);
    await renderPendentesList();
}