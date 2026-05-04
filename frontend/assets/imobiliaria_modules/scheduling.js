import { api } from './api-imob.js';
import { SolicitacoesService } from './solicitacoesService.js';
import { openModal, closeModal, showNotification } from './utils.js';

export const renderSchedulingPage = async (container) => {
    
    // =========================================================================
    // 1. UTILITÁRIOS E HELPERS DE DOM
    // =========================================================================
    
    const $ = (selector) => container.querySelector(selector);
    const $$ = (selector) => container.querySelectorAll(selector);

    // =========================================================================
    // 2. CAMADA DE API E SERVIÇOS
    // =========================================================================
    const getToken = () => window.getToken ? window.getToken() : localStorage.getItem('engentoria_vist_token');
    const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    const EXT_SCHEDULING_URL = `${isLocal ? 'http://127.0.0.1:8000/api/v1' : '/api/v1'}/agendamento-externo`;

    const extractList = (res) => Array.isArray(res) ? res : (res?.items || res?.data || res?.clientes || res?.imoveis || []);

    const safeGetClientes = async () => {
        const res = await fetch(`${EXT_SCHEDULING_URL}/clientes`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) throw new Error('Falha ao buscar clientes.');
        return res.json();
    };

    const safeGetImoveis = async () => {
        const res = await fetch(`${EXT_SCHEDULING_URL}/imoveis`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) throw new Error('Falha ao buscar imóveis.');
        return res.json();
    };

    const safeCreateCliente = async (payload) => {
        const token = getToken();
        let res = await fetch(`${EXT_SCHEDULING_URL}/cliente`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (res.status === 404 || res.status === 405) {
            res = await fetch(`${EXT_SCHEDULING_URL}/clientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
        }
        
        if (!res.ok) { 
            const err = await res.json().catch(() => ({})); 
            const detailMsg = Array.isArray(err.detail) ? err.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ') : (err.detail || 'Falha ao criar cliente.');
            throw new Error(detailMsg); 
        }
        return res.json();
    };

    const safeCreateImovel = async (payload) => {
        const token = getToken();
        let res = await fetch(`${EXT_SCHEDULING_URL}/imovel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (res.status === 404 || res.status === 405) {
            res = await fetch(`${EXT_SCHEDULING_URL}/imoveis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) { 
            const err = await res.json().catch(() => ({})); 
            const detailMsg = Array.isArray(err.detail) ? err.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ') : (err.detail || 'Falha ao criar imóvel.');
            throw new Error(detailMsg); 
        }
        return res.json();
    };

    // =========================================================================
    // 3. GERENCIAMENTO DE ESTADO CENTRALIZADO
    // =========================================================================
    const state = {
        currentTab: 'agendamento',
        clientes: [],
        imoveis: [],
        imobiliarias: [],
        clientesPage: 1,
        clientesSearch: '',
        imoveisPage: 1,
        imoveisSearch: '',
        itemsPerPage: 6,
        
        wizard: {
            step: 1,
            clienteId: null,
            clienteObj: null,
            imovelId: null,
            imovelObj: null
        },

        // Estado do Histórico de Solicitações (Infinite Scroll)
        history: {
            items: [],
            page: 1,
            pageSize: 10,
            totalPages: 1,
            isLoading: false,
            hasMore: true
        }
    };

    const getImobiliariaIdFromState = () => {
        if (state.imobiliarias?.length > 0) return state.imobiliarias[0].id;
        if (state.imoveis?.length > 0 && state.imoveis[0].imobiliaria) return state.imoveis[0].imobiliaria.id; 
        return undefined; 
    };

    // Helpers de formatação
    const formatStatus = (status) => {
        const maps = {
            'PENDENTE_CLIENTE': { label: 'Aguard. Cliente', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
            'PENDENTE_ADMIN': { label: 'Aguard. Aprovação', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
            'AGENDADO': { label: 'Agendado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            'CANCELADO': { label: 'Cancelado', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
            'EXPIRADO': { label: 'Expirado', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' }
        };
        return maps[status] || { label: status, color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' };
    };

    const formatDate = (dateString) => {
        if(!dateString) return '--';
        return new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // =========================================================================
    // 4. CAMADA DE VIEW (TEMPLATES HTML)
    // =========================================================================
    const renderBaseLayout = () => {
        container.innerHTML = `
            <style>
                .glass-card { background: rgba(30, 27, 75, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(168, 85, 247, 0.15); box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5); }
                .glass-hover:hover { background: rgba(49, 46, 129, 0.6); border-color: rgba(168, 85, 247, 0.4); transform: translateY(-3px); box-shadow: 0 10px 40px -10px rgba(168, 85, 247, 0.2); cursor: pointer; }
                .input-glass { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(71, 85, 105, 0.5); color: white; }
                .input-glass:focus { border-color: #a855f7; box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2); outline: none; }
                .anim-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .anim-fade-in { animation: fadeIn 0.3s ease-out forwards; }
                @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.3); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(168, 85, 247, 0.6); }
                .step-active { border-color: #a855f7; background: rgba(168, 85, 247, 0.2); color: #fff; }
                .step-completed { border-color: #3b82f6; background: #3b82f6; color: #fff; }
                .step-inactive { border-color: rgba(71, 85, 105, 0.5); background: transparent; color: #64748b; }
                .line-active { background: linear-gradient(90deg, #3b82f6, #a855f7); }
                .line-inactive { background: rgba(71, 85, 105, 0.5); }
                .skeleton { background: linear-gradient(90deg, rgba(30, 41, 59, 0.5) 25%, rgba(51, 65, 85, 0.5) 50%, rgba(30, 41, 59, 0.5) 75%); background-size: 200% 100%; animation: loading 1.5s infinite; }
                @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            </style>
            
            <div class="anim-fade-in max-w-6xl mx-auto space-y-8 pb-20" id="scheduling-app">
                <!-- Header -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative">
                    <div class="absolute -top-20 -left-20 w-64 h-64 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none"></div>
                    <div class="absolute -bottom-20 -right-20 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"></div>
                    <div class="relative z-10">
                        <h1 class="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400 drop-shadow-sm">Hub de Gestão e Vistorias</h1>
                        <p class="text-slate-400 mt-2 text-sm max-w-lg">Centralize suas solicitações e portfólio de forma guiada e intuitiva.</p>
                    </div>
                </div>

                <!-- Tabs Navigation -->
                <div class="relative z-10 flex flex-wrap items-center gap-2 p-1.5 glass-card rounded-2xl w-fit">
                    <button data-tab="agendamento" class="tab-btn active px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg> Nova Solicitação</button>
                    <button data-tab="historico" class="tab-btn px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 text-slate-400 hover:text-white hover:bg-slate-800/50 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg> Histórico</button>
                    <div class="w-px h-6 bg-slate-700/50 mx-1"></div>
                    <button data-tab="clientes" class="tab-btn px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 text-slate-400 hover:text-white hover:bg-slate-800/50 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> Clientes</button>
                    <button data-tab="imoveis" class="tab-btn px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 text-slate-400 hover:text-white hover:bg-slate-800/50 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg> Imóveis</button>
                </div>

                <!-- Loader -->
                <div id="loading-overlay" class="py-20 flex flex-col items-center justify-center space-y-4 anim-fade-in relative z-10">
                    <div class="h-10 w-10 border-4 border-slate-700 border-t-purple-500 rounded-full animate-spin"></div>
                    <p class="text-slate-400 font-medium tracking-widest text-xs uppercase">Sincronizando Base de Dados...</p>
                </div>

                <!-- Tab Containers -->
                <div id="tabs-container" class="hidden relative z-10">
                    <div id="tab-agendamento" class="tab-content anim-slide-up">${getWizardTemplate()}</div>
                    <div id="tab-historico" class="tab-content hidden space-y-4">${getHistoricoTemplate()}</div>
                    <div id="tab-clientes" class="tab-content hidden space-y-4">${getClientesTemplate()}</div>
                    <div id="tab-imoveis" class="tab-content hidden space-y-4">${getImoveisTemplate()}</div>
                </div>
            </div>
        `;
    };

    const getWizardTemplate = () => `
        <div class="glass-card rounded-2xl p-6 lg:p-10 relative">
            <!-- Stepper -->
            <div class="flex items-center justify-between mb-10 max-w-2xl mx-auto relative">
                <div class="flex flex-col items-center relative z-10 w-24"><div id="step-circle-1" class="w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg transition-all duration-500 step-active">1</div><span class="text-xs font-medium mt-3 text-purple-300" id="step-label-1">Cliente</span></div>
                <div id="step-line-1" class="flex-1 h-1 rounded-full transition-all duration-500 line-inactive -mx-4"></div>
                <div class="flex flex-col items-center relative z-10 w-24"><div id="step-circle-2" class="w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg transition-all duration-500 step-inactive">2</div><span class="text-xs font-medium mt-3 text-slate-500" id="step-label-2">Imóvel</span></div>
                <div id="step-line-2" class="flex-1 h-1 rounded-full transition-all duration-500 line-inactive -mx-4"></div>
                <div class="flex flex-col items-center relative z-10 w-24"><div id="step-circle-3" class="w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg transition-all duration-500 step-inactive">3</div><span class="text-xs font-medium mt-3 text-slate-500" id="step-label-3">Vistoria</span></div>
            </div>

            <form id="solicitacao-form" class="max-w-3xl mx-auto">
                <!-- STEP 1: CLIENTE -->
                <div id="wiz-content-1" class="anim-fade-in">
                    <h3 class="text-2xl font-bold text-white mb-2">Quem é o Cliente / Inquilino?</h3>
                    <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 mt-6">
                        <div class="flex gap-4 mb-6 border-b border-slate-700/50 pb-4">
                            <button type="button" data-action="toggle-mode" data-step="1" data-mode="select" class="wiz-mode-btn wiz-mode-active-purple pb-1">Selecionar Existente</button>
                            <button type="button" data-action="toggle-mode" data-step="1" data-mode="create" class="wiz-mode-btn text-slate-500 hover:text-slate-300 font-semibold pb-1">Cadastrar Novo</button>
                        </div>
                        <div id="wiz-mode-1-select" class="space-y-4">
                            <div class="relative">
                                <input type="hidden" id="wiz_cliente_id">
                                <input type="text" id="search_cliente_input" class="w-full input-glass rounded-xl pl-12 pr-4 py-3.5" placeholder="Digite nome, e-mail ou telefone..." autocomplete="off">
                                <div id="dropdown_cliente" class="hidden absolute z-[100] w-full mt-1 bg-slate-800 border border-slate-600 rounded-xl max-h-60 overflow-y-auto custom-scrollbar shadow-lg"></div>
                            </div>
                            <div class="flex justify-end pt-4"><button type="button" id="btn-next-1" disabled data-action="wiz-next" data-target="2" class="bg-purple-600 text-white font-bold py-3 px-8 rounded-xl opacity-50 cursor-not-allowed transition-all">Continuar &rarr;</button></div>
                        </div>
                        <div id="wiz-mode-1-create" class="hidden space-y-4">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label class="block text-xs text-slate-400 mb-1">Nome Completo *</label><input type="text" id="wiz_add_cli_nome" class="w-full input-glass rounded-xl px-4 py-3"></div>
                                <div><label class="block text-xs text-slate-400 mb-1">E-mail *</label><input type="email" id="wiz_add_cli_email" class="w-full input-glass rounded-xl px-4 py-3"></div>
                                <div><label class="block text-xs text-slate-400 mb-1">Telefone</label><input type="text" id="wiz_add_cli_tel1" class="w-full input-glass rounded-xl px-4 py-3"></div>
                            </div>
                            <div class="flex justify-end pt-4"><button type="button" id="btn-save-next-1" data-action="wiz-create-cli" class="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 px-8 rounded-xl">Salvar e Continuar &rarr;</button></div>
                        </div>
                    </div>
                </div>

                <!-- STEP 2: IMOVEL -->
                <div id="wiz-content-2" class="hidden anim-fade-in">
                    <div class="bg-purple-900/30 border border-purple-500/30 rounded-xl p-4 mb-6 flex justify-between items-center"><span class="text-sm font-bold text-white" id="summary-cliente-nome"></span><button type="button" data-action="wiz-goto" data-target="1" class="text-xs text-purple-400">Alterar</button></div>
                    <h3 class="text-2xl font-bold text-white mb-2">Qual é o Imóvel?</h3>
                    <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 mt-6">
                        <div class="flex gap-4 mb-6 border-b border-slate-700/50 pb-4">
                            <button type="button" data-action="toggle-mode" data-step="2" data-mode="select" class="wiz-mode-btn wiz-mode-active-blue pb-1">Selecionar Existente</button>
                            <button type="button" data-action="toggle-mode" data-step="2" data-mode="create" class="wiz-mode-btn text-slate-500 hover:text-slate-300 font-semibold pb-1">Cadastrar Novo</button>
                        </div>
                        <div id="wiz-mode-2-select" class="space-y-4">
                            <div class="relative">
                                <input type="hidden" id="wiz_imovel_id">
                                <input type="text" id="search_imovel_input" class="w-full input-glass rounded-xl pl-12 pr-4 py-3.5" placeholder="Pesquise por código ou endereço..." autocomplete="off">
                                <div id="dropdown_imovel" class="hidden absolute z-[100] w-full mt-1 bg-slate-800 border border-slate-600 rounded-xl max-h-60 overflow-y-auto custom-scrollbar shadow-lg"></div>
                            </div>
                            <div class="flex justify-between pt-4">
                                <button type="button" data-action="wiz-goto" data-target="1" class="text-slate-400">&larr; Voltar</button>
                                <button type="button" id="btn-next-2" disabled data-action="wiz-next" data-target="3" class="bg-blue-600 text-white font-bold py-3 px-8 rounded-xl opacity-50 cursor-not-allowed">Continuar &rarr;</button>
                            </div>
                        </div>
                        <div id="wiz-mode-2-create" class="hidden space-y-4">
                            <div id="wiz_imob_container" class="hidden mb-4 bg-purple-900/10 border border-purple-500/30 p-4 rounded-xl">
                                <label class="block text-xs text-purple-300 mb-1">Filial da Imobiliária *</label><select id="wiz_add_im_imob" class="w-full input-glass rounded-xl px-4 py-3"></select>
                            </div>
                            <input type="hidden" id="wiz_add_im_imob_hidden">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label class="block text-xs text-slate-400 mb-1">Ref/Código *</label><input type="text" id="wiz_add_im_cod" class="w-full input-glass rounded-xl px-4 py-3"></div>
                                <div><label class="block text-xs text-slate-400 mb-1">Tamanho (m²) *</label><input type="number" id="wiz_add_im_tam" step="0.01" class="w-full input-glass rounded-xl px-4 py-3"></div>
                                <div><label class="block text-xs text-slate-400 mb-1">Endereço Completo *</label><input type="text" id="wiz_add_im_end" class="w-full input-glass rounded-xl px-4 py-3"></div>
                                <div><label class="block text-xs text-slate-400 mb-1">Mobília *</label>
                                    <select id="wiz_add_im_mob" class="w-full input-glass rounded-xl px-4 py-3"><option value="sem_mobilia">Sem Mobília</option><option value="semi_mobiliado">Semi-Mobiliado</option><option value="mobiliado">Mobiliado</option></select>
                                </div>
                            </div>
                            <div class="flex justify-between pt-4">
                                <button type="button" data-action="toggle-mode" data-step="2" data-mode="select" class="text-slate-400">Cancelar</button>
                                <button type="button" id="btn-save-next-2" data-action="wiz-create-imo" class="bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-bold py-3 px-8 rounded-xl">Salvar e Continuar &rarr;</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- STEP 3: FINAL -->
                <div id="wiz-content-3" class="hidden anim-fade-in relative">
                    <div class="absolute inset-0 pointer-events-none">
                        <div class="absolute -top-20 -left-20 w-72 h-72 bg-emerald-500/20 blur-[120px] rounded-full"></div>
                        <div class="absolute -bottom-24 -right-24 w-80 h-80 bg-cyan-500/20 blur-[140px] rounded-full"></div>
                    </div>
                    <div class="relative bg-gradient-to-br from-emerald-900/30 via-slate-900/40 to-emerald-900/20 border border-emerald-400/30 rounded-2xl p-5 mb-6 shadow-[0_0_30px_rgba(16,185,129,0.15)_inset] backdrop-blur-xl text-sm">
                        <div class="flex items-center justify-between mb-2">
                            <div class="text-white"><span class="text-emerald-400 text-xs mr-2 tracking-wider">Cliente:</span><span id="summary-final-cliente" class="font-medium"></span></div>
                        </div>
                        <div class="flex justify-between items-center text-white">
                            <div><span class="text-emerald-400 text-xs mr-2 tracking-wider">Imóvel:</span><span id="summary-final-imovel" class="font-medium"></span></div>
                            <button type="button" data-action="wiz-goto" data-target="2" class="text-xs text-emerald-400 hover:text-emerald-300 transition-all duration-300 hover:drop-shadow-[0_0_6px_rgba(16,185,129,0.7)]">Alterar</button>
                        </div>
                    </div>
                    <div class="relative bg-gradient-to-br from-slate-900/70 via-slate-900/60 to-slate-950/80 border border-slate-700/50 rounded-2xl p-6 space-y-6 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.6),inset_0_0_25px_rgba(16,185,129,0.08)]">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm text-slate-300 mb-2">Natureza da Vistoria *</label>
                                <select id="form_tipo_vistoria" required class="w-full input-glass rounded-xl px-4 py-3.5 bg-slate-900/60 border border-slate-600/50 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 transition-all duration-300">
                                    <option value="ENTRADA">Vistoria de Entrada</option>
                                    <option value="SAIDA">Vistoria de Saída</option>
                                    <option value="CONFERENCIA">Conferência / Revisão</option>
                                    <option value="AVERIGUACAO">Averiguação de Sinistro</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm text-slate-300 mb-2">Anexos <span class="text-emerald-400 text-xs">(Opcional, documento/vistoria inicial)</span></label>
                                <input type="file" id="form_arquivos" multiple accept=".pdf,.zip,.rar,.docx,image/*" class="w-full input-glass rounded-xl px-4 py-2.5 bg-slate-900/60 border border-slate-600/50 file:bg-emerald-600/20 file:text-emerald-300 file:border file:border-emerald-400/30 file:rounded-lg file:px-3 file:py-1 hover:border-emerald-400/50 transition-all duration-300" />
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm text-slate-300 mb-2">Observações para a Logística</label>
                            <textarea id="form_observacao" rows="3" class="w-full input-glass rounded-xl px-4 py-3 bg-slate-900/60 border border-slate-600/50 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300" placeholder="Ex: Chaves na portaria..."></textarea>
                        </div>
                    </div>
                    <div class="flex justify-between items-center mt-8 pt-6 border-t border-slate-700/50">
                        <button type="button" data-action="wiz-goto" data-target="2" class="text-slate-400 hover:text-white transition-all duration-300">&larr; Voltar</button>
                        <button type="submit" id="btn-submit-solicitacao" class="relative group overflow-hidden bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold py-3.5 px-8 rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all duration-300">
                            <span class="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.45),transparent_70%)]"></span>
                            <span class="relative">Enviar Solicitação →</span>
                        </button>
                    </div>
                </div>
            </form>
        </div>`;

    // NOVO TEMPLATE: HISTÓRICO DE SOLICITAÇÕES
    const getHistoricoTemplate = () => `
        <div class="glass-card p-6 rounded-2xl flex flex-col h-[70vh] min-h-[500px]">
            <div class="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-4">
                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                    <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Histórico de Solicitações
                </h2>
                <div class="text-xs text-slate-400" id="historico-counter">-- registros encontrados</div>
            </div>
            
            <!-- Contêiner de Infinite Scroll -->
            <div id="historico-scroll-container" class="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                <div id="historico-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Cards de histórico aqui -->
                </div>
                
                <!-- Indicador de Loading -->
                <div id="historico-loading" class="hidden py-6 flex justify-center items-center">
                    <div class="h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            </div>
        </div>
    `;

    const getClientesTemplate = () => `
        <div class="flex justify-between items-center gap-4 glass-card p-4 rounded-2xl">
            <input type="text" id="search-clientes" placeholder="Buscar por nome, email ou telefone..." class="w-full md:w-96 input-glass rounded-xl py-2.5 px-4">
            <button data-action="open-modal-cliente" class="bg-slate-800 text-white font-semibold py-2.5 px-6 rounded-xl border border-slate-700 hover:border-purple-500 whitespace-nowrap">Novo Cliente</button>
        </div>
        <div id="clientes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 min-h-[300px]"></div>
        <div id="pagination-clientes" class="flex justify-center items-center gap-4 pt-4"></div>`;

    const getImoveisTemplate = () => `
        <div class="flex justify-between items-center gap-4 glass-card p-4 rounded-2xl">
            <input type="text" id="search-imoveis" placeholder="Buscar por código ou endereço..." class="w-full md:w-96 input-glass rounded-xl py-2.5 px-4">
            <button data-action="open-modal-imovel" class="bg-slate-800 text-white font-semibold py-2.5 px-6 rounded-xl border border-slate-700 hover:border-blue-500 whitespace-nowrap">Novo Imóvel</button>
        </div>
        <div id="imoveis-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 min-h-[300px]"></div>
        <div id="pagination-imoveis" class="flex justify-center items-center gap-4 pt-4"></div>`;

    // =========================================================================
    // 5. CONTROLADORES E LÓGICA DE RENDERIZAÇÃO DINÂMICA
    // =========================================================================
    
    const switchTab = (tabId) => {
        state.currentTab = tabId;
        $$('.tab-content').forEach(el => el.classList.add('hidden', 'anim-slide-up'));
        $$('.tab-btn').forEach(btn => {
            btn.classList.remove('bg-gradient-to-r', 'from-purple-600', 'to-blue-600', 'text-white');
            btn.classList.add('text-slate-400');
        });
        
        $(`#tab-${tabId}`).classList.remove('hidden');
        const activeBtn = $(`[data-tab="${tabId}"]`);
        activeBtn.classList.remove('text-slate-400');
        activeBtn.classList.add('bg-gradient-to-r', 'from-purple-600', 'to-blue-600', 'text-white');

        // Se mudou para histórico, inicializa ou continua
        if (tabId === 'historico' && state.history.items.length === 0) {
            loadHistoryPage();
        }
    };

    const updateWizardUI = () => {
        const step = state.wizard.step;
        [1,2,3].forEach(i => $(`#wiz-content-${i}`).classList.add('hidden'));
        $(`#wiz-content-${step}`).classList.remove('hidden');

        [1,2,3].forEach(i => {
            const circle = $(`#step-circle-${i}`);
            const label = $(`#step-label-${i}`);
            const line = i < 3 ? $(`#step-line-${i}`) : null;

            if (i < step) { 
                circle.className = "w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg step-completed";
                circle.innerHTML = '✓';
                label.className = "text-xs font-bold mt-3 text-blue-400";
                if(line) line.className = "flex-1 h-1 rounded-full line-active -mx-4";
            } else if (i === step) {
                circle.className = "w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg step-active";
                circle.innerHTML = i;
                label.className = "text-xs font-bold mt-3 text-white";
                if(line) line.className = "flex-1 h-1 rounded-full line-inactive -mx-4";
            } else {
                circle.className = "w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg step-inactive";
                circle.innerHTML = i;
                label.className = "text-xs font-medium mt-3 text-slate-500";
                if(line) line.className = "flex-1 h-1 rounded-full line-inactive -mx-4";
            }
        });

        if (step === 2) {
            $('#summary-cliente-nome').textContent = state.wizard.clienteObj?.nome || '';
            setupSearchableDropdowns(); 
            if(state.wizard.imovelObj && state.wizard.imovelObj.cliente_id !== state.wizard.clienteId){
                state.wizard.imovelId = null; state.wizard.imovelObj = null;
                $('#wiz_imovel_id').value = ''; $('#search_imovel_input').value = '';
                $('#btn-next-2').disabled = true; $('#btn-next-2').classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
        if (step === 3) {
            $('#summary-final-cliente').textContent = state.wizard.clienteObj?.nome || '';
            $('#summary-final-imovel').textContent = `${state.wizard.imovelObj?.cod_imovel} - ${(state.wizard.imovelObj?.endereco||'').split(',')[0]}`;
        }
    };

    const toggleWizardMode = (step, mode) => {
        const isSel = mode === 'select';
        $(`#wiz-mode-${step}-select`).classList.toggle('hidden', !isSel);
        $(`#wiz-mode-${step}-create`).classList.toggle('hidden', isSel);
        
        const btnSel = $(`[data-action="toggle-mode"][data-step="${step}"][data-mode="select"]`);
        const btnCre = $(`[data-action="toggle-mode"][data-step="${step}"][data-mode="create"]`);
        const activeColor = step === 1 ? 'purple' : 'blue';

        btnSel.className = isSel ? `wiz-mode-btn text-${activeColor}-400 font-semibold border-b-2 border-${activeColor}-500 pb-1` : `wiz-mode-btn text-slate-500 pb-1`;
        btnCre.className = !isSel ? `wiz-mode-btn text-${activeColor}-400 font-semibold border-b-2 border-${activeColor}-500 pb-1` : `wiz-mode-btn text-slate-500 pb-1`;
    };

    // --- GRIDS DE CLIENTES E IMOVEIS ---
    const renderPagination = (total, page, containerId, callback) => {
        const totalPages = Math.ceil(total / state.itemsPerPage);
        const c = $(`#${containerId}`);
        if (totalPages <= 1) return c.innerHTML = '';
        
        c.innerHTML = `
            <button class="page-prev p-2 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-50" ${page===1?'disabled':''}>&larr;</button>
            <span class="text-sm px-4 py-2 text-slate-400">${page}/${totalPages}</span>
            <button class="page-next p-2 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-50" ${page===totalPages?'disabled':''}>&rarr;</button>
        `;
        c.querySelector('.page-prev')?.addEventListener('click', () => callback(page-1));
        c.querySelector('.page-next')?.addEventListener('click', () => callback(page+1));
    };

    const renderClientesGrid = () => {
        let list = state.clientes;
        if(state.clientesSearch) list = list.filter(c => (c.nome||'').toLowerCase().includes(state.clientesSearch) || (c.email||'').toLowerCase().includes(state.clientesSearch));
        
        const p = list.slice((state.clientesPage-1)*state.itemsPerPage, state.clientesPage*state.itemsPerPage);
        const grid = $('#clientes-grid');
        
        if(!p.length) return grid.innerHTML = `<div class="col-span-full py-10 text-center text-slate-500 glass-card rounded-xl">Nenhum encontrado.</div>`;
        grid.innerHTML = p.map((c,i) => `
            <div class="glass-card glass-hover rounded-2xl p-5 anim-slide-up" style="animation-delay:${i*40}ms">
                <div class="w-10 h-10 rounded-full bg-purple-900 border border-purple-500 flex items-center justify-center text-white font-bold mb-3">${(c.nome||'C').charAt(0).toUpperCase()}</div>
                <h4 class="font-bold text-white truncate">${c.nome}</h4><p class="text-sm text-slate-400">${c.email||'--'}</p>
            </div>`).join('');
            
        renderPagination(list.length, state.clientesPage, 'pagination-clientes', p => { state.clientesPage=p; renderClientesGrid(); });
    };

    const renderImoveisGrid = () => {
        let list = state.imoveis;
        if(state.imoveisSearch) list = list.filter(i => (i.cod_imovel||'').toLowerCase().includes(state.imoveisSearch) || (i.endereco||'').toLowerCase().includes(state.imoveisSearch));
        
        const p = list.slice((state.imoveisPage-1)*state.itemsPerPage, state.imoveisPage*state.itemsPerPage);
        const grid = $('#imoveis-grid');
        
        if(!p.length) return grid.innerHTML = `<div class="col-span-full py-10 text-center text-slate-500 glass-card rounded-xl">Nenhum encontrado.</div>`;
        grid.innerHTML = p.map((im,i) => `
            <div class="glass-card glass-hover rounded-2xl p-5 anim-slide-up" style="animation-delay:${i*40}ms">
                <span class="bg-blue-900/30 text-blue-300 px-2 py-1 rounded text-xs">REF: ${im.cod_imovel}</span>
                <h4 class="font-bold text-slate-200 mt-2 text-sm">${im.endereco}</h4>
                <div class="mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-400">${im.tamanho||0} m² | Vinculado: ${im.cliente?.nome||'--'}</div>
            </div>`).join('');
            
        renderPagination(list.length, state.imoveisPage, 'pagination-imoveis', p => { state.imoveisPage=p; renderImoveisGrid(); });
    };

    // =========================================================================
    // 6. LÓGICA DO HISTÓRICO E INFINITE SCROLL
    // =========================================================================

    const renderSkeletonHistory = () => {
        return Array.from({length: 4}).map(() => `
            <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 flex gap-4 opacity-70">
                <div class="skeleton h-12 w-12 rounded-full shrink-0"></div>
                <div class="flex-1 space-y-3 py-1">
                    <div class="skeleton h-4 w-3/4 rounded"></div>
                    <div class="skeleton h-3 w-1/2 rounded"></div>
                    <div class="skeleton h-3 w-1/4 rounded"></div>
                </div>
            </div>
        `).join('');
    };

    const loadHistoryPage = async () => {
        if (state.history.isLoading || !state.history.hasMore) return;
        
        const grid = $('#historico-grid');
        const loader = $('#historico-loading');
        const counter = $('#historico-counter');

        state.history.isLoading = true;
        loader.classList.remove('hidden');

        if (state.history.page === 1) {
            grid.innerHTML = renderSkeletonHistory();
        }

        try {
            const res = await SolicitacoesService.listar(state.history.page, state.history.pageSize);
            
            if (state.history.page === 1) grid.innerHTML = ''; // Limpa os skeletons
            
            state.history.totalPages = res.total_pages;
            state.history.hasMore = state.history.page < res.total_pages;
            
            if (res.items.length === 0 && state.history.page === 1) {
                grid.innerHTML = `<div class="col-span-full py-10 text-center text-slate-500 italic">Nenhuma solicitação encontrada no histórico.</div>`;
            } else {
                state.history.items = [...state.history.items, ...res.items];
                
                res.items.forEach(item => {
                    const statusObj = formatStatus(item.status);
                    const podeEditar = item.status === 'PENDENTE_ADMIN' || item.status === 'PENDENTE_CLIENTE';
                    const div = document.createElement('div');
                    div.className = "glass-card rounded-xl p-4 flex flex-col justify-between anim-fade-in";
                    div.innerHTML = `
                        <div class="flex justify-between items-start mb-3 cursor-pointer hist-card-body">
                            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${statusObj.color}">${statusObj.label}</span>
                            <span class="text-xs text-slate-500 font-mono">${formatDate(item.created_at)}</span>
                        </div>
                        <div class="cursor-pointer hist-card-body">
                            <h4 class="font-bold text-white text-sm truncate">${item.imovel.cod_imovel} - ${(item.imovel.endereco||'').split(',')[0]}</h4>
                            <p class="text-xs text-slate-400 mt-1 truncate">👤 ${item.cliente.nome}</p>
                            <p class="text-xs text-purple-400 font-medium mt-1">📋 ${item.tipo_vistoria.replace('_', ' ')}</p>
                        </div>
                        ${podeEditar ? `
                        <div class="flex gap-2 mt-3 pt-3 border-t border-slate-700/50">
                            <button data-action="editar" data-id="${item.id}" class="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 transition-colors">Editar</button>
                            <button data-action="cancelar" data-id="${item.id}" class="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 transition-colors">Cancelar</button>
                        </div>` : ''}
                    `;
                    div.querySelectorAll('.hist-card-body').forEach(el => el.addEventListener('click', () => openHistoricoModal(item.id)));
                    div.querySelector('[data-action="editar"]')?.addEventListener('click', (e) => { e.stopPropagation(); openEditarModal(item.id); });
                    div.querySelector('[data-action="cancelar"]')?.addEventListener('click', (e) => { e.stopPropagation(); confirmarCancelamento(item.id, div); });
                    grid.appendChild(div);
                });
            }

            counter.textContent = `${state.history.items.length} de ${res.total} registros`;
            state.history.page++;

        } catch (error) {
            showNotification('Erro ao carregar histórico: ' + error.message, 'error');
            if(state.history.page === 1) grid.innerHTML = `<div class="col-span-full text-center text-red-400 py-4">Falha ao carregar dados.</div>`;
        } finally {
            state.history.isLoading = false;
            loader.classList.add('hidden');
        }
    };

    const handleHistoryScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            loadHistoryPage();
        }
    };

    const openHistoricoModal = async (id) => {
        // Modal inicial com loading
        openModal(`
            <div class="flex flex-col items-center justify-center py-10">
                <div class="h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-slate-400 text-sm">Carregando detalhes...</p>
            </div>
        `);

        try {
            const detalhes = await SolicitacoesService.obterDetalhes(id);
            const statusObj = formatStatus(detalhes.status);

            // Substitui o conteúdo do modal
            const contentContainer = document.getElementById('modal-content');
            if(!contentContainer) return;

            // Tratamento de anexos (links seguros via backend ou url pública se aplicável)
            let anexosHtml = '<p class="text-xs text-slate-500 italic">Nenhum anexo</p>';
            if (detalhes.anexos && detalhes.anexos.length > 0) {
                anexosHtml = `<div class="flex flex-col gap-2 mt-2">
                    ${detalhes.anexos.map(a => `
                        <a href="${a.link || '#'}" target="${a.link ? '_blank' : '_self'}" class="text-xs flex items-center gap-2 p-2 bg-slate-800/50 rounded hover:bg-slate-700 text-cyan-400 transition-colors border border-slate-700/50">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                            ${a.file_path.split('_SOLICIT_')[0] || 'Anexo'}
                        </a>
                    `).join('')}
                </div>`;
            }

            // Lógica do botão de agenda
            let btnAgendaHtml = '';
            if (detalhes.agenda_id) {
                btnAgendaHtml = `
                    <button type="button" onclick="window.visualizarNaAgenda('${detalhes.agenda_id}')" class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl flex justify-center items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        Visualizar na Agenda
                    </button>
                `;
            }

            contentContainer.innerHTML = `
                <div class="text-left">
                    <div class="flex justify-between items-start mb-4 border-b border-slate-700/50 pb-4">
                        <div>
                            <h3 class="text-xl font-bold text-white leading-tight">Detalhes da Solicitação</h3>
                            <p class="text-xs text-slate-400 mt-1">${formatDate(detalhes.created_at)}</p>
                        </div>
                        <span class="text-[10px] uppercase font-bold px-2 py-1 rounded-md border ${statusObj.color}">${statusObj.label}</span>
                    </div>

                    <div class="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                        <!-- Imóvel -->
                        <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Imóvel</span>
                            <p class="text-sm font-bold text-blue-300">REF: ${detalhes.imovel.cod_imovel}</p>
                            <p class="text-sm text-slate-200 mt-1">${detalhes.imovel.endereco}</p>
                            <div class="flex gap-4 mt-2 text-xs text-slate-400">
                                <span>${detalhes.imovel.tamanho} m²</span>
                                <span>${(detalhes.imovel.mobiliado || 'sem_mobilia').replace('_', ' ')}</span>
                            </div>
                        </div>

                        <!-- Cliente e Vistoria -->
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cliente</span>
                                <p class="text-sm font-bold text-slate-200">${detalhes.cliente.nome}</p>
                                <p class="text-xs text-slate-400 mt-1 truncate" title="${detalhes.cliente.email}">${detalhes.cliente.email}</p>
                                <p class="text-xs text-slate-400">${detalhes.cliente.telefone1 || '--'}</p>
                            </div>
                            <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex flex-col justify-center items-center text-center">
                                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Natureza</span>
                                <span class="bg-purple-500/10 text-purple-300 border border-purple-500/20 px-3 py-1.5 rounded-lg text-sm font-bold block w-full">
                                    ${detalhes.tipo_vistoria.replace('_', ' ')}
                                </span>
                            </div>
                        </div>

                        <!-- Observações e Anexos -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Observações</span>
                                <div class="bg-slate-900/30 p-3 rounded-lg border border-slate-700/30 text-xs text-slate-300 min-h-[60px]">
                                    ${detalhes.observacao || '<span class="italic text-slate-500">Nenhuma observação informada.</span>'}
                                </div>
                            </div>
                            <div>
                                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Anexos Vinculados</span>
                                ${anexosHtml}
                            </div>
                        </div>
                    </div>
                    
                    ${btnAgendaHtml}
                </div>
            `;
        } catch (error) {
            showNotification(error.message, 'error');
            closeModal();
        }
    };

    // Expor função global para o botão do modal
    window.visualizarNaAgenda = (agendaId) => {
        closeModal();
        localStorage.setItem('focus_agenda_id', agendaId);
        window.location.hash = 'dashboard';
    };

    const TIPOS_VISTORIA = ['ENTRADA', 'SAIDA', 'CONFERENCIA', 'AVERIGUACAO', 'COMPLEMENTO_VISITA'];

    const confirmarCancelamento = (id, cardEl) => {
        openModal(`
            <div class="text-center py-4">
                <div class="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Cancelar Solicitação</h3>
                <p class="text-sm text-slate-400 mb-6">Tem certeza que deseja cancelar esta solicitação? Esta ação não pode ser desfeita.</p>
                <div class="flex gap-3 justify-center">
                    <button id="btn-confirm-cancel" class="px-6 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors">Sim, cancelar</button>
                    <button id="btn-dismiss-cancel" class="px-6 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-sm transition-colors">Voltar</button>
                </div>
            </div>
        `);

        document.getElementById('btn-dismiss-cancel').onclick = closeModal;
        document.getElementById('btn-confirm-cancel').onclick = async () => {
            const btn = document.getElementById('btn-confirm-cancel');
            btn.disabled = true;
            btn.textContent = 'Cancelando...';
            try {
                await SolicitacoesService.cancelar(id);
                closeModal();
                showNotification('Solicitação cancelada com sucesso.', 'success');
                // Atualiza o card visualmente sem recarregar a lista inteira
                const statusObj = formatStatus('CANCELADO');
                const badgeEl = cardEl.querySelector('.text-\\[10px\\]');
                if (badgeEl) {
                    badgeEl.className = `text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${statusObj.color}`;
                    badgeEl.textContent = statusObj.label;
                }
                cardEl.querySelector('.flex.gap-2.mt-3')?.remove();
                // Atualiza o item no estado local
                const idx = state.history.items.findIndex(i => i.id === id);
                if (idx !== -1) state.history.items[idx].status = 'CANCELADO';
            } catch (err) {
                showNotification(err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Sim, cancelar';
            }
        };
    };

    const openEditarModal = async (id) => {
        openModal(`
            <div class="flex flex-col items-center justify-center py-10">
                <div class="h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-slate-400 text-sm">Carregando dados...</p>
            </div>
        `);

        try {
            const detalhes = await SolicitacoesService.obterDetalhes(id);
            const contentContainer = document.getElementById('modal-content');
            if (!contentContainer) return;

            const tipoOpts = TIPOS_VISTORIA.map(t =>
                `<option value="${t}" ${detalhes.tipo_vistoria === t ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`
            ).join('');

            let anexosHtml = '<p class="text-xs text-slate-500 italic">Nenhum anexo</p>';
            if (detalhes.anexos?.length) {
                anexosHtml = detalhes.anexos.map(a => `
                    <a href="${a.link || '#'}" target="${a.link ? '_blank' : '_self'}" class="text-xs flex items-center gap-2 p-2 bg-slate-800/50 rounded hover:bg-slate-700 text-cyan-400 transition-colors border border-slate-700/50">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                        ${a.file_path.split('_SOLICIT_')[0] || 'Anexo'}
                    </a>
                `).join('');
            }

            contentContainer.innerHTML = `
                <div class="text-left">
                    <h3 class="text-xl font-bold text-white mb-1">Editar Solicitação</h3>
                    <p class="text-xs text-slate-400 mb-5">${detalhes.imovel.cod_imovel} · ${detalhes.cliente.nome}</p>

                    <div class="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                        <div>
                            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tipo de Vistoria</label>
                            <select id="edit-tipo" class="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500">
                                ${tipoOpts}
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Observação</label>
                            <textarea id="edit-obs" rows="3" class="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500 resize-none">${detalhes.observacao || ''}</textarea>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Anexos Existentes</label>
                            <div class="flex flex-col gap-1.5">${anexosHtml}</div>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Adicionar Novos Anexos</label>
                            <input id="edit-files" type="file" multiple class="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200 file:text-xs hover:file:bg-slate-600 cursor-pointer" />
                        </div>
                    </div>

                    <div class="flex gap-3 mt-6">
                        <button id="btn-salvar-edicao" class="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors">Salvar</button>
                        <button id="btn-fechar-edicao" class="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-sm transition-colors">Fechar</button>
                    </div>
                </div>
            `;

            document.getElementById('btn-fechar-edicao').onclick = closeModal;
            document.getElementById('btn-salvar-edicao').onclick = async () => {
                const btn = document.getElementById('btn-salvar-edicao');
                btn.disabled = true;
                btn.textContent = 'Salvando...';

                try {
                    const fd = new FormData();
                    const tipoVal = document.getElementById('edit-tipo').value;
                    if (tipoVal) fd.append('tipo_vistoria', tipoVal);
                    
                    const obs = document.getElementById('edit-obs').value;
                    if (obs !== null && obs !== undefined) fd.append('observacao', obs.trim());
                    
                    const files = document.getElementById('edit-files').files;
                    if (files && files.length > 0) {
                        for (const f of files) fd.append('arquivos', f);
                    }

                    await SolicitacoesService.editar(id, fd);
                    closeModal();
                    showNotification('Solicitação atualizada com sucesso.', 'success');
                    // Recarrega o histórico do início para refletir as mudanças
                    state.history.items = [];
                    state.history.page = 1;
                    state.history.hasMore = true;
                    $('#historico-grid').innerHTML = '';
                    loadHistoryPage();
                } catch (err) {
                    showNotification(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Salvar';
                }
            };
        } catch (err) {
            showNotification(err.message, 'error');
            closeModal();
        }
    };


    // =========================================================================
    // 7. EVENTOS GLOBAIS E DELEGAÇÃO
    // =========================================================================
    const bindEvents = () => {
        // TABS
        $$('[data-tab]').forEach(btn => btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab)));
        
        // SEARCH INPUTS
        let sTmt1, sTmt2;
        $('#search-clientes').addEventListener('input', e => { clearTimeout(sTmt1); sTmt1=setTimeout(()=>{ state.clientesSearch=e.target.value.toLowerCase(); state.clientesPage=1; renderClientesGrid(); }, 300); });
        $('#search-imoveis').addEventListener('input', e => { clearTimeout(sTmt2); sTmt2=setTimeout(()=>{ state.imoveisSearch=e.target.value.toLowerCase(); state.imoveisPage=1; renderImoveisGrid(); }, 300); });

        // DELEGAÇÃO DE EVENTOS DO WIZARD
        container.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;

            if (action === 'wiz-goto') {
                state.wizard.step = parseInt(e.target.closest('[data-target]').dataset.target);
                updateWizardUI();
            }
            else if (action === 'wiz-next') {
                state.wizard.step = parseInt(e.target.closest('[data-target]').dataset.target);
                updateWizardUI();
            }
            else if (action === 'toggle-mode') {
                const dataset = e.target.closest('[data-action]').dataset;
                toggleWizardMode(parseInt(dataset.step), dataset.mode);
            }
            else if (action === 'wiz-create-cli') handleCreateClienteWizard(e);
            else if (action === 'wiz-create-imo') handleCreateImovelWizard(e);
            else if (action === 'open-modal-cliente') openAddClienteModal();
            else if (action === 'open-modal-imovel') openAddImovelModal();
        });

        // FORMULÁRIO DE SOLICITAÇÃO FINAL
        $('#solicitacao-form').addEventListener('submit', handleFinalSubmit);

        // INFINITE SCROLL DO HISTÓRICO
        const historicoScroll = $('#historico-scroll-container');
        if (historicoScroll) {
            historicoScroll.addEventListener('scroll', handleHistoryScroll);
        }
    };

    // =========================================================================
    // 8. ACTIONS DOS FORMULÁRIOS
    // =========================================================================
    
    const handleCreateClienteWizard = async (e) => {
        const btn = e.target.closest('button');
        btn.disabled = true; btn.innerHTML = 'Salvando...';
        try {
            const payload = {
                nome: $('#wiz_add_cli_nome').value.trim(),
                email: $('#wiz_add_cli_email').value.trim(),
                telefone1: $('#wiz_add_cli_tel1').value.trim() || null,
                saldo_devedor_total: 0
            };
            if(!payload.nome || !payload.email) throw new Error("Preencha Nome e E-mail.");
            
            const novoCli = await safeCreateCliente(payload);
            state.wizard.clienteId = novoCli.id; state.wizard.clienteObj = novoCli;
            
            state.clientes = extractList(await safeGetClientes());
            renderClientesGrid();

            toggleWizardMode(1, 'select');
            $('#wiz_cliente_id').value = novoCli.id; $('#search_cliente_input').value = novoCli.nome;
            $('#btn-next-1').disabled = false; $('#btn-next-1').classList.remove('opacity-50', 'cursor-not-allowed');
            
            state.wizard.step = 2; updateWizardUI();
        } catch(err) { showNotification(err.message, 'error'); } 
        finally { btn.disabled = false; btn.innerHTML = 'Salvar e Continuar &rarr;'; }
    };

    const handleCreateImovelWizard = async (e) => {
        const btn = e.target.closest('button');
        btn.disabled = true; btn.innerHTML = 'Salvando...';
        try {
            const tam = parseFloat($('#wiz_add_im_tam').value);
            if(isNaN(tam) || tam <= 0) throw new Error("Tamanho inválido.");
            
            const imobSelect = $('#wiz_add_im_imob');
            const finalImobId = (imobSelect && !imobSelect.parentElement.classList.contains('hidden')) 
                ? imobSelect.value : ($('#wiz_add_im_imob_hidden')?.value || getImobiliariaIdFromState());

            const payload = {
                cod_imovel: $('#wiz_add_im_cod').value.trim(),
                tamanho: tam,
                endereco: $('#wiz_add_im_end').value.trim(),
                mobiliado: $('#wiz_add_im_mob').value,
                cliente_id: state.wizard.clienteId
            };
            if(finalImobId) payload.imobiliaria_id = finalImobId;

            const novoIm = await safeCreateImovel(payload);
            state.wizard.imovelId = novoIm.id; state.wizard.imovelObj = novoIm;
            
            state.imoveis = extractList(await safeGetImoveis());
            renderImoveisGrid();

            toggleWizardMode(2, 'select');
            $('#wiz_imovel_id').value = novoIm.id; $('#search_imovel_input').value = `${novoIm.cod_imovel} - ${novoIm.endereco.split(',')[0]}`;
            $('#btn-next-2').disabled = false; $('#btn-next-2').classList.remove('opacity-50', 'cursor-not-allowed');
            
            state.wizard.step = 3; updateWizardUI();
        } catch(err) { showNotification(err.message, 'error'); } 
        finally { btn.disabled = false; btn.innerHTML = 'Salvar e Continuar &rarr;'; }
    };

    const handleFinalSubmit = async (e) => {
        e.preventDefault();
        
        const performSubmission = async () => {
            if (!state.wizard.clienteId || !state.wizard.imovelId) return showNotification('Dados inconsistentes.', 'error');
            
            const files = $('#form_arquivos').files;

            const btn = $('#btn-submit-solicitacao');
            const originalText = btn?.innerHTML || 'Enviar Solicitação →';
            if (btn) {
                btn.disabled = true; 
                btn.innerHTML = 'Enviando...';
            }

            // Hardening: Prevenir envio acidental de strings "null" ou "undefined" para o backend
            if (!state.wizard.clienteId || state.wizard.clienteId === 'null' || state.wizard.clienteId === 'undefined') {
                if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                return showNotification('Erro de validação: Cliente inválido. Por favor, selecione novamente.', 'error');
            }
            if (!state.wizard.imovelId || state.wizard.imovelId === 'null' || state.wizard.imovelId === 'undefined') {
                if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                return showNotification('Erro de validação: Imóvel inválido. Por favor, selecione novamente.', 'error');
            }

            const fd = new FormData();
            fd.append('cliente_id', state.wizard.clienteId);
            fd.append('imovel_id', state.wizard.imovelId);
            fd.append('tipo_vistoria', $('#form_tipo_vistoria').value);
            fd.append('origem', 'DIRETO_IMOBILIARIA');
            
            const obsValue = $('#form_observacao').value.trim();
            if (obsValue) fd.append('observacao', obsValue);
            
            const MAX_FILE_MB = 100;
            const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
            for (let i = 0; i < files.length; i++) {
                if (files[i].size > MAX_FILE_BYTES) {
                    if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                    return showNotification(`Arquivo '${files[i].name}' ultrapassa o limite de ${MAX_FILE_MB}MB.`, 'error');
                }
                fd.append('arquivos', files[i]);
            }

            try {
                await api.createSolicitacao(fd);
                showNotification('Enviado com sucesso!', 'success');
                e.target.reset();
                state.wizard = { step: 1, clienteId: null, clienteObj: null, imovelId: null, imovelObj: null };
                updateWizardUI();

                // Limpa o cache do histórico para obrigar recarregamento se o usuário mudar de aba
                state.history = { items: [], page: 1, pageSize: 10, totalPages: 1, isLoading: false, hasMore: true };
                
                // Fecha modal se estiver aberto
                if (window.closeModal) window.closeModal();

                // Navega para aba histórico para mostrar o sucesso
                switchTab('historico');

            } catch (err) { 
                showNotification(err.message || 'Erro no envio.', 'error'); 
            } finally { 
                if (btn) {
                    btn.disabled = false; 
                    btn.innerHTML = originalText;
                }
            }
        };

        const now = new Date();
        const hours = now.getHours();

        // Verificação de horário: 17:00 em diante
        if (hours >= 17) {
            openModal(`
                <div class="text-center py-6">
                    <div class="w-20 h-20 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(234,179,8,0.1)]">
                        <svg class="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Aviso de Horário</h3>
                    <p class="text-slate-400 mb-8 px-4 leading-relaxed">Este agendamento será realizado a partir do próximo dia útil <br> <span class="text-yellow-500/80 text-sm">(Solicitado a partir das 17:00)</span></p>
                    <button id="btn-confirm-scheduling" class="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-emerald-900/20 transition-all hover:brightness-110 active:scale-[0.98]">
                        Entendido
                    </button>
                </div>
            `);
            
            const confirmBtn = document.getElementById('btn-confirm-scheduling');
            if (confirmBtn) {
                confirmBtn.onclick = () => performSubmission();
            }
        } else {
            await performSubmission();
        }
    };

    // =========================================================================
    // 9. DROPDOWNS E MODAIS AUXILIARES
    // =========================================================================
    const setupSearchableDropdowns = () => {
        const setup = (inputId, hiddenId, dropdownId, type) => {
            const input = $(`#${inputId}`); const hidden = $(`#${hiddenId}`); const dropdown = $(`#${dropdownId}`);
            if(!input || !hidden || !dropdown) return;

            const renderList = (term = '') => {
                const isCli = type === 'cliente';
                let data = isCli ? state.clientes : state.imoveis;
                if (!isCli && state.wizard.clienteId) data = data.filter(i => i.cliente_id === state.wizard.clienteId || !i.cliente_id);

                let filtered = data;
                if(term) {
                    const t = term.toLowerCase();
                    filtered = data.filter(item => isCli 
                        ? (item.nome||'').toLowerCase().includes(t) || (item.email||'').toLowerCase().includes(t)
                        : (item.cod_imovel||'').toLowerCase().includes(t) || (item.endereco||'').toLowerCase().includes(t));
                }

                if(!filtered.length) return dropdown.innerHTML = `<div class="p-4 text-sm text-slate-400">Nenhum resultado.</div>`;

                dropdown.innerHTML = filtered.map(item => {
                    const display = isCli 
                        ? `<div class="font-bold text-white">${item.nome}</div><div class="text-xs text-slate-400">${item.email}</div>`
                        : `<div class="font-bold text-blue-300">REF: ${item.cod_imovel}</div><div class="text-xs text-slate-300 truncate">${item.endereco}</div>`;
                    const valueStr = isCli ? item.nome : `${item.cod_imovel} - ${(item.endereco||'').split(',')[0]}`;

                    return `<div class="p-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 dropdown-item" data-id="${item.id}" data-val="${valueStr.replace(/"/g, '&quot;')}">${display}</div>`;
                }).join('');

                dropdown.querySelectorAll('.dropdown-item').forEach(el => el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hidden.value = el.dataset.id; input.value = el.dataset.val; dropdown.classList.add('hidden');
                    
                    if(isCli) {
                        state.wizard.clienteId = el.dataset.id; state.wizard.clienteObj = state.clientes.find(c => c.id === el.dataset.id);
                        $('#btn-next-1').disabled = false; $('#btn-next-1').classList.remove('opacity-50', 'cursor-not-allowed');
                    } else {
                        state.wizard.imovelId = el.dataset.id; state.wizard.imovelObj = state.imoveis.find(i => i.id === el.dataset.id);
                        $('#btn-next-2').disabled = false; $('#btn-next-2').classList.remove('opacity-50', 'cursor-not-allowed');
                    }
                }));
            };

            input.onfocus = () => { dropdown.classList.remove('hidden'); renderList(''); input.select(); };
            input.oninput = (e) => {
                dropdown.classList.remove('hidden'); hidden.value = ''; 
                if(type === 'cliente') { state.wizard.clienteId = null; $('#btn-next-1').disabled = true; $('#btn-next-1').classList.add('opacity-50'); }
                if(type === 'imovel') { state.wizard.imovelId = null; $('#btn-next-2').disabled = true; $('#btn-next-2').classList.add('opacity-50'); }
                renderList(e.target.value);
            };

            // Closest fix para o window click
            document.addEventListener('click', (e) => {
                if(!input.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.add('hidden');
                    if(!hidden.value) input.value = ''; 
                }
            });
        };
        setup('search_cliente_input', 'wiz_cliente_id', 'dropdown_cliente', 'cliente');
        setup('search_imovel_input', 'wiz_imovel_id', 'dropdown_imovel', 'imovel');
    };

    const openAddClienteModal = () => {
        openModal(`
            <div class="text-left"><h3 class="text-2xl font-bold text-white mb-4">Novo Cliente</h3>
            <form id="m-cli-form" class="space-y-4">
                <input type="text" id="m_cli_nome" placeholder="Nome *" required class="w-full input-glass rounded-xl p-3">
                <input type="email" id="m_cli_email" placeholder="E-mail *" required class="w-full input-glass rounded-xl p-3">
                <input type="text" id="m_cli_tel1" placeholder="Telefone" class="w-full input-glass rounded-xl p-3">
                <div class="flex justify-end gap-2 pt-4"><button type="button" class="btn-cancel px-4 py-2 text-slate-300">Cancelar</button><button type="submit" class="bg-purple-600 text-white px-6 py-2 rounded-xl">Salvar</button></div>
            </form></div>`);
            
        document.querySelector('.btn-cancel').onclick = closeModal;
        document.getElementById('m-cli-form').onsubmit = async (e) => {
            e.preventDefault();
            try { 
                await safeCreateCliente({nome:e.target.m_cli_nome.value, email:e.target.m_cli_email.value, telefone1:e.target.m_cli_tel1.value, saldo_devedor_total:0});
                showNotification('Salvo!','success'); closeModal(); 
                state.clientes = extractList(await safeGetClientes()); renderClientesGrid(); setupSearchableDropdowns(); 
            } catch(err){ showNotification(err.message,'error'); }
        };
    };

    const openAddImovelModal = () => {
        const imobOptions = state.imobiliarias.length > 1 
            ? `<select id="m_im_imob" required class="w-full input-glass rounded-xl p-3"><option value="">Imobiliária...</option>${state.imobiliarias.map(i => `<option value="${i.id}">${i.nome}</option>`).join('')}</select>` 
            : `<input type="hidden" id="m_im_imob" value="${state.imobiliarias[0]?.id || ''}">`;

        openModal(`
            <div class="text-left"><h3 class="text-2xl font-bold text-white mb-4">Novo Imóvel</h3>
            <form id="m-imo-form" class="space-y-4">
                ${imobOptions}
                <div class="flex gap-4"><input type="text" id="m_im_cod" placeholder="REF *" required class="w-1/2 input-glass rounded-xl p-3"><input type="number" id="m_im_tam" step="0.01" placeholder="m² *" required class="w-1/2 input-glass rounded-xl p-3"></div>
                <input type="text" id="m_im_end" placeholder="Endereço *" required class="w-full input-glass rounded-xl p-3">
                <select id="m_im_mob" required class="w-full input-glass rounded-xl p-3"><option value="sem_mobilia">Sem Mobília</option><option value="semi_mobiliado">Semi-Mobiliado</option><option value="mobiliado">Mobiliado</option></select>
                <select id="m_im_cli" required class="w-full input-glass rounded-xl p-3"><option value="">Vincular Cliente...</option>${state.clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>
                <div class="flex justify-end gap-2 pt-4"><button type="button" class="btn-cancel px-4 py-2 text-slate-300">Cancelar</button><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-xl">Salvar</button></div>
            </form></div>`);
            
        document.querySelector('.btn-cancel').onclick = closeModal;
        document.getElementById('m-imo-form').onsubmit = async (e) => {
            e.preventDefault();
            try { 
                const tam = parseFloat(e.target.m_im_tam.value); if (isNaN(tam) || tam <= 0) throw new Error("Tamanho inválido.");
                const payload = { cod_imovel: e.target.m_im_cod.value.trim(), tamanho: tam, endereco: e.target.m_im_end.value.trim(), mobiliado: e.target.m_im_mob.value, cliente_id: e.target.m_im_cli.value };
                const finalImobId = e.target.m_im_imob?.value || getImobiliariaIdFromState();
                if (finalImobId) payload.imobiliaria_id = finalImobId;

                await safeCreateImovel(payload);
                showNotification('Salvo!','success'); closeModal(); 
                state.imoveis = extractList(await safeGetImoveis()); renderImoveisGrid(); setupSearchableDropdowns(); 
            } catch(err){ showNotification(err.message,'error'); }
        };
    };

    // =========================================================================
    // 10. INICIALIZAÇÃO
    // =========================================================================
    const init = async () => {
        renderBaseLayout();
        bindEvents();

        try {
            const [resClientes, resImoveis, resImobiliarias] = await Promise.all([ 
                safeGetClientes(), safeGetImoveis(),
                (api.getImobiliarias ? api.getImobiliarias().catch(() => []) : Promise.resolve([]))
            ]);
            
            state.clientes = extractList(resClientes);
            state.imoveis = extractList(resImoveis);
            state.imobiliarias = extractList(resImobiliarias);
            
            if (state.imobiliarias.length > 1 && $('#wiz_imob_container')) {
                $('#wiz_imob_container').classList.remove('hidden');
                $('#wiz_add_im_imob').innerHTML = state.imobiliarias.map(i => `<option value="${i.id}">${i.nome}</option>`).join('');
            } else if (state.imobiliarias.length === 1 && $('#wiz_add_im_imob_hidden')) {
                $('#wiz_add_im_imob_hidden').value = state.imobiliarias[0].id;
            }

            setupSearchableDropdowns();
            renderClientesGrid();
            renderImoveisGrid();
            
            $('#loading-overlay').classList.add('hidden');
            $('#tabs-container').classList.remove('hidden');
        } catch (error) { showNotification("Falha na sincronização dos dados.", "error"); }
    };

    await init();
};