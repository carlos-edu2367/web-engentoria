// /assets/modules/vistoriadores.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, renderPageContent, sanitizeHTML } from '../ui.js';

let vistoriadoresCache = null;

/**
 * Renderiza um gráfico de linha para o histórico de vistorias de um vistoriador,
 * garantindo que sempre exiba os últimos 3 meses completos.
 * @param {string} canvasId - O ID do elemento canvas.
 * @param {Array<object>} historico - O histórico mensal do vistoriador vindo da API.
 */
function renderVistoriadorChart(canvasId, historico) {
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) return;

    const labels = [];
    const data = [];
    const now = new Date();

    let currentDate = new Date(now.getFullYear(), now.getMonth(), 1);

    for (let i = 0; i < 3; i++) {
        currentDate.setMonth(currentDate.getMonth() - 1);

        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();
        const monthLabel = `${String(month).padStart(2, '0')}/${year}`;

        const historicoEntry = historico.find(h => h.mes_ano === monthLabel);
        
        labels.push(monthLabel);
        data.push(historicoEntry ? historicoEntry.total_vistorias : 0);
    }

    labels.reverse();
    data.reverse();

    const ctx = canvasElement.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Vistorias Realizadas',
                data: data,
                borderColor: '#00ffb3',
                backgroundColor: 'rgba(0, 255, 179, 0.1)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#00ffb3'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 10, 0.8)',
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9ca3af', precision: 0 },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { display: false }
                }
            }
        }
    });
}

/**
 * Renderiza o formulário para criar ou editar um vistoriador.
 * @param {object} [vistoriador=null] - O objeto do vistoriador para edição.
 */
function renderVistoriadorForm(vistoriador = null) {
    const isEditing = vistoriador !== null;
    const title = isEditing ? 'Editar Vistoriador' : 'Cadastrar Novo Vistoriador';
    const buttonText = isEditing ? 'Salvar Alterações' : 'Cadastrar';
    const formId = 'vistoriador-form';
    const passwordHelpText = isEditing ? 'Deixe em branco para não alterar a senha.' : '';

    const formHTML = `
        <h2 class="text-2xl font-bold text-cyan-300 mb-6">${title}</h2>
        <form id="${formId}" class="space-y-4">
            <input type="hidden" id="vistoriador-id" value="${isEditing ? vistoriador.id : ''}">
            
            <div>
                <label for="nome" class="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                <input type="text" id="nome" name="nome" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? sanitizeHTML(vistoriador.nome) : ''}">
            </div>

            <div>
                <label for="email" class="block text-sm font-medium text-gray-300 mb-1">E-mail</label>
                <input type="email" id="email" name="email" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing ? sanitizeHTML(vistoriador.email) : ''}">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="telefone1" class="block text-sm font-medium text-gray-300 mb-1">Telefone 1</label>
                    <input type="tel" id="telefone1" name="telefone1" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing && vistoriador.telefone1 ? sanitizeHTML(vistoriador.telefone1) : ''}">
                </div>
                <div>
                    <label for="telefone2" class="block text-sm font-medium text-gray-300 mb-1">Telefone 2 (Opcional)</label>
                    <input type="tel" id="telefone2" name="telefone2" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400" value="${isEditing && vistoriador.telefone2 ? sanitizeHTML(vistoriador.telefone2) : ''}">
                </div>
            </div>

            <div>
                <label for="senha" class="block text-sm font-medium text-gray-300 mb-1">Senha</label>
                <input type="password" id="senha" name="senha" ${!isEditing ? 'required' : ''} minlength="6" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400">
                <p class="text-xs text-gray-400 mt-1">${passwordHelpText}</p>
            </div>

            <div class="flex justify-end gap-4 pt-4">
                <button type="button" id="cancel-button" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition">${buttonText}</button>
            </div>
        </form>
    `;
    showModal(formHTML);

    document.getElementById('cancel-button').addEventListener('click', hideModal);
    document.getElementById(formId).addEventListener('submit', handleFormSubmit);
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('#vistoriador-id').value;
    const isEditing = id !== '';

    const data = {
        nome: form.querySelector('#nome').value,
        email: form.querySelector('#email').value,
        telefone1: form.querySelector('#telefone1').value,
        telefone2: form.querySelector('#telefone2').value,
        tipo: 'vistoriador'
    };

    const senha = form.querySelector('#senha').value;
    if (senha) {
        data.senha = senha;
    }

    try {
        if (isEditing) {
            await api.updateVistoriador(id, data);
            showAlert('Vistoriador atualizado com sucesso!');
        } else {
            await api.createVistoriador(data);
            showAlert('Vistoriador cadastrado com sucesso!');
        }
        hideModal();
        await refreshVistoriadoresList();
    } catch (error) {
        showAlert(error.message || 'Não foi possível salvar o vistoriador.', 'error');
    }
}

