// frontend/assets/imobiliaria.js

const isLocalImob = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL_IMOB = isLocalImob ? 'http://127.0.0.1:8000/api/v1/imobiliaria' : '/api/v1/imobiliaria';

let calendar; // Variável global para o calendário

document.addEventListener('DOMContentLoaded', () => {
    protectImobiliariaPage();

    const navLinks = document.querySelectorAll('.nav-link');
    const pageContent = document.getElementById('page-content');
    const imobNav = document.getElementById('imobiliaria-nav');

    const loadPage = async (pageId) => {
        navLinks.forEach(link => {
            link.classList.remove('active');
            link.classList.add('hover:bg-gray-700/50');
        });
        const activeLink = imobNav.querySelector(`a[href="#${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            activeLink.classList.remove('hover:bg-gray-700/50');
        }

        pageContent.innerHTML = `
            <div class="flex justify-center items-center h-64">
                <div class="animate-pulse flex flex-col items-center">
                    <div class="h-12 w-12 bg-cyan-400/20 rounded-full flex items-center justify-center mb-4">
                        <svg class="h-6 w-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                        </svg>
                    </div>
                    <p class="text-cyan-400">Carregando...</p>
                </div>
            </div>
        `;
        
        try {
            switch (pageId) {
                case 'overview':
                    await renderOverview();
                    break;
                case 'agenda':
                    await renderAgenda();
                    break;
                case 'relatorios':
                    await renderRelatorios();
                    break;
                default:
                    await renderOverview();
            }
        } catch (error) {
            pageContent.innerHTML = `
                <div class="bg-red-900/30 border border-red-800/50 rounded-lg p-4 text-center">
                    <p class="text-red-400 font-medium">Erro ao carregar conteúdo:</p>
                    <p class="text-gray-400 mt-1">${error.message}</p>
                </div>
            `;
        }
    };

    imobNav.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.hash) {
            e.preventDefault();
            window.location.hash = link.hash.substring(1);
        }
    });
    
    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.substring(1) || 'overview';
        loadPage(pageId);
    });

    const initialPage = window.location.hash.substring(1) || 'overview';
    loadPage(initialPage);

    document.getElementById('logout-button').addEventListener('click', logout);
});

// =================================================================
// --- Funções de Renderização de Páginas ---
// =================================================================

async function renderOverview() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="fade-in">
            <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300 mb-6">Visão Geral</h1>
            
            <!-- KPIs -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                ${createKpiCard('kpi-mes-atual', 'Vistorias (Mês Atual)', 'bg-cyan-900/20', 'text-cyan-400', 'M6,12 L18,12 M12,6 L12,18')}
                ${createKpiCard('kpi-improdutivas-mes', 'Improdutivas (Mês Atual)', 'bg-yellow-900/20', 'text-yellow-400', 'M13 10V3L8 8l5 5v-3.5c4 0 7 2 7 6s-3 6-7 6-7-2-7-6')}
                ${createKpiCard('kpi-projecao', 'Projeção (Próximo Mês)', 'bg-purple-900/20', 'text-purple-400', 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', true)}
                ${createKpiCard('kpi-taxa-improdutividade', 'Taxa de Improdutividade', 'bg-red-900/20', 'text-red-400', 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z')}
            </div>
            
            <!-- Comparações -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div id="comp-vistorias" class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 neon-border"></div>
                <div id="comp-improdutivas" class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 neon-border"></div>
            </div>
            
            <!-- Gráfico -->
            <div class="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 neon-border">
                <h2 class="text-xl font-bold text-cyan-300 mb-4">Tendência Mensal e Projeção</h2>
                <div class="h-80">
                    <canvas id="vistoriasChart"></canvas>
                </div>
            </div>
        </div>
    `;
    
    try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL_IMOB}/dashboard-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Falha ao buscar estatísticas.');
        const stats = await response.json();

        // Atualiza KPIs
        document.getElementById('kpi-mes-atual').textContent = stats.vistorias_mes_atual;
        document.getElementById('kpi-improdutivas-mes').textContent = stats.improdutivas_mes_atual;
        document.getElementById('kpi-projecao').textContent = `~${stats.projecao_proximo_mes}`;
        
        const taxaImprodutividade = stats.vistorias_mes_atual > 0 ? 
            ((stats.improdutivas_mes_atual / stats.vistorias_mes_atual) * 100).toFixed(1) : 0;
        document.getElementById('kpi-taxa-improdutividade').textContent = `${taxaImprodutividade}%`;

        // Atualiza comparações
        document.getElementById('comp-vistorias').innerHTML = createComparisonCard(
            'Vistorias (Últimos 30d)', 
            stats.vistorias_30d.total, 
            stats.vistorias_30d.change
        );
        
        document.getElementById('comp-improdutivas').innerHTML = createComparisonCard(
            'Improdutivas (Últimos 30d)', 
            stats.improdutivas_30d.total, 
            stats.improdutivas_30d.change
        );

        // Configura o gráfico
        const chartCtx = document.getElementById('vistoriasChart').getContext('2d');
        const labels = Object.keys(stats.monthly_breakdown);
        const data = Object.values(stats.monthly_breakdown);
        
        const nextMonthLabel = getNextMonthLabel(labels[labels.length - 1]);
        labels.push(nextMonthLabel);
        data.push(stats.projecao_proximo_mes);

        // Calcula o stepSize para o eixo Y
        const maxDataValue = Math.max(...data.filter(Number.isFinite));
        const stepSize = Math.ceil(maxDataValue / 5) || 1;

        new Chart(chartCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nº de Vistorias',
                    data: data,
                    backgroundColor: (context) => 
                        context.dataIndex === data.length - 1 
                            ? 'rgba(167, 139, 250, 0.5)'
                            : 'rgba(34, 211, 238, 0.5)',
                    borderColor: (context) => 
                        context.dataIndex === data.length - 1 
                            ? 'rgb(167, 139, 250)' 
                            : 'rgb(34, 211, 238)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grace: '5%',
                        suggestedMax: maxDataValue + stepSize,
                        grid: { color: 'rgba(55, 65, 81, 0.5)' },
                        ticks: { 
                            color: '#9ca3af',
                            stepSize: stepSize
                        } 
                    }, 
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#9ca3af' } 
                    } 
                },
                plugins: { 
                    legend: { 
                        labels: { 
                            color: '#d1d5db',
                            font: { weight: '600' }
                        } 
                    } 
                }
            }
        });

    } catch (error) {
        contentDiv.innerHTML = `
            <div class="bg-red-900/30 border border-red-800/50 rounded-lg p-4 text-center">
                <p class="text-red-400 font-medium">Erro ao carregar visão geral:</p>
                <p class="text-gray-400 mt-1">${error.message}</p>
            </div>
        `;
    }
}

