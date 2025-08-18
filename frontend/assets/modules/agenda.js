// /assets/modules/agenda.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';
import { startAgendamentoWizard } from './agendamento-wizard.js';

let calendar; // Manter a referência do calendário
let reagendamentoState = { active: false, event: null }; // Controla o modo de reagendamento

/**
 * Renderiza o conteúdo customizado de um evento no calendário.
 * @param {object} eventInfo - Informações do evento do FullCalendar.
 * @returns {object} - Um objeto com o HTML do evento.
 */
function renderEventContent(eventInfo) {
    const props = eventInfo.event.extendedProps;
    let iconClass, title, subtitle;

    if (props.tipo === 'LIVRE') {
        iconClass = 'bg-green-400';
        title = eventInfo.timeText;
        subtitle = props.vistoriador.nome.split(' ')[0];
    } else if (props.tipo === 'FECHADO') {
        iconClass = 'bg-yellow-500';
        title = eventInfo.timeText;
        subtitle = 'Fechado';
    } else {
        iconClass = 'bg-gray-500';
        title = eventInfo.timeText;
        subtitle = props.imovel ? `CT ${props.imovel.cod_imovel}` : 'Ocupado';
    }

    return {
        html: `
            <div class="fc-event-main-frame flex items-center gap-2 overflow-hidden">
                <div class="w-2 h-2 rounded-full flex-shrink-0 ${iconClass}"></div>
                <div class="fc-event-title-container flex-grow">
                    <div class="fc-event-title font-bold">${title}</div>
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
                Vistoriador: ${sanitizeHTML(props.vistoriador.nome)}<br>
                Data: ${event.start.toLocaleDateString('pt-BR')} às ${event.start.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
            </p>
            <div class="flex justify-center gap-4">
                <button id="btn-iniciar-agendamento" class="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition">Iniciar Agendamento</button>
                <button id="btn-fechar-horario" class="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition">Fechar Horário</button>
            </div>
        `;
        showModal(modalHTML, 'max-w-lg');

        document.getElementById('btn-iniciar-agendamento').onclick = () => startAgendamentoWizard(event, calendar);
        document.getElementById('btn-fechar-horario').onclick = () => handleFecharHorario(event.id);

    } else if (props.tipo !== 'FECHADO') {
        renderVistoriaDetailsModal(event);
    }
}

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
        try {
            await api.fecharHorario(agendaId, motivo);
            showAlert('Horário fechado com sucesso!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível fechar o horário.', 'error');
        }
    };
}

/**
 * Renderiza o modal com detalhes de uma vistoria já agendada e adiciona os listeners de eventos.
 * @param {object} event - O evento do FullCalendar.
 */
