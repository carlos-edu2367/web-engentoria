import { api } from './api.js';
import { formatCurrency, showNotification, openModal, closeModal, sanitizeHTML } from './utils.js';

export async function renderRelatorios(container) {
    const today = new Date();
    // Formata YYYY-MM para o input type="month"
    const currentMonth = today.toISOString().slice(0, 7); 

    container.innerHTML = `
        <div class="space-y-6 fade-in max-w-4xl mx-auto pb-20"> <!-- pb-20 para não ficar atrás do menu mobile se houver -->
            <div class="flex flex-col md:flex-row justify-between items-end border-b border-slate-800 pb-4 gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-white">Relatórios</h2>
                    <p class="text-slate-400 text-sm">Acompanhe suas comissões e produtividade.</p>
                </div>
            </div>

            <!-- Card de Filtro -->
            <div class="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/50 shadow-lg neon-border">
                <form id="report-form" class="flex flex-col sm:flex-row items-end gap-4">
                    <div class="w-full flex-1">
                        <label for="month-input" class="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Mês de Referência</label>
                        <input type="month" id="month-input" value="${currentMonth}" required 
                            class="w-full bg-slate-900 border border-slate-600 text-white rounded-xl py-3 px-4 focus:ring-2 focus:ring-teal-500 outline-none transition-all">
                    </div>
                    <button type="submit" class="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 active:scale-95 text-white font-bold rounded-xl transition shadow-lg flex justify-center items-center">
                        <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        Gerar Relatório
                    </button>
                </form>
            </div>

            <!-- Área de Resultados -->
            <div id="report-results" class="min-h-[200px]">
                <div class="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
                    <svg class="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    <p class="text-sm">Selecione um mês acima e clique em Gerar.</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('report-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const resultsDiv = document.getElementById('report-results');
        const [ano, mes] = document.getElementById('month-input').value.split('-');
        const btn = e.target.querySelector('button[type="submit"]');
        
        // Estado de Loading
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Gerando...`;
        
        resultsDiv.innerHTML = `
            <div class="text-center py-12">
                <div class="animate-spin h-10 w-10 mx-auto border-4 border-slate-700 border-t-teal-500 rounded-full"></div>
                <p class="mt-4 text-slate-400 text-sm animate-pulse">Calculando comissões...</p>
            </div>
        `;

        try {
            const data = await api.getMeuRelatorio(mes, ano);
            renderResults(resultsDiv, data);
        } catch (error) {
            resultsDiv.innerHTML = `
                <div class="p-6 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 text-center">
                    <svg class="h-10 w-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <h3 class="font-bold text-lg">Erro ao gerar relatório</h3>
                    <p class="text-sm mt-1 opacity-80">${error.message}</p>
                </div>
            `;
            showNotification('Erro ao gerar relatório', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Gerar Relatório`;
        }
    });
}

function renderResults(container, data) {
    // 1. Cards de Totais (Mobile First Grid)
    const totalsHTML = `
        <div class="grid grid-cols-1 gap-4 mb-6 animate-fade-in">
            <!-- Total Geral (Destaque) -->
            <div class="bg-gradient-to-br from-teal-900/80 to-slate-900 p-6 rounded-2xl border border-teal-500/30 shadow-lg relative overflow-hidden">
                <div class="absolute -top-4 -right-4 w-24 h-24 bg-teal-500/20 rounded-full blur-2xl"></div>
                <p class="text-xs text-teal-300 uppercase font-bold tracking-wider mb-1">Total a Receber</p>
                <p class="text-4xl font-bold text-white tracking-tight">${formatCurrency(data.total_geral_comissao)}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md">
                    <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Vistorias</p>
                    <p class="text-xl font-bold text-slate-200">${formatCurrency(data.total_comissao_vistorias)}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md">
                    <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Improdutivas</p>
                    <p class="text-xl font-bold text-amber-400">${formatCurrency(data.total_comissao_improdutivas)}</p>
                </div>
            </div>
        </div>
    `;

    // 2. Tabelas Detalhadas (Scroll Horizontal para Mobile)
    let tablesHTML = '';
    
    // Lista Vistorias por Imobiliária
    const imobiliarias = Object.keys(data.vistorias_por_imobiliaria);
    
    if (imobiliarias.length > 0) {
        for (const imob of imobiliarias) {
            const vistorias = data.vistorias_por_imobiliaria[imob];
            tablesHTML += `
                <div class="mb-5 bg-slate-800/50 rounded-xl overflow-hidden border border-slate-700/50 shadow-sm animate-fade-in">
                    <div class="bg-slate-800/80 px-4 py-3 flex justify-between items-center backdrop-blur-md">
                        <div class="flex items-center gap-2">
                            <div class="w-1 h-4 bg-teal-500 rounded-full"></div>
                            <h3 class="font-bold text-slate-200 text-sm truncate pr-2">${imob}</h3>
                        </div>
                        <span class="text-[10px] bg-slate-700 px-2 py-0.5 rounded-full text-slate-300 font-medium">${vistorias.length} vistorias</span>
                    </div>
                    <div class="overflow-x-auto custom-scrollbar">
                        <table class="w-full text-sm text-left text-slate-300 whitespace-nowrap">
                            <thead class="text-[10px] text-slate-500 uppercase bg-slate-900/30">
                                <tr>
                                    <th class="px-4 py-2 font-medium">Data</th>
                                    <th class="px-4 py-2 font-medium">Cód.</th>
                                    <th class="px-4 py-2 font-medium text-right">Comissão</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700/50">
                                ${vistorias.map(v => {
                                    // Serialize o objeto para passar no data-attribute
                                    const itemJson = encodeURIComponent(JSON.stringify(v));
                                    return `
                                    <tr class="hover:bg-slate-700/30 transition-colors cursor-pointer report-item-row" data-type="vistoria" data-item="${itemJson}">
                                        <td class="px-4 py-3 text-xs">
                                            <div class="font-medium text-slate-200">${new Date(v.data).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</div>
                                            <div class="text-[10px] text-slate-500">${new Date(v.data).toLocaleDateString('pt-BR', {weekday:'short'})}</div>
                                        </td>
                                        <td class="px-4 py-3 text-xs">
                                            <div class="font-mono text-white font-bold">${v.cod_imovel}</div>
                                            <div class="text-[10px] text-slate-500 truncate max-w-[100px]">${v.endereco}</div>
                                        </td>
                                        <td class="px-4 py-3 text-xs text-right font-bold text-emerald-400">${formatCurrency(v.comissao_vistoriador)}</td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    } else if (data.improdutivas.length === 0) {
        tablesHTML = `
            <div class="text-center py-8 text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
                <p class="text-sm">Nenhuma vistoria encontrada para este período.</p>
            </div>
        `;
    }

    // Tabela Improdutivas
    if(data.improdutivas.length > 0) {
        tablesHTML += `
            <div class="mb-4 bg-red-900/10 rounded-xl overflow-hidden border border-red-500/20 shadow-sm animate-fade-in">
                <div class="bg-red-900/20 px-4 py-3 flex items-center gap-2">
                    <div class="w-1 h-4 bg-red-500 rounded-full"></div>
                    <h3 class="font-bold text-red-300 text-sm">Improdutivas</h3>
                </div>
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full text-sm text-left text-slate-300 whitespace-nowrap">
                        <tbody class="divide-y divide-red-900/20">
                            ${data.improdutivas.map(v => {
                                const itemJson = encodeURIComponent(JSON.stringify(v));
                                return `
                                <tr class="hover:bg-red-900/10 transition-colors cursor-pointer report-item-row" data-type="improdutiva" data-item="${itemJson}">
                                    <td class="px-4 py-3 text-xs">
                                        <div class="font-medium text-slate-200">${new Date(v.data_vistoria_original).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</div>
                                    </td>
                                    <td class="px-4 py-3 text-xs">
                                        <div class="font-mono font-bold">${v.cod_imovel}</div>
                                        <div class="text-[10px] text-red-400/70 italic truncate max-w-[120px]">${v.motivo_improdutividade}</div>
                                    </td>
                                    <td class="px-4 py-3 text-xs text-right font-bold text-amber-400">${formatCurrency(v.comissao_vistoriador)}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    container.innerHTML = totalsHTML + tablesHTML;

    // Adicionar Event Listeners para os cliques nas linhas
    container.querySelectorAll('.report-item-row').forEach(row => {
        row.addEventListener('click', () => {
            const item = JSON.parse(decodeURIComponent(row.dataset.item));
            const type = row.dataset.type;
            showReportItemDetails(item, type);
        });
    });
}

function showReportItemDetails(item, type) {
    const isVistoria = type === 'vistoria';
    // Determina o campo de data dependendo do tipo de objeto
    const dateStr = isVistoria ? item.data : item.data_vistoria_original;
    // Formata a data com segurança
    let dateFormatted = 'N/D';
    if(dateStr) {
        const d = new Date(dateStr);
        // Ajuste para timezone local simples (evita problema de dia anterior se UTC)
        dateFormatted = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); 
    }
    
    const content = `
        <div class="space-y-4">
             <div class="flex justify-between items-start border-b border-slate-700 pb-2">
                <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider ${isVistoria ? 'text-teal-500' : 'text-red-500'}">
                        ${isVistoria ? 'Detalhes da Vistoria' : 'Vistoria Improdutiva'}
                    </span>
                    <h3 class="text-xl font-bold text-white mt-1">CT ${sanitizeHTML(item.cod_imovel || 'N/A')}</h3>
                </div>
                <button id="close-report-modal" class="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <div class="space-y-3">
                <div class="bg-slate-800 p-3 rounded-lg">
                    <p class="text-xs text-slate-500 uppercase">Data</p>
                    <p class="text-white font-medium">${dateFormatted}</p>
                </div>

                ${isVistoria ? `
                    <div class="bg-slate-800 p-3 rounded-lg">
                        <p class="text-xs text-slate-500 uppercase">Endereço</p>
                        <p class="text-white font-medium text-sm">${sanitizeHTML(item.endereco)}</p>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                         <div class="bg-slate-800 p-3 rounded-lg">
                            <p class="text-xs text-slate-500 uppercase">Tipo</p>
                            <p class="text-white font-medium text-sm">${item.tipo_vistoria || 'N/A'}</p>
                        </div>
                        <div class="bg-slate-800 p-3 rounded-lg">
                            <p class="text-xs text-slate-500 uppercase">Mobília</p>
                            <p class="text-white font-medium text-sm capitalize">${(item.tipo_mobilia || 'N/A').replace(/_/g, ' ').toLowerCase()}</p>
                        </div>
                    </div>

                    <div class="bg-slate-800 p-3 rounded-lg">
                        <p class="text-xs text-slate-500 uppercase">Tamanho</p>
                        <p class="text-white font-medium text-sm">${item.tamanho || 0} m²</p>
                    </div>
                ` : `
                    <div class="bg-slate-800 p-3 rounded-lg">
                        <p class="text-xs text-slate-500 uppercase">Motivo</p>
                        <p class="text-red-300 font-medium text-sm">${sanitizeHTML(item.motivo_improdutividade)}</p>
                    </div>
                `}

                <div class="grid grid-cols-2 gap-3 pt-2">
                    <div class="bg-slate-800 p-3 rounded-lg border border-teal-500/30">
                        <p class="text-xs text-teal-500 uppercase font-bold">Sua Comissão</p>
                        <p class="text-emerald-400 font-bold text-lg">${formatCurrency(item.comissao_vistoriador)}</p>
                    </div>
                </div>

                ${isVistoria && item.observacao_vistoriador ? `
                    <div class="bg-amber-900/10 p-3 rounded-lg border border-amber-500/20 mt-2">
                        <p class="text-xs text-amber-500 uppercase font-bold mb-1">Observação</p>
                        <p class="text-amber-100/80 text-sm italic">"${sanitizeHTML(item.observacao_vistoriador)}"</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    openModal(content, 'max-w-sm');
    document.getElementById('close-report-modal').onclick = closeModal;
}