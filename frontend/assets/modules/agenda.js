// /assets/modules/agenda.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';
import { startAgendamentoWizard } from './agendamento-wizard.js';

// ============================================================================
// ESTADOS GLOBAIS
// ============================================================================
let calendar;
let reagendamentoState = { active: false, event: null };
let pendenteState = { active: false, solicitacao: null }; 
let currentVistoriadorFilter = 'all'; 
let knownVistoriadores = new Map(); 
let currentImobiliariaFilter = 'all'; 
let knownImobiliarias = new Map(); 
let currentSearchQuery = ''; 
let iaAnalysisCache = null;
const IA_CACHE_DURATION = 2 * 60 * 60 * 1000; 

// ============================================================================
// ESTILOS GLOBAIS (INJETADOS NA INICIALIZAÇÃO)
// ============================================================================
const injectModernStyles = () => {
    if (document.getElementById('agenda-modern-styles')) return;
    const style = document.createElement('style');
    style.id = 'agenda-modern-styles';
    style.innerHTML = `
        /* Animações Modernas */
        .anim-fade-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .anim-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .anim-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

        /* Estilos de Abas Modernas (Segmented Control) */
        .tab-btn {
            color: #94a3b8;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tab-btn:hover:not(.active) { color: #f1f5f9; background: rgba(255,255,255,0.05); }
        .tab-btn.active {
            background-color: #1e293b; 
            color: #22d3ee; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid rgba(34, 211, 238, 0.2);
        }

        /* FullCalendar Premium Overrides */
        .fc-theme-standard td, .fc-theme-standard th { border-color: rgba(51, 65, 85, 0.5) !important; }
        .fc-theme-standard .fc-scrollgrid { border-color: transparent !important; }
        .fc .fc-toolbar-title { font-weight: 900; color: #f8fafc; letter-spacing: -0.025em; font-size: 1.5rem !important;}
        .fc .fc-button-primary { 
            background-color: rgba(30, 41, 59, 0.8); border: 1px solid rgba(51, 65, 85, 0.8); text-transform: capitalize; font-weight: 600;
            backdrop-filter: blur(4px); transition: all 0.2s ease;
        }
        .fc .fc-button-primary:hover { background-color: #334155; border-color: #475569; box-shadow: 0 0 10px rgba(255,255,255,0.05);}
        .fc .fc-button-primary:not(:disabled).fc-button-active { background-color: #0891b2; border-color: #06b6d4; box-shadow: 0 0 15px rgba(6,182,212,0.4);}
        .fc .fc-daygrid-day.fc-day-today { background-color: rgba(6, 182, 212, 0.08) !important; }
        .fc-col-header-cell-cushion { color: #94a3b8; font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; padding: 12px 0 !important;}
        .fc-daygrid-day-number { color: #cbd5e1; font-weight: 600; padding: 8px !important; }
        
        /* Design de Eventos Glassmorphism */
        .fc-event {
            border: none !important;
            background: transparent !important;
            padding: 3px !important;
        }
        .event-card-inner {
            border-radius: 8px;
            backdrop-filter: blur(8px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid transparent;
        }
        .fc-event:hover .event-card-inner { transform: translateY(-2px); filter: brightness(1.2); }
        
        .event-livre .event-card-inner { background: rgba(16, 185, 129, 0.15); border-color: rgba(16,185,129,0.3); border-left: 4px solid #10b981;}
        .event-fechado .event-card-inner { background: rgba(245, 158, 11, 0.15); border-color: rgba(245,158,11,0.3); border-left: 4px solid #f59e0b;}
        .event-ocupado .event-card-inner { background: rgba(6, 182, 212, 0.15); border-color: rgba(6,182,212,0.3); border-left: 4px solid #06b6d4;}
        
        /* Modos Especiais com Glow */
        .event-reagendamento-disponivel .event-card-inner { 
            background: rgba(16, 185, 129, 0.2) !important; border-left-color: #10b981 !important; 
            cursor: pointer; box-shadow: 0 0 15px rgba(16,185,129,0.3);
            animation: pulse-glow-green 2s infinite;
        }
        .event-reagendamento-indisponivel { opacity: 0.2; filter: grayscale(1); pointer-events: none; }
        
        @keyframes pulse-glow-green {
            0%, 100% { box-shadow: 0 0 5px rgba(16,185,129, 0.2); border-color: rgba(16,185,129, 0.3); }
            50% { box-shadow: 0 0 20px rgba(16,185,129, 0.6); border-color: rgba(16,185,129, 0.8); }
        }

        /* Floating Banners Premium */
        .floating-banner {
            position: absolute; top: 1.5rem; left: 50%; transform: translateX(-50%);
            z-index: 50; padding: 0.75rem 1.5rem; border-radius: 9999px;
            box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(12px);
            display: flex; align-items: center; gap: 1rem;
            animation: slideDownFade 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideDownFade { from { opacity: 0; transform: translate(-50%, -30px); } to { opacity: 1; transform: translate(-50%, 0); } }

        /* Custom Scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(56, 189, 248, 0.8); }
    `;
    document.head.appendChild(style);
};

// ============================================================================
// HELPERS E ABAS (MURAL E DOCUMENTOS)
// ============================================================================