function renderVistoriaDetailsModal(event) {
    const props = event.extendedProps;
    const imovel = props.imovel || {};
    const cliente = imovel.cliente || {};
    const imobiliaria = imovel.imobiliaria || {};

    const detailsHTML = `
        <div class="p-2">
            <h3 class="text-2xl font-bold text-cyan-300 mb-4">Detalhes da Vistoria</h3>
            <div class="space-y-3 text-gray-300">
                <p><strong>Cód. Imóvel:</strong> ${sanitizeHTML(imovel.cod_imovel || 'N/A')}</p>
                <p><strong>Vistoriador:</strong> ${sanitizeHTML(props.vistoriador.nome)}</p>
                <p><strong>Cliente:</strong> ${sanitizeHTML(cliente.nome || 'N/A')}</p>
                <p><strong>Imobiliária:</strong> ${sanitizeHTML(imobiliaria.nome || 'N/A')}</p>
                <p><strong>Endereço:</strong> ${sanitizeHTML(imovel.endereco || 'N/A')}</p>
                <p><strong>Valor Vistoria:</strong> R$ ${props.valor_final_vistoria?.toFixed(2) || '0.00'}</p>
                <p><strong>Valor Vistoriador:</strong> R$ ${props.valor_vistoriador?.toFixed(2) || '0.00'}</p>
                <p><strong>Obs. Privada:</strong> ${sanitizeHTML(props.observacao_privada || 'Nenhuma')}</p>
            </div>
            <div id="vistoria-actions" class="border-t border-gray-700 mt-6 pt-6 flex flex-wrap justify-center gap-3">
                <button data-action="edit" class="action-btn bg-blue-600 hover:bg-blue-500">Editar</button>
                <button data-action="reschedule" class="action-btn bg-purple-600 hover:bg-purple-500">Reagendar</button>
                <button data-action="unproductive" class="action-btn bg-yellow-500 hover:bg-yellow-400 text-black">Marcar Improdutiva</button>
                <button data-action="cancel" class="action-btn bg-red-600 hover:bg-red-500">Cancelar Agendamento</button>
            </div>
        </div>
    `;
    showModal(detailsHTML, 'max-w-2xl');

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

/**
 * Abre o modal para marcar uma vistoria como improdutiva, solicitando motivo e valor.
 * @param {object} event - O objeto do evento do FullCalendar.
 */
function handleMarcarImprodutiva(event) {
    const modalHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Marcar Vistoria como Improdutiva</h3>
        <form id="form-improdutiva" class="space-y-4">
            <div>
                <label for="motivo_improdutiva" class="block text-sm mb-1">Motivo</label>
                <textarea id="motivo_improdutiva" required class="w-full bg-gray-700 rounded p-2 h-24" placeholder="Descreva o motivo pelo qual a vistoria não pôde ser realizada..."></textarea>
            </div>
            <div>
                <label for="valor_cobranca" class="block text-sm mb-1">Valor a ser Cobrado da Imobiliária (R$)</label>
                <input type="number" step="0.01" min="0" id="valor_cobranca" required class="w-full bg-gray-700 rounded p-2" placeholder="Ex: 80.00">
            </div>
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
        btn.disabled = true;
        btn.textContent = 'Confirmando...';

        const data = {
            motivo: document.getElementById('motivo_improdutiva').value,
            valor_cobranca: parseFloat(document.getElementById('valor_cobranca').value)
        };

        try {
            await api.markAsImprodutiva(event.id, data);
            showAlert('Vistoria marcada como improdutiva!');
            hideModal();
            calendar.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível marcar como improdutiva.', 'error');
            btn.disabled = false;
            btn.textContent = 'Confirmar Improdutiva';
        }
    };
}

/**
 * Lida com a edição completa de uma vistoria, incluindo dados do imóvel.
 * @param {object} event - O evento do FullCalendar.
 */
function handleEditarVistoria(event) {
    const props = event.extendedProps;
    const imovel = props.imovel || {};

    const modalHTML = `
        <h3 class="text-2xl font-bold text-cyan-300 mb-6">Editar Vistoria Completa</h3>
        <form id="form-edit-vistoria" class="space-y-4">
            
            <fieldset class="border border-gray-600 p-4 rounded-lg">
                <legend class="px-2 text-cyan-300">Dados do Imóvel</legend>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            // Dados do imóvel
            cod_imovel: document.getElementById('cod_imovel').value,
            endereco: document.getElementById('endereco').value,
            tamanho: parseFloat(document.getElementById('tamanho').value),
            mobiliado: document.getElementById('mobiliado').value,
            // Dados da vistoria
            tipo_vistoria: document.getElementById('tipo_vistoria').value,
            observacao_privada: document.getElementById('observacao_privada').value,
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
    banner.className = 'bg-purple-600 text-white text-center p-2 font-bold sticky top-0 z-30';
    banner.innerHTML = `
        Reagendando vistoria de ${sanitizeHTML(event.extendedProps.imovel.cod_imovel)}. 
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
        <p class="text-gray-300 mb-6"><strong>Para:</strong> ${targetEvent.start.toLocaleString('pt-BR')} com ${sanitizeHTML(targetEvent.extendedProps.vistoriador.nome)}</p>
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
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-cyan-300">Agenda de Vistorias</h1>
        </div>
        <div id="calendar-container" class="bg-gray-800/50 rounded-xl neon-border p-4 relative">
            <div id="calendar"></div>
        </div>
    `;
    renderPageContent(pageHTML);

    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
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
            if (reagendamentoState.active) {
                return arg.event.extendedProps.tipo === 'LIVRE' ? 'event-reagendamento-disponivel' : 'event-reagendamento-indisponivel';
            }
            return '';
        }
    });

    // Adiciona estilos para o modo de reagendamento
    const style = document.createElement('style');
    style.innerHTML = `
        .event-reagendamento-disponivel { cursor: pointer; background-color: #a78bfa !important; border-color: #8b5cf6 !important; }
        .event-reagendamento-indisponivel { opacity: 0.3; filter: grayscale(1); }
        .action-btn { padding: 0.5rem 1rem; color: white; font-weight: bold; border-radius: 0.5rem; transition: background-color 0.2s; }
    `;
    document.head.appendChild(style);

    calendar.render();
}
