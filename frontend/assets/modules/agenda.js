// /assets/modules/agenda.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';
import { startAgendamentoWizard } from './agendamento-wizard.js';

let calendar; // Manter a referência do calendário
let reagendamentoState = { active: false, event: null }; // Controla o modo de reagendamento

// --- VARIÁVEIS PARA OS FILTROS ---
let currentVistoriadorFilter = 'all'; // 'all' ou o ID do vistoriador
let knownVistoriadores = new Map(); // Armazena {id: nome} para popular o select

let currentImobiliariaFilter = 'all'; // 'all' ou o ID da imobiliária
let knownImobiliarias = new Map(); // Armazena {id: nome} para popular o select

let currentSearchQuery = ''; // Texto para busca por código do imóvel

// --- SISTEMA DE CACHE IA ---
// Armazena { message: string, timestamp: number }
let iaAnalysisCache = null;
const IA_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 horas em milissegundos

// --- INÍCIO DA PARTE 2: Helpers de Abas (Mural e Documentos) ---

/**
 * Renderiza o conteúdo da aba Mural para o Admin.
 * @param {string} agendaId - ID do agendamento.
 * @param {string} containerId - ID do elemento container.
 */
async function renderAdminMuralTab(agendaId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-400">Carregando...</p>';
    
    try {
        // Usa a nova API do admin
        const data = await api.getComentariosVistoria(agendaId);
        const remetente = "admin"; // Admin sempre envia como "admin"
        
        const comentariosHTML = data.comentarios.map(c => `
            <div class="p-3 rounded-lg ${c.remetente === remetente ? 'bg-cyan-900/50 ml-auto' : 'bg-gray-700/50 mr-auto'}" style="max-width: 80%;">
                <p class="text-sm text-gray-200 whitespace-pre-wrap">${sanitizeHTML(c.conteudo)}</p>
                <p class="text-xs text-gray-400 text-right mt-1 capitalize">${sanitizeHTML(c.remetente)} - ${new Date(c.created_at).toLocaleString('pt-BR')}</p>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="space-y-3 max-h-64 overflow-y-auto mb-4 p-2 bg-gray-900/50 rounded-lg custom-scrollbar">${comentariosHTML || '<p class="text-gray-400 text-center">Nenhum comentário ainda.</p>'}</div>
            <div class="flex flex-col sm:flex-row gap-2">
                <textarea id="mural-textarea" rows="2" class="w-full p-2 bg-gray-700/50 border border-gray-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50" placeholder="Escreva seu comentário..."></textarea>
                <button id="mural-submit-btn" class="py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold transition-colors">Enviar</button>
            </div>
            <div id="mural-error" class="text-red-400 text-sm mt-2 hidden"></div>
        `;

        container.querySelector('#mural-submit-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const textarea = container.querySelector('#mural-textarea');
            const errorDiv = container.querySelector('#mural-error');
            const comentario = textarea.value.trim();
            
            errorDiv.classList.add('hidden');
            if (comentario) {
                btn.disabled = true;
                btn.textContent = 'Enviando...';
                try {
                    // Usa a nova API do admin
                    await api.postComentarioVistoria(agendaId, comentario);
                    renderAdminMuralTab(agendaId, containerId); // Recarrega o mural
                } catch (e) { 
                    errorDiv.textContent = e.message;
                    errorDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Enviar';
                }
            }
        });
    } catch (e) { 
        container.innerHTML = `<p class="text-red-400 text-center">${e.message}</p>`; 
    }
}

/**
 * Renderiza o conteúdo da aba Documentos para o Admin.
 * @param {string} agendaId - ID do agendamento.
 * @param {string} containerId - ID do elemento container.
 */
async function renderAdminDocumentosTab(agendaId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-400">Carregando...</p>';
    
    try {
        // Usa a nova API do admin
        const data = await api.getDocumentosVistoria(agendaId);
        
        const documentosHTML = data.documentos.map(d => `
            <div class="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                <a href="${d.link}" target="_blank" class="text-cyan-400 hover:underline truncate" title="${sanitizeHTML(d.file_path || d.nome)}">
                    <svg class="h-5 w-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    ${sanitizeHTML(d.file_path || d.nome)}
                </a>
                <button class="delete-doc-btn text-red-500 hover:text-red-400" data-doc-id="${d.id}" aria-label="Deletar ${sanitizeHTML(d.file_path || d.nome)}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="space-y-3 max-h-64 overflow-y-auto mb-4 p-2 bg-gray-900/50 rounded-lg custom-scrollbar">${documentosHTML || '<p class="text-gray-400 text-center">Nenhum documento anexado.</p>'}</div>
            <form id="doc-upload-form" class="flex flex-col sm:flex-row gap-2">
                <input type="file" name="file" required class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-600/50 file:text-cyan-100 hover:file:bg-cyan-600 transition-colors">
                <input type="hidden" name="agendamento_id" value="${agendaId}">
                <button type="submit" class="py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold transition-colors">Anexar</button>
            </form>
            <div id="doc-error" class="text-red-400 text-sm mt-2 hidden"></div>
        `;

        container.querySelector('#doc-upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const btn = form.querySelector('button[type="submit"]');
            const input = form.querySelector('input[type="file"]');
            const errorDiv = container.querySelector('#doc-error');
            
            errorDiv.classList.add('hidden');
            if (input.files.length > 0) {
                const formData = new FormData(form);
                
                btn.disabled = true;
                btn.textContent = 'Enviando...';
                try {
                    // Usa a nova API do admin com FormData
                    await api.postDocumentoVistoria(formData);
                    renderAdminDocumentosTab(agendaId, containerId); // Recarrega
                } catch (e) { 
                    errorDiv.textContent = e.message;
                    errorDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Anexar';
                }
            } else {
                errorDiv.textContent = 'Por favor, selecione um arquivo.';
                errorDiv.classList.remove('hidden');
            }
        });

        container.querySelectorAll('.delete-doc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.dataset.docId;
                // MODIFICAÇÃO: Removido confirm()
                showModal(`
                    <h2 class="text-2xl font-bold text-red-400 mb-4">Confirmar Exclusão</h2>
                    <p class="text-gray-300 mb-6">Tem certeza que deseja deletar este documento?</p>
                    <div id="modal-error" class="text-red-400 text-sm hidden mb-4"></div>
                    <div class="flex justify-end gap-4">
                        <button id="btn-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                        <button id="btn-confirm" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition">Sim, Deletar</button>
                    </div>
                `, 'max-w-md');

                document.getElementById('btn-cancel').onclick = hideModal;
                document.getElementById('btn-confirm').onclick = async () => {
                    const confirmBtn = document.getElementById('btn-confirm');
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = 'Deletando...';
                    try {
                        await api.deleteDocumentoVistoria(docId);
                        showAlert('Documento deletado.');
                        hideModal();
                        renderAdminDocumentosTab(agendaId, containerId); // Recarrega
                    } catch (e) {
                        document.getElementById('modal-error').textContent = e.message;
                        document.getElementById('modal-error').classList.remove('hidden');
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = 'Sim, Deletar';
                    }
                };
            });
        });

    } catch (e) { 
        container.innerHTML = `<p class="text-red-400 text-center">${e.message}</p>`; 
    }
}
// --- FIM DA PARTE 2: Helpers de Abas ---


