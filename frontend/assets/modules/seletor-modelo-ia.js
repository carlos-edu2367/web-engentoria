// /assets/modules/seletor-modelo-ia.js
// Seletor de modelo de IA com busca, usando a lista de modelos do provider.
// A lista é cacheada no servidor (24h) e também no navegador (24h).

import { api } from '../api.js';
import { sanitizeHTML } from '../ui.js';

const CACHE_PREFIXO = 'engentoria_ia_modelos_v1_';
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTADOS = 300;

function lerCache(provider) {
    try {
        const bruto = localStorage.getItem(CACHE_PREFIXO + provider);
        if (!bruto) return null;
        const cache = JSON.parse(bruto);
        if (!cache || !Array.isArray(cache.modelos) || Date.now() - cache.salvoEm > CACHE_MS) return null;
        return cache;
    } catch (e) {
        return null;
    }
}

function salvarCache(provider, dados) {
    try {
        localStorage.setItem(CACHE_PREFIXO + provider, JSON.stringify({ ...dados, salvoEm: Date.now() }));
    } catch (e) { /* armazenamento indisponível: segue sem cache local */ }
}

function formatarContexto(tokens) {
    if (!tokens) return null;
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
    return `${Math.round(tokens / 1000)}K`;
}

function formatarPreco(entrada, saida) {
    if (entrada === null || entrada === undefined) return null;
    if (entrada === 0 && saida === 0) return 'Grátis';
    const fmt = (v) => `$${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${fmt(entrada)} / ${fmt(saida ?? 0)} por 1M`;
}

const CHIP = 'text-[10px] px-1.5 py-0.5 rounded border';
const ROTULOS_CAPACIDADE = {
    saida_estruturada: { texto: 'JSON', cls: 'border-cyan-700/60 text-cyan-300 bg-cyan-900/30' },
    raciocinio: { texto: 'Raciocínio', cls: 'border-purple-700/60 text-purple-300 bg-purple-900/30' },
};

/**
 * Monta o seletor dentro de `container`.
 * @param {HTMLElement} container
 * @param {{ provider: string, valor: string, campoClasse: string, onChange?: (valor: string) => void }} opcoes
 */
