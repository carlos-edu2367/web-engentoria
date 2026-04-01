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
    // Função auxiliar para evitar "null" na tela
    const safeStr = (str, fallback = 'Não informado') => str ? sanitizeHTML(str) : fallback;
    
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

        // Tratamentos específicos
        const telefones = [fullData.cliente?.telefone1, fullData.cliente?.telefone2].filter(Boolean).join(' / ') || 'Sem telefone';
        const dataCriacao = fullData.created_at ? new Date(fullData.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Data indisponível';
        const isMobiliado = fullData.imovel?.mobiliado ? fullData.imovel.mobiliado.replace('_', ' ') : 'N/A';
        const temAnexos = fullData.anexos && fullData.anexos.length > 0;

        // Renderizador de anexos (suporta tanto array de strings quanto array de objetos)
        let anexosHTML = '';
        if (temAnexos) {
            const listaAnexos = fullData.anexos.map((anexo, index) => {
                const url = typeof anexo === 'string' ? anexo : (anexo.link || '#');
                const nome = typeof anexo === 'string' ? `Documento ${index + 1}` : (anexo.nome || anexo.name || `Documento ${index + 1}`);
                
                return `
                    <a href="${url}" target="_blank" rel="noopener noreferrer" title="${sanitizeHTML(nome)}" 
                       class="group/anexo flex items-center gap-2 px-3 py-2 bg-slate-900/60 hover:bg-emerald-900/20 border border-slate-700/60 hover:border-emerald-500/50 rounded-lg text-xs text-slate-300 hover:text-emerald-400 transition-all duration-300">
                        <svg class="w-3.5 h-3.5 text-slate-500 group-hover/anexo:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                        <span class="truncate max-w-[120px] font-medium">${sanitizeHTML(nome)}</span>
                        <svg class="w-3.5 h-3.5 opacity-0 group-hover/anexo:opacity-100 transition-opacity ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                `;
            }).join('');

            anexosHTML = `
                <div class="mt-4 pt-4 border-t border-slate-700/50">
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                        Arquivos Anexados (${fullData.anexos.length})
                    </p>
                    <div class="flex flex-wrap gap-2">
                        ${listaAnexos}
                    </div>
                </div>
            `;
        }

        const modalHTML = `
<div class="anim-slide-up w-full">
    <!-- Header do Modal -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-700/60 pb-5">
        <div class="flex items-center gap-4">
            <div class="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_25px_rgba(6,182,212,0.4)]">
                <div class="absolute inset-0 bg-white/20 rounded-2xl backdrop-blur-sm"></div>
                <svg class="relative z-10 h-7 w-7 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <div>
                <div class="flex items-center gap-3 mb-1.5">
                    <h3 class="text-xl sm:text-2xl font-black text-white tracking-tight leading-none">Análise de Solicitação</h3>
                    ${fullData.status ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${fullData.status === 'pendente' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}">${safeStr(fullData.status)}</span>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <span class="flex h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></span>
                    <p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Protocolo #${fullData.id ? fullData.id.split('-')[0] : 'NOVO'}</p>
                </div>
            </div>
        </div>
        <button id="btn-close-modal-top" class="self-end sm:self-center text-slate-400 hover:text-white transition-all p-2.5 bg-slate-800/50 rounded-full border border-slate-700 hover:bg-slate-700 hover:scale-105 active:scale-95">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    </div>

    <!-- Grid de 4 Seções -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        
        <!-- 1. Cliente -->
        <div class="group relative bg-slate-800/40 rounded-2xl p-5 border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 overflow-hidden shadow-lg">
            <div class="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-purple-500/20 transition-all duration-500 pointer-events-none"></div>
            
            <div class="flex items-center gap-3 mb-4 relative z-10">
                <div class="p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                </div>
                <h4 class="text-lg font-bold text-white">Dados do Cliente</h4>
            </div>

            <ul class="space-y-3 relative z-10">
                <li class="flex items-center gap-3">
                    <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"></path></svg>
                    <span class="text-sm font-semibold text-slate-200">${safeStr(fullData.cliente?.nome)}</span>
                </li>
                <li class="flex items-center gap-3">
                    <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z"></path></svg>
                    <span class="text-sm text-slate-400 truncate">${safeStr(fullData.cliente?.email, 'Sem e-mail')}</span>
                </li>
                <li class="flex items-center gap-3">
                    <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                    <span class="text-sm text-slate-400">${telefones}</span>
                </li>
            </ul>
        </div>

        <!-- 2. Imóvel -->
        <div class="group relative bg-slate-800/40 rounded-2xl p-5 border border-slate-700/50 hover:border-cyan-500/50 transition-all duration-300 overflow-hidden shadow-lg">
            <div class="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-cyan-500/20 transition-all duration-500 pointer-events-none"></div>
            
            <div class="flex items-center justify-between mb-4 relative z-10">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                    </div>
                    <h4 class="text-lg font-bold text-white">Informações do Imóvel</h4>
                </div>
                <span class="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-xs font-bold tracking-wide">CT ${safeStr(fullData.imovel?.cod_imovel, 'N/A')}</span>
            </div>

            <ul class="space-y-3 relative z-10">
                <li class="flex items-start gap-3">
                    <svg class="w-4 h-4 text-slate-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <div>
                        <span class="text-sm text-slate-300 leading-snug block">${safeStr(fullData.imovel?.endereco)}</span>
                        ${fullData.imovel?.cep ? `<span class="text-[11px] text-slate-500 block mt-0.5">CEP: ${sanitizeHTML(fullData.imovel.cep)}</span>` : ''}
                        ${fullData.imovel?.referencia ? `<span class="text-[11px] text-slate-500 block mt-0.5">Ref: ${sanitizeHTML(fullData.imovel.referencia)}</span>` : ''}
                    </div>
                </li>
                <li class="flex items-center gap-4">
                    <div class="flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                        <span class="text-sm font-medium text-slate-400">${fullData.imovel?.tamanho || 0} m²</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        <span class="text-sm font-medium text-slate-400 capitalize">${isMobiliado}</span>
                    </div>
                </li>
            </ul>
        </div>

        <!-- 3. Imobiliária / Financeiro -->
        <div class="group relative bg-slate-800/40 rounded-2xl p-5 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 overflow-hidden shadow-lg">
            <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-500/20 transition-all duration-500 pointer-events-none"></div>
            
            <div class="flex items-center gap-3 mb-3 relative z-10">
                <div class="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                </div>
                <h4 class="text-lg font-bold text-white">Imobiliária Responsável</h4>
            </div>

            <div class="relative z-10 space-y-2">
                <div class="flex items-center gap-2 text-sm">
                    <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    <span class="font-semibold text-slate-200">${safeStr(fullData.imobiliaria?.nome)}</span>
                </div>
                <div class="flex items-center gap-2 text-xs text-slate-400">
                    <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>Saldo Devedor Cliente: <strong class="text-slate-300">R$ ${(fullData.cliente?.saldo_devedor_total || 0).toFixed(2).replace('.', ',')}</strong></span>
                </div>
            </div>
        </div>

        <!-- 4. Solicitação -->
        <div class="group relative bg-slate-800/40 rounded-2xl p-5 border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300 overflow-hidden shadow-lg flex flex-col justify-between">
            <div class="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-emerald-500/20 transition-all duration-500 pointer-events-none"></div>
            
            <div>
                <div class="flex items-center gap-3 mb-4 relative z-10">
                    <div class="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    </div>
                    <h4 class="text-lg font-bold text-white">Detalhes do Serviço</h4>
                </div>

                <div class="relative z-10 space-y-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ${safeStr(fullData.tipo_vistoria, 'Não definido')}
                        </span>
                        <span class="flex items-center gap-1.5 text-xs text-slate-400 font-medium bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
                            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            ${dataCriacao}
                        </span>
                    </div>
                    
                    ${fullData.origem ? `
                        <p class="text-[11px] text-slate-500 font-medium">Origem: <span class="text-slate-400">${sanitizeHTML(fullData.origem)}</span></p>
                    ` : ''}
                    
                    ${fullData.observacao ? `
                        <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex gap-2">
                            <svg class="w-4 h-4 text-slate-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                            <p class="text-sm text-slate-300 italic line-clamp-2" title="${sanitizeHTML(fullData.observacao)}">"${sanitizeHTML(fullData.observacao)}"</p>
                        </div>
                    ` : `
                        <div class="flex items-center gap-2 text-slate-500">
                            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <p class="text-sm italic">Nenhuma observação informada.</p>
                        </div>
                    `}
                </div>
            </div>
            
            <!-- Renderização Dinâmica dos Anexos -->
            ${anexosHTML}

        </div>

    </div>

    <!-- Ações -->
    <div class="flex flex-col sm:flex-row justify-end gap-3 pt-5 border-t border-slate-700/60">
        <button id="btn-fechar-detalhes" class="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all duration-200 border border-slate-600 hover:text-white">
            Voltar
        </button>
        <button id="btn-ir-agenda" class="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transform hover:-translate-y-1 flex items-center justify-center gap-2 border border-emerald-400/50">
            Agendar Vistoria
            <svg class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
    </div>
</div>
        `;

        showModal(modalHTML, 'max-w-4xl');

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