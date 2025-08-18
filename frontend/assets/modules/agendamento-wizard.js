// /assets/modules/agendamento-wizard.js

import { api } from '../api.js';
import { showModal, hideModal, showAlert, sanitizeHTML } from '../ui.js';

let wizardState = {};
let calendarRef = null;
let cache = {
    imobiliarias: null,
    clientes: null,
    imoveis: {} // Cache de imóveis por imobiliária
};

// --- Funções de Renderização dos Passos ---

function renderWizard() {
    const stepRenderers = {
        1: renderStep1,
        2: renderStep2,
        3: renderStep3,
        4: renderStep4
    };
    const renderer = stepRenderers[wizardState.step];
    if (renderer) {
        renderer();
    }
}

async function renderStep1() {
    if (!cache.imobiliarias) {
        cache.imobiliarias = await api.getImobiliarias();
    }
    const wizardHTML = `
        <div id="wizard-content">
            <h3 class="text-xl font-bold text-white mb-4">Passo 1 de 4: Selecione a Imobiliária</h3>
            <input type="text" id="search-imobiliaria" class="w-full bg-gray-700 rounded p-2 mb-3" placeholder="Pesquisar imobiliária...">
            <ul id="imobiliaria-list" class="max-h-64 overflow-y-auto space-y-2">
                ${cache.imobiliarias.map(imob => `
                    <li class="p-3 rounded-lg hover:bg-cyan-800/50 cursor-pointer" data-id="${imob.id}">
                        ${sanitizeHTML(imob.nome)}
                    </li>
                `).join('')}
            </ul>
        </div>
        <div class="flex justify-end mt-6">
            <button id="cancel-wizard" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
        </div>
    `;
    showModal(wizardHTML, 'max-w-lg');

    document.getElementById('cancel-wizard').onclick = hideModal;
    const list = document.getElementById('imobiliaria-list');
    
    list.onclick = (e) => {
        if (e.target.tagName === 'LI') {
            wizardState.imobiliaria_id = e.target.dataset.id;
            wizardState.imobiliaria_nome = e.target.textContent.trim();
            wizardState.step = 2;
            renderWizard();
        }
    };

    document.getElementById('search-imobiliaria').onkeyup = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        list.querySelectorAll('li').forEach(li => {
            li.style.display = li.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    };
}

async function renderStep2() {
    if (!cache.clientes) {
        cache.clientes = await api.getClientes();
    }
     const wizardHTML = `
        <div id="wizard-content">
            <h3 class="text-xl font-bold text-white mb-4">Passo 2 de 4: Selecione o Cliente</h3>
            <div class="flex gap-2 mb-3">
                <input type="text" id="search-cliente" class="w-full bg-gray-700 rounded p-2" placeholder="Pesquisar cliente...">
                <button id="add-new-cliente" class="p-2 bg-green-600 hover:bg-green-500 rounded-lg">Novo</button>
            </div>
            <ul id="cliente-list" class="max-h-64 overflow-y-auto space-y-2">
                ${cache.clientes.map(c => `
                    <li class="p-3 rounded-lg hover:bg-cyan-800/50 cursor-pointer" data-id="${c.id}">
                        <p class="font-bold">${sanitizeHTML(c.nome)}</p>
                        <p class="text-sm text-gray-400">${sanitizeHTML(c.email)}</p>
                    </li>
                `).join('')}
            </ul>
        </div>
        <div class="flex justify-between mt-6">
            <button id="back-wizard" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Voltar</button>
            <button id="cancel-wizard" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition">Cancelar</button>
        </div>
    `;
    showModal(wizardHTML, 'max-w-lg');
    
    document.getElementById('back-wizard').onclick = () => { wizardState.step = 1; renderWizard(); };
    document.getElementById('cancel-wizard').onclick = hideModal;
    document.getElementById('add-new-cliente').onclick = renderNewClienteForm;

    const list = document.getElementById('cliente-list');
    list.onclick = (e) => {
        const li = e.target.closest('li');
        if (li) {
            wizardState.cliente_id = li.dataset.id;
            wizardState.cliente_nome = li.querySelector('p').textContent.trim();
            wizardState.step = 3;
            renderWizard();
        }
    };
    
    document.getElementById('search-cliente').onkeyup = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        list.querySelectorAll('li').forEach(li => {
            li.style.display = li.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    };
}

async function renderStep3() {
    if (!cache.imoveis[wizardState.imobiliaria_id]) {
        // Idealmente, o backend filtraria por imobiliaria_id
        const todosImoveis = await api.getImoveis();
        cache.imoveis[wizardState.imobiliaria_id] = todosImoveis;
    }
    const imoveis = cache.imoveis[wizardState.imobiliaria_id].filter(i => i.imobiliaria.id === wizardState.imobiliaria_id);

    const wizardHTML = `
        <div id="wizard-content">
            <h3 class="text-xl font-bold text-white mb-4">Passo 3 de 4: Selecione o Imóvel</h3>
            <div class="flex gap-2 mb-3">
                <input type="text" id="search-imovel" class="w-full bg-gray-700 rounded p-2" placeholder="Pesquisar por código ou endereço...">
                <button id="add-new-imovel" class="p-2 bg-green-600 hover:bg-green-500 rounded-lg">Novo</button>
            </div>
            <ul id="imovel-list" class="max-h-64 overflow-y-auto space-y-2">
                ${imoveis.map(i => `
                    <li class="p-3 rounded-lg hover:bg-cyan-800/50 cursor-pointer" data-id="${i.id}">
                        <p class="font-bold">CT ${sanitizeHTML(i.cod_imovel)}</p>
                        <p class="text-sm text-gray-400">${sanitizeHTML(i.endereco)}</p>
                    </li>
                `).join('')}
            </ul>
        </div>
        <div class="flex justify-between mt-6">
            <button id="back-wizard" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Voltar</button>
            <button id="cancel-wizard" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition">Cancelar</button>
        </div>
    `;
    showModal(wizardHTML, 'max-w-lg');
    
    document.getElementById('back-wizard').onclick = () => { wizardState.step = 2; renderWizard(); };
    document.getElementById('cancel-wizard').onclick = hideModal;
    document.getElementById('add-new-imovel').onclick = renderNewImovelForm;

    const list = document.getElementById('imovel-list');
    list.onclick = (e) => {
        const li = e.target.closest('li');
        if (li) {
            wizardState.imovel_id = li.dataset.id;
            wizardState.imovel_cod = li.querySelector('p').textContent.trim();
            wizardState.step = 4;
            renderWizard();
        }
    };
    
    document.getElementById('search-imovel').onkeyup = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        list.querySelectorAll('li').forEach(li => {
            li.style.display = li.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    };
}

async function renderStep4() {
    const imovel = cache.imoveis[wizardState.imobiliaria_id].find(i => i.id === wizardState.imovel_id);
    const necessitaHorarioDuplo = (imovel.tamanho >= 100 || imovel.mobiliado === 'mobiliado');
    
    const wizardHTML = `
        <div id="wizard-content">
            <h3 class="text-xl font-bold text-white mb-4">Passo 4 de 4: Confirmação</h3>
            <div class="space-y-2 p-4 bg-gray-900/50 rounded-lg">
                <p><strong>Imobiliária:</strong> ${sanitizeHTML(wizardState.imobiliaria_nome)}</p>
                <p><strong>Cliente:</strong> ${sanitizeHTML(wizardState.cliente_nome)}</p>
                <p><strong>Imóvel:</strong> ${sanitizeHTML(wizardState.imovel_cod)}</p>
                <p><strong>Horário:</strong> ${wizardState.horario_selecionado_str}</p>
                <p><strong>Vistoriador:</strong> ${sanitizeHTML(wizardState.vistoriador_nome)}</p>
            </div>
            ${necessitaHorarioDuplo ? `
            <div class="mt-4 p-3 bg-yellow-500/20 border border-yellow-500 rounded-lg text-yellow-300 text-sm">
                <p><strong>Atenção:</strong> Este imóvel requer 2 horários. O sistema tentará alocar o próximo horário livre do vistoriador.</p>
                <div class="mt-2"><input type="checkbox" id="force-single" class="mr-2"><label for="force-single">Forçar agendamento em horário único</label></div>
            </div>` : ''}
            
            <div class="mt-4">
                <label for="tipo_vistoria" class="block text-sm">Tipo de Vistoria</label>
                <select id="tipo_vistoria" class="w-full bg-gray-700 rounded px-3 py-2 mt-1">
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                    <option value="CONFERENCIA">Conferência</option>
                    <option value="AVERIGUACAO">Averiguação</option>
                    <option value="COMPLEMENTO_VISITA">Complemento/Visita</option>
                </select>
            </div>
        </div>
        <div class="flex justify-between mt-6">
            <button id="back-wizard" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Voltar</button>
            <button id="confirm-agendamento" class="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg transition font-bold">Confirmar Agendamento</button>
        </div>
    `;
    showModal(wizardHTML, 'max-w-lg');
    
    document.getElementById('back-wizard').onclick = () => { wizardState.step = 3; renderWizard(); };
    document.getElementById('confirm-agendamento').onclick = async () => {
        const data = {
            horario_id: wizardState.horario_id,
            imovel_id: wizardState.imovel_id,
            imobiliaria_id: wizardState.imobiliaria_id,
            tipo: document.getElementById('tipo_vistoria').value,
            force_single_slot: document.getElementById('force-single')?.checked || false
        };
        try {
            await api.scheduleVistoria(data);
            showAlert('Vistoria agendada com sucesso!');
            hideModal();
            calendarRef.refetchEvents();
        } catch (error) {
            showAlert(error.message || 'Não foi possível agendar.', 'error');
        }
    };
}


// --- Funções para Novos Cadastros ---

function renderNewClienteForm() {
    const formHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Novo Cliente</h3>
        <form id="form-new-cliente" class="space-y-3">
            <input type="text" name="nome" required placeholder="Nome Completo" class="w-full bg-gray-700 rounded p-2">
            <input type="email" name="email" required placeholder="E-mail" class="w-full bg-gray-700 rounded p-2">
            <input type="tel" name="telefone1" placeholder="Telefone 1" class="w-full bg-gray-700 rounded p-2">
            <input type="tel" name="telefone2" placeholder="Telefone 2" class="w-full bg-gray-700 rounded p-2">
            <div class="flex justify-end gap-2 pt-3">
                <button type="button" id="back-to-wizard" class="px-4 py-2 bg-gray-600 rounded">Voltar</button>
                <button type="submit" class="px-4 py-2 bg-green-600 rounded flex items-center justify-center">Salvar Cliente</button>
            </div>
        </form>
    `;
    document.getElementById('wizard-content').innerHTML = formHTML;
    document.getElementById('back-to-wizard').onclick = renderStep2;
    document.getElementById('form-new-cliente').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Salvando...';

        const data = {
            nome: form.nome.value, email: form.email.value,
            telefone1: form.telefone1.value, telefone2: form.telefone2.value
        };
        try {
            const novoCliente = await api.createCliente(data);
            showAlert('Cliente criado com sucesso!');
            cache.clientes = null; // Invalida o cache para buscar a lista atualizada
            wizardState.cliente_id = novoCliente.id;
            wizardState.cliente_nome = novoCliente.nome;
            wizardState.step = 3;
            renderWizard();
        } catch (error) {
            showAlert(error.message || 'Erro ao criar cliente.', 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Cliente';
        }
    };
}

function renderNewImovelForm() {
    const formHTML = `
        <h3 class="text-xl font-bold text-white mb-4">Novo Imóvel</h3>
        <form id="form-new-imovel" class="space-y-3">
            <input type="text" name="cod_imovel" required placeholder="Código do Imóvel" class="w-full bg-gray-700 rounded p-2">
            <input type="text" name="endereco" required placeholder="Endereço Completo" class="w-full bg-gray-700 rounded p-2">
            <div class="grid grid-cols-2 gap-2">
                <input type="text" name="cep" placeholder="CEP" class="w-full bg-gray-700 rounded p-2">
                <input type="number" step="0.01" name="tamanho" required placeholder="Tamanho (m²)" class="w-full bg-gray-700 rounded p-2">
            </div>
            <input type="text" name="referencia" placeholder="Ponto de Referência" class="w-full bg-gray-700 rounded p-2">
            <select name="mobiliado" class="w-full bg-gray-700 rounded p-2">
                <option value="sem_mobilia">Sem Mobília</option>
                <option value="semi_mobiliado">Semi Mobiliado</option>
                <option value="mobiliado">Mobiliado</option>
            </select>
            <div class="flex justify-end gap-2 pt-3">
                <button type="button" id="back-to-wizard" class="px-4 py-2 bg-gray-600 rounded">Voltar</button>
                <button type="submit" class="px-4 py-2 bg-green-600 rounded flex items-center justify-center">Salvar Imóvel</button>
            </div>
        </form>
    `;
    document.getElementById('wizard-content').innerHTML = formHTML;
    document.getElementById('back-to-wizard').onclick = renderStep3;
    document.getElementById('form-new-imovel').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Salvando...';

        const data = {
            cod_imovel: form.cod_imovel.value,
            endereco: form.endereco.value,
            tamanho: parseFloat(form.tamanho.value),
            mobiliado: form.mobiliado.value,
            cep: form.cep.value,
            referencia: form.referencia.value,
            cliente_id: wizardState.cliente_id,
            imobiliaria_id: wizardState.imobiliaria_id
        };
        try {
            const novoImovel = await api.createImovel(data);
            showAlert('Imóvel criado com sucesso!');
            
            // CORREÇÃO: Adiciona o novo imóvel ao cache em vez de invalidá-lo
            if (cache.imoveis[wizardState.imobiliaria_id]) {
                cache.imoveis[wizardState.imobiliaria_id].push(novoImovel);
            } else {
                cache.imoveis[wizardState.imobiliaria_id] = [novoImovel];
            }

            wizardState.imovel_id = novoImovel.id;
            wizardState.imovel_cod = `CT ${novoImovel.cod_imovel}`;
            wizardState.step = 4;
            renderWizard();
        } catch (error) {
            showAlert(error.message || 'Erro ao criar imóvel.', 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Salvar Imóvel';
        }
    };
}


// --- Função de Inicialização ---

export function startAgendamentoWizard(horario, calendarInstance) {
    wizardState = {
        horario_id: horario.id,
        vistoriador_id: horario.extendedProps.vistoriador.id,
        vistoriador_nome: horario.extendedProps.vistoriador.nome,
        horario_selecionado_str: horario.start.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        step: 1,
    };
    calendarRef = calendarInstance;
    renderWizard();
}
