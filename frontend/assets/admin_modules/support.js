// frontend/assets/admin_modules/support.js
import { api } from '../api-ti.js';
import { openModal, closeModal, showNotification } from './utils.js';

export const renderSupportPage = async (pageContent) => {
    pageContent.innerHTML = `
        <div class="fade-in h-full flex flex-col">
            <div class="flex gap-4 mb-6 border-b border-gray-700 pb-1">
                <button class="tab-btn active text-white border-b-2 border-orange-500 pb-3 px-2 font-medium" data-tab="chamados">Chamados TI</button>
                <button class="tab-btn text-gray-400 hover:text-white pb-3 px-2 font-medium" data-tab="feedbacks">Feedbacks App</button>
                <button class="tab-btn text-gray-400 hover:text-white pb-3 px-2 font-medium" data-tab="improdutivas">Reverter Improdutivas</button>
            </div>
            <div id="support-content" class="flex-1 overflow-auto">
                <!-- Dynamic Content -->
            </div>
        </div>
    `;

    // Tab Logic
    const tabs = pageContent.querySelectorAll('.tab-btn');
    const contentDiv = document.getElementById('support-content');

    const loadTab = async (tab) => {
        contentDiv.innerHTML = '<div class="text-center py-10 text-gray-500">Carregando...</div>';
        if (tab === 'chamados') await renderChamadosTab(contentDiv);
        if (tab === 'feedbacks') await renderFeedbacksTab(contentDiv);
        if (tab === 'improdutivas') await renderImprodutivasTab(contentDiv);
    };

    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(b => {
                b.classList.remove('active', 'text-white', 'border-b-2', 'border-orange-500');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('active', 'text-white', 'border-b-2', 'border-orange-500');
            btn.classList.remove('text-gray-400');
            loadTab(btn.dataset.tab);
        });
    });

    // Load default
    await renderChamadosTab(contentDiv);
};