async function renderAdminMuralTab(agendaId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8">
            <svg class="w-8 h-8 text-cyan-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p class="text-sm text-slate-400">Carregando mensagens...</p>
        </div>`;
    
    try {
        const data = await api.getComentariosVistoria(agendaId);
        const remetente = "admin"; 
        
        const comentariosHTML = data.comentarios.map(c => `
            <div class="p-3 rounded-xl shadow-sm anim-slide-up ${c.remetente === remetente ? 'bg-gradient-to-br from-cyan-900/60 to-cyan-800/40 ml-auto border border-cyan-500/20' : 'bg-slate-800/60 mr-auto border border-slate-700'}" style="max-width: 85%;">
                <p class="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">${sanitizeHTML(c.conteudo)}</p>
                <div class="flex items-center justify-end gap-1 mt-2 text-[10px] text-slate-400 font-medium">
                    <span class="capitalize">${sanitizeHTML(c.remetente)}</span>
                    <span>•</span>
                    <span>${new Date(c.created_at).toLocaleString('pt-BR', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'})}</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="space-y-3 max-h-72 overflow-y-auto mb-4 p-3 bg-slate-900/40 rounded-xl border border-slate-800 custom-scrollbar">
                ${comentariosHTML || '<div class="flex flex-col items-center justify-center h-full py-8 text-slate-500"><svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg><p>Nenhuma mensagem no mural ainda.</p></div>'}
            </div>
            <div class="flex flex-col sm:flex-row gap-3">
                <textarea id="mural-textarea" rows="2" class="w-full p-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all resize-none placeholder-slate-500" placeholder="Escreva uma mensagem interna..."></textarea>
                <button id="mural-submit-btn" class="sm:w-auto w-full py-2 px-6 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2 transform hover:-translate-y-0.5">
                    Enviar
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                </button>
            </div>
            <div id="mural-error" class="text-red-400 text-xs mt-2 hidden text-center font-medium"></div>
        `;

        container.querySelector('#mural-submit-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const textarea = container.querySelector('#mural-textarea');
            const errorDiv = container.querySelector('#mural-error');
            const comentario = textarea.value.trim();
            
            errorDiv.classList.add('hidden');
            if (comentario) {
                const originalContent = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
                try {
                    await api.postComentarioVistoria(agendaId, comentario);
                    renderAdminMuralTab(agendaId, containerId); 
                } catch (e) { 
                    errorDiv.textContent = e.message;
                    errorDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                }
            }
        });
    } catch (e) { 
        container.innerHTML = `<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-red-400 text-sm"><p>${e.message}</p></div>`; 
    }
}

async function renderAdminDocumentosTab(agendaId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8">
            <svg class="w-8 h-8 text-cyan-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p class="text-sm text-slate-400">Carregando documentos...</p>
        </div>`;
    
    try {
        const data = await api.getDocumentosVistoria(agendaId);
        
        const documentosHTML = data.documentos.map(d => `
            <div class="flex justify-between items-center p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl hover:bg-slate-800/80 hover:border-cyan-500/30 transition-all anim-slide-up group">
                <a href="${d.link}" target="_blank" class="flex items-center text-cyan-400 hover:text-cyan-300 truncate text-sm font-medium" title="${sanitizeHTML(d.file_path || d.nome)}">
                    <div class="p-2 bg-cyan-900/30 rounded-lg mr-3 group-hover:bg-cyan-500/20 transition-colors">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    </div>
                    ${sanitizeHTML(d.file_path || d.nome)}
                </a>
                <button class="delete-doc-btn p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" data-doc-id="${d.id}" aria-label="Deletar">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="space-y-2 max-h-64 overflow-y-auto mb-5 p-1 custom-scrollbar">
                ${documentosHTML || '<div class="flex flex-col items-center justify-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-xl"><svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg><p class="text-sm">Nenhum documento anexado.</p></div>'}
            </div>
            <form id="doc-upload-form" class="flex flex-col sm:flex-row gap-3 items-center bg-slate-800/30 p-3 rounded-xl border border-slate-700/50">
                <div class="flex-grow w-full relative">
                    <input type="file" id="file-upload" name="file" required class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                    <div class="w-full flex items-center justify-between px-4 py-2 border border-slate-600 border-dashed rounded-lg text-sm text-slate-400 bg-slate-900/50 hover:bg-slate-800 transition-colors pointer-events-none">
                        <span id="file-name-display" class="truncate mr-2">Selecione um arquivo...</span>
                        <svg class="w-5 h-5 text-cyan-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    </div>
                </div>
                <input type="hidden" name="agendamento_id" value="${agendaId}">
                <button type="submit" class="w-full sm:w-auto py-2 px-6 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-lg hover:shadow-cyan-500/20 transform hover:-translate-y-0.5">Anexar</button>
            </form>
            <div id="doc-error" class="text-red-400 text-xs mt-2 hidden text-center font-medium"></div>
        `;

        const fileInput = container.querySelector('#file-upload');
        const fileDisplay = container.querySelector('#file-name-display');
        fileInput.addEventListener('change', (e) => {
            fileDisplay.textContent = e.target.files[0] ? e.target.files[0].name : 'Selecione um arquivo...';
            fileDisplay.classList.add('text-slate-200');
        });

        container.querySelector('#doc-upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const btn = form.querySelector('button[type="submit"]');
            const input = form.querySelector('input[type="file"]');
            const errorDiv = container.querySelector('#doc-error');
            
            errorDiv.classList.add('hidden');
            if (input.files.length > 0) {
                const formData = new FormData(form);
                const origText = btn.textContent;
                btn.disabled = true;
                btn.innerHTML = '<svg class="w-5 h-5 animate-spin mx-auto" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
                try {
                    await api.postDocumentoVistoria(formData);
                    renderAdminDocumentosTab(agendaId, containerId); 
                } catch (e) { 
                    errorDiv.textContent = e.message;
                    errorDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = origText;
                }
            } else {
                errorDiv.textContent = 'Por favor, selecione um arquivo.';
                errorDiv.classList.remove('hidden');
            }
        });

        container.querySelectorAll('.delete-doc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.dataset.docId;
                showModal(`
                    <div class="text-center anim-scale-in">
                        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-500/20 mb-4">
                            <svg class="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-2">Excluir Documento?</h2>
                        <p class="text-slate-400 mb-6">Esta ação não poderá ser desfeita. O arquivo será removido permanentemente.</p>
                        <div id="modal-error" class="text-red-400 text-sm hidden mb-4 bg-red-500/10 p-2 rounded"></div>
                        <div class="flex justify-center gap-3">
                            <button id="btn-cancel" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors">Cancelar</button>
                            <button id="btn-confirm" class="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-red-500/30 transform hover:-translate-y-0.5">Excluir</button>
                        </div>
                    </div>
                `, 'max-w-md bg-slate-900/95 backdrop-blur-xl border border-slate-700/60');

                document.getElementById('btn-cancel').onclick = hideModal;
                document.getElementById('btn-confirm').onclick = async () => {
                    const confirmBtn = document.getElementById('btn-confirm');
                    confirmBtn.disabled = true;
                    confirmBtn.innerHTML = '<svg class="w-5 h-5 animate-spin mx-auto" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
                    try {
                        await api.deleteDocumentoVistoria(docId);
                        showAlert('Documento deletado com sucesso.', 'success');
                        hideModal();
                        renderAdminDocumentosTab(agendaId, containerId); 
                    } catch (e) {
                        document.getElementById('modal-error').textContent = e.message;
                        document.getElementById('modal-error').classList.remove('hidden');
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = 'Excluir';
                    }
                };
            });
        });

    } catch (e) { 
        container.innerHTML = `<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-red-400 text-sm"><p>${e.message}</p></div>`; 
    }
}

// ============================================================================
// RENDERIZAÇÃO DO CALENDÁRIO
// ============================================================================

function renderEventContent(eventInfo) {
    const props = eventInfo.event.extendedProps;
    let iconHtml, title, subtitle, textColorClass;

    const isListView = eventInfo.view.type.includes('list');

    if (props.tipo === 'LIVRE') {
        textColorClass = 'text-emerald-400';
        iconHtml = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
        title = isListView ? 'Horário Livre' : eventInfo.timeText;
        subtitle = props.vistoriador?.nome.split(' ')[0] || 'Vistoriador';
    } else if (props.tipo === 'FECHADO') {
        textColorClass = 'text-amber-400';
        iconHtml = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>`;
        title = isListView ? 'Horário Fechado' : eventInfo.timeText;
        subtitle = props.motivo_fechamento || 'Fechado';
    } else { // Ocupado
        textColorClass = 'text-cyan-400';
        iconHtml = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>`;
        title = isListView ? `CT ${props.imovel?.cod_imovel || 'Vistoria'}` : eventInfo.timeText;
        subtitle = props.imovel ? `CT ${props.imovel?.cod_imovel}` : 'Ocupado';
    }

    return {
        html: `
            <div class="event-card-inner w-full h-full flex flex-col justify-center px-2 py-1.5 relative z-10 overflow-hidden min-h-[32px]">
                <div class="flex items-center gap-1.5 leading-none">
                    <span class="${textColorClass} flex-shrink-0 drop-shadow-md">${iconHtml}</span>
                    <span class="fc-event-title font-bold text-slate-100 text-[11px] tracking-wide truncate">${title}</span>
                </div>
                ${!isListView && subtitle ? `<div class="text-[10px] text-slate-400 truncate opacity-90 mt-1 font-medium leading-tight">${sanitizeHTML(subtitle)}</div>` : ''}
            </div>
        `
    };
}

// ============================================================================
// LÓGICA DE MODOS (PENDENTE, REAGENDAMENTO, CLIQUE)
// ============================================================================