function renderConfirmDeleteModal(id, nome) {
    const modalHTML = `
        <h2 class="text-2xl font-bold text-red-400 mb-4">Confirmar Exclusão</h2>
        <p class="text-gray-300 mb-6">Você tem certeza que deseja excluir o vistoriador "<strong>${sanitizeHTML(nome)}</strong>"?</p>
        <div class="flex justify-end gap-4">
            <button id="cancel-delete" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="confirm-delete" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition">Excluir</button>
        </div>
    `;
    showModal(modalHTML, 'max-w-md');

    document.getElementById('cancel-delete').addEventListener('click', hideModal);
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
            await api.deleteVistoriador(id);
            showAlert('Vistoriador excluído com sucesso!');
            hideModal();
            await refreshVistoriadoresList();
        } catch (error) {
            showAlert(error.message || 'Não foi possível excluir o vistoriador.', 'error');
        }
    });
}

function renderVistoriadoresList(vistoriadores) {
    const listContainer = document.getElementById('vistoriadores-list');
    if (!listContainer) return;

    if (vistoriadores.length === 0) {
        listContainer.innerHTML = '<p class="text-center py-8 text-gray-500">Nenhum vistoriador encontrado.</p>';
        return;
    }

    listContainer.innerHTML = vistoriadores.map(v => `
        <div class="bg-gray-800/50 rounded-xl neon-border p-4 flex justify-between items-center">
            <div>
                <p class="font-bold text-white">${sanitizeHTML(v.nome)}</p>
                <p class="text-sm text-gray-400">${sanitizeHTML(v.email)}</p>
            </div>
            <div>
                <button class="details-btn p-2 text-gray-400 hover:text-cyan-300" data-id="${v.id}" title="Ver Detalhes">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                </button>
                <button class="edit-btn p-2 text-gray-400 hover:text-cyan-300" data-id="${v.id}" title="Editar">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                </button>
                <button class="delete-btn p-2 text-gray-400 hover:text-red-400" data-id="${v.id}" data-nome="${sanitizeHTML(v.nome)}" title="Excluir">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        </div>
        <div id="details-${v.id}" class="details-panel bg-gray-900/50 rounded-b-xl p-6 hidden -mt-2"></div>
    `).join('');
}

/**
 * Renderiza a UI de gerenciamento de horários.
 * @param {HTMLElement} container - O elemento onde a UI será renderizada.
 * @param {string} vistoriadorId - O ID do vistoriador.
 */
async function renderHorariosManager(container, vistoriadorId) {
    const diasSemana = [
        { value: '0', text: 'Segunda-feira' }, { value: '1', text: 'Terça-feira' },
        { value: '2', text: 'Quarta-feira' }, { value: '3', text: 'Quinta-feira' },
        { value: '4', text: 'Sexta-feira' }, { value: '5', text: 'Sábado' },
        { value: '6', text: 'Domingo' }
    ];
    
    // MODIFICAÇÃO: Removida a lista de horários fixos.
    
    container.innerHTML = `
        <h4 class="font-bold text-cyan-300 mb-3">Horários Fixos</h4>
        <div id="horarios-fixos-list-${vistoriadorId}" class="space-y-2 mb-4 p-3 bg-gray-800/50 rounded-lg max-h-48 overflow-y-auto">
            <p class="text-gray-400 text-center">Carregando horários...</p>
        </div>
        <form id="form-add-horario-fixo-${vistoriadorId}" class="grid grid-cols-3 gap-2 items-end">
            <select name="dia_semana" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">${diasSemana.map(d => `<option value="${d.value}">${d.text}</option>`).join('')}</select>
            <!-- MODIFICAÇÃO: Substituído select por input type="time" -->
            <input type="time" name="horario" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
            <button type="submit" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition h-full">Adicionar</button>
        </form>

        <h4 class="font-bold text-cyan-300 mt-6 mb-3">Adicionar Horário Avulso</h4>
        <form id="form-add-horario-avulso-${vistoriadorId}" class="grid grid-cols-3 gap-2 items-end">
            <input type="date" name="data" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
            <!-- MODIFICAÇÃO: Substituído select por input type="time" -->
            <input type="time" name="horario" required class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
            <button type="submit" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition h-full">Adicionar</button>
        </form>
    `;

    const refreshList = async () => {
        const horarios = await api.getHorariosFixos(vistoriadorId);
        const listContainer = document.getElementById(`horarios-fixos-list-${vistoriadorId}`);
        if (horarios.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 text-center">Nenhum horário fixo cadastrado.</p>';
            return;
        }
        listContainer.innerHTML = horarios
            .sort((a, b) => a.dia_semana.localeCompare(b.dia_semana) || a.horario.localeCompare(b.horario))
            .map(h => `
            <div class="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                <span>${diasSemana.find(d => d.value === h.dia_semana)?.text || 'Dia inválido'} às ${h.horario}</span>
                <button class="delete-horario-fixo-btn text-red-500 hover:text-red-400" data-horario-id="${h.id}">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
                </button>
            </div>
        `).join('');
    };

    container.addEventListener('click', async (e) => {
        if (e.target.closest('.delete-horario-fixo-btn')) {
            const horarioId = e.target.closest('.delete-horario-fixo-btn').dataset.horarioId;
            try {
                await api.deleteHorarioFixo(horarioId);
                showAlert('Horário fixo removido.');
                refreshList();
            } catch (error) {
                showAlert('Erro ao remover horário.', 'error');
            }
        }
    });

    document.getElementById(`form-add-horario-fixo-${vistoriadorId}`).addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = {
            vistoriador_id: vistoriadorId,
            dia_semana: form.dia_semana.value,
            horario: form.horario.value,
        };
        try {
            await api.addHorarioFixo(data);
            showAlert('Horário fixo adicionado!');
            refreshList();
        } catch (error) {
            showAlert(error.message || 'Não foi possível adicionar o horário.', 'error');
        }
    });

    document.getElementById(`form-add-horario-avulso-${vistoriadorId}`).addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = {
            vistoriador_id: vistoriadorId,
            data: form.data.value,
            horario: form.horario.value,
        };
        try {
            await api.addHorarioAvulso(data);
            showAlert(`Horário avulso em ${data.data} adicionado!`);
            form.reset();
        } catch (error) {
            showAlert(error.message || 'Não foi possível adicionar o horário avulso.', 'error');
        }
    });

    await refreshList();
}

