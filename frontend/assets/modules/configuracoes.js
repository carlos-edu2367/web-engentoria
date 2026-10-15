// /assets/modules/configuracoes.js

import { api } from '../api.js';
import { renderPageContent, showAlert, sanitizeHTML } from '../ui.js';
import { criarSeletorModelo } from './seletor-modelo-ia.js';

/**
 * Renderiza a página de configurações com o formulário.
 * @param {object} config - O objeto de configuração vindo da API.
 */
async function renderConfiguracoesPage(config) {
    const pageHTML = `
        <h1 class="text-3xl font-bold text-cyan-300 mb-8">Configurações do Sistema</h1>
        
        <div class="max-w-2xl">
            <div class="bg-gray-800/50 p-6 rounded-xl neon-border">
                <h2 class="text-xl font-bold text-white mb-6">Valores e Comissões</h2>
                <form id="form-configuracoes" class="space-y-4">
                    <div>
                        <label for="percentual_comissao_improdutiva" class="block text-sm mb-1 text-gray-400">Valor Fixo da Comissão para Vistoria Improdutiva (R$)</label>
                        <input 
                            type="number" 
                            id="percentual_comissao_improdutiva" 
                            name="percentual_comissao_improdutiva" 
                            step="0.01" 
                            min="0"
                            required 
                            class="w-full bg-gray-700 rounded p-2 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            value="${sanitizeHTML((config.percentual_comissao_improdutiva || 0).toFixed(2))}"
                        >
                        <p class="text-xs text-gray-500 mt-1">Este é o valor fixo que o vistoriador receberá quando uma vistoria for marcada como improdutiva.</p>
                    </div>

                    <div class="pt-4 flex justify-end">
                        <button type="submit" class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold transition-colors">
                            Salvar Alterações
                        </button>
                    </div>
                </form>
            </div>

            <div id="ia-config-card" class="bg-gray-800/50 p-6 rounded-xl neon-border mt-8">
                <h2 class="text-xl font-bold text-white mb-2">Inteligência Artificial</h2>
                <p class="text-sm text-gray-400 mb-6">Usada no laudo de não conformidades (laudos de entrada) e no Insight IA da agenda.</p>
                <p class="text-gray-400 text-sm">Carregando...</p>
            </div>
        </div>
    `;
    renderPageContent(pageHTML);
    initIAConfig();

    // Adiciona o listener para o formulário de submissão
    document.getElementById('form-configuracoes').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const data = {
            percentual_comissao_improdutiva: parseFloat(document.getElementById('percentual_comissao_improdutiva').value)
        };

        try {
            await api.updateConfig(data);
            showAlert('Configurações salvas com sucesso!', 'success');
        } catch (error) {
            showAlert(error.message || 'Erro ao salvar as configurações.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

/**
 * Card de configuração do provider/modelo de IA.
 * As chaves de API ficam apenas nas variáveis de ambiente do servidor.
 */
async function initIAConfig() {
    const card = document.getElementById('ia-config-card');
    let config;
    try {
        config = await api.getIAConfig();
    } catch (error) {
        card.querySelector('p:last-child').textContent = 'Não foi possível carregar a configuração de IA.';
        return;
    }

    const campo = 'w-full bg-gray-700 rounded p-2 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500';
    card.innerHTML = `
        <h2 class="text-xl font-bold text-white mb-2">Inteligência Artificial</h2>
        <p class="text-sm text-gray-400 mb-6">Usada no laudo de não conformidades (laudos de entrada) e no Insight IA da agenda.</p>
        <form id="form-ia" class="space-y-4">
            <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="habilitado" class="w-5 h-5 accent-cyan-500">
                <span class="text-sm text-gray-300">Gerar laudo de não conformidades automaticamente ao finalizar um laudo de entrada</span>
            </label>
            <div>
                <label class="block text-sm mb-1 text-gray-400">Provider</label>
                <select name="provider" class="${campo}">
                    ${config.providers.map(p => `<option value="${p.id}">${sanitizeHTML(p.nome)}</option>`).join('')}
                </select>
                <p id="ia-chave-status" class="text-xs mt-1"></p>
            </div>
            <div>
                <label class="block text-sm mb-1 text-gray-400">Modelo</label>
                <div id="ia-seletor-modelo"></div>
                <p class="text-xs text-gray-500 mt-1">Lista de modelos do provider escolhido. Ao trocar de provider, o modelo padrão dele é selecionado.</p>
            </div>
            <div id="ia-teste-resultado" class="hidden text-sm p-3 rounded-lg"></div>
            <div class="pt-2 flex flex-wrap justify-end gap-3">
                <button type="button" id="btn-testar-ia" class="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-bold transition-colors">Testar conexão</button>
                <button type="submit" class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold transition-colors">Salvar</button>
            </div>
        </form>
    `;

    const form = document.getElementById('form-ia');
    const providers = Object.fromEntries(config.providers.map(p => [p.id, p]));
    form.habilitado.checked = config.habilitado;
    form.provider.value = config.provider;
    const seletorModelo = criarSeletorModelo(document.getElementById('ia-seletor-modelo'), {
        provider: config.provider,
        valor: config.modelo,
        campoClasse: campo,
    });

    const atualizarStatusChave = () => {
        const p = providers[form.provider.value];
        const el = document.getElementById('ia-chave-status');
        el.textContent = p.chave_configurada
            ? `Chave de API configurada no servidor (${p.variavel_ambiente}).`
            : `Chave de API não configurada: defina a variável de ambiente ${p.variavel_ambiente} no servidor.`;
        el.className = `text-xs mt-1 ${p.chave_configurada ? 'text-green-400' : 'text-yellow-400'}`;
    };
    // Ao trocar de provider, sugere o modelo padrão dele (os ids de modelo diferem entre providers)
    form.provider.addEventListener('change', () => {
        seletorModelo.trocarProvider(form.provider.value, providers[form.provider.value].modelo_padrao);
        atualizarStatusChave();
    });
    atualizarStatusChave();

    const resultado = document.getElementById('ia-teste-resultado');
    document.getElementById('btn-testar-ia').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Testando...';
        resultado.className = 'text-sm p-3 rounded-lg bg-gray-700/50 text-gray-300';
        resultado.textContent = 'Enviando uma mensagem de teste ao provider...';
        try {
            const r = await api.testarIA({ provider: form.provider.value, modelo: seletorModelo.valor.trim() });
            if (r.ok) {
                resultado.className = 'text-sm p-3 rounded-lg bg-green-900/40 text-green-300';
                resultado.textContent = `Conexão OK (${r.latencia_ms} ms). Resposta do modelo: "${r.resposta}"`;
            } else {
                resultado.className = 'text-sm p-3 rounded-lg bg-red-900/40 text-red-300';
                resultado.textContent = `Falha: ${r.erro}`;
            }
        } catch (error) {
            resultado.className = 'text-sm p-3 rounded-lg bg-red-900/40 text-red-300';
            resultado.textContent = `Falha: ${error.message}`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Testar conexão';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        if (!seletorModelo.valor.trim()) {
            showAlert('Selecione um modelo de IA.', 'error');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        try {
            await api.updateIAConfig({
                provider: form.provider.value,
                modelo: seletorModelo.valor.trim(),
                habilitado: form.habilitado.checked,
            });
            showAlert('Configuração de IA salva com sucesso!', 'success');
        } catch (error) {
            showAlert(error.message || 'Erro ao salvar a configuração de IA.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    });
}

/**
 * Função de inicialização do módulo de configurações.
 */
export async function initConfiguracoes() {
    try {
        const configData = await api.getConfig();
        await renderConfiguracoesPage(configData);
    } catch (error) {
        showAlert('Não foi possível carregar as configurações.', 'error');
        renderPageContent('<p class="text-red-400">Erro ao carregar a página de configurações.</p>');
    }
}