function handleEventClick(clickInfo) {
    const event = clickInfo.event;
    const props = event.extendedProps;

    if (pendenteState.active) {
        handlePendenteSelect(event);
        return;
    }

    if (reagendamentoState.active) {
        handleReagendamentoSelect(event);
        return;
    }

    if (props.tipo === 'LIVRE') {
        const modalHTML = `
            <div class="text-center anim-scale-in">
                <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 mb-5 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                    <svg class="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                </div>
                <h3 class="text-2xl font-black text-white mb-2 tracking-tight">Horário Disponível</h3>
                <div class="bg-slate-800/50 rounded-xl p-4 inline-block mb-6 border border-slate-700/50 shadow-inner">
                    <p class="text-sm text-slate-300">
                        <span class="text-slate-500 font-bold uppercase tracking-wider text-[10px] block mb-1">Vistoriador</span>
                        <span class="block font-medium mb-3 text-white">${sanitizeHTML(props.vistoriador?.nome || 'N/A')}</span>
                        
                        <span class="text-slate-500 font-bold uppercase tracking-wider text-[10px] block mb-1">Data e Hora</span>
                        <span class="block font-medium text-emerald-400">${event.start.toLocaleDateString('pt-BR')} às ${event.start.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>
                    </p>
                </div>
                <div class="flex flex-col sm:flex-row justify-center gap-3">
                    <button id="btn-iniciar-agendamento" class="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transform hover:-translate-y-1">Iniciar Agendamento</button>
                    <button id="btn-fechar-horario" class="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-bold rounded-xl transition-all border border-slate-700 hover:border-amber-500/30">Fechar Horário</button>
                </div>
            </div>
        `;
        showModal(modalHTML, 'max-w-md bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');

        document.getElementById('btn-iniciar-agendamento').onclick = () => {
            hideModal();
            startAgendamentoWizard(event, calendar, (novoAgendamento) => {
                const mockEvent = { extendedProps: novoAgendamento, start: new Date(`${novoAgendamento.data}T${novoAgendamento.horario}`) };
                handleGerarComprovante(mockEvent); 
            });
        };
        document.getElementById('btn-fechar-horario').onclick = () => handleFecharHorario(event.id);

    } else if (props.tipo === 'FECHADO') {
        renderConfirmReabrirModal(event.id, event);
    } else {
        showAdminVistoriaModal(event);
    }
}

function enterPendenteMode(solicitacao) {
    pendenteState = { active: true, solicitacao: solicitacao };
    
    const banner = document.createElement('div');
    banner.id = 'pendente-banner';
    banner.className = 'floating-banner bg-slate-900/90 border border-cyan-500/50 text-white shadow-[0_0_30px_rgba(6,182,212,0.3)]';
    banner.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="relative flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-lg bg-cyan-400 opacity-30"></span>
                <svg class="h-4 w-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <div>
                <p class="text-[10px] uppercase font-bold text-cyan-400 tracking-widest leading-none mb-1">Modo Alocação</p>
                <p class="font-medium text-sm sm:text-base leading-none">Clique em um horário <span class="text-emerald-400 font-bold">LIVRE</span> para a CT ${sanitizeHTML(solicitacao.imovel.cod_imovel)}</p>
            </div>
            <div class="h-8 w-px bg-slate-700/50 mx-2"></div>
            <button id="cancel-pendente-mode" class="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-xl transition-all font-bold text-slate-300 hover:text-white">Cancelar</button>
        </div>
    `;
    
    document.getElementById('calendar-container').prepend(banner);
    document.getElementById('cancel-pendente-mode').onclick = exitPendenteMode;

    if (calendar) calendar.refetchEvents(); 
}

function exitPendenteMode() {
    pendenteState = { active: false, solicitacao: null };
    const banner = document.getElementById('pendente-banner');
    if(banner) {
        banner.style.animation = 'slideDownFade 0.3s reverse forwards';
        setTimeout(() => banner.remove(), 300);
    }
    // LIMPEZA PREVENTIVA DE SEGURANÇA (Ajuste Obrigatório 2)
    sessionStorage.removeItem('agendamentoPendenteState');
    
    if (calendar) calendar.refetchEvents();
}

function handlePendenteSelect(targetEvent) {
    if (targetEvent.extendedProps.tipo !== 'LIVRE') {
        showAlert('Por favor, selecione um horário livre (verde) para alocar esta vistoria.', 'error');
        return;
    }
    
    const solicitacao = pendenteState.solicitacao;
    
    // INJETANDO FLAG EXPLÍCITA PARA O WIZARD SABER QUE É SOLICITAÇÃO EXTERNA (Ajuste Obrigatório 1)
    solicitacao.is_external = true; 
    
    startAgendamentoWizard(targetEvent, calendar, async (novoAgendamento) => {
        try {
            await api.marcarSolicitacaoAgendada(solicitacao.id, novoAgendamento.id);
            showAlert('Vistoria alocada e confirmada com sucesso!', 'success');
            exitPendenteMode();
            const mockEvent = { extendedProps: novoAgendamento, start: new Date(`${novoAgendamento.data}T${novoAgendamento.horario}`) };
            handleGerarComprovante(mockEvent);
        } catch (error) {
            showAlert('Erro ao vincular solicitação externa ao horário: ' + error.message, 'error');
            exitPendenteMode();
        }
    }, solicitacao); 
}

function enterReagendamentoMode(event) {
    reagendamentoState = { active: true, event: event };
    hideModal();
    
    const banner = document.createElement('div');
    banner.id = 'reagendamento-banner';
    banner.className = 'floating-banner bg-slate-900/90 border border-purple-500/50 text-white shadow-[0_0_30px_rgba(168,85,247,0.3)]';
    banner.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="relative flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-lg bg-purple-400 opacity-30"></span>
                <svg class="h-4 w-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <div>
                <p class="text-[10px] uppercase font-bold text-purple-400 tracking-widest leading-none mb-1">Modo Reagendamento</p>
                <p class="font-medium text-sm sm:text-base leading-none">Selecione o novo horário <span class="text-emerald-400 font-bold">LIVRE</span> para <strong>CT ${sanitizeHTML(event.extendedProps.imovel?.cod_imovel || 'Vistoria')}</strong></p>
            </div>
            <div class="h-8 w-px bg-slate-700/50 mx-2"></div>
            <button id="cancel-reagendamento" class="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-xl transition-all font-bold text-slate-300 hover:text-white">Cancelar</button>
        </div>
    `;
    document.getElementById('calendar-container').prepend(banner);
    document.getElementById('cancel-reagendamento').onclick = exitReagendamentoMode;

    calendar.refetchEvents(); 
}

function exitReagendamentoMode() {
    reagendamentoState = { active: false, event: null };
    const banner = document.getElementById('reagendamento-banner');
    if(banner) {
        banner.style.animation = 'slideDownFade 0.3s reverse forwards';
        setTimeout(() => banner.remove(), 300);
    }
    calendar.refetchEvents();
}

function handleReagendamentoSelect(targetEvent) {
    if (targetEvent.extendedProps.tipo !== 'LIVRE') {
        showAlert('Por favor, selecione um horário livre (verde).', 'error');
        return;
    }
    const originalEvent = reagendamentoState.event;
    const modalHTML = `
        <div class="text-center anim-scale-in">
            <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-400/20 to-purple-600/20 mb-5 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                <svg class="h-8 w-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <h3 class="text-2xl font-black text-white mb-6">Confirmar Reagendamento</h3>
            
            <div class="flex items-center justify-center gap-4 mb-8">
                <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700 text-left flex-1 shadow-inner">
                    <p class="text-[10px] uppercase text-slate-500 font-bold mb-1">Data Original</p>
                    <p class="text-sm text-slate-300 font-medium">${originalEvent.start.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</p>
                </div>
                <div class="text-purple-400"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></div>
                <div class="bg-purple-900/30 p-4 rounded-xl border border-purple-500/40 text-left flex-1 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                    <p class="text-[10px] uppercase text-purple-400 font-bold mb-1">Nova Data</p>
                    <p class="text-sm text-white font-bold">${targetEvent.start.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</p>
                    <p class="text-[10px] text-slate-400 mt-1 truncate font-medium flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ${sanitizeHTML(targetEvent.extendedProps.vistoriador?.nome || 'N/A')}</p>
                </div>
            </div>

            <div class="flex justify-center gap-3">
                <button id="btn-cancel" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors border border-slate-600">Cancelar</button>
                <button id="btn-confirm" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] transform hover:-translate-y-1">Confirmar Reagendamento</button>
            </div>
        </div>
    `;
    showModal(modalHTML, 'max-w-md bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');
    document.getElementById('btn-cancel').onclick = hideModal;
    document.getElementById('btn-confirm').onclick = async (e) => {
        const btn = e.currentTarget;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg class="w-5 h-5 animate-spin mx-auto text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        try {
            await api.reagendarVistoria(originalEvent.id, targetEvent.id);
            showAlert('Vistoria reagendada com sucesso!', 'success');
            hideModal();
            exitReagendamentoMode();
        } catch (error) {
            showAlert(error.message || 'Não foi possível reagendar.', 'error');
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    };
}