/**
 * Renderiza o conteúdo customizado de um evento no calendário.
 * @param {object} eventInfo - Informações do evento do FullCalendar.
 * @returns {object} - Um objeto com o HTML do evento.
 */
function renderEventContent(eventInfo) {
    const props = eventInfo.event.extendedProps;
    let iconHtml, title, subtitle, textColorClass;

    const isListView = eventInfo.view.type.includes('list');

    if (props.tipo === 'LIVRE') {
        textColorClass = 'text-green-400';
        iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>`;
        title = isListView ? 'Horário Livre' : eventInfo.timeText;
        subtitle = props.vistoriador?.nome.split(' ')[0] || 'Vistoriador';
    } else if (props.tipo === 'FECHADO') {
        textColorClass = 'text-yellow-400';
        iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>`;
        title = isListView ? 'Horário Fechado' : eventInfo.timeText;
        subtitle = props.motivo_fechamento || 'Fechado';
    } else { // Ocupado
        textColorClass = 'text-cyan-400';
        iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>`;
        title = isListView ? `CT ${props.imovel?.cod_imovel || 'Vistoria'}` : eventInfo.timeText;
        subtitle = props.imovel ? `CT ${props.imovel?.cod_imovel}` : 'Ocupado';
    }

    return {
        html: `
            <div class="fc-event-main-frame w-full h-full flex items-start gap-2 overflow-hidden p-1">
                <div class="flex-shrink-0 mt-0.5 ${textColorClass}">${iconHtml}</div>
                <div class="flex-grow min-w-0">
                    <div class="fc-event-title font-semibold text-white">${title}</div>
                    <div class="text-xs text-gray-400 truncate">${sanitizeHTML(subtitle)}</div>
                </div>
            </div>
        `
    };
}


/**
 * Lida com o clique em um evento do calendário.
 * @param {object} clickInfo - Informações do clique do FullCalendar.
 */
function handleEventClick(clickInfo) {
    const event = clickInfo.event;
    const props = event.extendedProps;

    if (reagendamentoState.active) {
        handleReagendamentoSelect(event);
        return;
    }

    if (props.tipo === 'LIVRE') {
        const modalHTML = `
            <h3 class="text-xl font-bold text-white mb-4">Ação para Horário Livre</h3>
            <p class="text-gray-400 mb-6">
                Vistoriador: ${sanitizeHTML(props.vistoriador?.nome || 'N/A')}<br>
                Data: ${event.start.toLocaleDateString('pt-BR')} às ${event.start.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
            </p>
            <div class="flex flex-col sm:flex-row justify-center gap-4">
                <button id="btn-iniciar-agendamento" class="w-full sm:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition">Iniciar Agendamento</button>
                <button id="btn-fechar-horario" class="w-full sm:w-auto px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition">Fechar Horário</button>
            </div>
        `;
        showModal(modalHTML, 'max-w-lg');

        // AQUI ESTÁ A MUDANÇA PRINCIPAL
        document.getElementById('btn-iniciar-agendamento').onclick = () => {
            // Passamos uma função de callback como 3º argumento
            startAgendamentoWizard(event, calendar, (novoAgendamento) => {
                // Esta função será executada após o sucesso do wizard
                
                // Monta um objeto similes a um evento do FullCalendar para a função do comprovante
                const mockEvent = {
                    extendedProps: novoAgendamento,
                    start: new Date(`${novoAgendamento.data}T${novoAgendamento.horario}`)
                };
                
                // Abre o comprovante automaticamente
                handleGerarComprovante(mockEvent);
            });
        };

        document.getElementById('btn-fechar-horario').onclick = () => handleFecharHorario(event.id);

    } else if (props.tipo === 'FECHADO') {
        renderConfirmReabrirModal(event.id, event);
    
    } else {
        showAdminVistoriaModal(event); // Modal com abas para vistorias ocupadas
    }
}

/**
 * MODIFICADO: Envia o payload correto para fechar o horário.
 * @param {string} agendaId - O ID do horário da agenda.
 */
function handleFecharHorario(agendaId) {
    const modalHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Fechar Horário</h3>
        <form id="form-fechar-horario">
            <label for="motivo-fechamento" class="block text-sm font-medium text-gray-300 mb-1">Motivo</label>
            <input type="text" id="motivo-fechamento" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" placeholder="Ex: Compromisso pessoal">
            <div class="flex justify-end gap-4 mt-6">
                <button type="button" id="cancel-fechar-horario" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition">Confirmar</button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-lg');
    document.getElementById('cancel-fechar-horario').onclick = hideModal;
    document.getElementById('form-fechar-horario').onsubmit = async (e) => {
        e.preventDefault();
        const motivo = document.getElementById('motivo-fechamento').value;
        const payload = { fechar: true, motivo: motivo };
        try {
            await api.fecharHorario(agendaId, payload);
            showAlert('Horário fechado com sucesso!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível fechar o horário.', 'error');
        }
    };
}

/**
 * Renderiza o modal de confirmação para reabrir um horário.
 * @param {string} agendaId - O ID do horário da agenda.
 * @param {object} event - O objeto do evento do FullCalendar.
 */
function renderConfirmReabrirModal(agendaId, event) {
    const props = event.extendedProps;
    const motivo = props.observacao_privada || props.motivo_fechamento || 'Motivo não especificado.';

    const modalHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Reabrir Horário</h3>
        <p class="text-gray-400 mb-2">Este horário foi fechado manualmente.</p>
        <p class="text-gray-300 mb-6"><strong>Motivo:</strong> ${sanitizeHTML(motivo)}</p>
        <p class="text-gray-300 mb-6">Deseja reabrir este horário e torná-lo "LIVRE"?</p>
        <div class="flex justify-end gap-4">
            <button id="btn-cancel-reabrir" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="btn-confirm-reabrir" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition">Sim, Reabrir Horário</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('btn-cancel-reabrir').onclick = hideModal;
    document.getElementById('btn-confirm-reabrir').onclick = async () => {
        const payload = { fechar: false, motivo: "" };
        try {
            await api.fecharHorario(agendaId, payload);
            showAlert('Horário reaberto com sucesso!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível reabrir o horário.', 'error');
        }
    };
}

/**
 * MODAL DA VISTORIA DO ADMIN (com abas e verificação de laudo)
 * @param {object} event - O evento do FullCalendar.
 */
async function showAdminVistoriaModal(event) {
    // 1. Extração Segura de Dados
    // Garante que não quebre se vier de um clique no calendário (extendedProps) ou direto (event)
    const props = event.extendedProps || event; 
    const imovel = props.imovel || {};
    const cliente = imovel.cliente || {};
    const imobiliaria = imovel.imobiliaria || {};
    const agendamentoId = event.id || props.id;

    // --- Helpers Visuais ---

    // Sanitização básica contra XSS
    const sanitizeHTML = (str) => {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    };

    // Card de Informação (Grid System)
    const createInfoCard = (label, value, iconPath, extraClasses = "") => `
        <div class="group relative flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 transition-all duration-300 hover:border-cyan-500/30 hover:bg-slate-800/60 hover:shadow-[0_0_15px_rgba(34,211,238,0.05)] ${extraClasses}">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-cyan-500 shadow-inner group-hover:scale-110 group-hover:text-cyan-400 transition-transform">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    ${iconPath}
                </svg>
            </div>
            <div class="overflow-hidden">
                <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">${label}</p>
                <p class="truncate text-sm font-medium text-slate-200 group-hover:text-white transition-colors" title="${String(value).replace(/"/g, '&quot;')}">
                    ${value}
                </p>
            </div>
        </div>
    `;

    // --- Construção do Layout (HTML Strings) ---

    const detailsTabHTML = `
        <div class="anim-slide-up space-y-6">
            
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                ${createInfoCard("Cód. Imóvel", sanitizeHTML(imovel.cod_imovel || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />')}
                ${createInfoCard("Tipo Vistoria", sanitizeHTML(props.tipo || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />', "border-cyan-500/20 bg-cyan-900/10")}
                ${createInfoCard("Vistoriador", sanitizeHTML(props.vistoriador?.nome || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />')}
                ${createInfoCard("Cliente", sanitizeHTML(cliente.nome || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />')}
                ${createInfoCard("Imobiliária", sanitizeHTML(imobiliaria.nome || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />')}
                ${createInfoCard("Tamanho", sanitizeHTML(imovel.tamanho ? imovel.tamanho + ' m²' : 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />')}
            </div>

            <div class="relative flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-cyan-500">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div>
                    <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Endereço Completo</p>
                    <p class="text-sm text-slate-300 leading-snug">${sanitizeHTML(imovel.endereco || 'N/A')}</p>
                    <div class="mt-1 flex items-center gap-2">
                        <span class="inline-flex items-center rounded-md bg-slate-700/50 px-2 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-slate-600/20">
                            ${sanitizeHTML(imovel.mobiliado || 'N/A')}
                        </span>
                    </div>
                </div>
            </div>

            <div class="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 to-emerald-950/20 p-4">
                <h4 class="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Financeiro
                </h4>
                <div class="flex divide-x divide-emerald-500/20">
                    <div class="flex-1 px-2 text-center">
                        <p class="text-xs text-slate-500">Valor Vistoria</p>
                        <p class="text-lg font-bold text-emerald-400">R$ ${props.valor_final_vistoria?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div class="flex-1 px-2 text-center">
                        <p class="text-xs text-slate-500">Repasse Vistoriador</p>
                        <p class="text-lg font-bold text-slate-200">R$ ${props.valor_vistoriador?.toFixed(2) || '0.00'}</p>
                    </div>
                </div>
            </div>

            <div id="laudo-admin-container" class="animate-pulse rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-3 text-center transition-all duration-300">
                <p class="flex items-center justify-center gap-2 text-xs text-slate-400">
                    <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Sincronizando status do laudo...
                </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
                <div class="relative overflow-hidden rounded-lg border border-amber-500/20 bg-amber-950/10 p-4">
                    <div class="absolute left-0 top-0 h-full w-1 bg-amber-500"></div>
                    <h4 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-amber-400">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        Msg. Vistoriador
                    </h4>
                    <p class="text-sm italic text-slate-300/90">${sanitizeHTML(props.observacao_vistoriador || 'Nenhuma')}</p>
                </div>

                <div class="relative overflow-hidden rounded-lg border border-slate-600/30 bg-slate-800/30 p-4">
                    <div class="absolute left-0 top-0 h-full w-1 bg-slate-500"></div>
                    <h4 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Privado (Admin)
                    </h4>
                    <p class="text-sm text-slate-400">${sanitizeHTML(props.observacao_privada || 'Nenhuma')}</p>
                </div>
            </div>

            <div id="vistoria-actions" class="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-700/50 pt-6">
                <button data-action="comprovante" class="group flex items-center gap-2 rounded-lg bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-400 ring-1 ring-inset ring-emerald-600/20 transition hover:bg-emerald-600 hover:text-white">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Comprovante
                </button>

                <button data-action="edit" class="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 hover:shadow-lg transition-all">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    Editar
                </button>

                <button data-action="reschedule" class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Reagendar
                </button>

                <div class="h-6 w-px bg-slate-700 mx-1"></div>

                <button data-action="unproductive" class="flex items-center gap-2 rounded-lg border border-amber-500/30 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500 hover:text-white transition-colors">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Improdutiva
                </button>

                <button data-action="cancel" class="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-500 hover:text-white hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Cancelar
                </button>
            </div>
        </div>
    `;

    // Wrapper do Modal (Header + Tabs + Content)
    const modalHTML = `
        <div class="sticky top-0 z-50 mb-6 flex items-center justify-between border-b border-slate-700/60 bg-slate-900/80 pb-4 backdrop-blur-md">
            <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                    <svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                </div>
                <div>
                    <h2 class="text-xl font-bold tracking-tight text-white">
                        Vistoria <span class="text-cyan-400">#${sanitizeHTML(imovel.cod_imovel || '---')}</span>
                    </h2>
                    <p class="text-xs text-slate-400">Gerenciamento de ordem de serviço</p>
                </div>
            </div>
            <button id="close-modal-btn" class="group relative rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                <div class="absolute inset-0 rounded-full bg-slate-700 opacity-0 transition-opacity group-hover:opacity-100"></div>
                <svg class="relative z-10 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <div class="mb-6">
            <nav class="flex space-x-1 rounded-xl bg-slate-950/50 p-1 shadow-inner" id="modal-tabs" role="tablist">
                <button data-tab="detalhes" class="tab-btn flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200 focus:outline-none active bg-slate-800 text-white shadow shadow-black/20" role="tab" aria-selected="true">
                    Detalhes
                </button>
                <button data-tab="mural" class="tab-btn flex-1 rounded-lg py-2 text-sm font-medium text-slate-400 transition-all duration-200 hover:text-slate-200 focus:outline-none" role="tab" aria-selected="false">
                    Mural
                </button>
                <button data-tab="documentos" class="tab-btn flex-1 rounded-lg py-2 text-sm font-medium text-slate-400 transition-all duration-200 hover:text-slate-200 focus:outline-none" role="tab" aria-selected="false">
                    Documentos
                </button>
            </nav>
        </div>

        <div class="relative min-h-[300px]">
            <div id="tab-content-detalhes" class="tab-content" role="tabpanel">
                ${detailsTabHTML}
            </div>
            
            <div id="tab-content-mural" class="tab-content hidden anim-slide-up" role="tabpanel">
                <div class="flex flex-col items-center justify-center py-12 text-slate-500">
                    <svg class="mb-4 h-12 w-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                    <p>Carregando mural...</p>
                </div>
            </div>
            
            <div id="tab-content-documentos" class="tab-content hidden anim-slide-up" role="tabpanel">
                <div class="flex flex-col items-center justify-center py-12 text-slate-500">
                    <svg class="mb-4 h-12 w-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <p>Carregando documentos...</p>
                </div>
            </div>
        </div>
    `;

    // 2. Renderização
    showModal(modalHTML, 'max-w-3xl');

    // 3. Event Listeners (A lógica "Brain" do Modal)

    // Fechar Modal
    document.getElementById('close-modal-btn').addEventListener('click', hideModal);

    // Delegação de Eventos para os Botões de Ação
    document.getElementById('vistoria-actions').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        
        switch (action) {
            case 'comprovante': if(typeof handleGerarComprovante === 'function') handleGerarComprovante(event); break;
            case 'edit': if(typeof handleEditarVistoria === 'function') handleEditarVistoria(event); break;
            case 'reschedule': if(typeof enterReagendamentoMode === 'function') enterReagendamentoMode(event); break;
            case 'unproductive': if(typeof handleMarcarImprodutiva === 'function') handleMarcarImprodutiva(event); break;
            case 'cancel': if(typeof handleCancelarAgendamento === 'function') handleCancelarAgendamento(event); break;
        }
    });
    
    // Lógica Avançada das Abas (Toggle Visual e Lazy Load)
    document.getElementById('modal-tabs').addEventListener('click', async (e) => { // Adicionado async
        const target = e.target.closest('.tab-btn');
        if (!target) return;
        
        e.preventDefault();
        const tabId = target.dataset.tab;

        // 1. Atualização Visual das Abas
        const activeClasses = ['bg-slate-800', 'text-white', 'shadow', 'shadow-black/20'];
        const inactiveClasses = ['text-slate-400', 'hover:text-slate-200'];

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove(...activeClasses);
            btn.classList.add(...inactiveClasses);
            btn.setAttribute('aria-selected', 'false');
        });

        target.classList.remove(...inactiveClasses);
        target.classList.add(...activeClasses);
        target.setAttribute('aria-selected', 'true');

        // 2. Troca de Conteúdo
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        const contentDiv = document.getElementById(`tab-content-${tabId}`);
        
        if (contentDiv) {
            contentDiv.classList.remove('hidden');

            // 3. Lógica de Carregamento (Lazy Load) corrigida
            // Verifica se já carregou usando um atributo data-loaded em vez de verificar texto
            if (!contentDiv.hasAttribute('data-loaded')) {
                
                try {
                    console.log(`Tentando carregar aba: ${tabId} para ID: ${agendamentoId}`);

                    if (tabId === 'mural') {
                        // Verifica explicitamente se a função existe
                        if (typeof renderAdminMuralTab !== 'undefined') {
                            await renderAdminMuralTab(agendamentoId, 'tab-content-mural');
                            contentDiv.setAttribute('data-loaded', 'true'); // Marca como carregado
                        } else {
                            throw new Error('Função renderAdminMuralTab não encontrada (verifique os imports).');
                        }
                    } 
                    
                    else if (tabId === 'documentos') {
                        if (typeof renderAdminDocumentosTab !== 'undefined') {
                            await renderAdminDocumentosTab(agendamentoId, 'tab-content-documentos');
                            contentDiv.setAttribute('data-loaded', 'true');
                        } else {
                            throw new Error('Função renderAdminDocumentosTab não encontrada (verifique os imports).');
                        }
                    }

                } catch (err) {
                    console.error("Erro ao carregar aba:", err);
                    // Mostra o erro na UI em vez de ficar carregando infinito
                    contentDiv.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-8 text-center">
                            <div class="rounded-full bg-red-500/10 p-3 text-red-400 mb-3">
                                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <p class="text-sm text-red-300">Erro ao carregar conteúdo.</p>
                            <p class="text-xs text-slate-500 mt-1 max-w-xs">${err.message}</p>
                        </div>
                    `;
                }
            }
        }
    });
    // 4. Busca Assíncrona do Laudo (Skeleton -> Resultado)
    try {
        // Usa agendamentoId extraído no início
        const laudo = await api.getLaudoByAgendamento(agendamentoId);
        const laudoContainer = document.getElementById('laudo-admin-container');
        
        if (laudoContainer) {
            const isApproved = laudo.aprovado; 
            
            // Definição de estilos baseada no status
            const containerClass = isApproved 
                ? 'border-emerald-500/30 bg-emerald-900/10' 
                : 'border-yellow-500/30 bg-yellow-900/10';
            
            const badgeClass = isApproved
                ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40'
                : 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/40';

            const statusText = isApproved ? 'Laudo Aprovado' : 'Pendente de Análise';

            // Remove pulse e atualiza UI
            laudoContainer.classList.remove('animate-pulse', 'border-dashed');
            laudoContainer.className = `rounded-lg border ${containerClass} p-4 transition-all duration-500`;
            
            laudoContainer.innerHTML = `
                <div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <div class="flex items-center gap-3">
                        <div class="flex h-10 w-10 items-center justify-center rounded-full ${isApproved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}">
                            ${isApproved 
                                ? '<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                                : '<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
                            }
                        </div>
                        <div class="text-left">
                            <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Status Atual</p>
                            <span class="mt-1 inline-block rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset ${badgeClass}">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    <button id="view-laudo-btn" data-laudo-id="${laudo.id}" class="w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 hover:shadow-lg hover:shadow-cyan-500/20 sm:w-auto">
                        Visualizar Laudo
                    </button>
                </div>`;

            // Ação do Botão Ver Laudo
            const btnLaudo = document.getElementById('view-laudo-btn');
            if(btnLaudo) {
                btnLaudo.onclick = (e) => {
                    const id = e.currentTarget.dataset.laudoId;
                    hideModal();
                    window.location.hash = `#laudos?view=${id}`;
                };
            }
        }
    } catch (error) {
        const laudoContainer = document.getElementById('laudo-admin-container');
        if (laudoContainer) {
            laudoContainer.classList.remove('animate-pulse', 'border-dashed');
            
            if (error.message && error.message.includes('404')) {
                // Caso normal: Vistoriador ainda não fez o laudo
                laudoContainer.innerHTML = `
                    <div class="flex items-center justify-center gap-2 text-slate-500">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span class="text-sm">Laudo ainda não iniciado pelo vistoriador.</span>
                    </div>`;
            } else {
                // Caso erro de sistema
                laudoContainer.className = "rounded-lg border border-red-500/30 bg-red-900/10 p-3 text-center";
                laudoContainer.innerHTML = `<p class="text-xs text-red-400">Erro ao verificar status: ${sanitizeHTML(error.message)}</p>`;
            }
        }
    }
}
function handleCancelarAgendamento(event) {
    const modalHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Cancelar Agendamento</h3>
        <p class="text-gray-300 mb-6">Tem certeza que deseja cancelar esta vistoria? O horário voltará a ficar disponível.</p>
        <div class="flex justify-end gap-4">
            <button id="btn-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Não</button>
            <button id="btn-confirm-cancel" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition">Sim, Cancelar</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');
    document.getElementById('btn-cancel').onclick = hideModal;
    document.getElementById('btn-confirm-cancel').onclick = async () => {
        try {
            await api.cancelarVistoria(event.id);
            showAlert('Agendamento cancelado com sucesso!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível cancelar.', 'error');
        }
    };
}

function handleMarcarImprodutiva(event) {
    const modalHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Marcar Vistoria como Improdutiva</h3>
        <form id="form-improdutiva" class="space-y-4">
            <div>
                <label for="motivo_improdutiva" class="block text-sm mb-1">Motivo</label>
                <textarea id="motivo_improdutiva" required class="w-full bg-gray-700 rounded p-2 h-24" placeholder="Descreva o motivo..."></textarea>
            </div>
            <div>
                <label for="valor_cobranca" class="block text-sm mb-1">Valor a ser Cobrado da Imobiliária (R$)</label>
                <input type="number" step="0.01" min="0" id="valor_cobranca" required class="w-full bg-gray-700 rounded p-2" placeholder="Ex: 80.00">
            </div>
            <div id="modal-error" class="text-red-400 text-sm hidden"></div>
            <div class="flex justify-end gap-3 pt-4">
                <button type="button" id="cancel-modal" class="px-4 py-2 bg-gray-600 rounded">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition">Confirmar Improdutiva</button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-modal').onclick = hideModal;
    document.getElementById('form-improdutiva').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const errorDiv = document.getElementById('modal-error');
        btn.disabled = true;
        btn.textContent = 'Confirmando...';
        errorDiv.classList.add('hidden');

        const data = {
            motivo: document.getElementById('motivo_improdutiva').value,
            valor_cobranca: parseFloat(document.getElementById('valor_cobranca').value)
        };

        if (isNaN(data.valor_cobranca)) {
            errorDiv.textContent = 'Por favor, insira um valor de cobrança válido.';
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Confirmar Improdutiva';
            return;
        }

        try {
            await api.markAsImprodutiva(event.id, data);
            showAlert('Vistoria marcada como improdutiva!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            errorDiv.textContent = error.message || 'Não foi possível marcar como improdutiva.';
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Confirmar Improdutiva';
        }
    };
}

function handleGerarComprovante(event) {
    // Garante que funciona mesmo se passar o objeto de dados direto
    const props = event.extendedProps || event;
    const imovel = props.imovel || {};
    const cliente = imovel.cliente || {};
    
    const dataParts = props.data.split('-'); 
    const dataFormatada = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;
    
    const nomeCliente = cliente.nome || 'Cliente';
    const telefoneBruto = cliente.telefone || cliente.celular || '';
    const telefoneLimpo = telefoneBruto.replace(/\D/g, ''); 
    
    const whatsappMessage = `Olá ${nomeCliente}, tudo bem?%0A%0A` +
        `Passando para confirmar o agendamento da sua vistoria:%0A` +
        `🏠 *Imóvel:* ${imovel.cod_imovel || ''} - ${imovel.endereco || ''}%0A` +
        `📅 *Data:* ${dataFormatada}%0A` +
        `⏰ *Horário:* ${props.horario}%0A` +
        `👷 *Vistoriador:* ${props.vistoriador?.nome || 'Equipe'}%0A%0A` +
        `Qualquer dúvida estamos à disposição!`;

    const whatsappLink = telefoneLimpo 
        ? `https://wa.me/55${telefoneLimpo}?text=${whatsappMessage}`
        : `https://wa.me/?text=${whatsappMessage}`; 

    const modalHTML = `
        <div class="text-center">
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-2xl relative overflow-hidden max-w-sm mx-auto">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-green-500"></div>
                <h3 class="text-xl font-bold text-white mb-2 tracking-wide">CONFIRMAÇÃO DE AGENDAMENTO</h3>
                <p class="text-xs text-gray-500 uppercase tracking-widest mb-6">Comprovante Digital</p>

                <div class="space-y-4 text-left bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 text-sm">
                    <div class="flex items-start gap-3">
                        <div class="mt-0.5 text-cyan-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div>
                        <div>
                            <p class="text-gray-400 text-xs uppercase font-bold">Endereço</p>
                            <p class="text-white leading-tight">${sanitizeHTML(imovel.endereco || 'Endereço não informado')}</p>
                            <p class="text-xs text-gray-500 mt-0.5">Cód: ${sanitizeHTML(imovel.cod_imovel || 'N/A')}</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3 border-t border-gray-700/50 pt-3">
                        <div class="mt-0.5 text-cyan-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>
                        <div>
                            <p class="text-gray-400 text-xs uppercase font-bold">Data e Hora</p>
                            <p class="text-white font-mono font-bold text-lg">${dataFormatada} <span class="text-gray-500 text-sm font-normal">às</span> ${props.horario}</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3 border-t border-gray-700/50 pt-3">
                         <div class="mt-0.5 text-cyan-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>
                        <div>
                            <p class="text-gray-400 text-xs uppercase font-bold">Vistoriador Responsável</p>
                            <p class="text-white">${sanitizeHTML(props.vistoriador?.nome || 'A definir')}</p>
                        </div>
                    </div>
                     <div class="flex items-start gap-3 border-t border-gray-700/50 pt-3">
                         <div class="mt-0.5 text-purple-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                        <div class="w-full">
                            <p class="text-gray-400 text-xs uppercase font-bold">Cliente</p>
                            <p class="text-white">${sanitizeHTML(cliente.nome || 'N/A')}</p>
                            <p class="text-xs text-gray-400 truncate w-full">${sanitizeHTML(cliente.email || 'Email não informado')}</p>
                        </div>
                    </div>
                </div>

                <div class="mt-6 flex flex-col gap-3">
                    <a href="${whatsappLink}" target="_blank" class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-green-900/50">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.463 1.065 2.876 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                        Enviar via WhatsApp
                    </a>
                    <button id="btn-close-voucher" class="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-lg transition">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');
    document.getElementById('btn-close-voucher').onclick = hideModal;
}

function handleEditarVistoria(event) {
    const props = event.extendedProps;
    const imovel = props.imovel || {};
    const imobiliaria = imovel.imobiliaria || {}; // Obtém imobiliária

    const modalHTML = `
        <h3 class="text-2xl font-bold text-cyan-300 mb-6">Editar Vistoria Completa</h3>
        <form id="form-edit-vistoria" class="space-y-4">
            
            <fieldset class="border border-gray-600 p-4 rounded-lg">
                <legend class="px-2 text-cyan-300">Dados do Imóvel</legend>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- ADICIONADO: Campo de Imobiliária (ReadOnly) para confirmação visual -->
                    <div class="md:col-span-2">
                        <label class="block text-sm text-gray-400">Imobiliária Responsável</label>
                        <input type="text" class="w-full bg-gray-800 border border-gray-600 text-gray-300 rounded px-3 py-2 mt-1 cursor-not-allowed" value="${sanitizeHTML(imobiliaria.nome || 'Não definida')}" disabled>
                    </div>

                    <div>
                        <label for="cod_imovel" class="block text-sm">Cód. Imóvel</label>
                        <input type="text" id="cod_imovel" class="w-full bg-gray-700 rounded px-3 py-2 mt-1" value="${sanitizeHTML(imovel.cod_imovel || '')}">
                    </div>
                    <div>
                        <label for="endereco" class="block text-sm">Endereço</label>
                        <input type="text" id="endereco" class="w-full bg-gray-700 rounded px-3 py-2 mt-1" value="${sanitizeHTML(imovel.endereco || '')}">
                    </div>
                    <div>
                        <label for="tamanho" class="block text-sm">Tamanho (m²)</label>
                        <input type="number" step="0.01" id="tamanho" class="w-full bg-gray-700 rounded px-3 py-2 mt-1" value="${imovel.tamanho || ''}">
                    </div>
                    <div>
                        <label for="mobiliado" class="block text-sm">Mobília</label>
                        <select id="mobiliado" class="w-full bg-gray-700 rounded px-3 py-2 mt-1">
                            <option value="sem_mobilia" ${imovel.mobiliado === 'sem_mobilia' ? 'selected' : ''}>Sem Mobília</option>
                            <option value="semi_mobiliado" ${imovel.mobiliado === 'semi_mobiliado' ? 'selected' : ''}>Semi Mobiliado</option>
                            <option value="mobiliado" ${imovel.mobiliado === 'mobiliado' ? 'selected' : ''}>Mobiliado</option>
                        </select>
                    </div>
                </div>
            </fieldset>

            <fieldset class="border border-gray-600 p-4 rounded-lg">
                <legend class="px-2 text-cyan-300">Dados da Vistoria</legend>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label for="tipo_vistoria" class="block text-sm">Tipo de Vistoria</label>
                        <select id="tipo_vistoria" class="w-full bg-gray-700 rounded px-3 py-2 mt-1">
                            <option value="ENTRADA" ${props.tipo === 'ENTRADA' ? 'selected' : ''}>Entrada</option>
                            <option value="SAIDA" ${props.tipo === 'SAIDA' ? 'selected' : ''}>Saída</option>
                            <option value="CONFERENCIA" ${props.tipo === 'CONFERENCIA' ? 'selected' : ''}>Conferência</option>
                            <option value="AVERIGUACAO" ${props.tipo === 'AVERIGUACAO' ? 'selected' : ''}>Averiguação</option>
                            <option value="COMPLEMENTO_VISITA" ${props.tipo === 'COMPLEMENTO_VISITA' ? 'selected' : ''}>Complemento/Visita</option>
                        </select>
                    </div>
                    <div>
                        <label for="valor_final_vistoria" class="block text-sm">Valor Vistoria (R$)</label>
                        <input type="number" step="0.01" id="valor_final_vistoria" class="w-full bg-gray-700 rounded px-3 py-2 mt-1" placeholder="Automático" value="${props.valor_final_vistoria || ''}">
                    </div>
                    <div>
                        <label for="valor_vistoriador" class="block text-sm">Valor Vistoriador (R$)</label>
                        <input type="number" step="0.01" id="valor_vistoriador" class="w-full bg-gray-700 rounded px-3 py-2 mt-1" placeholder="Automático" value="${props.valor_vistoriador || ''}">
                    </div>
                </div>
                 <div class="mt-4">
                    <label for="observacao_vistoriador" class="block text-sm">Observação para Vistoriador</label>
                    <textarea id="observacao_vistoriador" rows="2" class="w-full bg-gray-700 rounded px-3 py-2 mt-1">${props.observacao_vistoriador || ''}</textarea>
                </div>
                 <div class="mt-4">
                    <label for="observacao_privada" class="block text-sm">Observação Privada</label>
                    <textarea id="observacao_privada" rows="2" class="w-full bg-gray-700 rounded px-3 py-2 mt-1">${props.observacao_privada || ''}</textarea>
                </div>
                <div class="mt-4 flex items-center">
                    <input type="checkbox" id="recalcular-valores" class="h-4 w-4 rounded bg-gray-600 border-gray-500 text-cyan-500 focus:ring-cyan-500">
                    <label for="recalcular-valores" class="ml-2 block text-sm text-gray-300">Setar valores automaticamente</label>
                </div>
            </fieldset>

            <div class="flex justify-end gap-4 pt-4">
                <button type="button" id="cancel-edit-vistoria" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition">Salvar Alterações</button>
            </div>
        </form>
    `;
    showModal(modalHTML, 'max-w-3xl');

    const recalcularCheckbox = document.getElementById('recalcular-valores');
    const valorVistoriaInput = document.getElementById('valor_final_vistoria');
    const valorVistoriadorInput = document.getElementById('valor_vistoriador');

    recalcularCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        valorVistoriaInput.disabled = isChecked;
        valorVistoriadorInput.disabled = isChecked;
        if (isChecked) {
            valorVistoriaInput.value = ''; 
            valorVistoriadorInput.value = '';
            valorVistoriaInput.placeholder = 'Automático';
            valorVistoriadorInput.placeholder = 'Automático';
        }
    });

    document.getElementById('cancel-edit-vistoria').addEventListener('click', hideModal);

    document.getElementById('form-edit-vistoria').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            cod_imovel: document.getElementById('cod_imovel').value,
            endereco: document.getElementById('endereco').value,
            tamanho: parseFloat(document.getElementById('tamanho').value),
            mobiliado: document.getElementById('mobiliado').value,
            tipo_vistoria: document.getElementById('tipo_vistoria').value,
            observacao_privada: document.getElementById('observacao_privada').value,
            observacao_vistoriador: document.getElementById('observacao_vistoriador').value
        };

        if (!recalcularCheckbox.checked) {
            data.valor_final_vistoria = parseFloat(valorVistoriaInput.value) || null;
            data.valor_vistoriador = parseFloat(valorVistoriadorInput.value) || null;
        }
        
        try {
            await api.updateVistoria(event.id, data);
            showAlert('Vistoria atualizada com sucesso!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível atualizar a vistoria.', 'error');
        }
    };
}

function enterReagendamentoMode(event) {
    reagendamentoState = { active: true, event: event };
    hideModal();
    showAlert('MODO REAGENDAMENTO: Selecione um novo horário livre no calendário.', 'info');
    
    const banner = document.createElement('div');
    banner.id = 'reagendamento-banner';
    banner.className = 'bg-purple-600 text-white text-center p-2 font-bold sticky top-0 z-30 text-sm sm:text-base';
    banner.innerHTML = `
        Reagendando vistoria de ${sanitizeHTML(event.extendedProps.imovel?.cod_imovel || 'Vistoria')}. 
        Selecione um novo horário ou <button id="cancel-reagendamento" class="underline hover:text-purple-200">cancele</button>.
    `;
    document.getElementById('calendar-container').prepend(banner);
    document.getElementById('cancel-reagendamento').onclick = exitReagendamentoMode;

    calendar.refetchEvents(); // Força a re-renderização para aplicar o estilo
}

function exitReagendamentoMode() {
    reagendamentoState = { active: false, event: null };
    document.getElementById('reagendamento-banner')?.remove();
    calendar.refetchEvents();
}

function handleReagendamentoSelect(targetEvent) {
    if (targetEvent.extendedProps.tipo !== 'LIVRE') {
        showAlert('Por favor, selecione um horário livre (verde).', 'error');
        return;
    }

    const originalEvent = reagendamentoState.event;
    const modalHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Confirmar Reagendamento</h3>
        <p class="text-gray-300 mb-2"><strong>De:</strong> ${originalEvent.start.toLocaleString('pt-BR')}</p>
        <p class="text-gray-300 mb-6"><strong>Para:</strong> ${targetEvent.start.toLocaleString('pt-BR')} com ${sanitizeHTML(targetEvent.extendedProps.vistoriador?.nome || 'N/A')}</p>
        <div class="flex justify-end gap-4">
            <button id="btn-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="btn-confirm" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition">Confirmar</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');
    document.getElementById('btn-cancel').onclick = hideModal;
    document.getElementById('btn-confirm').onclick = async () => {
        try {
            await api.reagendarVistoria(originalEvent.id, targetEvent.id);
            showAlert('Vistoria reagendada com sucesso!');
            hideModal();
            exitReagendamentoMode();
        } catch (error) {
            showAlert(error.message || 'Não foi possível reagendar.', 'error');
        }
    };
}

/**
 * Exibe o modal com o resultado da análise da IA.
 * @param {string} message - A mensagem retornada pela IA.
 */
function showIAModal(message) {
    showModal(`
        <div class="text-left">
            <h3 class="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Análise Operacional IA
            </h3>
            <div class="bg-gray-700/50 p-4 rounded-lg border-l-4 border-purple-500">
                <p class="text-gray-200 whitespace-pre-wrap leading-relaxed">${sanitizeHTML(message)}</p>
            </div>
            <div class="mt-4 flex justify-between items-center text-xs text-gray-500">
                 <span>Resultados em cache por 2 horas.</span>
                 <button id="btn-close-ia" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-white transition">Fechar</button>
            </div>
        </div>
    `, 'max-w-2xl');
    
    document.getElementById('btn-close-ia').onclick = hideModal;
}

/**
 * Atualiza as opções do select de filtro de vistoriadores.
 * Adiciona novos vistoriadores encontrados nos eventos sem duplicar.
 * @param {Array} events - Lista de eventos carregados.
 */
function updateVistoriadorSelect(events) {
    const select = document.getElementById('filter-vistoriador');
    if (!select) return;

    let hasNew = false;
    events.forEach(e => {
        if (e.vistoriador && e.vistoriador.id && e.vistoriador.nome) {
            if (!knownVistoriadores.has(e.vistoriador.id)) {
                knownVistoriadores.set(e.vistoriador.id, e.vistoriador.nome);
                hasNew = true;
            }
        }
    });

    if (hasNew) {
        // Reconstrói as opções mantendo a seleção atual
        const currentVal = select.value;
        let options = '<option value="all">Todos os Vistoriadores</option>';
        
        knownVistoriadores.forEach((nome, id) => {
            options += `<option value="${id}">${sanitizeHTML(nome)}</option>`;
        });

        select.innerHTML = options;
        select.value = currentVal; // Restaura seleção
    }
}

/**
 * Atualiza as opções do select de filtro de Imobiliárias.
 * Adiciona novas imobiliárias encontradas nos eventos sem duplicar.
 * @param {Array} events - Lista de eventos carregados.
 */
function updateImobiliariaSelect(events) {
    const select = document.getElementById('filter-imobiliaria');
    if (!select) return;

    let hasNew = false;
    events.forEach(e => {
        if (e.imovel && e.imovel.imobiliaria && e.imovel.imobiliaria.id && e.imovel.imobiliaria.nome) {
            if (!knownImobiliarias.has(e.imovel.imobiliaria.id)) {
                knownImobiliarias.set(e.imovel.imobiliaria.id, e.imovel.imobiliaria.nome);
                hasNew = true;
            }
        }
    });

    if (hasNew) {
        // Reconstrói as opções mantendo a seleção atual
        const currentVal = select.value;
        let options = '<option value="all">Todas as Imobiliárias</option>';
        
        knownImobiliarias.forEach((nome, id) => {
            options += `<option value="${id}">${sanitizeHTML(nome)}</option>`;
        });

        select.innerHTML = options;
        select.value = currentVal; // Restaura seleção
    }
}

export async function initAgenda() {
    const pageHTML = `
        <div class="flex flex-col mb-8 gap-4">
            <h1 class="text-3xl font-bold text-cyan-300">Agenda de Vistorias</h1>
            
            <div class="flex flex-wrap gap-3 w-full justify-between items-center bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                
                <!-- Grupo de Filtros Esquerda -->
                <div class="flex flex-wrap gap-3 w-full lg:w-auto">
                    <!-- Busca por Código -->
                    <div class="relative w-full sm:w-auto">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input type="text" id="filter-search-code" placeholder="Buscar cód. imóvel..." class="w-full sm:w-48 bg-gray-700 text-white border border-gray-600 rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm placeholder-gray-400">
                    </div>

                    <!-- Filtro de Vistoriador -->
                    <select id="filter-vistoriador" class="w-full sm:w-auto bg-gray-700 text-white border border-gray-600 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm">
                        <option value="all">Todos os Vistoriadores</option>
                    </select>

                    <!-- Filtro de Imobiliária -->
                    <select id="filter-imobiliaria" class="w-full sm:w-auto bg-gray-700 text-white border border-gray-600 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm">
                        <option value="all">Todas as Imobiliárias</option>
                    </select>
                </div>

                <!-- Grupo de Ações Direita -->
                <div class="flex flex-wrap gap-3 w-full lg:w-auto justify-end mt-2 lg:mt-0">
                    <button id="btn-analise-ia" class="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Análise IA
                    </button>
                    <button id="btn-gerar-agenda" class="w-full sm:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Gerar Agenda
                    </button>
                </div>
            </div>
        </div>
        <div id="calendar-container" class="bg-gray-800/50 rounded-xl neon-border p-2 sm:p-4 relative">
            <div id="calendar"></div>
        </div>
    `;
    renderPageContent(pageHTML);

    // Listener para o filtro de Vistoriador
    document.getElementById('filter-vistoriador').addEventListener('change', (e) => {
        currentVistoriadorFilter = e.target.value;
        if (calendar) calendar.refetchEvents();
    });

    // Listener para o filtro de Imobiliária
    document.getElementById('filter-imobiliaria').addEventListener('change', (e) => {
        currentImobiliariaFilter = e.target.value;
        if (calendar) calendar.refetchEvents();
    });

    // Listener para a Busca por Código (com pequeno debounce se necessário, mas input direto é ok aqui)
    document.getElementById('filter-search-code').addEventListener('input', (e) => {
        currentSearchQuery = e.target.value.trim().toLowerCase();
        if (calendar) calendar.refetchEvents();
    });

    document.getElementById('btn-analise-ia').addEventListener('click', async (e) => {
        const btn = e.currentTarget;

        // VERIFICAÇÃO DE CACHE
        const now = Date.now();
        if (iaAnalysisCache && (now - iaAnalysisCache.timestamp < IA_CACHE_DURATION)) {
            console.log("Usando cache da análise IA");
            showIAModal(iaAnalysisCache.message);
            return;
        }

        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analisando...
        `;

        try {
            // Nota: Certifique-se de que o método 'analyzeScheduleWithAI' existe no seu api.js
            const result = await api.analyzeScheduleWithAI();
            
            // ATUALIZA O CACHE
            iaAnalysisCache = {
                message: result.message,
                timestamp: Date.now()
            };

            showIAModal(result.message);

        } catch (error) {
            const errorMsg = error.message && error.message.includes('not a function') 
                ? 'Erro: Método api.analyzeScheduleWithAI não encontrado. Atualize o arquivo api.js.' 
                : (error.message || 'Erro ao consultar IA.');
            showAlert(errorMsg, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    });

    document.getElementById('btn-gerar-agenda').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Gerando...
        `;

        try {
            const result = await api.generateAgenda();
            showAlert(result.message || 'Agenda gerada com sucesso!', 'success');
            if (calendar) {
                calendar.refetchEvents();
            }
        } catch (error) {
            showAlert(error.message || 'Erro ao gerar agenda.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    });

    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
            list: 'Lista'
        },
        listDayFormat: (info) => {
            const date = info.date.marker;
            const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
            const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
            
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();

            return `${capitalizedWeekday} (${day}/${month}/${year})`;
        },
        slotDuration: '00:15:00',
        slotLabelInterval: '01:00:00',
        slotMinTime: '07:00:00',
        slotMaxTime: '20:00:00',
        expandRows: true,
        events: async (fetchInfo, successCallback, failureCallback) => {
            try {
                const start = fetchInfo.startStr.split('T')[0];
                const end = fetchInfo.endStr.split('T')[0];
                const rawEvents = await api.getAgendaEvents(start, end);
                
                // Atualiza as opções dos filtros com base nos dados recebidos
                updateVistoriadorSelect(rawEvents);
                updateImobiliariaSelect(rawEvents); // Atualiza select de imobiliárias

                // Aplica TODOS os filtros selecionados pelo usuário no Client-Side
                const filteredEvents = rawEvents.filter(e => {
                    // 1. Filtro de Vistoriador
                    if (currentVistoriadorFilter !== 'all') {
                        // Se filtro ativo, verifica se ID bate.
                        if (!e.vistoriador || String(e.vistoriador.id) !== String(currentVistoriadorFilter)) {
                            return false;
                        }
                    }

                    // 2. Filtro de Imobiliária
                    if (currentImobiliariaFilter !== 'all') {
                        // Eventos LIVRE ou FECHADO geralmente não têm imobiliária, então são ocultados ao filtrar
                        if (!e.imovel || !e.imovel.imobiliaria || String(e.imovel.imobiliaria.id) !== String(currentImobiliariaFilter)) {
                            return false;
                        }
                    }

                    // 3. Filtro de Busca (Código do Imóvel - LIKE)
                    if (currentSearchQuery) {
                        const codImovel = (e.imovel?.cod_imovel || '').toLowerCase();
                        // Se não tiver código (ex: LIVRE/FECHADO) ou código não contém o termo, oculta
                        if (!codImovel.includes(currentSearchQuery)) {
                            return false;
                        }
                    }

                    return true;
                });

                successCallback(filteredEvents.map(e => ({
                    id: e.id,
                    title: e.tipo === 'LIVRE' ? 'Livre' : (e.imovel?.cod_imovel || e.tipo),
                    start: `${e.data}T${e.horario}`,
                    extendedProps: e,
                })));
            } catch (error) {
                showAlert('Erro ao carregar eventos da agenda.', 'error');
                failureCallback(error);
            }
        },
        eventContent: renderEventContent,
        eventClick: handleEventClick,
        eventClassNames: (arg) => {
            let classes = [];
            const props = arg.event.extendedProps;

            if (reagendamentoState.active) {
                classes.push(props.tipo === 'LIVRE' ? 'event-reagendamento-disponivel' : 'event-reagendamento-indisponivel');
            }

            switch(props.tipo) {
                case 'LIVRE':
                    classes.push('event-livre');
                    break;
                case 'FECHADO':
                    classes.push('event-fechado');
                    break;
                default: // Ocupado
                    classes.push('event-ocupado');
                    break;
            }
            return classes.join(' ');
        }
    });

    const style = document.createElement('style');
    style.innerHTML = `
        .event-reagendamento-disponivel { cursor: pointer; background-color: #a78bfa !important; border-color: #8b5cf6 !important; }
        .event-reagendamento-indisponivel { opacity: 0.3; filter: grayscale(1); }
        .action-btn { padding: 0.5rem 1rem; color: white; font-weight: bold; border-radius: 0.5rem; transition: background-color 0.2s; }
        
        /* Novo Design dos Eventos */
        .fc-event {
            border-width: 1px !important;
            border-left-width: 4px !important;
            padding: 0 !important; /* Reset padding to allow internal control */
            border-radius: 4px;
        }
        .event-livre {
            background-color: rgba(16, 185, 129, 0.1) !important;
            border-color: #10B981 !important;
        }
        .event-fechado {
            background-color: rgba(245, 158, 11, 0.1) !important;
            border-color: #F59E0B !important;
        }
        .event-ocupado {
            background-color: rgba(6, 182, 212, 0.1) !important;
            border-color: #06B6D4 !important;
        }
        .fc-daygrid-event-dot {
            display: none; /* Oculta o ponto padrão na visualização de mês */
        }
        .fc-event-main {
            padding: 2px;
        }

        /* MODIFICAÇÃO: Estilos para a Visualização em Lista */
        .fc .fc-list-day-cushion {
            background-color: #374151; /* Cor de fundo mais escura e sólida */
            padding: 8px 14px;
        }
        .fc .fc-list-day-text, .fc .fc-list-day-side-text {
            color: #e5e7eb;
            font-weight: 600;
        }
        .fc .fc-list-event:hover td {
            background-color: rgba(6, 182, 212, 0.2) !important;
        }
        .fc .fc-list-table {
            border-bottom: none;
        }

        /* --- INÍCIO DA PARTE 2: Estilos para Abas e Scroll --- */
        .tab-btn {
            padding: 0.5rem 1rem; /* p-2 px-4 */
            color: #9ca3af; /* text-gray-400 */
            border-bottom: 2px solid transparent;
            font-weight: 500; /* medium */
            white-space: nowrap;
            transition: color 0.2s, border-color 0.2s;
        }
        .tab-btn.active {
            color: #06b6d4; /* text-cyan-500 */
            border-bottom-color: #06b6d4; /* border-cyan-500 */
            font-weight: 600; /* semibold */
        }
        .tab-btn:hover {
            color: #d1d5db; /* text-gray-300 */
        }
        .tab-content {
            animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        /* Scrollbar customizado para chat/docs */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #06b6d4; border-radius: 3px; }
        /* --- FIM DA PARTE 2: Estilos --- */
    `;
    document.head.appendChild(style);

    calendar.render();
}