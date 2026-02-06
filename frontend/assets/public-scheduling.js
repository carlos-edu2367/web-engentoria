// frontend/assets/public-scheduling.js

// Configuração
// Detecta ambiente (Dev/Prod)
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isLocal ? 'http://127.0.0.1:8000/api/v1/publico/agendamento' : '/api/v1/publico/agendamento';

// Estado da Aplicação
const state = {
    token: null,
    info: null,
    slots: {}, // { 'YYYY-MM-DD': [ {id, horario, vistoriador...} ] }
    selectedDate: null,
    selectedSlotId: null,
    slotData: null // Dados do slot selecionado para resumo
};

// --- Elementos do DOM ---
const views = {
    loading: document.getElementById('loading-state'),
    welcome: document.getElementById('step-welcome'),
    calendar: document.getElementById('step-calendar'),
    success: document.getElementById('step-success'),
    error: document.getElementById('step-error')
};

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Obter Token da URL (ex: ?token=XYZ ou caminho /agendar/XYZ)
    // Para facilitar testes estáticos, vamos pegar do Query Param '?token='
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');

    // Se estiver usando roteamento de path (ex: /agendar/TOKEN), pega do último segmento
    if (!token) {
        const pathSegments = window.location.pathname.split('/');
        if (pathSegments.length > 0) {
            // Tenta pegar o último segmento se parecer um UUID
            const lastSegment = pathSegments[pathSegments.length - 1];
            if (lastSegment.length > 20) token = lastSegment;
        }
    }

    if (!token) {
        showError('Token de agendamento não encontrado.');
        return;
    }

    state.token = token;
    init();
});

async function init() {
    showLoading(true);
    try {
        // Carrega Informações Iniciais
        await fetchInfo();
        
        // Renderiza tela de boas-vindas
        renderWelcome();
        
        // Pre-fetch dos slots em background
        fetchSlots(); 
        
        switchView('welcome');
    } catch (error) {
        console.error(error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// --- Funções de API ---

async function fetchInfo() {
    const res = await fetch(`${API_BASE_URL}/${state.token}/info`);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao carregar informações.');
    }
    state.info = await res.json();
}

async function fetchSlots() {
    const res = await fetch(`${API_BASE_URL}/${state.token}/slots`);
    if (!res.ok) {
        console.error("Erro ao buscar slots");
        return;
    }
    const data = await res.json();
    state.slots = data.slots_por_dia;
}

async function confirmAppointment() {
    if (!state.selectedSlotId) return;
    
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE_URL}/${state.token}/confirmar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agenda_id: state.selectedSlotId })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Este horário não está mais disponível.');
        }

        const result = await res.json();
        
        // Render Success
        // FIX: Adicionado 'T00:00:00' para evitar conversão de UTC para timezone local (o que voltava 1 dia)
        document.getElementById('success-date').textContent = new Date(result.data + 'T00:00:00').toLocaleDateString('pt-BR');
        document.getElementById('success-time').textContent = result.horario;
        switchView('success');
        
        // Verifica se lucide está disponível antes de chamar
        if(window.lucide) lucide.createIcons();

    } catch (error) {
        alert(error.message); // Alerta simples para erro de ação
    } finally {
        showLoading(false);
    }
}

// --- Renderização ---

function renderWelcome() {
    const info = state.info;
    document.getElementById('client-name').textContent = info.cliente_nome.split(' ')[0]; // Primeiro nome
    document.getElementById('imob-name').textContent = info.imobiliaria_nome;
    
    document.getElementById('imovel-cod').textContent = `COD: ${info.imovel_cod}`;
    document.getElementById('imovel-address').textContent = info.imovel_endereco;
    document.getElementById('imovel-size').textContent = `${info.imovel_tamanho} m²`;
    document.getElementById('imovel-furnished').textContent = formatMobiliado(info.imovel_mobiliado);
    document.getElementById('vistoria-type').textContent = info.tipo_vistoria;

    // Listeners
    document.getElementById('btn-start').onclick = () => {
        renderCalendarDates();
        switchView('calendar');
    };
}

