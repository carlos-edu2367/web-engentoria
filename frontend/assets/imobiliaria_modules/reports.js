import { api } from './api-imob.js';
import { showNotification } from './utils.js';

export const renderReportsPage = async (container) => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Estrutura Base (Layout do Antigo Frontend + Ajustes Modernos)
    container.innerHTML = `
        <div class="fade-in max-w-7xl mx-auto space-y-6">
            
            <!-- Header e Toolbar Unificada -->
            <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                
                <!-- Título Gradiente (Estilo Antigo) -->
                <div>
                    <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">
                        Relatórios Mensais
                    </h1>
                    <p class="text-gray-400 text-sm mt-1">Visão geral financeira e operacional do grupo.</p>
                </div>

                <!-- Barra de Ferramentas -->
                <div class="flex flex-wrap items-center gap-3 bg-gray-900/80 p-3 rounded-xl border border-gray-700/50 shadow-lg backdrop-blur-sm">
                    
                    <!-- Seletores de Data -->
                    <div class="flex items-center gap-2 mr-2">
                        <select id="report-month" class="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg p-2 outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer transition-all">
                            ${Array.from({length: 12}, (_, i) => 
                                `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>${new Date(0, i).toLocaleString('pt-BR', {month: 'long'})}</option>`
                            ).join('')}
                        </select>
                        <select id="report-year" class="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg p-2 outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer transition-all">
                            ${generateYearOptions(currentYear)}
                        </select>
                    </div>

                    <div class="h-8 w-px bg-gray-700 mx-1 hidden md:block"></div>

                    <!-- Botão Gerar -->
                    <button id="btn-generate" class="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-cyan-900/20 hover:shadow-cyan-500/30 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Carregar
                    </button>

                    <!-- Botões Download (Excel/PDF) -->
                    <button id="btn-excel" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-600/30 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2" title="Baixar Excel">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <span class="hidden sm:inline">Excel</span>
                    </button>
                    <button id="btn-pdf" class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-600/30 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2" title="Baixar PDF">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                        <span class="hidden sm:inline">PDF</span>
                    </button>
                </div>
            </div>

            <!-- Área de Conteúdo -->
            <div id="report-content" class="space-y-6 min-h-[400px]">
                <!-- O conteúdo será injetado aqui via JS -->
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('btn-generate').addEventListener('click', loadReportData);
    document.getElementById('btn-excel').addEventListener('click', () => handleDownload('excel'));
    document.getElementById('btn-pdf').addEventListener('click', () => handleDownload('pdf'));
    
    // Carregamento inicial
    loadReportData();
};

function generateYearOptions(currentYear) {
    let options = '';
    // Gera opções de 2024 até o ano atual + 1
    for (let y = 2024; y <= currentYear + 1; y++) {
        options += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }
    return options;
}

async function loadReportData() {
    const mes = document.getElementById('report-month').value;
    const ano = document.getElementById('report-year').value;
    const reportContent = document.getElementById('report-content');

    // Loading State Moderno
    reportContent.innerHTML = `
        <div class="flex justify-center items-center h-64 bg-gray-900/30 rounded-2xl border border-gray-800/50 backdrop-blur-sm">
            <div class="animate-pulse flex flex-col items-center">
                <div class="h-12 w-12 border-t-2 border-b-2 border-cyan-400 rounded-full animate-spin mb-4"></div>
                <p class="text-cyan-400 font-medium">Consolidando dados do grupo...</p>
            </div>
        </div>
    `;

    try {
        // Chamadas paralelas para API (Dados do Relatório + Status do Workflow)
        const [data, infoStatus] = await Promise.all([
            api.getRelatorioDados(mes, ano),
            api.getInfoMensal(mes, ano).catch(() => null)
        ]);

        const relatorios = data.relatorios || [];
        const resumo = data.resumo_geral || {};

        if (!relatorios.length) {
            renderEmptyState(reportContent);
            return;
        }

        // Renderização dos Blocos
        const infoBlock = renderInfoStatusBlock(infoStatus);
        const summaryBlock = renderGroupSummaryBlock(resumo);
        const reportsBlock = relatorios.map(r => renderIndividualReportCard(r)).join('');

        reportContent.innerHTML = infoBlock + summaryBlock + reportsBlock;

        // Reatachar eventos do botão de chat/aprovação se existir
        const infoBtn = document.getElementById('analisar-info-btn');
        if (infoBtn) {
            infoBtn.addEventListener('click', () => {
                // Redireciona para dashboard e abre o chat (simulado)
                window.location.hash = 'dashboard';
                showNotification('Redirecionando para o chat...', 'info');
            });
        }

    } catch (error) {
        console.error(error);
        reportContent.innerHTML = `
            <div class="bg-red-900/20 border border-red-500/30 p-8 rounded-2xl text-center">
                <h3 class="text-red-400 font-bold text-lg mb-2">Erro ao carregar dados</h3>
                <p class="text-gray-400">${error.message || "Falha na comunicação com o servidor."}</p>
            </div>
        `;
    }
}

// --- Renderizadores de HTML ---

function renderEmptyState(container) {
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 bg-gray-900/50 border border-gray-800 rounded-2xl">
            <div class="bg-gray-800/50 p-4 rounded-full mb-4">
                <svg class="h-10 w-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
            </div>
            <p class="text-gray-400 text-lg font-medium">Nenhum dado encontrado para este período.</p>
            <p class="text-gray-600 text-sm mt-1">Tente selecionar outro mês ou ano.</p>
        </div>
    `;
}

