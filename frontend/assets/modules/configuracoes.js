// /assets/modules/configuracoes.js

import { api } from '../api.js';
import { renderPageContent, showAlert, sanitizeHTML } from '../ui.js';

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
        </div>
    `;
    renderPageContent(pageHTML);

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
