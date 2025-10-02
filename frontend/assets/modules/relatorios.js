// /assets/modules/relatorios.js

import { api } from '../api.js';
import { renderPageContent, showAlert, sanitizeHTML } from '../ui.js';

let cache = {
    imobiliarias: null,
    vistoriadores: null,
};

/**
 * Formata o status de mobília para um texto amigável.
 * @param {string} status - O status vindo da API (ex: 'semi_mobiliado').
 * @returns {string} - O texto formatado (ex: 'Semi Mobiliado').
 */
function formatMobilia(status) {
    const map = {
        'sem_mobilia': 'Sem Mobília',
        'semi_mobiliado': 'Semi Mobiliado',
        'mobiliado': 'Mobiliado'
    };
    return map[status] || status;
}

/**
 * Renderiza o relatório de uma imobiliária no container de resultados para visualização.
 * @param {object} data - Os dados do relatório vindos da API.
 */
function renderRelatorioImobiliaria(data) {
    const container = document.getElementById('report-results');
    const { vistorias, improdutivas, total_vistorias, total_improdutivas, total_geral } = data;

    const renderTable = (title, items, columns) => {
        if (items.length === 0) return `<h4 class="text-lg font-semibold text-cyan-300 mt-6 mb-2">${title}</h4><p class="text-gray-400">Nenhum item encontrado.</p>`;
        return `
            <h4 class="text-lg font-semibold text-cyan-300 mt-6 mb-2">${title}</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-900/50">
                        <tr>${columns.map(c => `<th class="p-2 text-left">${c.header}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr class="border-b border-gray-700">
                                ${columns.map(c => `<td class="p-2 ${c.className || ''}" title="${c.title ? c.title(item) : ''}">${c.render(item)}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };

    const vistoriasCols = [
        { header: 'Data', render: item => new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR') },
        { header: 'Cód. Imóvel', render: item => sanitizeHTML(item.cod_imovel) },
        { header: 'Endereço', render: item => sanitizeHTML(item.endereco), className: 'truncate max-w-xs', title: item => item.endereco },
        { header: 'Tamanho', render: item => `${item.tamanho} m²` },
        { header: 'Mobília', render: item => formatMobilia(item.tipo_mobilia) },
        { header: 'Valor', render: item => `R$ ${(item.valor || 0).toFixed(2)}` },
        { header: 'Obs. Vistoriador', render: item => sanitizeHTML(item.observacao_vistoriador || '---'), className: 'truncate max-w-xs', title: item => item.observacao_vistoriador },
        { header: 'Obs. Privada', render: item => sanitizeHTML(item.observacao_privada || '---'), className: 'truncate max-w-xs', title: item => item.observacao_privada },
    ];
    
    const improdutivasCols = [
        { header: 'Data', render: item => new Date(item.data_vistoria_original + 'T00:00:00').toLocaleDateString('pt-BR') },
        { header: 'Cód. Imóvel', render: item => sanitizeHTML(item.cod_imovel) },
        { header: 'Motivo', render: item => sanitizeHTML(item.motivo_improdutividade), className: 'truncate max-w-sm', title: item => item.motivo_improdutividade },
        { header: 'Valor', render: item => `R$ ${(item.valor_cobrado || 0).toFixed(2)}` },
    ];

    container.innerHTML = `
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border mt-8">
            <div class="border-b border-gray-700 pb-4 mb-4">
                <h3 class="text-2xl font-bold text-white">Relatório: ${sanitizeHTML(data.imobiliaria_nome)}</h3>
                <p class="text-gray-400">Período: ${data.periodo}</p>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center mb-6">
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <p class="text-sm text-gray-400">Total Vistorias</p>
                    <p class="text-xl font-bold">R$ ${total_vistorias.toFixed(2)}</p>
                </div>
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <p class="text-sm text-gray-400">Total Improdutivas</p>
                    <p class="text-xl font-bold">R$ ${total_improdutivas.toFixed(2)}</p>
                </div>
                <div class="bg-cyan-900/50 p-3 rounded-lg">
                    <p class="text-sm text-cyan-300">Total Geral</p>
                    <p class="text-xl font-bold text-white">R$ ${total_geral.toFixed(2)}</p>
                </div>
            </div>

            ${renderTable('Vistorias Realizadas', vistorias, vistoriasCols)}
            ${renderTable('Vistorias Improdutivas', improdutivas, improdutivasCols)}
        </div>
    `;
}

/**
 * Renderiza o relatório de um vistoriador para visualização.
 * @param {object} data - Os dados do relatório.
 */
function renderRelatorioVistoriador(data) {
    const container = document.getElementById('report-results');
    const { vistorias_por_imobiliaria, improdutivas, total_comissao_vistorias, total_comissao_improdutivas, total_geral_comissao } = data;

    let tablesHTML = '';
    if (Object.keys(vistorias_por_imobiliaria).length > 0) {
        for (const imobNome in vistorias_por_imobiliaria) {
            const vistorias = vistorias_por_imobiliaria[imobNome];
            tablesHTML += `
                <h4 class="text-lg font-semibold text-cyan-300 mt-6 mb-2">Imobiliária: ${sanitizeHTML(imobNome)}</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-900/50">
                            <tr>
                                <th class="p-2 text-left">Data</th>
                                <th class="p-2 text-left">Cód. Imóvel</th>
                                <th class="p-2 text-left">Tipo</th>
                                <th class="p-2 text-left">Obs. Vistoriador</th>
                                <th class="p-2 text-left">Comissão</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vistorias.map(v => `
                                <tr class="border-b border-gray-700">
                                    <td class="p-2">${new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                    <td class="p-2">${sanitizeHTML(v.cod_imovel)}</td>
                                    <td class="p-2">${sanitizeHTML(v.tipo_vistoria)}</td>
                                    <td class="p-2 truncate max-w-xs" title="${sanitizeHTML(v.observacao_vistoriador || '')}">${sanitizeHTML(v.observacao_vistoriador || '---')}</td>
                                    <td class="p-2">R$ ${(v.comissao_vistoriador || 0).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } else {
        tablesHTML += '<p class="text-gray-400 mt-4">Nenhuma vistoria encontrada para este período.</p>';
    }
    
    if (improdutivas.length > 0) {
        tablesHTML += `
            <h4 class="text-lg font-semibold text-red-400 mt-6 mb-2">Vistorias Improdutivas</h4>
            <div class="overflow-x-auto">
                 <table class="w-full text-sm">
                    <thead class="bg-gray-900/50">
                        <tr>
                           <th class="p-2 text-left">Data</th>
                           <th class="p-2 text-left">Motivo</th>
                           <th class="p-2 text-left">Comissão</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${improdutivas.map(i => `
                             <tr class="border-b border-gray-700">
                                <td class="p-2">${new Date(i.data_vistoria_original + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                <td class="p-2 truncate max-w-sm" title="${sanitizeHTML(i.motivo_improdutividade)}">${sanitizeHTML(i.motivo_improdutividade)}</td>
                                <td class="p-2">R$ ${(i.comissao_vistoriador || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border mt-8">
            <div class="border-b border-gray-700 pb-4 mb-4">
                <h3 class="text-2xl font-bold text-white">Relatório: ${sanitizeHTML(data.vistoriador_nome)}</h3>
                <p class="text-gray-400">Período: ${data.periodo}</p>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center mb-6">
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <p class="text-sm text-gray-400">Comissão Vistorias</p>
                    <p class="text-xl font-bold">R$ ${total_comissao_vistorias.toFixed(2)}</p>
                </div>
                <div class="bg-gray-900/50 p-3 rounded-lg">
                    <p class="text-sm text-gray-400">Comissão Improdutivas</p>
                    <p class="text-xl font-bold">R$ ${total_comissao_improdutivas.toFixed(2)}</p>
                </div>
                <div class="bg-cyan-900/50 p-3 rounded-lg">
                    <p class="text-sm text-cyan-300">Total Geral</p>
                    <p class="text-xl font-bold text-white">R$ ${total_geral_comissao.toFixed(2)}</p>
                </div>
            </div>
            ${tablesHTML}
        </div>
    `;
}


/**
 * Lida com o clique no botão "Gerar Relatório" para download.
 * Constrói a URL e inicia o download.
 */
async function handleDownloadRelatorio(event) {
    event.preventDefault();
    const btn = event.currentTarget.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Gerando...
    `;

    try {
        const form = event.currentTarget;
        const mes = form.querySelector('#download-month').value;
        const ano = form.querySelector('#download-year').value;
        const formato = form.querySelector('#download-format').value;
        const imobiliariaId = form.querySelector('#download-imobiliaria').value;
        const vistoriadorId = form.querySelector('#download-vistoriador').value;

        if (!mes || !ano || !formato) {
            throw new Error('Mês, Ano e Formato são obrigatórios.');
        }

        const params = new URLSearchParams({ mes, ano, formato });
        if (imobiliariaId) params.append('imobiliaria_id', imobiliariaId);
        if (vistoriadorId) params.append('vistoriador_id', vistoriadorId);

        await api.downloadRelatorio(params);
        showAlert('Seu download foi iniciado.', 'info');

    } catch (error) {
        showAlert(error.message || 'Erro ao gerar o relatório.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


/**
 * Lida com a submissão do formulário de envio de relatório por e-mail.
 * @param {Event} event
 */
async function handleEmailReport(event) {
    event.preventDefault();
    const btn = event.currentTarget.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Enviando...
    `;

    try {
        const [ano, mes] = document.getElementById('email-month').value.split('-');
        if (!ano || !mes) {
            throw new Error('Por favor, selecione um Mês/Ano válido.');
        }

        const result = await api.sendValoresTotaisEmail(ano, mes);
        showAlert(result.message || 'Relatório enviado para a fila de envio!', 'success');

    } catch (error) {
        showAlert(error.message || 'Erro ao solicitar o envio do e-mail.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


/**
 * Popula os dropdowns de filtros com dados da API.
 */
async function popularFiltros() {
    try {
        cache.imobiliarias = await api.getImobiliarias();
        cache.vistoriadores = await api.getVistoriadores();
        
        // Popula selects para visualização
        const selectImobView = document.getElementById('view-select-imobiliaria');
        selectImobView.innerHTML = cache.imobiliarias.map(i => `<option value="${i.id}">${sanitizeHTML(i.nome)}</option>`).join('');
        
        const selectVistView = document.getElementById('view-select-vistoriador');
        selectVistView.innerHTML = cache.vistoriadores.map(v => `<option value="${v.id}">${sanitizeHTML(v.nome)}</option>`).join('');

        // Popula selects para download
        const selectImobDl = document.getElementById('download-imobiliaria');
        selectImobDl.innerHTML = '<option value="">Geral / Todas</option>' + cache.imobiliarias.map(i => `<option value="${i.id}">${sanitizeHTML(i.nome)}</option>`).join('');
        
        const selectVistDl = document.getElementById('download-vistoriador');
        selectVistDl.innerHTML = '<option value="">Geral / Todos</option>' + cache.vistoriadores.map(v => `<option value="${v.id}">${sanitizeHTML(v.nome)}</option>`).join('');

        // Lógica para desabilitar selects de download
        selectImobDl.addEventListener('change', () => {
            selectVistDl.disabled = !!selectImobDl.value;
            if(selectImobDl.value) selectVistDl.value = '';
        });
        selectVistDl.addEventListener('change', () => {
            selectImobDl.disabled = !!selectVistDl.value;
            if(selectVistDl.value) selectImobDl.value = '';
        });

    } catch (error) {
        showAlert('Erro ao carregar dados para os filtros.', 'error');
        document.querySelectorAll('select').forEach(s => s.innerHTML = '<option value="">Erro ao carregar</option>');
    }
}


/**
 * Função principal para inicializar o módulo de relatórios.
 */
export async function initRelatorios() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.toISOString().slice(0, 7); // Formato YYYY-MM
    const currentMonthInput = String(today.getMonth() + 1).padStart(2, '0');

    const pageHTML = `
        <h1 class="text-3xl font-bold text-cyan-300 mb-8">Relatórios</h1>

        <!-- SEÇÃO DE DOWNLOAD -->
        <div class="bg-gray-800/50 p-6 md:p-8 rounded-xl neon-border mb-8">
            <h2 class="text-xl font-bold text-white mb-6">Download de Relatórios Consolidados</h2>
            <form id="form-download-report">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label for="download-month" class="block text-sm mb-1">Mês*</label>
                        <input type="number" id="download-month" required class="w-full bg-gray-700 rounded p-2" min="1" max="12" value="${currentMonthInput}">
                    </div>
                    <div>
                        <label for="download-year" class="block text-sm mb-1">Ano*</label>
                        <input type="number" id="download-year" required class="w-full bg-gray-700 rounded p-2" min="2020" max="2099" value="${currentYear}">
                    </div>
                    <div>
                        <label for="download-format" class="block text-sm mb-1">Formato*</label>
                        <select id="download-format" required class="w-full bg-gray-700 rounded p-2">
                            <option value="excel">Excel</option>
                            <option value="pdf">PDF</option>
                        </select>
                    </div>
                </div>
                <div class="border-t border-gray-700 mt-6 pt-6">
                    <p class="text-sm text-gray-400 mb-4">Filtre por imobiliária OU por vistoriador. Deixar ambos como "Geral" gerará um relatório de faturamento consolidado.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label for="download-imobiliaria" class="block text-sm mb-1">Imobiliária (Opcional)</label>
                            <select id="download-imobiliaria" class="w-full bg-gray-700 rounded p-2"><option>Carregando...</option></select>
                        </div>
                        <div>
                            <label for="download-vistoriador" class="block text-sm mb-1">Vistoriador (Opcional)</label>
                            <select id="download-vistoriador" class="w-full bg-gray-700 rounded p-2"><option>Carregando...</option></select>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end pt-6 mt-6">
                    <button type="submit" class="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold transition-colors flex items-center">
                        Gerar e Baixar Relatório
                    </button>
                </div>
            </form>
        </div>
        
        <!-- NOVA SEÇÃO DE ENVIO POR E-MAIL -->
        <div class="bg-gray-800/50 p-6 md:p-8 rounded-xl neon-border mb-8">
            <h2 class="text-xl font-bold text-white mb-6">Relatório Consolidado por E-mail</h2>
            <p class="text-sm text-gray-400 mb-4">Dispara o envio do relatório consolidado (faturamento por grupo e comissões por vistoriador) para o e-mail administrativo configurado no sistema.</p>
            <form id="form-email-report">
                <div class="flex flex-col sm:flex-row items-end gap-4">
                    <div class="w-full sm:w-auto">
                        <label for="email-month" class="block text-sm mb-1">Mês/Ano do Relatório*</label>
                        <input type="month" id="email-month" required class="w-full bg-gray-700 rounded p-2" value="${currentMonth}">
                    </div>
                    <button type="submit" class="w-full sm:w-auto px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold transition-colors flex items-center justify-center">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        Enviar por E-mail
                    </button>
                </div>
            </form>
        </div>

        <!-- SEÇÃO DE VISUALIZAÇÃO -->
        <h2 class="text-2xl font-bold text-cyan-300 mt-12 mb-6">Visualização Rápida</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
                <h3 class="text-xl font-bold text-white mb-4">Por Imobiliária</h3>
                <form id="form-imobiliaria-view" class="space-y-4">
                    <select id="view-select-imobiliaria" required class="w-full bg-gray-700 rounded p-2"><option>Carregando...</option></select>
                    <div class="flex gap-4">
                        <input type="month" id="view-month-imobiliaria" required class="w-full bg-gray-700 rounded p-2" value="${currentMonth}">
                        <button type="submit" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold">Gerar</button>
                    </div>
                </form>
            </div>
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
                <h3 class="text-xl font-bold text-white mb-4">Por Vistoriador</h3>
                <form id="form-vistoriador-view" class="space-y-4">
                    <select id="view-select-vistoriador" required class="w-full bg-gray-700 rounded p-2"><option>Carregando...</option></select>
                    <div class="flex gap-4">
                        <input type="month" id="view-month-vistoriador" required class="w-full bg-gray-700 rounded p-2" value="${currentMonth}">
                        <button type="submit" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold">Gerar</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="report-results"></div>
    `;
    renderPageContent(pageHTML);
    
    await popularFiltros();

    document.getElementById('form-download-report').addEventListener('submit', handleDownloadRelatorio);
    document.getElementById('form-email-report').addEventListener('submit', handleEmailReport);

    document.getElementById('form-imobiliaria-view').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '...';

        const imobiliariaId = document.getElementById('view-select-imobiliaria').value;
        const [ano, mes] = document.getElementById('view-month-imobiliaria').value.split('-');
        
        try {
            const data = await api.getRelatorioImobiliaria(imobiliariaId, mes, ano);
            renderRelatorioImobiliaria(data);
        } catch (error) {
            showAlert(error.message || 'Erro ao gerar relatório.', 'error');
            document.getElementById('report-results').innerHTML = '';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Gerar';
        }
    });

    document.getElementById('form-vistoriador-view').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = '...';

        const vistoriadorId = document.getElementById('view-select-vistoriador').value;
        const [ano, mes] = document.getElementById('view-month-vistoriador').value.split('-');

        try {
            const data = await api.getRelatorioVistoriador(vistoriadorId, mes, ano);
            renderRelatorioVistoriador(data);
        } catch (error) {
            showAlert(error.message || 'Erro ao gerar relatório.', 'error');
            document.getElementById('report-results').innerHTML = '';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Gerar';
        }
    });
}