// ============================================================================
// MODAIS SECUNDÁRIOS
// ============================================================================

function handleFecharHorario(agendaId) {
    const modalHTML = `
        <div class="anim-scale-in">
            <h3 class="text-2xl font-black text-amber-400 mb-5 flex items-center gap-3">
                <div class="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                Fechar Horário
            </h3>
            <form id="form-fechar-horario" class="space-y-5">
                <div>
                    <label for="motivo-fechamento" class="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Motivo do Fechamento</label>
                    <input type="text" id="motivo-fechamento" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all outline-none shadow-inner" placeholder="Ex: Compromisso pessoal, Trânsito...">
                </div>
                <div class="flex justify-end gap-3 pt-3 border-t border-slate-700/60">
                    <button type="button" id="cancel-fechar-horario" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-slate-300 font-bold border border-slate-600 hover:text-white">Cancelar</button>
                    <button type="submit" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-all shadow-lg hover:shadow-amber-500/30 transform hover:-translate-y-1">Confirmar Fechamento</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalHTML, 'max-w-md bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');
    document.getElementById('cancel-fechar-horario').onclick = hideModal;
    document.getElementById('form-fechar-horario').onsubmit = async (e) => {
        e.preventDefault();
        const motivo = document.getElementById('motivo-fechamento').value;
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Processando...';
        try {
            await api.fecharHorario(agendaId, { fechar: true, motivo: motivo });
            showAlert('Horário fechado com sucesso!', 'success');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível fechar o horário.', 'error');
            btn.disabled = false; btn.textContent = 'Confirmar Fechamento';
        }
    };
}

function renderConfirmReabrirModal(agendaId, event) {
    const props = event.extendedProps;
    const motivo = props.observacao_privada || props.motivo_fechamento || 'Motivo não especificado.';

    const modalHTML = `
        <div class="text-center anim-scale-in">
             <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 mb-5 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <svg class="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
            </div>
            <h3 class="text-2xl font-black text-white mb-4">Reabrir Horário</h3>
            <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 inline-block mb-6 shadow-inner w-full">
                <p class="text-[10px] uppercase font-bold tracking-widest text-amber-500 mb-2">Bloqueado por:</p>
                <p class="text-sm text-amber-100 font-medium italic">"${sanitizeHTML(motivo)}"</p>
            </div>
            <p class="text-slate-300 mb-8 font-medium">Deseja tornar este horário disponível (LIVRE) novamente?</p>
            <div class="flex justify-center gap-3">
                <button id="btn-cancel-reabrir" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-slate-300 font-bold border border-slate-600 hover:text-white">Manter Fechado</button>
                <button id="btn-confirm-reabrir" class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] transform hover:-translate-y-1">Sim, Reabrir</button>
            </div>
        </div>
    `;
    showModal(modalHTML, 'max-w-md bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');
    document.getElementById('btn-cancel-reabrir').onclick = hideModal;
    document.getElementById('btn-confirm-reabrir').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Processando...';
        try {
            await api.fecharHorario(agendaId, { fechar: false, motivo: "" });
            showAlert('Horário reaberto com sucesso!', 'success');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível reabrir o horário.', 'error');
            btn.disabled = false; btn.textContent = 'Sim, Reabrir';
        }
    };
}

function handleCancelarAgendamento(event) {
    const modalHTML = `
        <div class="text-center anim-scale-in">
             <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-600/20 mb-5 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <svg class="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </div>
            <h3 class="text-2xl font-black text-white mb-3 tracking-tight">Cancelar Vistoria</h3>
            <p class="text-slate-300 mb-8 font-medium leading-relaxed">Tem certeza que deseja cancelar esta vistoria? O horário voltará a ficar <span class="text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Livre</span> na agenda do vistoriador.</p>
            <div class="flex flex-col sm:flex-row justify-center gap-3">
                <button id="btn-cancel" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-slate-300 font-bold border border-slate-600 hover:text-white">Não, Manter</button>
                <button id="btn-confirm-cancel" class="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] transform hover:-translate-y-1 border border-red-500/50">Sim, Cancelar</button>
            </div>
        </div>
    `;
    showModal(modalHTML, 'max-w-md bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');
    document.getElementById('btn-cancel').onclick = hideModal;
    document.getElementById('btn-confirm-cancel').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Processando...';
        try {
            await api.cancelarVistoria(event.id);
            showAlert('Agendamento cancelado com sucesso!', 'success');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível cancelar.', 'error');
            btn.disabled = false; btn.textContent = 'Sim, Cancelar';
        }
    };
}

function handleMarcarImprodutiva(event) {
    const modalHTML = `
        <div class="anim-scale-in">
            <h3 class="text-2xl font-black text-amber-400 mb-6 flex items-center gap-3">
                <div class="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                Marcar como Improdutiva
            </h3>
            <form id="form-improdutiva" class="space-y-5">
                <div>
                    <label for="motivo_improdutiva" class="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Motivo / Relato</label>
                    <textarea id="motivo_improdutiva" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl p-4 text-white focus:ring-2 focus:ring-amber-500 outline-none resize-none h-28 shadow-inner" placeholder="Descreva por que a vistoria não pôde ser realizada..."></textarea>
                </div>
                <div>
                    <label for="valor_cobranca" class="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Valor da Cobrança (R$)</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span class="text-slate-500 font-bold">R$</span>
                        </div>
                        <input type="number" step="0.01" min="0" id="valor_cobranca" required class="w-full bg-slate-900/80 border border-slate-600 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-amber-500 outline-none shadow-inner" placeholder="0.00">
                    </div>
                </div>
                <div id="modal-error" class="text-red-400 text-sm hidden font-medium"></div>
                <div class="flex justify-end gap-3 pt-5 border-t border-slate-700/60 mt-2">
                    <button type="button" id="cancel-modal" class="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-slate-300 font-bold border border-slate-600 hover:text-white">Cancelar</button>
                    <button type="submit" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)] transform hover:-translate-y-1">Confirmar Improdutiva</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalHTML, 'max-w-md bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');

    document.getElementById('cancel-modal').onclick = hideModal;
    document.getElementById('form-improdutiva').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const errorDiv = document.getElementById('modal-error');
        btn.disabled = true; btn.textContent = 'Processando...';
        errorDiv.classList.add('hidden');

        const data = {
            motivo: document.getElementById('motivo_improdutiva').value,
            valor_cobranca: parseFloat(document.getElementById('valor_cobranca').value)
        };

        if (isNaN(data.valor_cobranca)) {
            errorDiv.textContent = 'Por favor, insira um valor de cobrança válido.';
            errorDiv.classList.remove('hidden');
            btn.disabled = false; btn.textContent = 'Confirmar Improdutiva';
            return;
        }

        try {
            await api.markAsImprodutiva(event.id, data);
            showAlert('Vistoria marcada como improdutiva!', 'success');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            errorDiv.textContent = error.message || 'Não foi possível marcar como improdutiva.';
            errorDiv.classList.remove('hidden');
            btn.disabled = false; btn.textContent = 'Confirmar Improdutiva';
        }
    };
}

