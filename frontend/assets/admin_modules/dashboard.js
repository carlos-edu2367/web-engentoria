// frontend/assets/admin_modules/dashboard.js
import { api } from '../api-ti.js';

let feedbackChartInstance = null;

export const renderDashboard = async (pageContent) => {
    const stats = await api.getDashboardStats();
    const feedbackData = await api.getFeedbackChart();

    pageContent.innerHTML = `
        <div class="fade-in">
            <h2 class="text-3xl font-bold mb-8 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">Visão Geral do Sistema</h2>
            
            <!-- Stats Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <!-- Card Users -->
                <div class="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 hover:border-orange-500/30 transition-all group">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-gray-400 font-medium group-hover:text-orange-400 transition-colors">Usuários Totais</h3>
                        <div class="p-3 bg-blue-500/10 rounded-xl text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </div>
                    </div>
                    <div class="flex items-baseline">
                        <span class="text-4xl font-bold text-white tracking-tight">${stats.total_users + stats.total_clients}</span>
                        <span class="ml-2 text-sm text-gray-500">App + Clientes</span>
                    </div>
                </div>

                <!-- Card Imobiliarias -->
                <div class="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 hover:border-orange-500/30 transition-all group">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-gray-400 font-medium group-hover:text-orange-400 transition-colors">Imobiliárias</h3>
                        <div class="p-3 bg-purple-500/10 rounded-xl text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        </div>
                    </div>
                    <span class="text-4xl font-bold text-white tracking-tight">${stats.total_imobiliarias}</span>
                </div>

                <!-- Card Imoveis -->
                <div class="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 hover:border-orange-500/30 transition-all group">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-gray-400 font-medium group-hover:text-orange-400 transition-colors">Imóveis Ativos</h3>
                        <div class="p-3 bg-green-500/10 rounded-xl text-green-400 group-hover:bg-green-500/20 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                        </div>
                    </div>
                    <span class="text-4xl font-bold text-white tracking-tight">${stats.total_imoveis}</span>
                </div>

                <!-- Card Chamados -->
                <div class="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 hover:border-orange-500/30 transition-all group cursor-pointer" onclick="window.location.hash='support'">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-gray-400 font-medium group-hover:text-orange-400 transition-colors">Suporte Aberto</h3>
                        <div class="p-3 bg-red-500/10 rounded-xl text-red-400 group-hover:bg-red-500/20 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                        </div>
                    </div>
                    <div class="flex items-baseline">
                        <span class="text-4xl font-bold text-white tracking-tight">${stats.open_tickets}</span>
                        <span class="ml-2 text-xs text-orange-400">Ver fila →</span>
                    </div>
                </div>
            </div>

            <!-- Feedback Chart -->
            <div class="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 shadow-xl">
                <h3 class="text-xl font-bold text-white mb-6">Qualidade do App (Média de Feedback)</h3>
                <div class="relative h-80 w-full">
                    <canvas id="feedbackChart"></canvas>
                </div>
            </div>
        </div>
    `;

    renderChart(feedbackData);
};

const renderChart = (feedbackData) => {
    if (feedbackChartInstance) feedbackChartInstance.destroy();
    const ctx = document.getElementById('feedbackChart').getContext('2d');
    
    feedbackChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: feedbackData.map(d => d.version),
            datasets: [{
                label: 'Nota Média',
                data: feedbackData.map(d => d.avg_rating),
                borderColor: '#f97316',
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
                    gradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
                    return gradient;
                },
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#f97316',
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#f3f4f6',
                    bodyColor: '#d1d5db',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 5,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { family: 'Inter' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { family: 'Inter' } }
                }
            }
        }
    });
};