// frontend/assets/imobiliaria_modules/dashboard.js
import { api } from './api-imob.js';
import { openModal, showNotification } from './utils.js';

let calendar;
let chartInstance;

export const renderDashboard = async (container) => {
    const today = new Date();
    
    // UX UPDATE: Define o padrão como o mês anterior (fechamento mais recente provável)
    // Se hoje for Janeiro (mês 0), isso volta para Dezembro do ano anterior corretamente.
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const selectedMonth = lastMonthDate.getMonth() + 1;
    const selectedYear = lastMonthDate.getFullYear();
    
    // Ano atual real para gerar o range de opções (ex: 2024, 2025, 2026) independentemente da seleção
    const currentRealYear = today.getFullYear();
    // Estilos customizados para FullCalendar e Scrollbars injetados dinamicamente
    const customStyles = `
        <style>
            /* Custom Scrollbar */
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: rgba(31, 41, 55, 0.5); }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 3px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6B7280; }

            /* FullCalendar Overrides para Dark/Neon Theme */
            .fc { border: none !important; font-family: inherit; }
            .fc-theme-standard td, .fc-theme-standard th { border-color: rgba(75, 85, 99, 0.3) !important; }
            .fc-col-header-cell { background-color: rgba(31, 41, 55, 0.5); padding: 8px 0; }
            .fc-col-header-cell-cushion { color: #9CA3AF; text-transform: uppercase; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-decoration: none !important; }
            .fc-daygrid-day-number { color: #D1D5DB; font-size: 0.85rem; padding: 4px 8px !important; text-decoration: none !important; }
            .fc-day-today { background: rgba(16, 185, 129, 0.05) !important; }
            .fc-daygrid-day-events { margin-bottom: 2px; }
            .fc-toolbar-title { font-size: 1.1rem !important; font-weight: 700; color: white; }
            .fc-button { background: rgba(55, 65, 81, 0.5) !important; border: 1px solid rgba(75, 85, 99, 0.5) !important; color: #E5E7EB !important; font-size: 0.75rem !important; text-transform: uppercase; font-weight: 600; padding: 0.4rem 0.8rem !important; box-shadow: none !important; }
            .fc-button:hover { background: rgba(75, 85, 99, 0.8) !important; }
            .fc-button-active { background: rgba(6, 182, 212, 0.2) !important; border-color: rgba(6, 182, 212, 0.5) !important; color: #22D3EE !important; }
            .fc-daygrid-event { white-space: normal !important; align-items: start !important; }
            .fc-scroller::-webkit-scrollbar { width: 4px; height: 4px; }
            .fc-scroller::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 2px; }

            /* --- FIX DO POPOVER (+2 more) --- */
            .fc-popover {
                background-color: rgba(17, 24, 39, 0.98) !important; /* gray-900 quase sólido */
                border: 1px solid rgba(75, 85, 99, 0.5) !important; /* borda suave */
                border-radius: 0.75rem !important;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 8px 10px -6px rgba(0, 0, 0, 0.8) !important;
                backdrop-filter: blur(12px); /* Efeito vidro */
                z-index: 9999 !important;
            }
            .fc-popover-header {
                background-color: rgba(31, 41, 55, 0.8) !important; /* gray-800 header */
                color: #e5e7eb !important;
                padding: 0.75rem 1rem !important;
                border-bottom: 1px solid rgba(75, 85, 99, 0.3) !important;
                border-top-left-radius: 0.75rem !important;
                border-top-right-radius: 0.75rem !important;
            }
            .fc-popover-title {
                font-size: 0.9rem !important;
                font-weight: 700 !important;
                letter-spacing: 0.05em !important;
            }
            .fc-popover-body {
                padding: 0.5rem !important;
            }
            .fc-popover-close {
                opacity: 0.6;
                transition: opacity 0.2s;
            }
            .fc-popover-close:hover {
                opacity: 1;
                color: #22d3ee !important; /* cyan hover */
            }
        </style>
    `;

    container.innerHTML = `
        ${customStyles}
        <div class="fade-in space-y-8 max-w-[1600px] mx-auto">
            
            <!-- Header -->
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-gray-800 pb-4">
                <div>
                    <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-emerald-300">
                        Painel de Controle
                    </h1>
                    <p class="text-gray-400 text-sm mt-1">Visão geral de desempenho e agendamentos.</p>
                </div>
                <div class="text-right hidden md:block">
                    <p class="text-gray-500 text-xs uppercase font-bold tracking-wider">Data Atual</p>
                    <p class="text-white font-mono">${today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                </div>
            </div>

            <!-- KPI Cards -->
            <div id="stats-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${renderStatSkeleton().repeat(4)}
            </div>

            <!-- Main Grid: Charts & Agenda -->
            <!-- Aumentado para 850px para dar mais espaço à agenda -->
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 h-auto xl:h-[850px]">
                
                <!-- Coluna Esquerda: Gráfico + Agenda -->
                <div class="xl:col-span-2 flex flex-col gap-6 h-full">
                    
                    <!-- Gráfico -->
                    <div class="bg-gray-900/50 border border-gray-700/50 rounded-2xl p-6 shadow-lg backdrop-blur-sm h-[280px] flex flex-col relative overflow-hidden group">
                        <div class="flex justify-between items-center mb-2 relative z-10">
                            <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Evolução de Vistorias
                            </h3>
                        </div>
                        <div class="relative w-full flex-1">
                            <canvas id="dashboardChart"></canvas>
                        </div>
                        <div class="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                    </div>

                    <!-- Agenda / Calendário -->
                    <!-- Adicionado min-h-[500px] para mobile -->
                    <div class="bg-gray-900/50 border border-gray-700/50 rounded-2xl p-0 flex-1 shadow-lg backdrop-blur-sm flex flex-col overflow-hidden relative min-h-[500px] xl:min-h-0">
                        <div class="p-4 border-b border-gray-700/50 bg-gray-800/30 flex justify-between items-center">
                             <h3 class="text-lg font-bold text-white flex items-center gap-2">
                                <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                Agenda
                            </h3>
                            <div class="flex gap-3 text-xs">
                                <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> <span class="text-gray-400">Entrada</span></div>
                                <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span> <span class="text-gray-400">Saída</span></div>
                            </div>
                        </div>
                        
                        <div class="flex-1 p-4 overflow-hidden bg-gray-900/20">
                            <div id="calendar" class="h-full w-full"></div>
                        </div>
                    </div>
                </div>

                <!-- Coluna Direita: Fechamento Mensal -->
                <div class="bg-gray-900/80 border border-gray-700/50 rounded-2xl flex flex-col h-[600px] xl:h-full shadow-2xl overflow-hidden relative">
                    
                    <!-- Chat Header -->
                    <div class="p-4 border-b border-gray-700/50 bg-gray-800/80 backdrop-blur-md z-20">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-base font-bold text-white flex items-center gap-2">
                                <div class="p-1.5 bg-blue-500/10 rounded-lg">
                                    <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                                </div>
                                Fechamento
                            </h3>
                            <span id="chat-status-indicator" class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                                Carregando...
                            </span>
                        </div>
                        
                        <!-- Filtros -->
                        <div class="flex gap-2 bg-gray-900/50 p-1 rounded-lg border border-gray-700/30">
                            <select id="info-month" class="bg-transparent text-white text-xs w-full outline-none px-2 cursor-pointer hover:text-cyan-400 transition-colors">
                                ${Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${i+1 === selectedMonth ? 'selected' : ''}>${new Date(0, i).toLocaleString('pt-BR', {month: 'long'})}</option>`).join('')}
                            </select>
                            <div class="w-px bg-gray-700 my-1"></div>
                            <select id="info-year" class="bg-transparent text-white text-xs w-20 outline-none px-2 cursor-pointer hover:text-cyan-400 transition-colors">
                                ${generateYearOptions(currentRealYear, selectedYear)}
                            </select>
                            <button id="btn-load-info" class="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded-md transition-all shadow-lg shadow-blue-900/20">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Chat Area -->
                    <div id="info-content" class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-gradient-to-b from-gray-900 to-gray-800/90 relative scroll-smooth">
                        <div class="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
                            <div class="h-6 w-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
                            <span class="text-xs">Sincronizando...</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 1. Load Stats
    loadDashboardStats();

    // 2. Init Calendar
    initCalendar();

    // 3. Init Monthly Info
    document.getElementById('btn-load-info').addEventListener('click', loadInfoMensal);
    document.getElementById('info-month').addEventListener('change', loadInfoMensal);
    document.getElementById('info-year').addEventListener('change', loadInfoMensal);
    
    loadInfoMensal();
};