export function criarSeletorModelo(container, { provider, valor, campoClasse, onChange }) {
    const estado = { provider, valor: valor || '', modelos: [], filtrados: [], ativo: 0, aberto: false, carregando: false, erro: null, info: null };

    container.innerHTML = `
        <div class="relative">
            <button type="button" data-ref="gatilho" aria-haspopup="listbox" aria-expanded="false"
                class="${campoClasse} flex items-center justify-between gap-2 text-left">
                <span class="min-w-0">
                    <span data-ref="rotulo" class="block truncate"></span>
                    <span data-ref="rotulo-id" class="block truncate text-xs text-gray-400 font-mono"></span>
                </span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <div data-ref="painel" class="hidden absolute z-30 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden">
                <div class="p-2 border-b border-gray-700 flex gap-2">
                    <div class="relative flex-1">
                        <svg class="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input data-ref="busca" type="text" autocomplete="off" placeholder="Buscar modelo..."
                            class="w-full bg-gray-700 rounded p-2 pl-8 text-sm border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                    </div>
                    <button type="button" data-ref="atualizar" title="Atualizar lista de modelos"
                        class="px-3 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-gray-300 hover:text-cyan-300 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                </div>
                <ul data-ref="lista" role="listbox" class="max-h-72 overflow-y-auto py-1"></ul>
                <p data-ref="rodape" class="px-3 py-2 text-xs text-gray-500 border-t border-gray-700"></p>
            </div>
        </div>`;

    const ref = (nome) => container.querySelector(`[data-ref="${nome}"]`);
    const gatilho = ref('gatilho'), painel = ref('painel'), busca = ref('busca'), lista = ref('lista'), rodape = ref('rodape');

    function modeloAtual() {
        return estado.modelos.find(m => m.id === estado.valor);
    }

    function desenharGatilho() {
        const m = modeloAtual();
        ref('rotulo').textContent = m ? m.nome : (estado.valor || 'Selecione um modelo');
        ref('rotulo-id').textContent = m && m.nome !== m.id ? m.id : '';
        ref('rotulo-id').classList.toggle('hidden', !(m && m.nome !== m.id));
    }

    function filtrar() {
        const termos = busca.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const resultado = termos.length
            ? estado.modelos.filter(m => {
                const alvo = `${m.id} ${m.nome}`.toLowerCase();
                return termos.every(t => alvo.includes(t));
            })
            : estado.modelos;
        estado.filtrados = resultado.slice(0, MAX_RESULTADOS);

        // Permite usar um id digitado que não está na lista (ex.: modelo recém-lançado).
        // Só para texto com cara de id (sem espaços), e sempre no fim da lista.
        const digitado = busca.value.trim();
        estado.personalizado = digitado && !/\s/.test(digitado) && !estado.modelos.some(m => m.id === digitado) ? digitado : null;
        estado.ativo = 0;
        estado.totalEncontrado = resultado.length;
        desenharLista();
    }

    function itensNavegaveis() {
        return estado.personalizado ? [...estado.filtrados, { personalizado: true, id: estado.personalizado }] : estado.filtrados;
    }

    function desenharLista() {
        const totalEncontrado = estado.totalEncontrado ?? estado.modelos.length;
        if (estado.carregando) {
            lista.innerHTML = `<li class="px-3 py-6 text-center text-sm text-gray-400"><div class="h-5 w-5 mx-auto mb-2 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>Carregando modelos...</li>`;
        } else {
            const itens = itensNavegaveis();
            lista.innerHTML = itens.map((m, i) => {
                const ativo = i === estado.ativo ? 'bg-gray-700/80' : '';
                if (m.personalizado) {
                    return `<li role="option" data-idx="${i}" class="px-3 py-2 cursor-pointer hover:bg-gray-700/80 ${ativo} ${i ? 'border-t border-gray-700/60' : ''}">
                        <span class="text-sm text-cyan-300">Usar "<span class="font-mono">${sanitizeHTML(m.id)}</span>"</span>
                        <span class="block text-xs text-gray-500">Modelo fora da lista do provider</span>
                    </li>`;
                }
                const selecionado = m.id === estado.valor;
                const chips = [
                    formatarContexto(m.contexto) ? `<span class="${CHIP} border-gray-600 text-gray-300">${formatarContexto(m.contexto)}</span>` : '',
                    m.imagem ? `<span class="${CHIP} border-emerald-700/60 text-emerald-300 bg-emerald-900/30">Imagem</span>` : '',
                    ...(m.capacidades || []).filter(c => ROTULOS_CAPACIDADE[c]).map(c =>
                        `<span class="${CHIP} ${ROTULOS_CAPACIDADE[c].cls}">${ROTULOS_CAPACIDADE[c].texto}</span>`),
                ].join('');
                const preco = formatarPreco(m.preco_entrada, m.preco_saida);
                return `<li role="option" aria-selected="${selecionado}" data-idx="${i}"
                        class="px-3 py-2 cursor-pointer hover:bg-gray-700/80 ${ativo} ${selecionado ? 'border-l-2 border-cyan-400' : 'border-l-2 border-transparent'}">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <p class="text-sm truncate ${selecionado ? 'text-cyan-300 font-bold' : 'text-gray-200'}">${sanitizeHTML(m.nome)}</p>
                            ${m.nome !== m.id ? `<p class="text-xs text-gray-500 font-mono truncate">${sanitizeHTML(m.id)}</p>` : ''}
                        </div>
                        <div class="flex flex-wrap justify-end gap-1 flex-shrink-0 max-w-[45%]">${chips}</div>
                    </div>
                    ${preco ? `<p class="text-[11px] text-gray-500 mt-0.5">${sanitizeHTML(preco)}</p>` : ''}
                </li>`;
            }).join('') || `<li class="px-3 py-6 text-center text-sm text-gray-400">${estado.erro ? sanitizeHTML(estado.erro) : 'Nenhum modelo encontrado.'}</li>`;
        }

        const partes = [];
        if (!estado.carregando && estado.modelos.length) {
            partes.push(`${totalEncontrado} de ${estado.modelos.length} modelos`);
            if (totalEncontrado > MAX_RESULTADOS) partes.push(`mostrando ${MAX_RESULTADOS}; refine a busca`);
            if (estado.info?.atualizado_em) partes.push(`lista de ${new Date(estado.info.atualizado_em * 1000).toLocaleString('pt-BR')}`);
            if (estado.info?.desatualizado) partes.push('provider indisponível, exibindo lista salva');
        }
        if (estado.erro && estado.modelos.length) partes.push(estado.erro);
        rodape.textContent = partes.join(' · ');
        rodape.classList.toggle('hidden', !partes.length);

        lista.querySelector(`[data-idx="${estado.ativo}"]`)?.scrollIntoView({ block: 'nearest' });
    }

    async function carregar(forcar = false) {
        const provider = estado.provider;
        const cache = forcar ? null : lerCache(provider);
        if (cache) {
            estado.modelos = cache.modelos;
            estado.info = cache;
            estado.erro = null;
        } else {
            estado.carregando = true;
            estado.erro = null;
            if (estado.aberto) desenharLista();
            try {
                const dados = await api.listarModelosIA(provider, forcar);
                if (provider !== estado.provider) return; // provider trocou durante a requisição
                estado.modelos = dados.modelos;
                estado.info = dados;
                if (!dados.desatualizado) salvarCache(provider, dados);
            } catch (error) {
                if (provider !== estado.provider) return;
                estado.erro = error.message || 'Não foi possível carregar a lista de modelos.';
                estado.modelos = [];
            } finally {
                if (provider === estado.provider) estado.carregando = false;
            }
        }
        desenharGatilho();
        if (estado.aberto) filtrar();
    }

    function abrir() {
        if (estado.aberto) return;
        estado.aberto = true;
        painel.classList.remove('hidden');
        gatilho.setAttribute('aria-expanded', 'true');
        busca.value = '';
        filtrar();
        busca.focus();
    }

    function fechar() {
        if (!estado.aberto) return;
        estado.aberto = false;
        painel.classList.add('hidden');
        gatilho.setAttribute('aria-expanded', 'false');
    }

    function selecionar(indice) {
        const item = itensNavegaveis()[indice];
        if (!item) return;
        estado.valor = item.id;
        desenharGatilho();
        fechar();
        gatilho.focus();
        onChange?.(estado.valor);
    }

    gatilho.addEventListener('click', () => (estado.aberto ? fechar() : abrir()));
    busca.addEventListener('input', filtrar);
    busca.addEventListener('keydown', (e) => {
        const total = itensNavegaveis().length;
        if (e.key === 'ArrowDown') { e.preventDefault(); estado.ativo = Math.min(estado.ativo + 1, total - 1); desenharLista(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); estado.ativo = Math.max(estado.ativo - 1, 0); desenharLista(); }
        else if (e.key === 'Enter') { e.preventDefault(); selecionar(estado.ativo); }
        else if (e.key === 'Escape') { e.preventDefault(); fechar(); gatilho.focus(); }
    });
    lista.addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco da busca
    lista.addEventListener('click', (e) => {
        const li = e.target.closest('[data-idx]');
        if (li) selecionar(Number(li.dataset.idx));
    });
    ref('atualizar').addEventListener('click', () => carregar(true));
    const fecharAoClicarFora = (e) => {
        if (!document.body.contains(container)) return document.removeEventListener('mousedown', fecharAoClicarFora);
        if (!container.contains(e.target)) fechar();
    };
    document.addEventListener('mousedown', fecharAoClicarFora);

    desenharGatilho();
    carregar();

    return {
        get valor() { return estado.valor; },
        trocarProvider(novoProvider, novoValor) {
            estado.provider = novoProvider;
            estado.valor = novoValor || '';
            estado.modelos = [];
            estado.info = null;
            desenharGatilho();
            carregar();
        },
    };
}