async function renderAgenda() {
    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = `
        <div class="fade-in">
            <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300 mb-6">Agenda de Vistorias</h1>
            <div id="calendar" class="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 neon-border"></div>
        </div>
    `;

    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        buttonText: {
            today:    'Hoje',
            month:    'Mês',
            week:     'Semana',
            day:      'Dia',
            list:     'Lista'
        },
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: async (fetchInfo, successCallback, failureCallback) => {
            try {
                const token = getToken();
                const url = `${API_BASE_URL_IMOB}/agenda?start_date=${fetchInfo.startStr.split('T')[0]}&end_date=${fetchInfo.endStr.split('T')[0]}`;
                const response = await fetch(url, { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                
                if (!response.ok) throw new Error('Falha ao buscar eventos.');
                const vistorias = await response.json();
                
                const events = vistorias.map(v => ({
                    title: `[${v.imovel.cod_imovel}] ${v.tipo_vistoria}`,
                    start: `${v.data}T${v.horario}`,
                    backgroundColor: v.tipo_vistoria.includes('Entrega') ? '#00a3ff' : '#00ffb3',
                    borderColor: v.tipo_vistoria.includes('Entrega') ? '#0088cc' : '#00cc88',
                    extendedProps: { vistoria: v }
                }));
                
                successCallback(events);
            } catch (error) {
                failureCallback(error);
            }
        },
        eventClick: (info) => {
            showVistoriaModal(info.event.extendedProps.vistoria);
        },
        eventTimeFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }
    });
    
    calendar.render();
}