function handleGerarComprovante(event) {
    const props = event.extendedProps || event;
    const imovel = props.imovel || {};
    const cliente = imovel.cliente || {};
    
    const dataParts = props.data.split('-'); 
    const dataFormatada = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;
    const telefoneLimpo = (cliente.telefone || cliente.celular || '').replace(/\D/g, ''); 
    
    const whatsappMessage = `Olá ${cliente.nome || 'Cliente'}, tudo bem?%0A%0A` +
        `Passando para confirmar o agendamento da sua vistoria:%0A` +
        `🏠 *Imóvel:* ${imovel.cod_imovel || ''} - ${imovel.endereco || ''}%0A` +
        `📅 *Data:* ${dataFormatada}%0A` +
        `⏰ *Horário:* ${props.horario}%0A` +
        `👷 *Vistoriador:* ${props.vistoriador?.nome || 'Equipe'}%0A%0A` +
        `Qualquer dúvida estamos à disposição!`;

    const whatsappLink = telefoneLimpo ? `https://wa.me/55${telefoneLimpo}?text=${whatsappMessage}` : `https://wa.me/?text=${whatsappMessage}`; 

    const modalHTML = `
        <div class="text-center anim-scale-in">
            <div class="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-3xl border border-slate-700/50 shadow-2xl relative overflow-hidden mx-auto max-w-sm">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-emerald-400"></div>
                
                <h3 class="text-xl font-black text-white mb-1 tracking-tight">COMPROVANTE DIGITAL</h3>
                <p class="text-[10px] text-cyan-400 uppercase tracking-[0.2em] mb-8 font-bold">Agendamento Confirmado</p>

                <div class="space-y-4 text-left bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 text-sm shadow-inner backdrop-blur-sm">
                    <div class="flex items-start gap-4">
                        <div class="mt-0.5 text-cyan-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div>
                        <div>
                            <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Endereço</p>
                            <p class="text-slate-200 leading-tight font-bold text-sm">${sanitizeHTML(imovel.endereco || 'Endereço não informado')}</p>
                            <p class="text-[11px] text-cyan-400 mt-1 font-mono font-bold">CT ${sanitizeHTML(imovel.cod_imovel || 'N/A')}</p>
                        </div>
                    </div>
                    <div class="w-full h-px bg-slate-700/50"></div>
                    <div class="flex items-start gap-4">
                        <div class="mt-0.5 text-emerald-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>
                        <div>
                            <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Data e Hora</p>
                            <p class="text-white font-mono font-bold text-lg tracking-tight">${dataFormatada} <span class="text-slate-500 text-sm font-normal">às</span> ${props.horario}</p>
                        </div>
                    </div>
                    <div class="w-full h-px bg-slate-700/50"></div>
                    <div class="flex items-start gap-4">
                         <div class="mt-0.5 text-cyan-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>
                        <div>
                            <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Vistoriador</p>
                            <p class="text-slate-200 font-bold">${sanitizeHTML(props.vistoriador?.nome || 'A definir')}</p>
                        </div>
                    </div>
                    <div class="w-full h-px bg-slate-700/50"></div>
                     <div class="flex items-start gap-4">
                         <div class="mt-0.5 text-purple-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                        <div class="w-full overflow-hidden">
                            <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Cliente</p>
                            <p class="text-slate-200 font-bold">${sanitizeHTML(cliente.nome || 'N/A')}</p>
                            <p class="text-[11px] text-slate-500 truncate mt-0.5 font-medium">${sanitizeHTML(cliente.email || 'Email não informado')}</p>
                        </div>
                    </div>
                </div>

                <div class="mt-8 flex flex-col gap-3">
                    <a href="${whatsappLink}" target="_blank" class="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 transform hover:-translate-y-1">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.463 1.065 2.876 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                        Enviar via WhatsApp
                    </a>
                    <button id="btn-close-voucher" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors border border-slate-600">
                        Fechar Janela
                    </button>
                </div>
            </div>
        </div>
    `;
    // Não precisa de classes de vidro extras pq o container já tem seu próprio
    showModal(modalHTML, '');
    document.getElementById('btn-close-voucher').onclick = hideModal;
}

