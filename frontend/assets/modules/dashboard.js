// /assets/modules/dashboard.js

import { api } from '../api.js';
import { renderPageContent } from '../ui.js';

/**
 * Formata um número como moeda brasileira (BRL).
 * @param {number} value - O valor a ser formatado.
 * @returns {string} - A string formatada.
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

/**
 * Cria o HTML para um card de KPI financeiro com comparação.
 * @param {string} id - O ID para o elemento do valor principal.
 * @param {string} title - O título do card.
 * @param {number} value - O valor principal a ser exibido.
 * @param {number} comparisonPercent - O percentual de comparação.
 * @param {string} comparisonText - O texto descritivo da comparação.
 * @param {string} iconPath - O caminho SVG para o ícone.
 * @returns {string} - O HTML do card.
 */
function createFinancialKpiCard(id, title, value, comparisonPercent, comparisonText, iconPath) {
    const isPositive = comparisonPercent >= 0;
    const colorClass = isPositive ? 'text-green-400' : 'text-red-400';
    const icon = isPositive ? 'M12 6l6 6m0 0l-6 6m6-6H6' : 'M12 18l-6-6m0 0l6-6m-6 6h12'; // Arrows right/left
    const formattedValue = formatCurrency(value);

    return `
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border flex flex-col justify-between">
            <div class="flex justify-between items-start">
                <h2 class="text-sm font-medium text-gray-400">${title}</h2>
                <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"></path>
                </svg>
            </div>
            <div>
                <p id="${id}" class="text-4xl font-bold text-white mt-2">${formattedValue}</p>
                <div class="flex items-center text-sm mt-1 ${colorClass}">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"></path>
                    </svg>
                    <span>${comparisonPercent.toFixed(2)}%</span>
                    <span class="text-gray-400 ml-1">${comparisonText}</span>
                </div>
            </div>
        </div>
    `;
}


/**
 * Renderiza o gráfico de vistorias usando Chart.js.
 * @param {HTMLCanvasElement} canvasElement - O elemento canvas onde o gráfico será renderizado.
 * @param {Array<object>} chartData - Os dados para o gráfico, vindos da API.
 */
function renderChart(canvasElement, chartData) {
    const labels = chartData.map(item => item.mes_ano);
    const data = chartData.map(item => item.total);

    const ctx = canvasElement.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 255, 179, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 255, 179, 0.1)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Vistorias Agendadas',
                data: data,
                backgroundColor: gradient,
                borderColor: '#00ffb3',
                borderWidth: 2,
                pointBackgroundColor: '#00ffb3',
                pointBorderColor: '#fff',
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#00ffb3',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 10, 0.8)',
                    titleFont: { size: 14, family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 255, 179, 0.1)' },
                    ticks: { color: '#9ca3af' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af' }
                }
            }
        }
    });
}

/**
 * Função principal para inicializar e renderizar a página do dashboard.
 */
export async function initDashboard() {
    // Estrutura HTML base do dashboard com placeholders
    const dashboardHTML = `
        <h1 class="text-3xl font-bold text-cyan-300 mb-8">Visão Geral</h1>
        
        <!-- Seção de cards financeiros -->
        <div id="financial-kpis" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <!-- Cards serão inseridos aqui pelo JS -->
        </div>

        <!-- Seção de cards de estatísticas gerais -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border flex flex-col justify-between">
                <h2 class="text-sm font-medium text-gray-400">Imobiliárias Ativas</h2>
                <p id="total-imobiliarias" class="text-4xl font-bold text-white">...</p>
            </div>
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border flex flex-col justify-between">
                <h2 class="text-sm font-medium text-gray-400">Vistoriadores</h2>
                <p id="total-vistoriadores" class="text-4xl font-bold text-white">...</p>
            </div>
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border flex flex-col justify-between">
                <h2 class="text-sm font-medium text-gray-400">Vistorias (Mês Atual)</h2>
                <p id="vistorias-mes" class="text-4xl font-bold text-white">...</p>
            </div>
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border flex flex-col justify-between">
                <h2 class="text-sm font-medium text-gray-400">Improdutivas (Mês Atual)</h2>
                <p id="improdutivas-mes" class="text-red-400 text-4xl font-bold">...</p>
            </div>
        </div>

        <!-- Seção do gráfico -->
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
            <h2 class="text-lg font-semibold text-white mb-4">Evolução Mensal de Vistorias</h2>
            <div class="h-80">
                <canvas id="vistoriasChart"></canvas>
            </div>
        </div>
    `;

    renderPageContent(dashboardHTML);

    try {
        // Busca todos os dados da API em paralelo
        const [stats, chartData, financialStats] = await Promise.all([
            api.getDashboardStats(),
            api.getVistoriasChartData(),
            api.getDashboardFinancialStats()
        ]);

        // Preenche os cards financeiros
        const financialKpisContainer = document.getElementById('financial-kpis');
        financialKpisContainer.innerHTML = `
            ${createFinancialKpiCard(
                'faturamento-mes',
                'Faturamento (Mês Atual)',
                financialStats.faturamento_mes_atual,
                financialStats.crescimento_percentual,
                'vs. mês anterior',
                'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01'
            )}
            ${createFinancialKpiCard(
                'comissoes-mes',
                'Comissões a Pagar (Mês)',
                financialStats.comissoes_a_pagar_mes_atual,
                0, // Sem comparação para comissões
                '',
                'M17 9.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-0-1H16V10a.5.5 0 01.5-.5zM8 12a4 4 0 100-8 4 4 0 000 8zm0 1a5 5 0 100-10 5 5 0 000 10z'
            )}
            ${createFinancialKpiCard(
                'lucro-mes',
                'Lucro (Faturamento - Comissão)',
                financialStats.lucro_mes_atual,
                0, // Sem comparação para lucro
                '',
                'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
            )}
        `;
        
        // Preenche os cards de estatísticas gerais
        document.getElementById('total-imobiliarias').textContent = stats.total_imobiliarias;
        document.getElementById('total-vistoriadores').textContent = stats.total_vistoriadores;
        document.getElementById('vistorias-mes').textContent = stats.vistorias_mes_atual;
        document.getElementById('improdutivas-mes').textContent = stats.improdutivas_mes_atual;

        // Renderiza o gráfico
        const canvasElement = document.getElementById('vistoriasChart');
        if (canvasElement) {
            renderChart(canvasElement, chartData);
        }

    } catch (error) {
        console.error('Falha ao carregar dados do dashboard:', error);
        document.querySelector('#page-content').innerHTML = `
            <div class="text-center text-red-400">
                <h2 class="text-2xl font-bold">Oops! Algo deu errado.</h2>
                <p>Não foi possível carregar as informações do dashboard. Tente novamente mais tarde.</p>
                <p class="text-sm mt-2 text-gray-500">${error.message}</p>
            </div>
        `;
    }
}