async function renderRelatorios() {
    const contentDiv = document.getElementById('page-content');
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    contentDiv.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">Relatórios Mensais</h1>
                <div class="flex gap-2 flex-wrap">
                    <select id="report-month" class="bg-gray-800/50 border border-gray-700/50 text-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"></select>
                    <select id="report-year" class="bg-gray-800/50 border border-gray-700/50 text-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"></select>
                    <button id="fetch-report-btn" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20">
                        Gerar Visualização
                    </button>
                    <button id="download-excel-btn" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20">
                        <svg class="h-5 w-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Excel
                    </button>
                    <button id="download-pdf-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20">
                        <svg class="h-5 w-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        PDF
                    </button>
                </div>
            </div>
            <div id="report-content" class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 neon-border"></div>
        </div>
    `;

    // CORREÇÃO: Declarar yearSelect antes de usar
    const monthSelect = document.getElementById('report-month');
    const yearSelect = document.getElementById('report-year');
    
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    monthNames.forEach((name, index) => {
        const option = new Option(name, index + 1);
        if (index + 1 === currentMonth) option.selected = true;
        monthSelect.add(option);
    });

    for (let y = currentYear; y >= 2022; y--) {
        yearSelect.add(new Option(y, y));
    }

    const fetchAndDisplayReport = async () => {
        const reportContent = document.getElementById('report-content');
        reportContent.innerHTML = `
            <div class="flex justify-center items-center h-48">
                <div class="animate-pulse flex flex-col items-center">
                    <div class="h-12 w-12 bg-cyan-400/20 rounded-full flex items-center justify-center mb-4">
                        <svg class="h-6 w-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                        </svg>
                    </div>
                    <p class="text-cyan-400">Gerando relatório...</p>
                </div>
            </div>
        `;
        
        const mes = monthSelect.value;
        const ano = yearSelect.value;
        
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL_IMOB}/relatorio-mensal?mes=${mes}&ano=${ano}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) throw new Error('Falha ao gerar relatório.');
            const relatorios = await response.json();
            
            if (!document.getElementById('report-content')) {
                console.log("Página de Relatórios não está mais ativa. Renderização abortada.");
                return;
            }

            if (relatorios.length === 0) {
                reportContent.innerHTML = `
                    <div class="text-center py-10">
                        <svg class="h-12 w-12 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p class="text-gray-400 mt-4">Nenhum dado encontrado para este período.</p>
                    </div>
                `;
                return;
            }
            
            reportContent.innerHTML = relatorios.map(r => createReportHTML(r)).join('');

        } catch (error) {
            reportContent.innerHTML = `
                <div class="bg-red-900/30 border border-red-800/50 rounded-lg p-4 text-center">
                    <p class="text-red-400 font-medium">Erro ao carregar relatório:</p>
                    <p class="text-gray-400 mt-1">${error.message}</p>
                </div>
            `;
        }
    };

    document.getElementById('fetch-report-btn').addEventListener('click', fetchAndDisplayReport);
    document.getElementById('download-excel-btn').addEventListener('click', () => downloadReport('excel'));
    document.getElementById('download-pdf-btn').addEventListener('click', () => downloadReport('pdf'));

    fetchAndDisplayReport();
}

// =================================================================
// --- Funções Auxiliares e de Componentes ---
// =================================================================

function createKpiCard(id, title, bgColor, textColor, svgPath = '', isProjection = false) {
    const valuePrefix = isProjection ? '~' : '';
    return `
        <div class="${bgColor} p-6 rounded-xl border border-gray-700/50 neon-border">
            <div class="flex justify-between items-start">
                <h2 class="text-gray-400 text-sm font-medium">${title}</h2>
                ${svgPath ? `
                    <svg class="h-5 w-5 ${textColor}/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${svgPath}"></path>
                    </svg>
                ` : ''}
            </div>
            <p class="text-3xl font-bold ${textColor} mt-2">${valuePrefix}<span id="${id}">0</span></p>
        </div>
    `;
}

function createComparisonCard(title, value, change) {
    const isPositive = change >= 0;
    const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400';
    const icon = isPositive ? '↑' : '↓';
    
    return `
        <div>
            <h2 class="text-gray-400 text-sm font-medium mb-2">${title}</h2>
            <div class="flex items-baseline gap-4">
                <p class="text-2xl font-bold">${value}</p>
                <span class="${colorClass} font-semibold flex items-center">
                    ${icon} ${Math.abs(change)}%
                    <svg class="h-4 w-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isPositive ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}"></path>
                    </svg>
                </span>
            </div>
            <p class="text-xs text-gray-500 mt-1">vs. 30 dias anteriores</p>
        </div>
    `;
}

function showVistoriaModal(vistoria) {
    const { imovel, cliente, vistoriador } = vistoria;
    const modalContent = document.getElementById('modal-content');
    const modal = document.getElementById('generic-modal');
    
    modalContent.innerHTML = `
        <div class="space-y-4">
            <div class="flex justify-between items-start">
                <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300 mb-2">
                    Detalhes do Agendamento
                </h2>
                <button id="close-modal-btn" class="p-1 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <!-- Coluna 1: Dados da Vistoria -->
                <div class="bg-gray-700/30 p-4 rounded-lg neon-border">
                    <h3 class="font-semibold text-lg border-b border-gray-600/50 pb-2 mb-3 text-cyan-300">
                        <svg class="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                        </svg>
                        Vistoria
                    </h3>
                    <div class="space-y-3">
                        <p><strong class="text-gray-300">Tipo:</strong> <span class="text-gray-200">${vistoria.tipo_vistoria}</span></p>
                        <p><strong class="text-gray-300">Data:</strong> <span class="text-gray-200">${new Date(vistoria.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span></p>
                        <p><strong class="text-gray-300">Horário:</strong> <span class="text-gray-200">${vistoria.horario}</span></p>
                        <p><strong class="text-gray-300">Vistoriador:</strong> <span class="text-gray-200">${vistoriador.nome}</span></p>
                    </div>
                </div>
                
                <!-- Coluna 2: Dados do Imóvel -->
                <div class="bg-gray-700/30 p-4 rounded-lg neon-border">
                    <h3 class="font-semibold text-lg border-b border-gray-600/50 pb-2 mb-3 text-emerald-300">
                        <svg class="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                        </svg>
                        Imóvel
                    </h3>
                    <div class="space-y-3">
                        <p><strong class="text-gray-300">Código:</strong> <span class="text-gray-200">${imovel.cod_imovel}</span></p>
                        <p><strong class="text-gray-300">Endereço:</strong> <span class="text-gray-200">${imovel.endereco}</span></p>
                        <p><strong class="text-gray-300">Valor:</strong> <span class="text-gray-200">${imovel.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
                        <p><strong class="text-gray-300">Imobiliária:</strong> <span class="text-gray-200">${imovel.imobiliaria.nome}</span></p>
                    </div>
                </div>
                
                ${cliente ? `
                <!-- Seção do Cliente (ocupa duas colunas) -->
                <div class="bg-gray-700/30 p-4 rounded-lg neon-border md:col-span-2">
                    <h3 class="font-semibold text-lg border-b border-gray-600/50 pb-2 mb-3 text-purple-300">
                        <svg class="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                        Cliente
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <p><strong class="text-gray-300">Nome:</strong> <span class="text-gray-200">${cliente.nome}</span></p>
                        <p><strong class="text-gray-300">Email:</strong> <span class="text-gray-200">${cliente.email || 'N/D'}</span></p>
                        <p><strong class="text-gray-300">Telefone:</strong> <span class="text-gray-200">${cliente.telefone1 || 'N/D'}</span></p>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
}

function createReportHTML(report) {
    const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    return `
        <div class="bg-gray-800/50 rounded-xl border border-gray-700/50 neon-border mb-6 overflow-hidden">
            <!-- Cabeçalho do Relatório -->
            <div class="bg-gray-700/50 p-6 border-b border-gray-700/50">
                <div class="md:flex justify-between items-start">
                    <div>
                        <h2 class="text-xl font-bold text-cyan-300">${report.imobiliaria_nome}</h2>
                        <p class="text-gray-400">${report.mes_ano}</p>
                    </div>
                    <div class="mt-4 md:mt-0 text-right">
                        <p class="text-gray-400">Valor Total a Pagar</p>
                        <p class="text-3xl font-bold text-emerald-400">${formatCurrency(report.valor_total)}</p>
                    </div>
                </div>

                <!-- KPIs do Relatório -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-center">
                    <div class="p-3 bg-gray-800/30 rounded-lg">
                        <p class="text-2xl font-bold">${report.total_vistorias}</p>
                        <p class="text-sm text-gray-400">Vistorias Agendadas</p>
                    </div>
                    <div class="p-3 bg-gray-800/30 rounded-lg">
                        <p class="text-2xl font-bold">${formatCurrency(report.valor_vistorias)}</p>
                        <p class="text-sm text-gray-400">Valor Vistorias</p>
                    </div>
                    <div class="p-3 bg-gray-800/30 rounded-lg">
                        <p class="text-2xl font-bold">${report.total_improdutivas}</p>
                        <p class="text-sm text-gray-400">Improdutivas</p>
                    </div>
                    <div class="p-3 bg-gray-800/30 rounded-lg">
                        <p class="text-2xl font-bold">${formatCurrency(report.valor_improdutivas)}</p>
                        <p class="text-sm text-gray-400">Valor Improdutivas</p>
                    </div>
                </div>
            </div>

            <!-- Detalhes das Vistorias -->
            <div class="p-6">
                <details class="group bg-gray-900/30 rounded-lg overflow-hidden mb-4">
                    <summary class="cursor-pointer p-4 flex justify-between items-center hover:bg-gray-700/50 transition">
                        <span class="font-semibold text-gray-200">
                            <svg class="h-5 w-5 inline mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                            </svg>
                            Detalhes das Vistorias Agendadas (${report.total_vistorias})
                        </span>
                        <svg class="h-5 w-5 text-gray-400 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </summary>
                    <div class="mt-2 px-4 pb-4 text-xs overflow-x-auto">
                        <table class="w-full text-left whitespace-nowrap">
                            <thead class="border-b border-gray-700">
                                <tr class="text-gray-400">
                                    <th class="p-3">Data</th>
                                    <th class="p-3">Cód. Imóvel</th>
                                    <th class="p-3">Endereço</th>
                                    <th class="p-3">Tamanho</th>
                                    <th class="p-3">Mobília</th>
                                    <th class="p-3">Tipo Vistoria</th>
                                    <th class="p-3">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${report.vistorias_agendadas.map(v => `
                                    <tr class="border-b border-gray-800 hover:bg-gray-700/50 transition">
                                        <td class="p-3">${new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td class="p-3">${v.cod_imovel}</td>
                                        <td class="p-3 truncate max-w-xs" title="${v.endereco}">${v.endereco}</td>
                                        <td class="p-3">${v.tamanho} m²</td>
                                        <td class="p-3">${v.mobiliado.replace(/_/g, ' ')}</td>
                                        <td class="p-3">${v.tipo}</td>
                                        <td class="p-3">${formatCurrency(v.valor)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>

                <!-- Detalhes das Improdutivas -->
                <details class="group bg-gray-900/30 rounded-lg overflow-hidden">
                    <summary class="cursor-pointer p-4 flex justify-between items-center hover:bg-gray-700/50 transition">
                        <span class="font-semibold text-gray-200">
                            <svg class="h-5 w-5 inline mr-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            Detalhes das Vistorias Improdutivas (${report.total_improdutivas})
                        </span>
                        <svg class="h-5 w-5 text-gray-400 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </summary>
                    <div class="mt-2 px-4 pb-4 text-xs overflow-x-auto">
                        <table class="w-full text-left whitespace-nowrap">
                            <thead class="border-b border-gray-700">
                                <tr class="text-gray-400">
                                    <th class="p-3">Data</th>
                                    <th class="p-3">Cód. Imóvel</th>
                                    <th class="p-3">Motivo</th>
                                    <th class="p-3">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${report.vistorias_improdutivas.map(v => `
                                    <tr class="border-b border-gray-800 hover:bg-gray-700/50 transition">
                                        <td class="p-3">${new Date(v.data_vistoria_original + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td class="p-3">${v.cod_imovel}</td>
                                        <td class="p-3 truncate max-w-xs" title="${v.motivo_improdutividade}">${v.motivo_improdutividade}</td>
                                        <td class="p-3">${formatCurrency(v.valor_cobranca)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>
            </div>
        </div>
    `;
}

function getNextMonthLabel(lastLabel) {
    if (!lastLabel) {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        const year = d.getFullYear().toString().slice(-2);
        return `${month.charAt(0).toUpperCase() + month.slice(1)}/${year}`;
    }
    
    const [monthStr, yearStr] = lastLabel.split('/');
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
    const year = parseInt(yearStr, 10) + 2000;
    
    const d = new Date(year, monthIndex);
    d.setMonth(d.getMonth() + 1);
    
    const nextMonth = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    const nextYear = d.getFullYear().toString().slice(-2);
    return `${nextMonth.charAt(0).toUpperCase() + nextMonth.slice(1)}/${nextYear}`;
}

async function downloadReport(format) {
    const mes = document.getElementById('report-month').value;
    const ano = document.getElementById('report-year').value;
    const token = getToken();
    const url = `${API_BASE_URL_IMOB}/relatorio-download?mes=${mes}&ano=${ano}&formato=${format}`;
    
    try {
        // Mostra feedback visual durante o download
        const btnId = `download-${format}-btn`;
        const originalText = document.getElementById(btnId).innerHTML;
        document.getElementById(btnId).innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Preparando...
        `;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Não foi possível baixar o relatório.' }));
            throw new Error(errorData.detail);
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `relatorio_${mes}_${ano}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch && filenameMatch.length > 1) {
                filename = filenameMatch[1];
            }
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();

    } catch (error) {
        // Mostra notificação de erro
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed bottom-4 right-4 bg-red-900/80 text-red-100 px-4 py-3 rounded-lg shadow-lg flex items-start max-w-xs';
        errorDiv.innerHTML = `
            <svg class="h-6 w-6 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
                <p class="font-bold">Erro ao baixar</p>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
        document.body.appendChild(errorDiv);
        
        // Remove a notificação após 5 segundos
        setTimeout(() => {
            errorDiv.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => errorDiv.remove(), 300);
        }, 5000);
        
    } finally {
        // Restaura o texto original do botão
        const btnId = `download-${format}-btn`;
        setTimeout(() => {
            if (document.getElementById(btnId)) {
                document.getElementById(btnId).innerHTML = originalText;
            }
        }, 1000);
    }
}