function generateYearOptions(centerYear, selectedYear) {
    let options = '';
    for (let y = centerYear - 1; y <= centerYear + 1; y++) {
        options += `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`;
    }
    return options;
}

function renderStatSkeleton() {
    return `
        <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-5 shadow-lg animate-pulse">
            <div class="flex justify-between items-start mb-2">
                <div class="h-3 w-20 bg-gray-800 rounded"></div>
                <div class="h-4 w-8 bg-gray-800 rounded"></div>
            </div>
            <div class="h-8 w-16 bg-gray-800 rounded mb-1"></div>
        </div>
    `;
}

async function loadDashboardStats() {
    try {
        const stats = await api.getDashboardStats();
        
        const now = new Date();
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const currentKey = `${monthNames[now.getMonth()]}/${now.getFullYear().toString().substr(-2)}`;
        const vistoriasTotalMes = stats.monthly_breakdown[currentKey] || stats.vistorias_mes_atual;

        const cardBase = "relative bg-gray-900/60 border border-gray-700/30 rounded-xl p-5 shadow-lg flex flex-col justify-between hover:border-gray-600 transition-all duration-300 group overflow-hidden backdrop-blur-sm";
        
        document.getElementById('stats-container').innerHTML = `
            <div class="${cardBase}">
                <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"></div>
                <div class="flex justify-between items-start relative z-10">
                    <div>
                        <p class="text-gray-400 text-[11px] uppercase font-bold tracking-wider">Vistorias (30d)</p>
                        <h4 class="text-3xl font-bold text-white mt-1 group-hover:scale-105 transition-transform origin-left">${stats.vistorias_30d.total}</h4>
                    </div>
                    <span class="text-xs font-bold ${stats.vistorias_30d.change >= 0 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'} px-2 py-1 rounded-lg flex items-center gap-1">
                        ${stats.vistorias_30d.change >= 0 ? '↑' : '↓'} ${Math.abs(stats.vistorias_30d.change)}%
                    </span>
                </div>
            </div>

            <div class="${cardBase}">
                <div class="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"></div>
                <div class="flex justify-between items-start relative z-10">
                    <div>
                        <p class="text-gray-400 text-[11px] uppercase font-bold tracking-wider">Improdutivas (30d)</p>
                        <h4 class="text-3xl font-bold text-white mt-1 group-hover:scale-105 transition-transform origin-left">${stats.improdutivas_30d.total}</h4>
                    </div>
                    <span class="text-xs font-bold ${stats.improdutivas_30d.change <= 0 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'} px-2 py-1 rounded-lg flex items-center gap-1">
                        ${stats.improdutivas_30d.change}%
                    </span>
                </div>
            </div>

            <div class="${cardBase}">
                <div class="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"></div>
                <div>
                    <p class="text-gray-400 text-[11px] uppercase font-bold tracking-wider">Projeção Próx. Mês</p>
                    <div class="flex items-end gap-2 mt-1">
                         <h4 class="text-3xl font-bold text-blue-400 group-hover:scale-105 transition-transform origin-left">~ ${stats.projecao_proximo_mes}</h4>
                         <span class="text-xs text-gray-500 mb-1.5">vistorias</span>
                    </div>
                </div>
            </div>

             <div class="${cardBase} border-l-4 border-l-emerald-500">
                <div>
                    <p class="text-emerald-400 text-[11px] uppercase font-bold tracking-wider">Volume Mês Atual</p>
                    <div class="flex justify-between items-end mt-1">
                        <div class="flex gap-2 items-baseline">
                            <h4 class="text-3xl font-bold text-white group-hover:scale-105 transition-transform origin-left">${vistoriasTotalMes}</h4>
                            <span class="text-[10px] text-gray-500 uppercase font-semibold">Total</span>
                        </div>
                         <svg class="w-6 h-6 text-emerald-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    </div>
                </div>
            </div>
        `;

        renderChart(stats.monthly_breakdown);

    } catch (e) {
        console.error(e);
        showNotification('Erro ao carregar estatísticas', 'error');
    }
}