function renderCalendarDates() {
    const container = document.getElementById('dates-container');
    container.innerHTML = '';

    const dates = Object.keys(state.slots).sort();

    if (dates.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500">Nenhuma data disponível no momento.</p>';
        return;
    }

    // Seleciona a primeira data por padrão
    if (!state.selectedDate) state.selectedDate = dates[0];

    dates.forEach(dateStr => {
        // Fix timezone issue: garante que a string YYYY-MM-DD seja tratada como meia-noite LOCAL
        const dateObj = new Date(dateStr + 'T00:00:00'); 
        
        // Formata Dia (ex: 12)
        const dayNum = dateObj.getDate();
        // Formata Dia Semana (ex: Seg)
        const weekDay = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        
        const btn = document.createElement('button');
        btn.className = `flex flex-col items-center justify-center min-w-[70px] p-3 rounded-2xl border transition-all snap-center
            ${state.selectedDate === dateStr 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-105' 
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:border-slate-600'}`;
        
        btn.innerHTML = `
            <span class="text-xs uppercase font-bold opacity-80">${weekDay}</span>
            <span class="text-xl font-bold">${dayNum}</span>
        `;

        btn.onclick = () => {
            state.selectedDate = dateStr;
            renderCalendarDates(); // Re-render para atualizar estilos
            renderSlots(dateStr);
        };

        container.appendChild(btn);
    });

    // Renderiza slots da data selecionada
    renderSlots(state.selectedDate);
}

function renderSlots(dateStr) {
    const grid = document.getElementById('slots-grid');
    const slots = state.slots[dateStr] || [];
    
    // Atualiza Label
    const dateObj = new Date(dateStr + 'T00:00:00');
    document.getElementById('selected-date-label').textContent = dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });

    // Limpa Grid (mantendo msg de vazio)
    Array.from(grid.children).forEach(child => {
        if (child.id !== 'no-slots-msg') child.remove();
    });

    const emptyMsg = document.getElementById('no-slots-msg');
    
    if (slots.length === 0) {
        emptyMsg.classList.remove('hidden');
    } else {
        emptyMsg.classList.add('hidden');
        slots.forEach(slot => {
            const btn = document.createElement('button');
            btn.className = `py-3 rounded-xl border font-medium text-sm transition-all
                ${state.selectedSlotId === slot.agenda_id 
                    ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-500'}`;
            
            btn.textContent = slot.horario;
            
            btn.onclick = () => selectSlot(slot, dateStr);
            grid.appendChild(btn);
        });
    }
}

function selectSlot(slot, dateStr) {
    state.selectedSlotId = slot.agenda_id;
    state.slotData = { ...slot, dateStr };
    
    // Atualiza visual dos slots
    renderSlots(dateStr);

    // Mostra resumo e habilita botão
    const summary = document.getElementById('selection-summary');
    const summaryText = document.getElementById('summary-text');
    const btnConfirm = document.getElementById('btn-confirm');

    const dateObj = new Date(dateStr + 'T00:00:00');
    const dateFormatted = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    summaryText.textContent = `${dateFormatted} às ${slot.horario}`;
    summary.classList.remove('hidden');
    
    btnConfirm.disabled = false;
    btnConfirm.classList.remove('bg-slate-700', 'text-slate-400', 'cursor-not-allowed');
    btnConfirm.classList.add('bg-emerald-600', 'text-white', 'hover:bg-emerald-500', 'shadow-lg', 'shadow-emerald-900/20');
}

// --- Helpers de UI ---

function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    
    if(viewName === 'calendar') {
        // Re-inicializa icons caso precise
        if(window.lucide) lucide.createIcons();
        // Listener do botão de voltar
        document.getElementById('btn-back').onclick = () => switchView('welcome');
        // Listener confirmar
        document.getElementById('btn-confirm').onclick = confirmAppointment;
    }
}

function showLoading(show) {
    if (show) views.loading.classList.remove('hidden');
    else views.loading.classList.add('hidden');
}

function showError(msg) {
    document.getElementById('error-msg').textContent = msg;
    switchView('error');
}

function formatMobiliado(val) {
    const map = {
        'sem_mobilia': 'Sem Mobília',
        'semi_mobiliado': 'Semi Mobiliado',
        'mobiliado': 'Mobiliado'
    };
    return map[val] || val;
}