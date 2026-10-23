// /assets/modules/uso-ia.js
// Página "Uso da IA": laudos de não conformidades gerados pela IA, tokens, tempo e custo estimado.

import { api } from '../api.js';
import { renderPageContent, showAlert, sanitizeHTML } from '../ui.js';

const PERIODOS = [
    { dias: 7, label: 'Últimos 7 dias' },
    { dias: 30, label: 'Últimos 30 dias' },
    { dias: 90, label: 'Últimos 90 dias' },
    { dias: 365, label: 'Últimos 12 meses' },
    { dias: 0, label: 'Todo o período' },
];
const STATUS = {
    CONCLUIDA: { label: 'Concluída', cls: 'bg-green-900/50 text-green-300 border-green-700/50' },
    ERRO: { label: 'Erro', cls: 'bg-red-900/50 text-red-300 border-red-700/50' },
    PENDENTE: { label: 'Na fila', cls: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50' },
    PROCESSANDO: { label: 'Processando', cls: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50' },
};
const FILTROS = {
    todos: { label: 'Todos', fn: () => true },
    ia: { label: 'Gerados pela IA', fn: l => l.status === 'CONCLUIDA' && l.gerado_por_ia },
    erro: { label: 'Com erro', fn: l => l.status === 'ERRO' },
    andamento: { label: 'Em andamento', fn: l => l.status === 'PENDENTE' || l.status === 'PROCESSANDO' },
    manual: { label: 'Montados à mão', fn: l => l.status === 'CONCLUIDA' && !l.gerado_por_ia },
};

let estado = { dias: 30, filtro: 'todos', data: null };

const fmtNum = (v, casas = 0) => (v === null || v === undefined)
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

function fmtUSD(v) {
    if (v === null || v === undefined) return '—';
    const casas = v > 0 && v < 0.01 ? 4 : 2;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtDuracao(segundos) {
    if (segundos === null || segundos === undefined) return '—';
    if (segundos < 60) return `${fmtNum(segundos, 0)} s`;
    const min = Math.floor(segundos / 60);
    return `${min} min ${String(Math.round(segundos % 60)).padStart(2, '0')} s`;
}

const fmtData = (v) => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDataVistoria = (v) => v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR') : '—';

export async function initUsoIA() {
    renderPageContent(`
        <div class="flex flex-wrap justify-between items-center gap-4 mb-8">
            <div>
                <h1 class="text-3xl font-bold text-cyan-300">Uso da IA</h1>
                <p class="text-sm text-gray-400 mt-1">Laudos de não conformidades gerados pela IA, consumo de tokens e custo estimado.</p>
            </div>
            <select id="uso-ia-periodo" class="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-200">
                ${PERIODOS.map(p => `<option value="${p.dias}" ${p.dias === estado.dias ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
        </div>
        <div id="uso-ia-conteudo"><p class="text-center text-gray-400 p-8">Carregando...</p></div>
    `);

    document.getElementById('uso-ia-periodo').addEventListener('change', (e) => {
        estado.dias = Number(e.target.value);
        carregar();
    });
    const conteudo = document.getElementById('uso-ia-conteudo');
    conteudo.addEventListener('click', handleClick);
    conteudo.addEventListener('change', (e) => {
        if (e.target.id === 'uso-ia-filtro') {
            estado.filtro = e.target.value;
            desenharLaudos();
        }
    });
    await carregar();
}

async function carregar() {
    const conteudo = document.getElementById('uso-ia-conteudo');
    if (!conteudo) return;
    const dias = estado.dias;
    conteudo.style.opacity = '0.5';
    try {
        const data = await api.getUsoIA(dias);
        if (dias !== estado.dias || !document.body.contains(conteudo)) return;
        estado.data = data;
        desenhar(conteudo);
    } catch (error) {
        conteudo.innerHTML = `<p class="text-center text-red-400 p-8">Erro ao carregar o uso da IA: ${sanitizeHTML(error.message)}</p>`;
    } finally {
        conteudo.style.opacity = '';
    }
}

function card(titulo, valor, detalhe = '') {
    return `
        <div class="bg-gray-800/50 p-5 rounded-xl neon-border">
            <h2 class="text-sm font-medium text-gray-400">${titulo}</h2>
            <p class="text-3xl font-bold text-white mt-2">${valor}</p>
            ${detalhe ? `<p class="text-xs text-gray-500 mt-1">${detalhe}</p>` : ''}
        </div>`;
}

function desenhar(conteudo) {
    const { resumo, modelos } = estado.data;
    const taxaErro = resumo.taxa_erro === null ? '' : `${fmtNum(resumo.taxa_erro * 100, 1)}% das execuções`;
    const outros = [
        resumo.em_andamento ? `${resumo.em_andamento} em andamento` : null,
        resumo.manuais ? `${resumo.manuais} montado(s) à mão` : null,
    ].filter(Boolean).join(' · ');

    conteudo.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            ${card('Laudos gerados pela IA', fmtNum(resumo.geradas_ia), outros)}
            ${card('Média de tokens por laudo', fmtNum(resumo.media_tokens_total),
                   `entrada ${fmtNum(resumo.media_tokens_entrada)} · saída ${fmtNum(resumo.media_tokens_saida)}`)}
            ${card('Total de tokens', fmtNum(resumo.tokens_entrada + resumo.tokens_saida),
                   `entrada ${fmtNum(resumo.tokens_entrada)} · saída ${fmtNum(resumo.tokens_saida)}`)}
            ${card('Tempo médio de geração', fmtDuracao(resumo.duracao_media_s))}
            ${card('Custo estimado', fmtUSD(resumo.custo_estimado_usd),
                   'Preços atuais do OpenRouter. O Ollama Cloud é cobrado por assinatura.')}
            ${card('Com erro', fmtNum(resumo.com_erro), taxaErro)}
        </div>

        <div class="bg-gray-800/50 rounded-xl neon-border p-5 mb-8">
            <h2 class="text-lg font-bold text-cyan-300 mb-4">Por modelo</h2>
            ${modelos.length ? tabelaModelos(modelos) : '<p class="text-sm text-gray-400">Nenhum laudo gerado pela IA no período.</p>'}
        </div>

        <div class="bg-gray-800/50 rounded-xl neon-border p-5">
            <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
                <h2 class="text-lg font-bold text-cyan-300">Laudos</h2>
                <select id="uso-ia-filtro" class="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200">
                    ${Object.entries(FILTROS).map(([id, f]) => `<option value="${id}" ${id === estado.filtro ? 'selected' : ''}>${f.label}</option>`).join('')}
                </select>
            </div>
            <div id="uso-ia-laudos"></div>
            <p class="text-xs text-gray-500 mt-4">Cada laudo guarda só a última execução: ao regerar, os tokens da execução anterior são substituídos. O Insight IA da agenda não entra nesta conta.</p>
        </div>`;
    desenharLaudos();
}

function tabelaModelos(modelos) {
    return `
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
                <thead class="text-xs uppercase text-gray-400 border-b border-gray-700">
                    <tr>
                        <th class="py-2 pr-4">Modelo</th>
                        <th class="py-2 pr-4 text-right">Laudos</th>
                        <th class="py-2 pr-4 text-right">Tokens médios (entrada / saída)</th>
                        <th class="py-2 pr-4 text-right">Maior laudo</th>
                        <th class="py-2 pr-4 text-right">Tempo médio</th>
                        <th class="py-2 pr-4 text-right">NCs por laudo</th>
                        <th class="py-2 text-right">Custo estimado</th>
                    </tr>
                </thead>
                <tbody>
                    ${modelos.map(m => `
                        <tr class="border-b border-gray-700/50">
                            <td class="py-2 pr-4">
                                <p class="text-white font-medium break-all">${sanitizeHTML(m.modelo || '—')}</p>
                                <p class="text-xs text-gray-500">${sanitizeHTML(m.provider_nome || '')}</p>
                            </td>
                            <td class="py-2 pr-4 text-right">${fmtNum(m.laudos)}</td>
                            <td class="py-2 pr-4 text-right whitespace-nowrap">${fmtNum(m.media_tokens_entrada)} / ${fmtNum(m.media_tokens_saida)}</td>
                            <td class="py-2 pr-4 text-right">${fmtNum(m.max_tokens_total)}</td>
                            <td class="py-2 pr-4 text-right whitespace-nowrap">${fmtDuracao(m.duracao_media_s)}</td>
                            <td class="py-2 pr-4 text-right">${fmtNum(m.media_nao_conformidades, 1)}</td>
                            <td class="py-2 text-right">${fmtUSD(m.custo_estimado_usd)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function badgeStatus(status) {
    const s = STATUS[status] || { label: status, cls: 'bg-gray-700 text-gray-300 border-gray-600' };
    return `<span class="inline-block px-2 py-0.5 text-xs font-bold rounded border ${s.cls}">${sanitizeHTML(s.label)}</span>`;
}

function desenharLaudos() {
    const container = document.getElementById('uso-ia-laudos');
    if (!container || !estado.data) return;
    const { laudos, limite } = estado.data;
    const lista = laudos.filter(FILTROS[estado.filtro].fn);

    if (!lista.length) {
        container.innerHTML = '<p class="text-sm text-gray-400">Nenhum laudo para exibir.</p>';
        return;
    }

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
                <thead class="text-xs uppercase text-gray-400 border-b border-gray-700">
                    <tr>
                        <th class="py-2 pr-4">Imóvel</th>
                        <th class="py-2 pr-4">Vistoria</th>
                        <th class="py-2 pr-4">Status</th>
                        <th class="py-2 pr-4">Modelo</th>
                        <th class="py-2 pr-4 text-right">Tokens (entrada / saída)</th>
                        <th class="py-2 pr-4 text-right">Tempo</th>
                        <th class="py-2 pr-4 text-right">NCs</th>
                        <th class="py-2 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(linhaLaudo).join('')}
                </tbody>
            </table>
        </div>
        ${laudos.length >= limite ? `<p class="text-xs text-gray-500 mt-3">Exibindo os ${limite} laudos mais recentes do período.</p>` : ''}`;
}

function linhaLaudo(l) {
    const detalheStatus = l.status === 'ERRO' && l.erro
        ? `<p class="text-xs text-red-300 mt-1 max-w-xs">${sanitizeHTML(l.erro)}</p>`
        : (l.aviso ? `<p class="text-xs text-yellow-300 mt-1 max-w-xs">${sanitizeHTML(l.aviso)}</p>` : '');
    const tokens = l.tokens_total === null ? '—' : `${fmtNum(l.tokens_entrada)} / ${fmtNum(l.tokens_saida)}`;
    const ncs = l.status === 'CONCLUIDA'
        ? `${fmtNum(l.qtd_nao_conformidades)}${l.qtd_nao_verificados ? `<span class="text-gray-500"> +${l.qtd_nao_verificados} n/v</span>` : ''}`
        : '—';

    return `
        <tr class="border-b border-gray-700/50 align-top">
            <td class="py-2 pr-4">
                <p class="text-white font-medium">${sanitizeHTML(l.codigo_imovel || '—')}</p>
                <p class="text-xs text-gray-400">${sanitizeHTML(l.endereco || '')}</p>
                <p class="text-xs text-gray-500">${sanitizeHTML(l.imobiliaria || '')}</p>
            </td>
            <td class="py-2 pr-4 whitespace-nowrap">
                <p>${fmtDataVistoria(l.data_vistoria)}</p>
                <p class="text-xs text-gray-500">${sanitizeHTML(l.vistoriador || '')}</p>
            </td>
            <td class="py-2 pr-4">
                ${badgeStatus(l.status)}
                ${l.laudo_aprovado ? '<span class="ml-1 text-xs text-green-400">laudo aprovado</span>' : ''}
                <p class="text-xs text-gray-500 mt-1">${fmtData(l.concluido_em || l.atualizado_em)}</p>
                ${detalheStatus}
            </td>
            <td class="py-2 pr-4 text-xs break-all">${modeloDoLaudo(l)}</td>
            <td class="py-2 pr-4 text-right whitespace-nowrap">${tokens}</td>
            <td class="py-2 pr-4 text-right whitespace-nowrap">${fmtDuracao(l.duracao_s)}</td>
            <td class="py-2 pr-4 text-right whitespace-nowrap">${ncs}</td>
            <td class="py-2 text-right whitespace-nowrap">
                ${l.laudo_finalizado ? `<a href="#laudos?view=${l.laudo_id}" class="inline-block px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Ver laudo</a>` : ''}
                ${l.status === 'CONCLUIDA' ? `<button data-action="pdf" data-id="${l.laudo_id}" class="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 rounded text-xs text-white">PDF</button>` : ''}
            </td>
        </tr>`;
}

function modeloDoLaudo(l) {
    if (l.gerado_por_ia) return sanitizeHTML(l.modelo || '—');
    return l.status === 'CONCLUIDA' ? '<span class="text-gray-500">manual</span>' : '—';
}

async function handleClick(e) {
    const btn = e.target.closest('button[data-action="pdf"]');
    if (!btn) return;
    btn.disabled = true;
    try {
        await api.abrirPdfNaoConformidades(btn.dataset.id);
    } catch (error) {
        showAlert(error.message || 'Erro ao abrir o PDF.', 'error');
    } finally {
        btn.disabled = false;
    }
}