function renderInfoStatusBlock(infoStatus) {
    if (!infoStatus) return '';

    let statusText, statusColor, borderColor, btnText;
    
    if (infoStatus.accepted) {
        statusText = "Relatório Aprovado";
        statusColor = "text-emerald-400";
        borderColor = "border-emerald-500/30";
        btnText = "Visualizar Chat";
    } else {
        const hasAdminMsg = infoStatus.mensagens && infoStatus.mensagens.some(m => m.remetente === 'adm');
        if (hasAdminMsg) {
            statusText = "Ajustes Solicitados";
            statusColor = "text-yellow-400";
            borderColor = "border-yellow-500/30";
            btnText = "Responder Solicitação";
        } else {
            statusText = "Aguardando Aprovação";
            statusColor = "text-gray-400";
            borderColor = "border-purple-500/30";
            btnText = "Analisar & Aprovar";
        }
    }

    return `
        <div class="bg-gray-900/60 p-6 rounded-xl border ${borderColor} shadow-lg backdrop-blur-md mb-6 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
                <div>
                    <h2 class="text-lg font-bold text-gray-200 mb-1">Status do Fechamento</h2>
                    <div class="flex items-center gap-2">
                        <span class="relative flex h-3 w-3">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${infoStatus.accepted ? 'bg-emerald-400' : 'bg-yellow-400'} opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-3 w-3 ${infoStatus.accepted ? 'bg-emerald-500' : 'bg-yellow-500'}"></span>
                        </span>
                        <p class="text-xl font-bold ${statusColor}">${statusText}</p>
                    </div>
                </div>
                <button id="analisar-info-btn" class="px-6 py-2.5 rounded-lg font-bold text-white bg-purple-600 hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/30 transform hover:-translate-y-0.5">
                    ${btnText}
                </button>
            </div>
        </div>
    `;
}

function renderGroupSummaryBlock(resumo) {
    const formatCurrency = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Cards usando grid CSS e estilo "Neon" suave
    return `
        <div class="bg-gray-900/50 p-6 rounded-xl border border-cyan-500/30 shadow-lg shadow-cyan-900/10 mb-8">
            <h2 class="text-xl font-bold text-cyan-300 mb-6 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                Resumo Geral do Grupo
            </h2>
            
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <!-- Card 1 -->
                <div class="p-4 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors">
                    <p class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Qtd. Vistorias</p>
                    <p class="text-2xl font-bold text-white mt-1">${resumo.total_vistorias_grupo}</p>
                </div>

                <!-- Card 2 -->
                <div class="p-4 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors">
                    <p class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Qtd. Improdutivas</p>
                    <p class="text-2xl font-bold text-red-200 mt-1">${resumo.total_improdutivas_grupo}</p>
                </div>

                <!-- Card 3 -->
                <div class="p-4 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors">
                    <p class="text-xs text-gray-400 uppercase tracking-wider font-semibold">R$ Vistorias</p>
                    <p class="text-2xl font-bold text-gray-200 mt-1">${formatCurrency(resumo.valor_vistorias_grupo)}</p>
                </div>

                <!-- Card 4 -->
                <div class="p-4 bg-gray-800/40 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors">
                    <p class="text-xs text-gray-400 uppercase tracking-wider font-semibold">R$ Improdutivas</p>
                    <p class="text-2xl font-bold text-gray-200 mt-1">${formatCurrency(resumo.valor_improdutivas_grupo)}</p>
                </div>

                <!-- Card Total (Destaque) -->
                <div class="p-4 bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-500/30 rounded-xl col-span-2 lg:col-span-1 shadow-lg shadow-emerald-900/20">
                    <p class="text-xs text-emerald-300 uppercase tracking-wider font-bold">Faturamento Total</p>
                    <p class="text-2xl font-bold text-white mt-1">${formatCurrency(resumo.valor_total_grupo)}</p>
                </div>
            </div>
        </div>
    `;
}