function renderChart(data) {
    const ctx = document.getElementById('dashboardChart').getContext('2d');
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (chartInstance) chartInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, '#10b981'); 
    gradient.addColorStop(1, '#064e3b'); 

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Vistorias',
                data: values,
                backgroundColor: gradient,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 'flex',
                maxBarThickness: 40,
                hoverBackgroundColor: '#34d399'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(75, 85, 99, 0.2)', drawBorder: false },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 11 } }
                }
            }
        }
    });
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    // Configuração para visual moderno tipo Card no Mês
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        height: '100%',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
        },
        buttonText: {
            today: 'Hoje',
            dayGridMonth: 'Mês',
            listWeek: 'Lista'
        },
        dayMaxEvents: 2, // Limita eventos por dia para evitar scroll vertical na célula
        moreLinkText: 'mais',
        moreLinkClick: 'popover',
        
        eventContent: function(arg) {
            const props = arg.event.extendedProps;
            const isEntrada = props.tipo === 'ENTRADA';
            
            // Design de Card Compacto para a view Mensal
            if (arg.view.type === 'dayGridMonth') {
                const bgClass = isEntrada ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-blue-500/10 border-blue-500/50';
                const textClass = isEntrada ? 'text-emerald-300' : 'text-blue-300';
                const borderClass = isEntrada ? 'border-l-emerald-500' : 'border-l-blue-500';

                return { html: `
                    <div class="w-full mb-1 p-1 rounded-r-md border-l-[3px] ${borderClass} ${bgClass} overflow-hidden cursor-pointer hover:brightness-125 transition-all shadow-sm">
                        <div class="flex justify-between items-center text-[10px] leading-tight font-bold ${textClass} mb-0.5">
                            <span>${arg.timeText}</span>
                            <span class="opacity-80 tracking-tighter">${props.tipo.substring(0,3)}</span>
                        </div>
                        <div class="text-[10px] text-gray-300 truncate font-medium leading-tight">
                            ${props.imovel ? props.imovel.cod_imovel : 'S/C'}
                        </div>
                    </div>
                `};
            } else {
                // Design para Lista (List View)
                const dotColor = isEntrada ? 'bg-emerald-500' : 'bg-blue-500';
                return { html: `
                    <div class="flex items-center gap-3 w-full py-1">
                        <div class="w-2 h-2 rounded-full ${dotColor} shadow-[0_0_5px_currentColor]"></div>
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-bold text-gray-200">${arg.event.title}</span>
                            <span class="text-[10px] text-gray-500">${props.imovel ? props.imovel.endereco : 'Endereço n/d'}</span>
                        </div>
                    </div>
                `};
            }
        },
        events: async (info, successCallback, failureCallback) => {
            try {
                const data = await api.getAgenda(info.startStr.split('T')[0], info.endStr.split('T')[0]);
                const events = data.map(item => ({
                    id: item.id,
                    title: `${item.tipo} - ${item.imovel ? item.imovel.cod_imovel : '...' }`, 
                    start: `${item.data}T${item.horario}`,
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    textColor: 'transparent', // Hack para esconder texto padrão do FC
                    extendedProps: { ...item }
                }));
                successCallback(events);
            } catch (error) {
                console.error(error);
                failureCallback(error);
            }
        },
        eventClick: (info) => showEventDetails(info.event)
    });
    calendar.render();
}