async function showVistoriadorDetails(id) {
    const detailsPanel = document.getElementById(`details-${id}`);
    document.querySelectorAll('.details-panel').forEach(panel => {
        if (panel.id !== `details-${id}`) {
            panel.classList.add('hidden');
        }
    });

    detailsPanel.classList.toggle('hidden');

    if (!detailsPanel.classList.contains('hidden') && detailsPanel.innerHTML.trim() === '') {
        detailsPanel.innerHTML = '<p class="text-center text-gray-400">Carregando estatísticas...</p>';
        try {
            const details = await api.getVistoriadorDetails(id);
            const chartId = `vistoriador-chart-${id}`;
            
            detailsPanel.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <h4 class="font-bold text-cyan-300 mb-3">Estatísticas (Meses Fechados)</h4>
                        <div class="space-y-2 text-sm mb-6">
                            <p><strong>Média de Vistorias:</strong> ${details.media_vistorias_mensal.toFixed(2)}/mês</p>
                            <p><strong>Média de Comissão:</strong> R$ ${details.media_comissao_mensal.toFixed(2)}/mês</p>
                        </div>
                        <h4 class="font-bold text-cyan-300 mb-3">Desempenho nos Últimos 3 Meses</h4>
                        <div class="h-48">
                            <canvas id="${chartId}"></canvas>
                        </div>
                    </div>
                    <div id="horarios-manager-container-${id}">
                        <!-- O gerenciador de horários será renderizado aqui -->
                    </div>
                </div>
            `;
            
            renderVistoriadorChart(chartId, details.historico_mensal);
            const horariosContainer = document.getElementById(`horarios-manager-container-${id}`);
            renderHorariosManager(horariosContainer, id);

        } catch (error) {
            detailsPanel.innerHTML = '<p class="text-center text-red-400">Não foi possível carregar os detalhes.</p>';
        }
    }
}

async function refreshVistoriadoresList() {
    try {
        const vistoriadores = await api.getVistoriadores();
        vistoriadoresCache = vistoriadores;
        renderVistoriadoresList(vistoriadores);
    } catch (error) {
        showAlert('Não foi possível carregar a lista de vistoriadores.', 'error');
    }
}

function handleActions(event) {
    const target = event.target.closest('button');
    if (!target) return;

    const id = target.dataset.id;
    if (target.classList.contains('edit-btn')) {
        const vistoriador = vistoriadoresCache.find(v => v.id === id);
        if (vistoriador) renderVistoriadorForm(vistoriador);
    } else if (target.classList.contains('delete-btn')) {
        const nome = target.dataset.nome;
        renderConfirmDeleteModal(id, nome);
    } else if (target.classList.contains('details-btn')) {
        showVistoriadorDetails(id);
    }
}

export async function initVistoriadores() {
    const pageHTML = `
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-cyan-300">Gestão de Vistoriadores</h1>
            <button id="add-vistoriador-btn" class="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-2 px-4 rounded-lg transition flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                Cadastrar Novo
            </button>
        </div>
        <div id="vistoriadores-list" class="space-y-4">
            <p class="text-center py-8 text-gray-500">Carregando...</p>
        </div>
    `;
    renderPageContent(pageHTML);

    document.getElementById('add-vistoriador-btn').addEventListener('click', () => renderVistoriadorForm());
    document.getElementById('page-content').addEventListener('click', handleActions);

    await refreshVistoriadoresList();
}