function renderIndividualReportCard(report) {
    const formatCurrency = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    // Mapeamento das listas vindas do backend
    const vistorias = report.vistorias_agendadas || [];
    const improdutivas = report.vistorias_improdutivas || [];

    return `
        <div class="bg-gray-800/30 rounded-xl border border-gray-700/50 mb-6 overflow-hidden hover:border-gray-600 transition-all shadow-md">
            
            <!-- Cabeçalho do Card da Imobiliária -->
            <div class="bg-gray-800/80 p-5 border-b border-gray-700/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div class="flex items-center gap-3">
                    <div class="bg-blue-900/30 p-2 rounded-lg text-blue-400">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-white leading-tight">${report.imobiliaria_nome}</h3>
                        <p class="text-xs text-gray-400 font-mono">${report.mes_ano}</p>
                    </div>
                </div>
                
                <div class="text-right bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-700/30">
                    <p class="text-xs text-gray-400 uppercase">Total a Pagar</p>
                    <p class="text-2xl font-bold text-emerald-400">${formatCurrency(report.valor_total)}</p>
                </div>
            </div>

            <!-- Corpo do Relatório (Details/Accordions) -->
            <div class="p-4 space-y-2">
                
                <!-- 1. Vistorias Realizadas -->
                <details class="group bg-gray-900/40 rounded-lg overflow-hidden border border-transparent hover:border-gray-700 transition-colors">
                    <summary class="cursor-pointer p-4 flex justify-between items-center select-none">
                        <div class="flex items-center gap-2 font-semibold text-gray-300 group-hover:text-white">
                            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                            <span>Vistorias Realizadas <span class="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full ml-2">${report.total_vistorias}</span></span>
                        </div>
                        <svg class="h-5 w-5 text-gray-500 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </summary>
                    
                    <div class="p-4 border-t border-gray-800 bg-gray-900/20 overflow-x-auto">
                        <table class="w-full text-left text-sm whitespace-nowrap">
                            <thead class="text-gray-500 font-medium border-b border-gray-800">
                                <tr>
                                    <th class="pb-2 pl-2">Data</th>
                                    <th class="pb-2">Imóvel</th>
                                    <th class="pb-2">Endereço</th>
                                    <th class="pb-2">Tipo</th>
                                    <th class="pb-2 text-right pr-2">Valor</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-400">
                                ${vistorias.length > 0 ? vistorias.map(v => `
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                                        <td class="py-2 pl-2 font-mono text-xs">${new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td class="py-2 font-bold text-gray-300">${v.cod_imovel}</td>
                                        <td class="py-2 max-w-[200px] truncate" title="${v.endereco}">${v.endereco}</td>
                                        <td class="py-2"><span class="bg-blue-500/10 text-blue-400 text-xs px-2 py-1 rounded border border-blue-500/20">${v.tipo}</span></td>
                                        <td class="py-2 text-right pr-2 font-mono text-gray-300">${formatCurrency(v.valor)}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="5" class="py-4 text-center text-gray-600">Nenhuma vistoria registrada.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </details>

                <!-- 2. Vistorias Improdutivas -->
                ${improdutivas.length > 0 ? `
                <details class="group bg-gray-900/40 rounded-lg overflow-hidden border border-transparent hover:border-gray-700 transition-colors mt-2">
                    <summary class="cursor-pointer p-4 flex justify-between items-center select-none">
                        <div class="flex items-center gap-2 font-semibold text-gray-300 group-hover:text-white">
                            <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>Improdutivas <span class="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full ml-2">${report.total_improdutivas}</span></span>
                        </div>
                        <svg class="h-5 w-5 text-gray-500 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </summary>
                    
                    <div class="p-4 border-t border-gray-800 bg-gray-900/20 overflow-x-auto">
                        <table class="w-full text-left text-sm whitespace-nowrap">
                            <thead class="text-gray-500 font-medium border-b border-gray-800">
                                <tr>
                                    <th class="pb-2 pl-2">Data Orig.</th>
                                    <th class="pb-2">Imóvel</th>
                                    <th class="pb-2">Motivo</th>
                                    <th class="pb-2 text-right pr-2">Valor</th>
                                </tr>
                            </thead>
                            <tbody class="text-gray-400">
                                ${improdutivas.map(v => `
                                    <tr class="border-b border-gray-800/50 hover:bg-red-900/10 transition-colors">
                                        <td class="py-2 pl-2 font-mono text-xs">${new Date(v.data_vistoria_original + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td class="py-2 font-bold text-gray-300">${v.cod_imovel}</td>
                                        <td class="py-2 text-red-300 italic max-w-[250px] truncate" title="${v.motivo_improdutividade}">${v.motivo_improdutividade}</td>
                                        <td class="py-2 text-right pr-2 font-mono text-gray-300">${formatCurrency(v.valor_cobranca)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>
                ` : ''}

            </div>
        </div>
    `;
}

// --- Funções Auxiliares ---

async function handleDownload(formato) {
    const mes = document.getElementById('report-month').value;
    const ano = document.getElementById('report-year').value;
    
    showNotification(`Gerando arquivo ${formato.toUpperCase()}... aguarde.`, 'info');
    
    try {
        const response = await api.downloadRelatorio(mes, ano, formato);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_vistorias_${mes}_${ano}.${formato === 'excel' ? 'xlsx' : 'pdf'}`;
        document.body.appendChild(a);
        a.click();
        
        // Limpeza
        window.URL.revokeObjectURL(url);
        a.remove();
        
        showNotification('Download iniciado com sucesso!', 'success');
    } catch (e) {
        console.error(e);
        showNotification('Erro ao baixar relatório. Tente novamente.', 'error');
    }
}