const renderChamadosTab = async (container) => {
    const chamados = await api.getChamados();
    
    container.innerHTML = `
        <div class="space-y-4">
            ${chamados.length === 0 ? '<p class="text-gray-500">Nenhum chamado registrado.</p>' : ''}
            ${chamados.map(c => `
                <div class="bg-gray-800 p-4 rounded-lg border-l-4 ${c.status === 'Aberto' ? 'border-red-500' : c.status === 'Resolvido' ? 'border-green-500' : 'border-yellow-500'}">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-white text-lg">${c.titulo} <span class="text-xs font-normal text-gray-400 bg-gray-700 px-2 py-0.5 rounded ml-2">${c.categoria}</span></h4>
                            <p class="text-gray-400 text-sm mt-1">${c.descricao}</p>
                            <div class="mt-3 flex items-center gap-4 text-xs text-gray-500">
                                <span>👤 ${c.nome_usuario}</span>
                                <span>📅 ${new Date(c.data_abertura).toLocaleString()}</span>
                                <span>🔥 Prioridade: ${c.prioridade}</span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-2">
                            <span class="text-xs font-bold px-2 py-1 rounded ${c.status === 'Aberto' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}">${c.status}</span>
                            ${c.status !== 'Resolvido' ? `
                                <button class="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors" onclick="window.resolveChamado('${c.id}')">Resolver</button>
                            ` : ''}
                        </div>
                    </div>
                    ${c.comentario_conclusao ? `
                        <div class="mt-3 bg-gray-900/50 p-2 rounded text-sm text-green-400 border border-green-900/30">
                            <strong>Solução:</strong> ${c.comentario_conclusao}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
};

window.resolveChamado = (id) => {
    openModal(`
        <h2 class="text-lg font-bold text-white mb-4">Resolver Chamado</h2>
        <textarea id="solucao-text" class="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white h-32" placeholder="Descreva a solução ou resposta..."></textarea>
        <div class="flex justify-end gap-2 mt-4">
             <button class="px-4 py-2 text-gray-400" onclick="window.closeModal()">Cancelar</button>
             <button class="px-4 py-2 bg-green-600 text-white rounded" onclick="window.submitResolucao('${id}')">Concluir</button>
        </div>
    `);
};

window.submitResolucao = async (id) => {
    const txt = document.getElementById('solucao-text').value;
    if(!txt) return showNotification('Escreva uma solução.', 'error');
    try {
        await api.resolveChamado(id, { comentario_conclusao: txt });
        showNotification('Chamado resolvido!', 'success');
        closeModal();
        // Recarrega a aba se estiver visível (simples reload via DOM trigger)
        const activeTab = document.querySelector('.tab-btn.active[data-tab="chamados"]');
        if(activeTab) activeTab.click(); 
    } catch(e) { showNotification(e.message, 'error'); }
};

const renderFeedbacksTab = async (container) => {
    const feedbacks = await api.getFeedbacks();
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-800 text-sm text-left">
                <thead class="bg-gray-900 text-gray-400">
                    <tr>
                        <th class="px-4 py-3">Nota</th>
                        <th class="px-4 py-3">Versão</th>
                        <th class="px-4 py-3">Usuário</th>
                        <th class="px-4 py-3">Comentário</th>
                        <th class="px-4 py-3">Data</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-800 text-gray-300">
                    ${feedbacks.map(f => `
                        <tr class="hover:bg-gray-800/30">
                            <td class="px-4 py-3 text-yellow-400 font-bold">${"★".repeat(f.nota)}</td>
                            <td class="px-4 py-3">${f.app_version}</td>
                            <td class="px-4 py-3">${f.nome_usuario}</td>
                            <td class="px-4 py-3 italic text-gray-400">${f.comentario || '-'}</td>
                            <td class="px-4 py-3 text-xs text-gray-500">${new Date(f.data_envio).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
};

const renderImprodutivasTab = (container) => {
    container.innerHTML = `
        <div class="bg-gray-800 p-4 rounded-lg mb-6">
            <h3 class="text-white font-bold mb-4">Buscar Vistorias Improdutivas</h3>
            <div class="flex gap-4">
                <input type="text" id="search-imovel" placeholder="Cód. Imóvel" class="bg-gray-900 border border-gray-700 rounded p-2 text-white flex-1">
                <input type="date" id="search-date" class="bg-gray-900 border border-gray-700 rounded p-2 text-white">
                <button class="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded" onclick="window.searchImprodutivas()">Buscar</button>
            </div>
        </div>
        <div id="improdutivas-results"></div>
    `;
};

window.searchImprodutivas = async () => {
    const cod = document.getElementById('search-imovel').value;
    const data = document.getElementById('search-date').value;
    const params = new URLSearchParams();
    if(cod) params.append('cod_imovel', cod);
    if(data) params.append('data_vistoria', data);

    try {
        const results = await api.searchImprodutivas(params);
        const resDiv = document.getElementById('improdutivas-results');
        if(results.length === 0) {
            resDiv.innerHTML = '<p class="text-gray-500 text-center mt-4">Nenhuma vistoria improdutiva encontrada com esses filtros.</p>';
            return;
        }
        resDiv.innerHTML = results.map(r => `
            <div class="bg-gray-800/50 p-4 rounded border border-gray-700 mt-2 flex justify-between items-center">
                <div>
                    <p class="text-white font-bold">${r.cod_imovel} - ${r.data_vistoria} às ${r.horario}</p>
                    <p class="text-sm text-gray-400">Cliente: ${r.cliente} | Motivo: ${r.motivo}</p>
                </div>
                <button class="text-sm border border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-white px-3 py-1 rounded transition-colors" onclick="window.confirmRevert('${r.id}')">Reverter Cobrança</button>
            </div>
        `).join('');
    } catch(e) { showNotification(e.message, 'error'); }
};

window.confirmRevert = (id) => {
    if(confirm("Tem certeza? Isso irá liberar o horário na agenda e estornar a dívida do cliente.")) {
        api.revertImprodutiva(id).then(() => {
            showNotification('Revertido com sucesso!', 'success');
            window.searchImprodutivas();
        }).catch(e => showNotification(e.message, 'error'));
    }
};