function handleEditarVistoria(event) {
    const props = event.extendedProps;
    const imovel = props.imovel || {};
    const imobiliaria = imovel.imobiliaria || {}; 

    const modalHTML = `
        <div class="anim-slide-up">
            <div class="flex items-center gap-4 mb-6 border-b border-slate-700/60 pb-5">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 shadow-[0_0_20px_rgba(59,130,246,0.3)] relative">
                    <div class="absolute inset-0 bg-white/20 rounded-2xl backdrop-blur-sm"></div>
                    <svg class="relative z-10 w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </div>
                <h3 class="text-3xl font-black text-white tracking-tight">Editar Vistoria</h3>
            </div>
            
            <form id="form-edit-vistoria" class="space-y-6">
                <div class="bg-slate-800/40 p-6 rounded-3xl border border-slate-700/50 shadow-inner">
                    <h4 class="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-5 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        Dados do Imóvel
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div class="md:col-span-2">
                            <label class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Imobiliária Responsável</label>
                            <input type="text" class="w-full bg-slate-900/50 border border-slate-700 text-slate-500 rounded-xl px-4 py-3 cursor-not-allowed text-sm font-bold shadow-inner" value="${sanitizeHTML(imobiliaria.nome || 'Não definida')}" disabled>
                        </div>
                        <div>
                            <label for="cod_imovel" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Cód. Imóvel</label>
                            <input type="text" id="cod_imovel" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-cyan-400 font-mono text-sm font-bold focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner" value="${sanitizeHTML(imovel.cod_imovel || '')}">
                        </div>
                        <div>
                            <label for="endereco" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Endereço</label>
                            <input type="text" id="endereco" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm font-medium focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner" value="${sanitizeHTML(imovel.endereco || '')}">
                        </div>
                        <div>
                            <label for="tamanho" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Tamanho (m²)</label>
                            <input type="number" step="0.01" id="tamanho" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm font-medium focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner" value="${imovel.tamanho || ''}">
                        </div>
                        <div>
                            <label for="mobiliado" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Mobília</label>
                            <select id="mobiliado" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm font-bold focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner appearance-none cursor-pointer">
                                <option value="sem_mobilia" ${imovel.mobiliado === 'sem_mobilia' ? 'selected' : ''}>Sem Mobília</option>
                                <option value="semi_mobiliado" ${imovel.mobiliado === 'semi_mobiliado' ? 'selected' : ''}>Semi Mobiliado</option>
                                <option value="mobiliado" ${imovel.mobiliado === 'mobiliado' ? 'selected' : ''}>Mobiliado</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="bg-slate-800/40 p-6 rounded-3xl border border-slate-700/50 shadow-inner">
                    <h4 class="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-5 flex items-center gap-2">
                         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                        Dados da Vistoria
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                         <div>
                            <label for="tipo_vistoria" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Tipo</label>
                            <select id="tipo_vistoria" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm font-bold focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner appearance-none cursor-pointer">
                                <option value="ENTRADA" ${props.tipo === 'ENTRADA' ? 'selected' : ''}>Entrada</option>
                                <option value="SAIDA" ${props.tipo === 'SAIDA' ? 'selected' : ''}>Saída</option>
                                <option value="CONFERENCIA" ${props.tipo === 'CONFERENCIA' ? 'selected' : ''}>Conferência</option>
                                <option value="AVERIGUACAO" ${props.tipo === 'AVERIGUACAO' ? 'selected' : ''}>Averiguação</option>
                                <option value="COMPLEMENTO_VISITA" ${props.tipo === 'COMPLEMENTO_VISITA' ? 'selected' : ''}>Complemento/Visita</option>
                            </select>
                        </div>
                        <div>
                            <label for="valor_final_vistoria" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Valor Vistoria (R$)</label>
                            <input type="number" step="0.01" id="valor_final_vistoria" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-emerald-400 font-bold text-sm focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner" placeholder="Automático" value="${props.valor_final_vistoria || ''}">
                        </div>
                        <div>
                            <label for="valor_vistoriador" class="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Valor Repasse (R$)</label>
                            <input type="number" step="0.01" id="valor_vistoriador" class="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-3 text-white font-bold text-sm focus:ring-2 focus:ring-cyan-500 outline-none shadow-inner" placeholder="Automático" value="${props.valor_vistoriador || ''}">
                        </div>
                    </div>
                    
                    <div class="mt-5 flex items-center bg-slate-900/60 p-3 rounded-xl border border-slate-700/80 shadow-inner">
                        <input type="checkbox" id="recalcular-valores" class="w-5 h-5 rounded border-slate-500 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900 ml-1 cursor-pointer">
                        <label for="recalcular-valores" class="ml-3 block text-xs font-bold text-cyan-400 cursor-pointer">Recalcular valores automaticamente (Tabela Padrão)</label>
                    </div>

                    <div class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label for="observacao_vistoriador" class="block text-[10px] uppercase font-bold tracking-widest text-amber-500 mb-2">Msg. Vistoriador</label>
                            <textarea id="observacao_vistoriador" rows="3" class="w-full bg-amber-900/10 border border-amber-700/30 rounded-xl px-4 py-3 text-amber-200 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none shadow-inner">${props.observacao_vistoriador || ''}</textarea>
                        </div>
                        <div>
                            <label for="observacao_privada" class="block text-[10px] uppercase font-bold tracking-widest text-purple-400 mb-2">Obs. Privada (Admin)</label>
                            <textarea id="observacao_privada" rows="3" class="w-full bg-purple-900/10 border border-purple-700/30 rounded-xl px-4 py-3 text-purple-200 text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none shadow-inner">${props.observacao_privada || ''}</textarea>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end gap-3 pt-6 border-t border-slate-700/60 mt-4">
                    <button type="button" id="cancel-edit-vistoria" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors border border-slate-600 hover:text-white">Cancelar</button>
                    <button type="submit" class="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] transform hover:-translate-y-1">Gravar Alterações</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalHTML, 'max-w-3xl bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');

    const recalcularCheckbox = document.getElementById('recalcular-valores');
    const valorVistoriaInput = document.getElementById('valor_final_vistoria');
    const valorVistoriadorInput = document.getElementById('valor_vistoriador');

    recalcularCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        valorVistoriaInput.disabled = isChecked;
        valorVistoriadorInput.disabled = isChecked;
        if (isChecked) {
            valorVistoriaInput.value = ''; valorVistoriadorInput.value = '';
            valorVistoriaInput.classList.add('opacity-40', 'bg-slate-900');
            valorVistoriadorInput.classList.add('opacity-40', 'bg-slate-900');
        } else {
            valorVistoriaInput.classList.remove('opacity-40', 'bg-slate-900');
            valorVistoriadorInput.classList.remove('opacity-40', 'bg-slate-900');
        }
    });

    document.getElementById('cancel-edit-vistoria').addEventListener('click', hideModal);

    document.getElementById('form-edit-vistoria').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerHTML = '<svg class="w-5 h-5 animate-spin mx-auto text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

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
            showAlert('Vistoria atualizada com sucesso!', 'success');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível atualizar.', 'error');
            btn.disabled = false; btn.textContent = 'Gravar Alterações';
        }
    };
}

// ============================================================================
// MODAL PRINCIPAL DO ADMIN (VISUALIZAÇÃO DA VISTORIA)
// ============================================================================

async function showAdminVistoriaModal(event) {
    const props = event.extendedProps || event; 
    const imovel = props.imovel || {};
    const cliente = imovel.cliente || {};
    const imobiliaria = imovel.imobiliaria || {};
    const agendamentoId = event.id || props.id;

    const createInfoCard = (label, value, iconPath, extraClasses = "") => `
        <div class="group relative flex items-center gap-3 rounded-2xl border border-slate-700/40 bg-slate-800/30 p-3.5 transition-all duration-300 hover:bg-slate-800/80 hover:border-cyan-500/30 hover:shadow-[0_4px_20px_rgba(6,182,212,0.05)] ${extraClasses}">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-cyan-400 shadow-inner group-hover:scale-110 transition-transform duration-300 border border-slate-800">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">${iconPath}</svg>
            </div>
            <div class="overflow-hidden">
                <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">${label}</p>
                <p class="truncate text-sm font-semibold text-slate-200 group-hover:text-white transition-colors" title="${String(value).replace(/"/g, '&quot;')}">${value}</p>
            </div>
        </div>
    `;

    const detailsTabHTML = `
        <div class="anim-slide-up space-y-5">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                ${createInfoCard("Cód. Imóvel", sanitizeHTML(imovel.cod_imovel || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />')}
                ${createInfoCard("Tipo Vistoria", sanitizeHTML(props.tipo || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />', "border-cyan-500/20 bg-gradient-to-br from-cyan-900/20 to-transparent")}
                ${createInfoCard("Vistoriador", sanitizeHTML(props.vistoriador?.nome || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />')}
                ${createInfoCard(
                    "Cliente",
                    `<div class="flex flex-col"><span class="font-medium">${sanitizeHTML(cliente.nome || 'N/A')}</span><span class="text-xs text-slate-400 font-normal">${sanitizeHTML(cliente.email || 'Sem e-mail')}</span></div>`,
                    '<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />'
                )}
                ${createInfoCard("Imobiliária", sanitizeHTML(imobiliaria.nome || 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />')}
                ${createInfoCard("Tamanho", sanitizeHTML(imovel.tamanho ? imovel.tamanho + ' m²' : 'N/A'), '<path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />')}
            </div>

            <div class="relative flex items-start gap-4 rounded-2xl border border-slate-700/40 bg-slate-800/30 p-4">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-cyan-500 border border-slate-800">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div>
                    <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Endereço Completo</p>
                    <p class="text-sm text-slate-200 leading-snug font-medium">${sanitizeHTML(imovel.endereco || 'N/A')}</p>
                    <div class="mt-2 flex items-center gap-2">
                        <span class="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-400 ring-1 ring-inset ring-slate-700 capitalize">
                            ${sanitizeHTML((imovel.mobiliado || 'N/A').replace('_', ' '))}
                        </span>
                    </div>
                </div>
            </div>

            <div class="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 to-slate-900 p-4">
                <h4 class="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Financeiro
                </h4>
                <div class="flex divide-x divide-emerald-500/20">
                    <div class="flex-1 px-2 text-center">
                        <p class="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Valor Vistoria</p>
                        <p class="text-xl font-black text-emerald-400">R$ ${props.valor_final_vistoria?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div class="flex-1 px-2 text-center">
                        <p class="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Repasse Vistoriador</p>
                        <p class="text-xl font-bold text-slate-200">R$ ${props.valor_vistoriador?.toFixed(2) || '0.00'}</p>
                    </div>
                </div>
            </div>

            <div id="laudo-admin-container" class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-center transition-all duration-300">
                <p class="flex items-center justify-center gap-2 text-sm text-slate-400 font-bold">
                    <svg class="h-5 w-5 animate-spin text-cyan-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Sincronizando laudo com a nuvem...
                </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
                <div class="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
                    <div class="absolute left-0 top-0 h-full w-1 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                    <h4 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        Msg. Vistoriador
                    </h4>
                    <p class="text-sm italic text-amber-100/70 font-medium leading-relaxed">${sanitizeHTML(props.observacao_vistoriador || 'Nenhuma observação.')}</p>
                </div>

                <div class="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-purple-950/10 p-4">
                    <div class="absolute left-0 top-0 h-full w-1 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                    <h4 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Privado (Admin)
                    </h4>
                    <p class="text-sm text-purple-100/70 font-medium leading-relaxed">${sanitizeHTML(props.observacao_privada || 'Nenhuma anotação.')}</p>
                </div>
            </div>

            <div id="vistoria-actions" class="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-700/60 pt-6">
                <button data-action="comprovante" class="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/20 transition-all hover:bg-emerald-500 hover:text-white hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transform hover:-translate-y-0.5">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Comprovante
                </button>

                <button data-action="edit" class="flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-slate-700 border border-slate-600 shadow-lg transform hover:-translate-y-0.5">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    Editar
                </button>

                <button data-action="reschedule" class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-black text-white transition-all hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_15px_rgba(168,85,247,0.3)] transform hover:-translate-y-0.5">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Reagendar
                </button>

                <div class="h-6 w-px bg-slate-700/60 mx-1 hidden sm:block"></div>

                <button data-action="unproductive" class="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-sm font-bold text-amber-500 transition-all hover:bg-amber-500 hover:text-slate-900 transform hover:-translate-y-0.5">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Improdutiva
                </button>

                <button data-action="cancel" class="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-400 transition-all hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transform hover:-translate-y-0.5">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Cancelar
                </button>
            </div>
        </div>
    `;

    const modalHTML = `
        <div class="sticky top-0 z-50 mb-6 flex items-center justify-between border-b border-slate-700/60 bg-slate-900/95 pb-5 pt-2 backdrop-blur-2xl">
            <div class="flex items-center gap-4">
                <div class="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                    <div class="absolute inset-0 bg-white/20 rounded-2xl backdrop-blur-sm"></div>
                    <svg class="relative z-10 h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                </div>
                <div>
                    <h2 class="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        Vistoria <span class="text-cyan-400 px-3 py-1 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-2xl shadow-inner">#${sanitizeHTML(imovel.cod_imovel || '---')}</span>
                    </h2>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ordem de Serviço (OS)</p>
                </div>
            </div>
            <button id="close-modal-btn" class="group relative rounded-full p-3 text-slate-400 transition-all hover:bg-slate-800 hover:text-white border border-transparent hover:border-slate-700">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <div class="mb-8">
            <nav class="flex p-1 space-x-1 bg-slate-900/80 rounded-xl border border-slate-700/50 backdrop-blur-md shadow-inner" id="modal-tabs" role="tablist">
                <button data-tab="detalhes" class="tab-btn active flex-1 rounded-lg py-3 text-sm font-bold transition-all focus:outline-none" role="tab" aria-selected="true">
                    Visão Geral
                </button>
                <button data-tab="mural" class="tab-btn flex-1 rounded-lg py-3 text-sm font-bold transition-all focus:outline-none" role="tab" aria-selected="false">
                    Mural Interno
                </button>
                <button data-tab="documentos" class="tab-btn flex-1 rounded-lg py-3 text-sm font-bold transition-all focus:outline-none" role="tab" aria-selected="false">
                    Documentos
                </button>
            </nav>
        </div>

        <div class="relative min-h-[350px]">
            <div id="tab-content-detalhes" class="tab-content" role="tabpanel">
                ${detailsTabHTML}
            </div>
            <div id="tab-content-mural" class="tab-content hidden" role="tabpanel"></div>
            <div id="tab-content-documentos" class="tab-content hidden" role="tabpanel"></div>
        </div>
    `;

    showModal(modalHTML, 'max-w-4xl bg-slate-900/95 backdrop-blur-2xl rounded-3xl border border-slate-700/60 shadow-2xl');

    document.getElementById('close-modal-btn').addEventListener('click', hideModal);

    document.getElementById('vistoria-actions').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        switch (action) {
            case 'comprovante': handleGerarComprovante(event); break;
            case 'edit': handleEditarVistoria(event); break;
            case 'reschedule': enterReagendamentoMode(event); break;
            case 'unproductive': handleMarcarImprodutiva(event); break;
            case 'cancel': handleCancelarAgendamento(event); break;
        }
    });
    
    document.getElementById('modal-tabs').addEventListener('click', async (e) => { 
        const target = e.target.closest('.tab-btn');
        if (!target) return;
        
        e.preventDefault();
        const tabId = target.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        target.classList.add('active');
        target.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        const contentDiv = document.getElementById(`tab-content-${tabId}`);
        
        if (contentDiv) {
            contentDiv.classList.remove('hidden');
            if (!contentDiv.hasAttribute('data-loaded')) {
                if (tabId === 'mural') await renderAdminMuralTab(agendamentoId, 'tab-content-mural');
                else if (tabId === 'documentos') await renderAdminDocumentosTab(agendamentoId, 'tab-content-documentos');
                contentDiv.setAttribute('data-loaded', 'true');
            }
        }
    });

    try {
        const laudo = await api.getLaudoByAgendamento(agendamentoId);
        const laudoContainer = document.getElementById('laudo-admin-container');
        if (laudoContainer) {
            const isApproved = laudo.aprovado; 
            const containerClass = isApproved ? 'border-emerald-500/40 bg-emerald-900/20' : 'border-amber-500/40 bg-amber-900/20';
            const badgeClass = isApproved ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/50' : 'bg-amber-500/20 text-amber-400 ring-amber-500/50';
            const statusText = isApproved ? 'Laudo Aprovado' : 'Pendente de Análise';

            laudoContainer.className = `rounded-2xl border ${containerClass} p-5 transition-all duration-500 anim-scale-in shadow-inner`;
            laudoContainer.innerHTML = `
                <div class="flex flex-col sm:flex-row items-center justify-between gap-5">
                    <div class="flex items-center gap-4 w-full sm:w-auto">
                        <div class="flex h-12 w-12 items-center justify-center rounded-xl ${isApproved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} border ${isApproved ? 'border-emerald-500/30' : 'border-amber-500/30'}">
                            ${isApproved ? '<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : '<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'}
                        </div>
                        <div class="text-left">
                            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Status do Laudo</p>
                            <span class="inline-flex rounded-lg px-3 py-1 text-xs font-black tracking-wide ring-1 ring-inset ${badgeClass}">${statusText}</span>
                        </div>
                    </div>
                    <button id="view-laudo-btn" data-laudo-id="${laudo.id}" class="w-full sm:w-auto rounded-xl bg-cyan-600 px-8 py-3.5 text-sm font-black text-white transition-all hover:bg-cyan-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transform hover:-translate-y-1 flex items-center justify-center gap-2">
                        Visualizar Laudo
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </button>
                </div>`;
            document.getElementById('view-laudo-btn').onclick = (e) => {
                hideModal(); window.location.hash = `#laudos?view=${e.currentTarget.dataset.laudoId}`;
            };
        }
    } catch (error) {
        const laudoContainer = document.getElementById('laudo-admin-container');
        if (laudoContainer) {
            laudoContainer.classList.remove('animate-pulse', 'border-dashed');
            if (error.message && error.message.includes('404')) {
                laudoContainer.className = "rounded-2xl border border-slate-700/60 bg-slate-800/40 p-5 text-center anim-fade-in shadow-inner";
                laudoContainer.innerHTML = `<div class="flex items-center justify-center gap-2 text-slate-500"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="text-sm font-bold">Laudo não iniciado pelo vistoriador.</span></div>`;
            } else {
                laudoContainer.className = "rounded-2xl border border-red-500/40 bg-red-900/20 p-5 text-center anim-fade-in shadow-inner";
                laudoContainer.innerHTML = `<p class="text-sm font-bold text-red-400">Erro ao verificar status: ${sanitizeHTML(error.message)}</p>`;
            }
        }
    }
}

// ============================================================================
// IA E FILTROS
// ============================================================================

function showIAModal(message) {
    showModal(`
        <div class="text-left anim-scale-in">
            <h3 class="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-6 flex items-center gap-4">
                <div class="p-3 bg-cyan-500/20 rounded-2xl border border-cyan-500/30 shadow-inner">
                    <svg class="w-7 h-7 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                Inteligência Operacional
            </h3>
            <div class="bg-slate-900/80 p-6 rounded-3xl border border-slate-700/60 shadow-inner">
                <p class="text-slate-300 whitespace-pre-wrap leading-relaxed font-medium text-sm">${sanitizeHTML(message)}</p>
            </div>
            <div class="mt-8 flex justify-between items-center border-t border-slate-700/60 pt-6">
                 <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Cache ativo (2h)</span>
                 <button id="btn-close-ia" class="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white transition-colors font-bold border border-slate-600 shadow-lg">Entendido</button>
            </div>
        </div>
    `, 'max-w-2xl bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl');
    document.getElementById('btn-close-ia').onclick = hideModal;
}

function updateSelects(events) {
    let newVistoriadores = false; let newImobiliarias = false;
    events.forEach(e => {
        if (e.vistoriador?.id && !knownVistoriadores.has(e.vistoriador.id)) { knownVistoriadores.set(e.vistoriador.id, e.vistoriador.nome); newVistoriadores = true; }
        if (e.imovel?.imobiliaria?.id && !knownImobiliarias.has(e.imovel.imobiliaria.id)) { knownImobiliarias.set(e.imovel.imobiliaria.id, e.imovel.imobiliaria.nome); newImobiliarias = true; }
    });

    if (newVistoriadores) {
        const sel = document.getElementById('filter-vistoriador');
        if(sel) {
            const current = sel.value;
            sel.innerHTML = '<option value="all">Vistoriador: Todos</option>' + Array.from(knownVistoriadores).map(([id, nome]) => `<option value="${id}">${sanitizeHTML(nome)}</option>`).join('');
            sel.value = current;
        }
    }
    if (newImobiliarias) {
        const sel = document.getElementById('filter-imobiliaria');
        if(sel) {
            const current = sel.value;
            sel.innerHTML = '<option value="all">Imobiliária: Todas</option>' + Array.from(knownImobiliarias).map(([id, nome]) => `<option value="${id}">${sanitizeHTML(nome)}</option>`).join('');
            sel.value = current;
        }
    }
}

// ============================================================================
// INICIALIZAÇÃO E FULLCALENDAR
// ============================================================================

export async function initAgenda() {
    injectModernStyles();

    const pageHTML = `
        <div class="flex flex-col mb-8 gap-6 anim-fade-in relative">
            <div class="absolute -top-10 -right-10 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
            <div>
                <h1 class="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 tracking-tight">Painel Operacional</h1>
                <p class="text-slate-400 text-sm mt-2 font-medium flex items-center gap-2">
                    <svg class="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Gerenciamento global de grade e alocação de vistorias
                </p>
            </div>
            
            <!-- Barra de Filtros Premium -->
            <div class="flex flex-col xl:flex-row gap-4 w-full justify-between items-center bg-slate-900/60 backdrop-blur-xl p-3 rounded-2xl border border-slate-700/50 shadow-lg relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 pointer-events-none"></div>
                
                <div class="flex flex-wrap gap-3 w-full xl:w-auto relative z-10 flex-grow">
                    <div class="relative w-full sm:w-64">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input type="text" id="filter-search-code" placeholder="Buscar CT..." class="w-full bg-slate-800 text-white border border-slate-700 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm font-medium transition-all placeholder-slate-500 shadow-inner">
                    </div>
                    <select id="filter-vistoriador" class="w-full sm:w-auto flex-grow bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium transition-all cursor-pointer shadow-inner appearance-none">
                        <option value="all">Vistoriador: Todos</option>
                    </select>
                    <select id="filter-imobiliaria" class="w-full sm:w-auto flex-grow bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium transition-all cursor-pointer shadow-inner appearance-none">
                        <option value="all">Imobiliária: Todas</option>
                    </select>
                </div>

                <div class="flex flex-wrap gap-3 w-full xl:w-auto justify-end relative z-10">
                    <button id="btn-analise-ia" class="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-400 hover:text-cyan-300 font-bold py-3 px-5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm transform hover:-translate-y-0.5 shadow-lg">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Insight IA
                    </button>
                    <button id="btn-gerar-agenda" class="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-3 px-5 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 text-sm transform hover:-translate-y-0.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Grade Automática
                    </button>
                </div>
            </div>
        </div>
        <div id="calendar-container" class="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/60 shadow-2xl p-4 sm:p-6 relative anim-slide-up">
            <div id="calendar" class="h-[calc(100vh-280px)] min-h-[600px]"></div>
        </div>
    `;
    renderPageContent(pageHTML);

    const pendingDataStr = sessionStorage.getItem('agendamentoPendenteState');
    if (pendingDataStr) {
        try { 
            enterPendenteMode(JSON.parse(pendingDataStr)); 
            // A limpeza agora é feita com segurança dentro do exitPendenteMode()
        } catch (e) {
            console.error("Falha ao iniciar modo pendente", e);
        }
    }

    document.getElementById('filter-vistoriador').addEventListener('change', (e) => { currentVistoriadorFilter = e.target.value; if (calendar) calendar.refetchEvents(); });
    document.getElementById('filter-imobiliaria').addEventListener('change', (e) => { currentImobiliariaFilter = e.target.value; if (calendar) calendar.refetchEvents(); });
    document.getElementById('filter-search-code').addEventListener('input', (e) => { currentSearchQuery = e.target.value.trim().toLowerCase(); if (calendar) calendar.refetchEvents(); });

    document.getElementById('btn-analise-ia').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (iaAnalysisCache && (Date.now() - iaAnalysisCache.timestamp < IA_CACHE_DURATION)) return showIAModal(iaAnalysisCache.message);
        
        const originalContent = btn.innerHTML; btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
        try {
            const result = await api.analyzeScheduleWithAI();
            iaAnalysisCache = { message: result.message, timestamp: Date.now() };
            showIAModal(result.message);
        } catch (error) {
            showAlert(error.message || 'Erro ao consultar IA.', 'error');
        } finally { btn.disabled = false; btn.innerHTML = originalContent; }
    });

    document.getElementById('btn-gerar-agenda').addEventListener('click', async (e) => {
        const btn = e.currentTarget; const originalContent = btn.innerHTML; btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
        try {
            const result = await api.generateAgenda();
            showAlert(result.message || 'Agenda gerada com sucesso!', 'success');
            if (calendar) calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Erro ao gerar agenda.', 'error');
        } finally { btn.disabled = false; btn.innerHTML = originalContent; }
    });

    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' },
        listDayFormat: (info) => {
            const date = info.date.marker;
            const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
            return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} (${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()})`;
        },
        slotDuration: '00:15:00', slotLabelInterval: '01:00:00', slotMinTime: '07:00:00', slotMaxTime: '20:00:00',
        expandRows: true, stickyHeaderDates: true, handleWindowResize: true,
        events: async (fetchInfo, successCallback, failureCallback) => {
            try {
                const rawEvents = await api.getAgendaEvents(fetchInfo.startStr.split('T')[0], fetchInfo.endStr.split('T')[0]);
                updateSelects(rawEvents);
                
                const filteredEvents = rawEvents.filter(e => {
                    if (currentVistoriadorFilter !== 'all' && String(e.vistoriador?.id) !== String(currentVistoriadorFilter)) return false;
                    if (currentImobiliariaFilter !== 'all' && String(e.imovel?.imobiliaria?.id) !== String(currentImobiliariaFilter)) return false;
                    if (currentSearchQuery && !(e.imovel?.cod_imovel || '').toLowerCase().includes(currentSearchQuery)) return false;
                    return true;
                });

                successCallback(filteredEvents.map(e => ({
                    id: e.id, title: e.tipo === 'LIVRE' ? 'Livre' : (e.imovel?.cod_imovel || e.tipo),
                    start: `${e.data}T${e.horario}`, extendedProps: e,
                })));
            } catch (error) { showAlert('Erro ao carregar eventos.', 'error'); failureCallback(error); }
        },
        eventContent: renderEventContent,
        eventClick: handleEventClick,
        eventClassNames: (arg) => {
            const props = arg.event.extendedProps;
            let classes = [(reagendamentoState.active || pendenteState.active) ? (props.tipo === 'LIVRE' ? 'event-reagendamento-disponivel' : 'event-reagendamento-indisponivel') : ''];
            classes.push(props.tipo === 'LIVRE' ? 'event-livre' : props.tipo === 'FECHADO' ? 'event-fechado' : 'event-ocupado');
            return classes.join(' ');
        }
    });

    calendar.render();
}