function showEventDetails(event) {
    const props = event.extendedProps;
    const endereco = props.imovel ? props.imovel.endereco : 'Endereço não disponível';
    const isEntrada = props.tipo === 'ENTRADA';
    let mobilia = null;
    if(props.imovel.mobilia == "sem_mobilia"){
        mobilia = "Sem mobília"
    } else if(props.imovel.mobilia == "semi_mobiliado"){
        mobilia = "Semi Mobiliado"
    } else{
        mobilia = "Mobiliado"
    };

    // Format date from YYYY-MM-DD to DD/MM/YYYY
    const dataFormatada = props.data ? props.data.split('-').reverse().join('/') : '';
    
    openModal(`
        <div class="relative space-y-6">

    <!-- Badge Tipo -->
    <div class="absolute top-0 right-0">
        <span class="px-3 py-1 rounded-full text-[10px] font-bold tracking-wide
            ${isEntrada 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}">
            ${props.tipo}
        </span>
    </div>

    <!-- Data e Hora -->
    <div>
        <h3 class="text-2xl font-bold text-white flex items-baseline gap-2">
            <span>${dataFormatada}</span>
            <span class="text-base font-normal text-gray-500">às</span>
            <span>${props.horario}</span>
        </h3>

        <!-- Endereço -->
        <p class="mt-2 text-gray-400 text-sm flex items-start gap-2">
            <svg class="w-4 h-4 mt-0.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>${endereco}</span>
        </p>
    </div>

    <!-- Dados do Imóvel -->
    <div class="grid grid-cols-3 gap-3 text-sm">
        <div class="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
            <span class="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Código</span>
            <span class="text-gray-200 font-medium">${props.imovel.cod_imovel}</span>
        </div>

        <div class="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
            <span class="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Tamanho</span>
            <span class="text-gray-200 font-medium">${props.imovel.tamanho} m²</span>
        </div>

        <div class="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
            <span class="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Valor</span>
            <span class="text-gray-200 font-medium">R$ ${props.imovel.valor}</span>
        </div>
    </div>

    <!-- Vistoriador e Status -->
    <div class="grid grid-cols-2 gap-4 text-sm">
        <div class="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
            <span class="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-2">
                Vistoriador
            </span>
            <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
                    ${props.vistoriador ? props.vistoriador.nome.charAt(0) : '?'}
                </div>
                <span class="text-gray-200 font-medium truncate">
                    ${props.vistoriador ? props.vistoriador.nome : 'Não atribuído'}
                </span>
            </div>
        </div>

        <div class="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
            <span class="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-2">
                Status
            </span>
            <span class="flex items-center gap-2 font-medium text-gray-200">
                <span class="w-2 h-2 rounded-full ${props.disponivel ? 'bg-yellow-500' : 'bg-green-500'}"></span>
                ${props.disponivel ? 'Pendente' : 'Confirmado'}
            </span>
        </div>
    </div>

    <div class="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
            <span class="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Mobilia</span>
            <span class="text-gray-200 font-medium">${mobilia}</span>
    </div>
                

    <!-- Mural -->
    <div class="border-t border-gray-700/50 pt-5 space-y-3">
        <h4 class="text-xs uppercase tracking-wider font-bold text-gray-300 flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Mural de Recados
        </h4>

        <div id="comments-list-${event.id}"
            class="h-40 overflow-y-auto custom-scrollbar bg-gray-900/60 border border-gray-700/50 rounded-lg p-3 space-y-3">
            <div class="flex justify-center py-4">
                <div class="h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        </div>

        <div class="flex gap-2">
            <input
                id="new-comment-${event.id}"
                type="text"
                placeholder="Escreva um recado..."
                class="flex-1 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm
                       focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none
                       placeholder-gray-600 transition-all"
                onkeypress="if(event.key === 'Enter') window.postComment('${event.id}')"
            />
            <button
                onclick="window.postComment('${event.id}')"
                class="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium
                       px-4 py-2 rounded-lg transition-colors shadow-lg shadow-cyan-900/20">
                Enviar
            </button>
        </div>
    </div>

</div>

    `);
    loadComments(event.id);
}

