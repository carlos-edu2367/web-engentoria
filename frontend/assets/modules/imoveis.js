// /assets/modules/imoveis.js

import { api } from '../api.js';
import { showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

/**
 * Renderiza a tabela de imóveis.
 * @param {Array<object>} imoveis - A lista de imóveis.
 */
function renderImoveisTable(imoveis) {
    const tableBody = document.getElementById('imoveis-table-body');
    if (!tableBody) return;

    if (imoveis.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Nenhum imóvel encontrado.</td></tr>';
        return;
    }

    // Mapeia os valores de 'mobiliado' para textos mais amigáveis
    const mobiliaMap = {
        'sem_mobilia': 'Sem Mobília',
        'semi_mobiliado': 'Semi Mobiliado',
        'mobiliado': 'Mobiliado'
    };

    tableBody.innerHTML = imoveis.map(imovel => `
        <tr class="border-b border-gray-700 hover:bg-gray-800/50">
            <td class="p-4 font-mono text-cyan-300">${sanitizeHTML(imovel.cod_imovel)}</td>
            <td class="p-4 font-medium">${sanitizeHTML(imovel.endereco)}</td>
            <td class="p-4">${sanitizeHTML(imovel.cliente.nome)}</td>
            <td class="p-4">${sanitizeHTML(imovel.imobiliaria.nome)}</td>
            <td class="p-4">${imovel.tamanho} m²</td>
            <td class="p-4">${mobiliaMap[imovel.mobiliado] || imovel.mobiliado}</td>
            <td class="p-4 font-mono text-right">R$ ${imovel.valor.toFixed(2)}</td>
        </tr>
    `).join('');
}

/**
 * Busca os dados da API e renderiza a tabela.
 */
async function refreshImoveisList() {
    try {
        const imoveis = await api.getImoveis();
        renderImoveisTable(imoveis);
    } catch (error) {
        showAlert('Não foi possível carregar a lista de imóveis.', 'error');
        const tableBody = document.getElementById('imoveis-table-body');
        if(tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Erro ao carregar dados.</td></tr>';
        }
    }
}

/**
 * Função principal para inicializar o módulo de imóveis.
 */
export async function initImoveis() {
    const pageHTML = `
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-cyan-300">Consulta de Imóveis</h1>
        </div>
        <div class="bg-gray-800/50 rounded-xl neon-border overflow-hidden">
            <table class="w-full text-left">
                <thead class="bg-gray-900/50">
                    <tr>
                        <th class="p-4">Código</th>
                        <th class="p-4">Endereço</th>
                        <th class="p-4">Cliente</th>
                        <th class="p-4">Imobiliária</th>
                        <th class="p-4">Tamanho</th>
                        <th class="p-4">Mobília</th>
                        <th class="p-4 text-right">Valor Base</th>
                    </tr>
                </thead>
                <tbody id="imoveis-table-body">
                    <tr><td colspan="7" class="text-center py-8 text-gray-500">Carregando...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    renderPageContent(pageHTML);

    await refreshImoveisList();
}
