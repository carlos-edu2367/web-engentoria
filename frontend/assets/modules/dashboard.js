// /assets/modules/dashboard.js

import { api } from '../api.js';
import { renderPageContent } from '../ui.js';

/**
 * Renderiza o gráfico de vistorias usando Chart.js.
 * @param {HTMLCanvasElement} canvasElement - O elemento canvas onde o gráfico será renderizado.
 * @param {Array<object>} chartData - Os dados para o gráfico, vindos da API.
 */
function renderChart(canvasElement, chartData) {
    // Pega os últimos 6 meses de dados, conforme fornecido pela API.
    const labels = chartData.map(item => item.mes_ano);
    const data = chartData.map(item => item.total);

    const ctx = canvasElement.getContext('2d');
    
    // Gradiente para a linha do gráfico
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
                backgroundColor: gradient, // Cor de preenchimento sob a linha
                borderColor: '#00ffb3', // Cor da linha
                borderWidth: 2,
                pointBackgroundColor: '#00ffb3',
                pointBorderColor: '#fff',
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#00ffb3',
                fill: true,
                tension: 0.4 // Deixa a linha com curvas suaves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Esconde a legenda, pois só temos um dataset
                },
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
                    grid: {
                        color: 'rgba(0, 255, 179, 0.1)' // Linhas de grade sutis
                    },
                    ticks: {
                        color: '#9ca3af' // Cor dos números do eixo Y
                    }
                },
                x: {
                    grid: {
                        display: false // Remove as linhas de grade verticais
                    },
                    ticks: {
                        color: '#9ca3af' // Cor dos meses no eixo X
                    }
                }
            }
        }
    });
}

/**
 * Calcula a média de vistorias e a mudança de produtividade, ignorando o mês atual.
 * @param {Array<object>} chartData - Os dados do gráfico.
 * @returns {object} - Um objeto contendo a média, a mensagem de produtividade e a cor.
 */
function calculateInsights(chartData) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JS months are 0-indexed
    const currentMonthLabel = `${String(currentMonth).padStart(2, '0')}/${currentYear}`;

    // Filtra os dados para incluir apenas meses completos
    let completedMonthsData = chartData.filter(item => item.mes_ano !== currentMonthLabel);

    // Garante que os dados estejam ordenados cronologicamente
    completedMonthsData.sort((a, b) => {
        const [aMonth, aYear] = a.mes_ano.split('/');
        const [bMonth, bYear] = b.mes_ano.split('/');
        if (aYear !== bYear) {
            return parseInt(aYear) - parseInt(bYear);
        }
        return parseInt(aMonth) - parseInt(bMonth);
    });

    // --- LÓGICA DE CÁLCULO REVISADA ---

    // Média: Usa os últimos 3 meses completos, se disponíveis.
    const lastThreeCompletedMonths = completedMonthsData.slice(-3);
    const average = lastThreeCompletedMonths.length > 0
        ? (lastThreeCompletedMonths.reduce((sum, item) => sum + item.total, 0) / lastThreeCompletedMonths.length).toFixed(1)
        : 'N/A';

    // Produtividade: Requer pelo menos 2 meses completos para comparar.
    if (completedMonthsData.length < 2) {
        return {
            average,
            productivityMessage: 'Dados insuficientes para análise de produtividade.',
            messageColor: 'text-yellow-400'
        };
    }

    // Pega os dois últimos meses completos de forma explícita
    const latestMonthData = completedMonthsData[completedMonthsData.length - 1];
    const previousMonthData = completedMonthsData[completedMonthsData.length - 2];

    // **FAIL-SAFE: Garante que não estamos a comparar o mesmo mês**
    if (!latestMonthData || !previousMonthData || latestMonthData.mes_ano === previousMonthData.mes_ano) {
        console.error("Erro de lógica: Tentativa de comparar o mesmo mês ou dados inválidos.", latestMonthData, previousMonthData);
        return {
            average,
            productivityMessage: 'Erro ao analisar os dados de produtividade.',
            messageColor: 'text-red-500'
        };
    }
    
    const latestMonthTotal = latestMonthData.total;
    const previousMonthTotal = previousMonthData.total;
    
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const latestMonthName = monthNames[parseInt(latestMonthData.mes_ano.split('/')[0], 10) - 1];
    const previousMonthName = monthNames[parseInt(previousMonthData.mes_ano.split('/')[0], 10) - 1];

    let productivityMessage = '';
    let messageColor = '';

    if (previousMonthTotal === 0 && latestMonthTotal > 0) {
        productivityMessage = `A produtividade aumentou significativamente em ${latestMonthName}!`;
        messageColor = 'text-green-400';
    } else if (previousMonthTotal === 0 && latestMonthTotal === 0) {
        productivityMessage = `Sem dados de produtividade para ${latestMonthName} e ${previousMonthName}.`;
        messageColor = 'text-gray-400';
    } else {
        const percentageChange = ((latestMonthTotal - previousMonthTotal) / previousMonthTotal) * 100;
        if (percentageChange > 5) {
            productivityMessage = `A produtividade aumentou ${percentageChange.toFixed(0)}% em ${latestMonthName} (vs. ${previousMonthName}).`;
            messageColor = 'text-green-400';
        } else if (percentageChange < -5) {
            productivityMessage = `A produtividade diminuiu ${Math.abs(percentageChange.toFixed(0))}% em ${latestMonthName} (vs. ${previousMonthName}).`;
            messageColor = 'text-red-400';
        } else {
            productivityMessage = `A produtividade manteve-se estável entre ${previousMonthName} e ${latestMonthName}.`;
            messageColor = 'text-gray-400';
        }
    }

    return { average, productivityMessage, messageColor };
}


