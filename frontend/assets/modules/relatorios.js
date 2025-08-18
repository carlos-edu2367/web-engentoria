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
 * Renderiza o relatório de uma imobiliária no container de resultados.
 * @param {object} data - Os dados do relatório vindos da API.
 */
function renderRelatorioImobiliaria(data) {
    const container = document.getElementById('report-results');
    const { vistorias, improdutivas, total_vistorias, total_improdutivas, total_geral } = data;

    const renderTable = (title, items, columns) => {
        if (items.length === 0) return '';
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
        { header: 'Observação', render: item => sanitizeHTML(item.observacao_privada || '---'), className: 'truncate max-w-xs', title: item => item.observacao_privada },
    ];
    
    const improdutivasCols = [
        { header: 'Data', render: item => new Date(item.data_vistoria_original + 'T00:00:00').toLocaleDateString('pt-BR') },
        { header: 'Cód. Imóvel', render: item => sanitizeHTML(item.cod_imovel) },
        { header: 'Motivo', render: item => sanitizeHTML(item.motivo_improdutividade), className: 'truncate max-w-sm', title: item => item.motivo_improdutividade },
        { header: 'Valor', render: item => `R$ ${(item.valor_cobrado || 0).toFixed(2)}` },
    ];

    container.innerHTML = `
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
            <div class="flex justify-between items-center border-b border-gray-700 pb-4 mb-4">
                <div>
                    <h3 class="text-2xl font-bold text-white">Relatório: ${sanitizeHTML(data.imobiliaria_nome)}</h3>
                    <p class="text-gray-400">Período: ${data.periodo}</p>
                </div>
                <div>
                    <button class="px-4 py-2 bg-gray-600 text-sm rounded-lg">Exportar PDF</button>
                    <button class="px-4 py-2 bg-gray-600 text-sm rounded-lg ml-2">Exportar Excel</button>
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-4 text-center mb-6">
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
 * Renderiza o relatório de um vistoriador.
 * @param {object} data - Os dados do relatório.
 */
function renderRelatorioVistoriador(data) {
    const container = document.getElementById('report-results');
    const { vistorias_por_imobiliaria, improdutivas, total_comissao_vistorias, total_comissao_improdutivas, total_geral_comissao } = data;

    let tablesHTML = '';
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
                            <th class="p-2 text-left">Endereço</th>
                            <th class="p-2 text-left">Tamanho</th>
                            <th class="p-2 text-left">Mobília</th>
                            <th class="p-2 text-left">Tipo</th>
                            <th class="p-2 text-left">Observação</th>
                            <th class="p-2 text-left">Comissão</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vistorias.map(v => `
                            <tr class="border-b border-gray-700">
                                <td class="p-2">${new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                <td class="p-2">${sanitizeHTML(v.cod_imovel)}</td>
                                <td class="p-2 truncate max-w-xs" title="${sanitizeHTML(v.endereco || '')}">${sanitizeHTML(v.endereco || '---')}</td>
                                <td class="p-2">${v.tamanho} m²</td>
                                <td class="p-2">${formatMobilia(v.tipo_mobilia)}</td>
                                <td class="p-2">${sanitizeHTML(v.tipo_vistoria)}</td>
                                <td class="p-2 truncate max-w-xs" title="${sanitizeHTML(v.observacao_privada || '')}">${sanitizeHTML(v.observacao_privada || '---')}</td>
                                <td class="p-2">R$ ${(v.comissao_vistoriador || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    if (improdutivas.length > 0) {
        tablesHTML += `
            <h4 class="text-lg font-semibold text-cyan-300 mt-6 mb-2">Vistorias Improdutivas</h4>
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
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
            <div class="flex justify-between items-center border-b border-gray-700 pb-4 mb-4">
                <div>
                    <h3 class="text-2xl font-bold text-white">Relatório: ${sanitizeHTML(data.vistoriador_nome)}</h3>
                    <p class="text-gray-400">Período: ${data.periodo}</p>
                </div>
                <div>
                    <button class="px-4 py-2 bg-gray-600 text-sm rounded-lg">Exportar PDF</button>
                    <button class="px-4 py-2 bg-gray-600 text-sm rounded-lg ml-2">Exportar Excel</button>
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-4 text-center mb-6">
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
 * Função principal para inicializar o módulo de relatórios.
 */
export async function initRelatorios() {
    const pageHTML = `
        <h1 class="text-3xl font-bold text-cyan-300 mb-8">Relatórios</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Card de Relatório por Imobiliária -->
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
                <h2 class="text-xl font-bold text-white mb-4">Por Imobiliária</h2>
                <form id="form-imobiliaria-report" class="space-y-4">
                    <div>
                        <label for="select-imobiliaria" class="block text-sm mb-1">Imobiliária</label>
                        <select id="select-imobiliaria" required class="w-full bg-gray-700 rounded p-2"><option>Carregando...</option></select>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                           <label for="month-imobiliaria" class="block text-sm mb-1">Mês</label>
                           <input type="month" id="month-imobiliaria" required class="w-full bg-gray-700 rounded p-2">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">&nbsp;</label>
                            <button type="submit" class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold">Gerar</button>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Card de Relatório por Vistoriador -->
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
                <h2 class="text-xl font-bold text-white mb-4">Por Vistoriador</h2>
                <form id="form-vistoriador-report" class="space-y-4">
                    <div>
                        <label for="select-vistoriador" class="block text-sm mb-1">Vistoriador</label>
                        <select id="select-vistoriador" required class="w-full bg-gray-700 rounded p-2"><option>Carregando...</option></select>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                           <label for="month-vistoriador" class="block text-sm mb-1">Mês</label>
                           <input type="month" id="month-vistoriador" required class="w-full bg-gray-700 rounded p-2">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">&nbsp;</label>
                            <button type="submit" class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold">Gerar</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <div id="report-results" class="mt-8"></div>
    `;
    renderPageContent(pageHTML);

    // Popula os selects
    try {
        cache.imobiliarias = await api.getImobiliarias();
        const selectImob = document.getElementById('select-imobiliaria');
        selectImob.innerHTML = cache.imobiliarias.map(i => `<option value="${i.id}">${sanitizeHTML(i.nome)}</option>`).join('');

        cache.vistoriadores = await api.getVistoriadores();
        const selectVist = document.getElementById('select-vistoriador');
        selectVist.innerHTML = cache.vistoriadores.map(v => `<option value="${v.id}">${sanitizeHTML(v.nome)}</option>`).join('');
    } catch (error) {
        showAlert('Erro ao carregar dados para os filtros.', 'error');
    }

    // Adiciona listeners aos formulários
    document.getElementById('form-imobiliaria-report').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Gerando...';

        const imobiliariaId = document.getElementById('select-imobiliaria').value;
        const [ano, mes] = document.getElementById('month-imobiliaria').value.split('-');
        
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

    document.getElementById('form-vistoriador-report').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Gerando...';

        const vistoriadorId = document.getElementById('select-vistoriador').value;
        const [ano, mes] = document.getElementById('month-vistoriador').value.split('-');

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