window.postComment = async (id) => {
    const input = document.getElementById(`new-comment-${id}`);
    if(!input.value.trim()) return;
    try {
        await api.postComentarioQuery(id, input.value);
        input.value = '';
        loadComments(id);
    } catch(e) { showNotification('Erro ao comentar', 'error'); }
};

async function loadComments(id) {
    try {
        const comments = (await api.getComentarios(id)).comentarios || [];
        const list = document.getElementById(`comments-list-${id}`);
        
        if(comments.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                    <svg class="w-6 h-6 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    <p class="text-xs italic">Nenhum recado ainda.</p>
                </div>`;
            return;
        }

        list.innerHTML = comments.map(c => {
            const isImob = c.remetente === 'imobiliaria';
            return `
            <div class="flex flex-col ${isImob ? 'items-end' : 'items-start'}">
                <div class="flex items-baseline gap-2 mb-1">
                    <span class="text-[9px] font-bold ${isImob ? 'text-cyan-400' : 'text-emerald-400'} uppercase tracking-wide">${c.remetente}</span>
                    <span class="text-[9px] text-gray-600">${new Date(c.created_at).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="px-3 py-2 rounded-lg max-w-[90%] text-xs text-gray-200 border ${isImob ? 'bg-cyan-900/20 border-cyan-500/20 rounded-tr-none' : 'bg-emerald-900/20 border-emerald-500/20 rounded-tl-none'}">
                    ${c.conteudo}
                </div>
            </div>
        `}).join('');
        
        list.scrollTop = list.scrollHeight;
    } catch(e) { console.error(e); }
}

async function loadInfoMensal() {
    const m = document.getElementById('info-month').value;
    const y = document.getElementById('info-year').value;
    const content = document.getElementById('info-content');
    const statusIndicator = document.getElementById('chat-status-indicator');
    
    // Reset e Loading
    if (statusIndicator) {
        statusIndicator.className = "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse";
        statusIndicator.textContent = "Atualizando...";
    }
    
    try {
        const [info, relatorioData] = await Promise.all([
            api.getInfoMensal(m, y),
            api.getRelatorioDados(m, y).catch(err => {
                console.warn("Erro ao carregar totais financeiros:", err);
                return null;
            })
        ]);
        
        const messages = info.mensagens || [];
        const docs = info.documentos || [];
        
        // Obtém o total correto do endpoint de relatórios (resumo geral do grupo)
        let valorTotal = 0;
        if (relatorioData && relatorioData.resumo_geral) {
            valorTotal = relatorioData.resumo_geral.valor_total_grupo;
        } else if (info.total) {
             // Fallback para comportamento antigo se info.total existir
             valorTotal = info.total;
        }
        
        // Atualiza Status Header
        if (statusIndicator) {
            const isApproved = info.accepted;
            statusIndicator.className = `text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${isApproved ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`;
            statusIndicator.textContent = isApproved ? 'Fechado' : 'Em Aberto';
        }

        content.innerHTML = `
            <!-- Resumo Financeiro Card -->
            <div class="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total do Mês</p>
                    ${info.accepted 
                        ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">Aprovado</span>' 
                        : '<span class="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500/30">Pendente</span>'}
                </div>
                <p class="text-2xl font-bold text-white tracking-tight">R$ ${parseFloat(valorTotal || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
            </div>

            <!-- Seção de Documentos -->
            <div class="space-y-2">
                <p class="text-[10px] font-bold text-gray-500 uppercase px-1">Anexos</p>
                ${docs.length ? `
                    <div class="grid grid-cols-1 gap-2">
                        ${docs.map(d => `
                            <a href="${d.link}" target="_blank" class="flex items-center gap-3 bg-gray-800/40 p-2.5 rounded-lg hover:bg-gray-800 transition-all border border-gray-700/30 hover:border-gray-600 group">
                                <div class="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <span class="text-sm font-medium text-gray-300 group-hover:text-white truncate transition-colors">Relatório de Fechamento</span>
                                    <span class="text-[10px] text-gray-500 truncate">${d.file_path || 'Documento PDF'}</span>
                                </div>
                                <svg class="w-4 h-4 text-gray-600 group-hover:text-white ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                            </a>
                        `).join('')}
                    </div>
                ` : `
                    <div class="border border-dashed border-gray-700 rounded-lg p-3 text-center">
                        <p class="text-xs text-gray-500 italic">Nenhum documento disponível ainda.</p>
                    </div>
                `}
            </div>

            <!-- Área de Chat -->
            <div class="flex-1 flex flex-col min-h-[300px] border border-gray-700/50 rounded-xl overflow-hidden bg-gray-900/30">
                <div class="bg-gray-800/50 px-3 py-2 border-b border-gray-700/50 flex justify-between items-center">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Histórico de Conversa</span>
                    <span class="text-[10px] text-gray-600">${messages.length} mensagens</span>
                </div>
                
                <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    ${messages.length ? messages.map(msg => {
                        const isImob = msg.remetente === 'imobiliaria';
                        return `
                        <div class="flex flex-col ${isImob ? 'items-end' : 'items-start'} animate-fade-in-up">
                            <div class="flex items-end gap-2 max-w-[85%]">
                                ${!isImob ? '<div class="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">E</div>' : ''}
                                
                                <div class="px-3 py-2.5 rounded-2xl text-sm shadow-sm ${
                                    isImob 
                                    ? 'bg-blue-600 text-white rounded-br-none' 
                                    : 'bg-gray-700 text-gray-200 rounded-bl-none border border-gray-600'
                                }">
                                    ${msg.conteudo}
                                </div>
                            </div>
                            <span class="text-[9px] text-gray-500 mt-1 px-1">${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                    `}).join('') : `
                        <div class="flex flex-col items-center justify-center h-full text-gray-600 gap-2 opacity-50">
                            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                            <p class="text-xs">Inicie a conversa...</p>
                        </div>
                    `}
                </div>
                
                <div class="p-3 bg-gray-800/30 border-t border-gray-700/50">
                    <div class="flex gap-2">
                        <input id="chat-input" type="text" 
                            class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder-gray-600" 
                            placeholder="Digite sua mensagem..."
                            onkeypress="if(event.key === 'Enter') window.sendInfoChat('${info.id}')">
                        <button onclick="window.sendInfoChat('${info.id}')" class="bg-blue-600 px-3 rounded-lg text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                        </button>
                    </div>
                </div>
            </div>

            ${!info.accepted ? `
                <div class="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-gray-800/50">
                    <button onclick="window.rejectInfo('${info.id}')" class="py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold uppercase tracking-wide transition-all">
                        Contestar
                    </button>
                    <button onclick="window.acceptInfo('${info.id}')" class="py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wide shadow-lg shadow-emerald-900/20 transition-all hover:scale-[1.02]">
                        Aprovar Fechamento
                    </button>
                </div>
            ` : `
                <div class="mt-2 text-center">
                    <p class="text-xs text-emerald-500 font-medium flex items-center justify-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        Fechamento aprovado
                    </p>
                </div>
            `}
        `;
        
        const chatBox = document.getElementById('chat-messages');
        if(chatBox) chatBox.scrollTop = chatBox.scrollHeight;

    } catch (error) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
                <div class="bg-gray-800 p-4 rounded-full mb-3">
                    <svg class="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h4 class="text-gray-300 font-bold mb-1">Aguardando Fechamento</h4>
                <p class="text-xs text-gray-500">Os dados financeiros e documentos deste mês ainda não foram liberados pela Engentoria.</p>
            </div>`;
    }
}

window.sendInfoChat = async (id) => {
    const input = document.getElementById('chat-input');
    if(!input.value.trim()) return;
    try {
        await api.sendInfoMessage(id, input.value);
        loadInfoMensal();
    } catch(e) { showNotification('Erro ao enviar mensagem', 'error'); }
}

window.acceptInfo = (id) => {
    openModal(`
        <div class="text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-900/50 mb-4">
                <svg class="h-6 w-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 class="text-lg leading-6 font-medium text-white mb-2">Confirmar Aprovação</h3>
            <p class="text-sm text-gray-400 mb-6">
                Ao aprovar, você confirma que todos os valores e documentos apresentados neste fechamento estão corretos. Esta ação não pode ser desfeita.
            </p>
            <div class="flex justify-center gap-3">
                <button onclick="document.getElementById('generic-modal').classList.add('hidden')" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
                    Cancelar
                </button>
                <button onclick="window.finalizeAccept('${id}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-900/20 transition-all">
                    Sim, Aprovar
                </button>
            </div>
        </div>
    `);
};

window.rejectInfo = (id) => {
    openModal(`
        <div class="text-left">
            <h3 class="text-lg font-bold text-white mb-1">Contestar Fechamento</h3>
            <p class="text-xs text-gray-400 mb-4">Descreva o motivo da contestação para que a equipe possa analisar.</p>
            
            <textarea id="reject-reason" rows="4" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder-gray-600 mb-4" placeholder="Ex: Valor da vistoria X está incorreto..."></textarea>
            
            <div class="flex justify-end gap-3">
                <button onclick="document.getElementById('generic-modal').classList.add('hidden')" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
                    Cancelar
                </button>
                <button onclick="window.finalizeReject('${id}')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-red-900/20 transition-all">
                    Enviar Contestação
                </button>
            </div>
        </div>
    `);
    setTimeout(() => document.getElementById('reject-reason')?.focus(), 100);
};

window.finalizeAccept = async (id) => {
    document.getElementById('generic-modal').classList.add('hidden');
    showNotification('Processando aprovação...', 'info');
    
    try {
        await api.acceptInfoMensal(id, true);
        showNotification('Fechamento aprovado com sucesso!', 'success');
        loadInfoMensal();
    } catch(e) { 
        showNotification(e.message, 'error'); 
    }
};

window.finalizeReject = async (id) => {
    const reasonInput = document.getElementById('reject-reason');
    const reason = reasonInput.value.trim();
    
    if(!reason) {
        showNotification('Por favor, informe o motivo.', 'warning');
        reasonInput.focus();
        return;
    }

    document.getElementById('generic-modal').classList.add('hidden');
    showNotification('Enviando contestação...', 'info');

    try {
        await api.sendInfoMessage(id, `[CONTESTAÇÃO] ${reason}`);
        await api.acceptInfoMensal(id, false);
        showNotification('Contestação registrada. Verifique o chat.', 'info');
        loadInfoMensal();
    } catch(e) { showNotification(e.message, 'error'); }
};