/**
 * Função principal para inicializar e renderizar a página do dashboard.
 */
export async function initDashboard() {
    // Estrutura HTML base do dashboard
    const dashboardHTML = `
        <h1 class="text-3xl font-bold text-cyan-300 mb-8">Dashboard</h1>
        
        <!-- Seção de cards de estatísticas -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
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
             <div class="bg-gray-800/50 p-6 rounded-xl neon-border flex flex-col justify-between">
                <h2 class="text-sm font-medium text-gray-400">Média (Meses Fechados)</h2>
                <p id="media-vistorias" class="text-4xl font-bold text-white">...</p>
            </div>
        </div>

        <!-- Seção do gráfico e insights -->
        <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
            <h2 class="text-lg font-semibold text-white mb-2">Evolução Mensal de Vistorias</h2>
            <p id="produtividade-mensagem" class="text-sm mb-4 text-gray-400">Analisando dados...</p>
            <div class="h-80">
                <canvas id="vistoriasChart"></canvas>
            </div>
        </div>
    `;

    renderPageContent(dashboardHTML);

    try {
        // Busca os dados da API em paralelo para mais performance
        const [stats, chartData] = await Promise.all([
            api.getDashboardStats(),
            api.getVistoriasChartData()
        ]);

        // Preenche os cards com os dados
        document.getElementById('total-imobiliarias').textContent = stats.total_imobiliarias;
        document.getElementById('total-vistoriadores').textContent = stats.total_vistoriadores;
        document.getElementById('vistorias-mes').textContent = stats.vistorias_mes_atual;
        document.getElementById('improdutivas-mes').textContent = stats.improdutivas_mes_atual;

        // Calcula insights e preenche os campos
        const insights = calculateInsights(chartData);
        document.getElementById('media-vistorias').textContent = insights.average;
        const mensagemEl = document.getElementById('produtividade-mensagem');
        mensagemEl.textContent = insights.productivityMessage;
        mensagemEl.className = `text-sm mb-4 ${insights.messageColor}`;


        // Renderiza o gráfico
        const canvasElement = document.getElementById('vistoriasChart');
        if (canvasElement) {
            renderChart(canvasElement, chartData);
        }

    } catch (error) {
        console.error('Falha ao carregar dados do dashboard:', error);
        // Exibe uma mensagem de erro amigável na tela
        document.querySelector('#page-content').innerHTML = `
            <div class="text-center text-red-400">
                <h2 class="text-2xl font-bold">Oops! Algo deu errado.</h2>
                <p>Não foi possível carregar as informações do dashboard. Tente novamente mais tarde.</p>
            </div>
        `;
    }
}
