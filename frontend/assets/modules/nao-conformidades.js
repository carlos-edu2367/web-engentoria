// /assets/modules/nao-conformidades.js
// Card "Laudo de Não Conformidades" exibido no detalhe do laudo (admin).

import { api } from '../api.js';
import { showModal, hideModal, showAlert, sanitizeHTML } from '../ui.js';

const GRAVIDADES = {
    CRITICA: { label: 'Crítica', cls: 'bg-red-900/60 text-red-300 border-red-700/60' },
    ALTA: { label: 'Alta', cls: 'bg-orange-900/60 text-orange-300 border-orange-700/60' },
    MEDIA: { label: 'Média', cls: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/60' },
    BAIXA: { label: 'Baixa', cls: 'bg-blue-900/60 text-blue-300 border-blue-700/60' },
};
const CATEGORIAS = {
    HIDRAULICA: 'Hidráulica',
    ELETRICA: 'Elétrica',
    ESQUADRIAS: 'Portas e janelas',
    GAS: 'Gás',
    SEGURANCA_ESTRUTURA: 'Segurança / estrutura',
    EQUIPAMENTOS: 'Equipamentos',
    OUTROS: 'Outros',
};
const FONTES = { LAUDO_DIGITAL: 'laudo digital', ARQUIVO_ANEXO: 'arquivo anexado' };
const POLLING_MS = 5000;

let estado = { laudoId: null, container: null, data: null, pollTimer: null };

/**
 * Renderiza o card de não conformidades dentro de `container`.
 * Some silenciosamente quando o laudo não é de ENTRADA.
 */
export async function renderNaoConformidades(container, laudoId) {
    pararPolling();
    estado = { laudoId, container, data: null, pollTimer: null };
    container.innerHTML = `<div class="mb-6 p-4 bg-gray-900/50 border border-gray-700/50 rounded-lg text-gray-400 text-sm">Carregando laudo de não conformidades...</div>`;
    container.onclick = handleClick;
    await carregar();
}

async function carregar() {
    const { laudoId, container } = estado;
    try {
        const data = await api.getNaoConformidades(laudoId);
        if (estado.laudoId !== laudoId || !document.body.contains(container)) return;
        estado.data = data;
        if (!data.elegivel) {
            container.innerHTML = '';
            return;
        }
        desenhar();
        const status = data.analise?.status;
        if (status === 'PENDENTE' || status === 'PROCESSANDO') {
            estado.pollTimer = setTimeout(carregar, POLLING_MS);
        }
    } catch (error) {
        container.innerHTML = `<div class="mb-6 p-4 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">Erro ao carregar o laudo de não conformidades: ${sanitizeHTML(error.message)}</div>`;
    }
}

function pararPolling() {
    if (estado.pollTimer) clearTimeout(estado.pollTimer);
    estado.pollTimer = null;
}

function badgeGravidade(gravidade) {
    const g = GRAVIDADES[gravidade] || { label: gravidade, cls: 'bg-gray-700 text-gray-300 border-gray-600' };
    return `<span class="inline-block px-2 py-0.5 text-xs font-bold rounded border ${g.cls}">${sanitizeHTML(g.label)}</span>`;
}

function desenhar() {
    const { container, data } = estado;
    const analise = data.analise;
    let corpo = '';

    if (!analise) {
        corpo = data.ia_habilitada
            ? `<p class="text-sm text-gray-400 mb-4">O laudo de não conformidades ainda não foi gerado. Ele é gerado automaticamente quando o vistoriador finaliza um laudo de entrada.</p>
               <div class="flex flex-wrap gap-3">
                   <button data-action="gerar" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition">Gerar agora</button>
                   <button data-action="add-item" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Adicionar item manualmente</button>
               </div>`
            : `<p class="text-sm text-gray-400 mb-4">A análise por IA está desabilitada em Configurações.</p>
               <button data-action="add-item" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Adicionar item manualmente</button>`;
    } else if (analise.status === 'PENDENTE' || analise.status === 'PROCESSANDO') {
        corpo = `
            <div class="flex items-center gap-3 text-cyan-300">
                <div class="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm">Analisando o laudo de entrada... isso pode levar alguns minutos.</p>
            </div>`;
    } else if (analise.status === 'ERRO') {
        corpo = `
            <div class="p-3 mb-4 bg-red-900/30 border border-red-700/50 rounded-lg">
                <p class="text-sm font-bold text-red-300 mb-1">Não foi possível gerar o laudo de não conformidades.</p>
                <p class="text-sm text-red-200">${sanitizeHTML(analise.erro || 'Erro desconhecido.')}</p>
            </div>
            <div class="flex flex-wrap gap-3">
                ${data.ia_habilitada ? '<button data-action="gerar" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition">Tentar novamente</button>' : ''}
                <button data-action="add-item" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Adicionar item manualmente</button>
            </div>`;
    } else {
        corpo = desenharConcluida(analise);
    }

    container.innerHTML = `
        <div class="mb-6 p-4 bg-gray-900/50 border border-cyan-700/50 rounded-lg">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h4 class="font-bold text-cyan-300">Laudo de Não Conformidades</h4>
                <span class="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50">IA</span>
            </div>
            <p class="text-xs text-gray-500 mb-4">Gerado com o auxílio de Inteligência Artificial. Revise os itens antes de aprovar: ao aprovar o laudo, este documento é liberado para a imobiliária junto com o laudo de entrada.</p>
            ${corpo}
        </div>`;
}

function desenharConcluida(analise) {
    const itens = analise.itens || [];
    const ncs = itens.filter(i => i.tipo === 'NAO_CONFORMIDADE');
    const naoVerificados = itens.filter(i => i.tipo === 'NAO_VERIFICADO');

    const resumo = ncs.length
        ? Object.keys(GRAVIDADES)
            .map(g => ({ g, qtd: ncs.filter(i => i.gravidade === g).length }))
            .filter(x => x.qtd > 0)
            .map(x => `<span class="inline-flex items-center gap-1">${badgeGravidade(x.g)}<span class="text-sm text-gray-300">${x.qtd}</span></span>`)
            .join('')
        : '<span class="text-sm text-green-300">Nenhuma não conformidade identificada.</span>';

    const meta = [
        analise.modelo ? `Modelo: ${sanitizeHTML(analise.modelo)}` : null,
        analise.fontes?.length ? `Fontes: ${sanitizeHTML(analise.fontes.map(f => FONTES[f] || f).join(', '))}` : null,
        analise.concluido_em ? `Gerado em ${new Date(analise.concluido_em).toLocaleString('pt-BR')}` : null,
    ].filter(Boolean).join(' · ');

    return `
        ${analise.aviso ? `<div class="p-3 mb-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-200">${sanitizeHTML(analise.aviso)}</div>` : ''}
        <div class="flex flex-wrap items-center gap-3 mb-4">${resumo}</div>
        ${listaPorAmbiente(ncs, true)}
        ${naoVerificados.length ? `
            <h5 class="text-sm font-bold text-gray-300 mt-6 mb-2">Itens não verificados na vistoria</h5>
            ${listaPorAmbiente(naoVerificados, false)}` : ''}
        <div class="flex flex-wrap gap-3 mt-5">
            <button data-action="add-item" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition text-sm">Adicionar item</button>
            <button data-action="pdf" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition text-sm">Visualizar PDF</button>
            ${estado.data.ia_habilitada ? '<button data-action="regerar" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition text-sm">Regerar com IA</button>' : ''}
        </div>
        ${meta ? `<p class="text-xs text-gray-500 mt-3">${meta}</p>` : ''}`;
}

function listaPorAmbiente(itens, comGravidade) {
    if (!itens.length) return '';
    const grupos = new Map();
    itens.forEach(i => {
        if (!grupos.has(i.ambiente)) grupos.set(i.ambiente, []);
        grupos.get(i.ambiente).push(i);
    });
    return [...grupos.entries()].map(([ambiente, lista]) => `
        <div class="mb-3">
            <p class="text-sm font-semibold text-white mb-2">${sanitizeHTML(ambiente)}</p>
            <div class="space-y-2">
                ${lista.map(i => `
                    <div class="p-3 bg-gray-800 rounded-lg border ${i.origem === 'IA' && !i.evidencia_validada ? 'border-yellow-600/60' : 'border-gray-700/50'}">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                            <div class="flex-1 min-w-[200px]">
                                <div class="flex flex-wrap items-center gap-2 mb-1">
                                    ${comGravidade ? badgeGravidade(i.gravidade) : ''}
                                    <span class="text-xs text-gray-400">${sanitizeHTML(CATEGORIAS[i.categoria] || i.categoria)}</span>
                                    ${i.origem === 'MANUAL' ? '<span class="text-xs px-1.5 rounded bg-gray-700 text-gray-300">Manual</span>' : ''}
                                </div>
                                <p class="text-sm text-gray-200"><strong>${sanitizeHTML(i.item)}</strong> — ${sanitizeHTML(i.descricao)}</p>
                                ${i.origem === 'IA' && !i.evidencia_validada ? '<p class="text-xs text-yellow-300 mt-1">Trecho citado pela IA não foi localizado no laudo. Confira antes de aprovar.</p>' : ''}
                                ${i.trecho_origem ? `
                                    <details class="mt-1">
                                        <summary class="text-xs text-gray-500 cursor-pointer">Ver trecho do laudo</summary>
                                        <p class="text-xs text-gray-400 italic mt-1 whitespace-pre-wrap">"${sanitizeHTML(i.trecho_origem)}"</p>
                                    </details>` : ''}
                            </div>
                            <div class="flex gap-1">
                                <button data-action="edit-item" data-id="${i.id}" class="p-1.5 text-gray-400 hover:text-cyan-300 transition" title="Editar">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 9 17l.464-3.536z"/></svg>
                                </button>
                                <button data-action="delete-item" data-id="${i.id}" class="p-1.5 text-gray-400 hover:text-red-400 transition" title="Remover">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`).join('');
}

// --- Ações ---------------------------------------------------------------------

async function handleClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const acao = btn.dataset.action;
    if (acao === 'gerar') await gerar(btn);
    else if (acao === 'regerar') confirmarRegerar();
    else if (acao === 'pdf') await abrirPdf(btn);
    else if (acao === 'add-item') abrirModalItem(null);
    else if (acao === 'edit-item') abrirModalItem(buscarItem(btn.dataset.id));
    else if (acao === 'delete-item') confirmarRemocao(buscarItem(btn.dataset.id));
}

function buscarItem(id) {
    return (estado.data?.analise?.itens || []).find(i => String(i.id) === String(id));
}

async function gerar(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
        await api.gerarNaoConformidades(estado.laudoId);
        showAlert('Análise iniciada. O resultado aparecerá aqui em alguns minutos.');
    } catch (error) {
        showAlert(error.message || 'Erro ao iniciar a análise.', 'error');
    }
    pararPolling();
    await carregar();
}

function confirmarRegerar() {
    const temManuais = (estado.data?.analise?.itens || []).some(i => i.origem === 'MANUAL');
    showModal(`
        <h2 class="text-2xl font-bold text-cyan-300 mb-4">Regerar com IA</h2>
        <p class="text-gray-300 mb-2">A lista atual será substituída por uma nova análise do laudo de entrada.</p>
        ${temManuais ? '<p class="text-yellow-300 text-sm mb-2">Atenção: itens adicionados ou editados manualmente serão perdidos.</p>' : ''}
        <div class="flex justify-end gap-4 mt-6">
            <button id="nc-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="nc-confirm" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition">Regerar</button>
        </div>`, 'max-w-md');
    document.getElementById('nc-cancel').onclick = hideModal;
    document.getElementById('nc-confirm').onclick = async () => {
        hideModal();
        await gerar(null);
    };
}

async function abrirPdf(btn) {
    btn.disabled = true;
    try {
        await api.abrirPdfNaoConformidades(estado.laudoId);
    } catch (error) {
        showAlert(error.message || 'Erro ao abrir o PDF.', 'error');
    } finally {
        btn.disabled = false;
    }
}

function confirmarRemocao(item) {
    if (!item) return;
    showModal(`
        <h2 class="text-2xl font-bold text-red-400 mb-4">Remover item</h2>
        <p class="text-gray-300 mb-6" id="nc-remover-texto"></p>
        <div id="nc-modal-error" class="text-red-400 text-sm hidden mb-4"></div>
        <div class="flex justify-end gap-4">
            <button id="nc-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
            <button id="nc-confirm" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition">Remover</button>
        </div>`, 'max-w-md');
    document.getElementById('nc-remover-texto').textContent = `Remover "${item.item} — ${item.descricao}" do laudo de não conformidades?`;
    document.getElementById('nc-cancel').onclick = hideModal;
    document.getElementById('nc-confirm').onclick = async (e) => {
        e.currentTarget.disabled = true;
        try {
            await api.deleteItemNaoConformidade(item.id);
            hideModal();
            await carregar();
        } catch (error) {
            mostrarErroModal(error.message);
            e.currentTarget.disabled = false;
        }
    };
}

function opcoes(mapa, selecionado) {
    return Object.entries(mapa)
        .map(([valor, label]) => `<option value="${valor}" ${valor === selecionado ? 'selected' : ''}>${sanitizeHTML(typeof label === 'string' ? label : label.label)}</option>`)
        .join('');
}

function abrirModalItem(item) {
    const editando = Boolean(item);
    const campo = 'w-full bg-gray-700 rounded p-2 border border-gray-600 focus:ring-2 focus:ring-cyan-500';
    showModal(`
        <h2 class="text-2xl font-bold text-cyan-300 mb-4">${editando ? 'Editar item' : 'Adicionar item'}</h2>
        <form id="nc-form-item" class="space-y-3">
            <div>
                <label class="block text-sm text-gray-400 mb-1">Tipo</label>
                <select name="tipo" class="${campo}">
                    <option value="NAO_CONFORMIDADE">Não conformidade</option>
                    <option value="NAO_VERIFICADO">Item não verificado na vistoria</option>
                </select>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Ambiente</label>
                    <input name="ambiente" required maxlength="200" placeholder="Ex.: Banheiro social" class="${campo}">
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Item</label>
                    <input name="item" required maxlength="200" placeholder="Ex.: Sifão da pia" class="${campo}">
                </div>
            </div>
            <div>
                <label class="block text-sm text-gray-400 mb-1">Problema</label>
                <textarea name="descricao" required maxlength="1000" rows="3" placeholder="Ex.: Sifão solto, com vazamento" class="${campo}"></textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Categoria</label>
                    <select name="categoria" class="${campo}">${opcoes(CATEGORIAS, item?.categoria || 'OUTROS')}</select>
                </div>
                <div id="nc-campo-gravidade">
                    <label class="block text-sm text-gray-400 mb-1">Gravidade</label>
                    <select name="gravidade" class="${campo}">${opcoes(GRAVIDADES, item?.gravidade || 'MEDIA')}</select>
                </div>
            </div>
            <div id="nc-modal-error" class="text-red-400 text-sm hidden"></div>
            <div class="flex justify-end gap-4 pt-2">
                <button type="button" id="nc-cancel" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition">Salvar</button>
            </div>
        </form>`, 'max-w-lg');

    const form = document.getElementById('nc-form-item');
    // Valores atribuídos via JS (e não interpolados no HTML) para evitar injeção em atributos
    form.tipo.value = item?.tipo || 'NAO_CONFORMIDADE';
    form.ambiente.value = item?.ambiente || '';
    form.item.value = item?.item || '';
    form.descricao.value = item?.descricao || '';

    const atualizarGravidade = () => {
        document.getElementById('nc-campo-gravidade').classList.toggle('hidden', form.tipo.value === 'NAO_VERIFICADO');
    };
    form.tipo.onchange = atualizarGravidade;
    atualizarGravidade();

    document.getElementById('nc-cancel').onclick = hideModal;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const payload = {
            tipo: form.tipo.value,
            ambiente: form.ambiente.value.trim(),
            item: form.item.value.trim(),
            descricao: form.descricao.value.trim(),
            categoria: form.categoria.value,
            gravidade: form.tipo.value === 'NAO_VERIFICADO' ? 'BAIXA' : form.gravidade.value,
        };
        if (!payload.ambiente || !payload.item || !payload.descricao) {
            mostrarErroModal('Preencha ambiente, item e problema.');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        try {
            if (editando) await api.updateItemNaoConformidade(item.id, payload);
            else await api.addItemNaoConformidade(estado.laudoId, payload);
            hideModal();
            await carregar();
        } catch (error) {
            mostrarErroModal(error.message);
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    };
}

function mostrarErroModal(mensagem) {
    const el = document.getElementById('nc-modal-error');
    if (!el) return;
    el.textContent = mensagem;
    el.classList.remove('hidden');
}
