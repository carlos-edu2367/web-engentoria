// /assets/modules/agenda.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';
import { startAgendamentoWizard } from './agendamento-wizard.js';

let calendar; // Manter a referência do calendário
let reagendamentoState = { active: false, event: null }; // Controla o modo de reagendamento

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

        document.getElementById('btn-iniciar-agendamento').onclick = () => startAgendamentoWizard(event, calendar);
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
    const props = event.extendedProps;
    const imovel = props.imovel || {};
    const cliente = imovel.cliente || {};
    const imobiliaria = imovel.imobiliaria || {};

    // 1. Gera o HTML da aba "Detalhes"
    const detailsTabHTML = `
        <div class="space-y-3 text-gray-300 mb-4 text-sm sm:text-base">
            <p><strong>Cód. Imóvel:</strong> ${sanitizeHTML(imovel.cod_imovel || 'N/A')}</p>
            <p><strong>Vistoriador:</strong> ${sanitizeHTML(props.vistoriador?.nome || 'N/A')}</p>
            <p><strong>Cliente:</strong> ${sanitizeHTML(cliente.nome || 'N/A')}</p>
            <p><strong>Imobiliária:</strong> ${sanitizeHTML(imobiliaria.nome || 'N/A')}</p>
            <p><strong>Endereço:</strong> ${sanitizeHTML(imovel.endereco || 'N/A')}</p>
            <p><strong>Valor Vistoria:</strong> R$ ${props.valor_final_vistoria?.toFixed(2) || '0.00'}</p>
            <p><strong>Valor Vistoriador:</strong> R$ ${props.valor_vistoriador?.toFixed(2) || '0.00'}</p>
        </div>

        <!-- NOVO CONTAINER DE VERIFICAÇÃO DE LAUDO -->
        <div id="laudo-admin-container" class="mt-4 p-4 bg-gray-900/50 rounded-lg">
            <p class="text-sm text-gray-400 text-center">Verificando status do laudo...</p>
        </div>
        <!-- FIM DO NOVO CONTAINER -->

        <div class="border-t border-gray-700 mt-4 pt-4 space-y-3">
            <div>
                <h4 class="font-semibold text-amber-300 text-sm">Observação para Vistoriador:</h4>
                <p class="text-gray-300 whitespace-pre-wrap pl-2 border-l-2 border-amber-300/50 mt-1 text-sm sm:text-base">${sanitizeHTML(props.observacao_vistoriador || 'Nenhuma')}</p>
            </div>
            <div>
                <h4 class="font-semibold text-gray-400 text-sm">Observação Privada (Admin):</h4>
                <p class="text-gray-300 whitespace-pre-wrap pl-2 border-l-2 border-gray-400/50 mt-1 text-sm sm:text-base">${sanitizeHTML(props.observacao_privada || 'Nenhuma')}</p>
            </div>
        </div>

        <div id="vistoria-actions" class="border-t border-gray-700 mt-6 pt-6 flex flex-wrap justify-center gap-3">
            <button data-action="edit" class="action-btn bg-blue-600 hover:bg-blue-500">Editar</button>
            <button data-action="reschedule" class="action-btn bg-purple-600 hover:bg-purple-500">Reagendar</button>
            <button data-action="unproductive" class="action-btn bg-yellow-500 hover:bg-yellow-400 text-black">Marcar Improdutiva</button>
            <button data-action="cancel" class="action-btn bg-red-600 hover:bg-red-500">Cancelar Agendamento</button>
        </div>
    `;

    // 2. Gera a estrutura do Modal com Abas
    const modalHTML = `
        <div class="flex justify-between items-start mb-4">
            <h2 class="text-xl sm:text-2xl font-bold text-cyan-300">
                Detalhes: CT ${sanitizeHTML(imovel.cod_imovel || 'Vistoria')}
            </h2>
            <button id="close-modal-btn" class="p-1 rounded-full hover:bg-gray-700/50 text-gray-400 hover:text-white transition">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <!-- Abas -->
        <div class="border-b border-gray-700/50 mb-4 overflow-x-auto">
            <nav class="flex space-x-2 sm:space-x-4 -mb-px" id="modal-tabs" role="tablist">
                <button data-tab="detalhes" class="tab-btn active" role="tab" aria-selected="true">Detalhes</button>
                <button data-tab="mural" class="tab-btn" role="tab" aria-selected="false">Mural</button>
                <button data-tab="documentos" class="tab-btn" role="tab" aria-selected="false">Documentos</button>
            </nav>
        </div>

        <!-- Conteúdo das Abas -->
        <div id="tab-content-detalhes" class="tab-content" role="tabpanel">
            ${detailsTabHTML}
        </div>
        <div id="tab-content-mural" class="tab-content hidden" role="tabpanel">
            <p class="text-center text-gray-400">Carregando...</p>
        </div>
        <div id="tab-content-documentos" class="tab-content hidden" role="tabpanel">
            <p class="text-center text-gray-400">Carregando...</p>
        </div>
    `;

    // 3. Exibe o modal
    showModal(modalHTML, 'max-w-3xl');

    // 4. Adiciona Listeners para as ações
    document.getElementById('vistoria-actions').addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;
        switch (action) {
            case 'edit': handleEditarVistoria(event); break;
            case 'reschedule': enterReagendamentoMode(event); break;
            case 'unproductive': handleMarcarImprodutiva(event); break;
            case 'cancel': handleCancelarAgendamento(event); break;
        }
    });

    // 5. Adiciona Listener para fechar o modal
    document.getElementById('close-modal-btn').addEventListener('click', hideModal);

    // 6. Adiciona Listeners para as Abas
    document.getElementById('modal-tabs').addEventListener('click', (e) => {
        const target = e.target.closest('.tab-btn');
        if (!target) return;

        const tabId = target.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });
        target.classList.add('active');
        target.setAttribute('aria-selected', 'true');
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        const contentDiv = document.getElementById(`tab-content-${tabId}`);
        contentDiv.classList.remove('hidden');

        if (contentDiv.innerHTML.includes('Carregando...')) {
            if (tabId === 'mural') renderAdminMuralTab(event.id, 'tab-content-mural');
            if (tabId === 'documentos') renderAdminDocumentosTab(event.id, 'tab-content-documentos');
        }
    });

    // 7. (NOVO) Chama a verificação do laudo
    try {
        const laudo = await api.getLaudoByAgendamento(event.id);
        const laudoContainer = document.getElementById('laudo-admin-container');
        
        // Laudo encontrado e finalizado
        const statusClass = laudo.aprovado ? 'bg-green-600/50 text-green-300' : 'bg-yellow-600/50 text-yellow-300';
        const statusText = laudo.aprovado ? 'Laudo Aprovado' : 'Pendente de Análise';

        laudoContainer.innerHTML = `
            <div class="flex flex-col sm:flex-row justify-between items-center gap-2">
                <div>
                    <p class="font-semibold text-white">Status do Laudo</p>
                    <span class="text-xs font-bold px-2 py-0.5 rounded ${statusClass}">${statusText}</span>
                </div>
                <button id="view-laudo-btn" data-laudo-id="${laudo.id}" class="w-full sm:w-auto action-btn bg-cyan-600 hover:bg-cyan-500 text-sm">
                    Ver Laudo para Análise
                </button>
            </div>
        `;
        document.getElementById('view-laudo-btn').onclick = (e) => {
            const laudoId = e.currentTarget.dataset.laudoId;
            hideModal();
            window.location.hash = `#laudos?view=${laudoId}`;
        };

    } catch (error) {
        const laudoContainer = document.getElementById('laudo-admin-container');
        if (error.message.includes('404')) {
            laudoContainer.innerHTML = '<p class="text-sm text-gray-500 text-center">Laudo ainda não finalizado pelo vistoriador.</p>';
        } else {
            laudoContainer.innerHTML = `<p class="text-sm text-red-400 text-center">Erro ao verificar laudo: ${error.message}</p>`;
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

export async function initAgenda() {
    const pageHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-center mb-8 flex-wrap gap-4">
            <h1 class="text-3xl font-bold text-cyan-300">Agenda de Vistorias</h1>
            <button id="btn-gerar-agenda" class="w-full sm:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Gerar Agenda (4 Semanas)
            </button>
        </div>
        <div id="calendar-container" class="bg-gray-800/50 rounded-xl neon-border p-2 sm:p-4 relative">
            <div id="calendar"></div>
        </div>
    `;
    renderPageContent(pageHTML);

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
                const events = await api.getAgendaEvents(start, end);
                successCallback(events.map(e => ({
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