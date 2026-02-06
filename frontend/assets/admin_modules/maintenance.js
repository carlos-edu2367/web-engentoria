// frontend/assets/admin_modules/maintenance.js
import { api } from '../api-ti.js';
import { openModal, closeModal, showNotification } from './utils.js';

let renderPageRef = null;

export const renderMaintenancePage = async (pageContent) => {
    renderPageRef = () => renderMaintenancePage(pageContent);
    // Carrega dados preliminares
    const deletedStats = await api.getCleanupPreview();

    pageContent.innerHTML = `
        <div class="fade-in max-w-5xl mx-auto">
            <h2 class="text-2xl font-bold mb-6 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">Manutenção do Sistema</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                <!-- Lixeira do Sistema -->
                <div class="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 hover:border-orange-500/30 transition-all">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="p-2 bg-red-500/10 rounded-lg text-red-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </div>
                        <h3 class="text-xl font-bold text-white">Lixeira / Soft Delete</h3>
                    </div>
                    <p class="text-gray-400 mb-6 text-sm">Registros deletados logicamente (soft delete) podem ser restaurados ou removidos permanentemente.</p>
                    
                    <div class="bg-gray-900/50 rounded-lg p-4 mb-6 border border-gray-700/30">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-gray-400">Itens na lixeira:</span>
                            <span class="text-white font-bold text-lg">${deletedStats.total}</span>
                        </div>
                        <ul class="text-xs text-gray-500 space-y-1">
                            ${Object.entries(deletedStats.counts).map(([k, v]) => `<li>• ${k}: ${v}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="flex gap-3">
                        <button id="btn-restore-view" class="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium">
                            Gerenciar/Restaurar
                        </button>
                        <button id="btn-cleanup-permanent" class="flex-1 py-2 px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-600/30 rounded-lg transition-colors text-sm font-medium">
                            Esvaziar Lixeira
                        </button>
                    </div>
                </div>

                <!-- Versão do App -->
                <div class="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 hover:border-orange-500/30 transition-all">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                        </div>
                        <h3 class="text-xl font-bold text-white">Versão do App</h3>
                    </div>
                    <p class="text-gray-400 mb-6 text-sm">Controle a flag de versão obrigatória para forçar atualizações nos clientes móveis.</p>
                    
                    <form id="form-app-version" class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-400 mb-1">Nova Tag de Versão</label>
                            <input type="text" name="new_version" placeholder="ex: 1.0.5+20" class="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all" required>
                        </div>
                        <button type="submit" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium">
                            Atualizar Versão
                        </button>
                    </form>
                </div>

                <!-- NOVO: Limpeza de Documentos -->
                <div class="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50 hover:border-orange-500/30 transition-all md:col-span-2">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        </div>
                        <h3 class="text-xl font-bold text-white">Limpeza de Armazenamento (Storage)</h3>
                    </div>
                    <p class="text-gray-400 mb-6 text-sm">Remove fisicamente arquivos antigos do servidor/cloud para liberar espaço e reduzir custos. 
                    A política atual remove arquivos de <strong>Info Mensal</strong> e <strong>Anexos de Agenda</strong> com mais de <strong>40 dias</strong>.</p>
                    
                    <div class="flex items-center justify-between bg-amber-900/10 border border-amber-500/20 p-4 rounded-lg">
                        <div class="flex items-center gap-3">
                            <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <span class="text-amber-200 text-sm">Essa ação remove os arquivos permanentemente e não pode ser desfeita.</span>
                        </div>
                        <div class="flex gap-2">
                            <button id="btn-inspect-docs" class="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium">
                                Inspecionar Bucket
                            </button>
                            <button id="btn-cleanup-docs" class="py-2 px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-bold shadow-lg shadow-amber-900/20">
                                Executar Limpeza
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Listeners da página de manutenção
    document.getElementById('form-app-version').addEventListener('submit', handleAppVersionUpdate);
    document.getElementById('btn-cleanup-permanent').addEventListener('click', confirmPermanentCleanup);
    document.getElementById('btn-restore-view').addEventListener('click', showRestoreModal);
    document.getElementById('btn-cleanup-docs').addEventListener('click', confirmDocsCleanup);
    
    // Novo listener de inspeção
    document.getElementById('btn-inspect-docs').addEventListener('click', () => inspectBucket('documentos'));
};

// --- Handlers Manutenção ---

const inspectBucket = async (bucketName) => {
    openModal('<div class="text-center py-8"><svg class="animate-spin h-8 w-8 text-orange-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p class="mt-2 text-gray-400">Carregando arquivos do bucket...</p></div>');
    
    try {
        const files = await api.listBucketFiles(bucketName);
        
        // Formata o tamanho do arquivo
        const formatSize = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const listHTML = files.length > 0 ? `
            <div class="mb-4 text-sm text-gray-400 flex justify-between">
                <span>Total de Arquivos: <strong>${files.length}</strong></span>
                <span>Bucket: <strong>${bucketName}</strong></span>
            </div>
            <div class="max-h-96 overflow-y-auto custom-scrollbar border border-gray-700 rounded-lg">
                <table class="w-full text-left text-sm text-gray-400">
                    <thead class="bg-gray-900 sticky top-0">
                        <tr>
                            <th class="p-3 font-medium text-gray-300">Arquivo</th>
                            <th class="p-3 font-medium text-gray-300">Data Criação</th>
                            <th class="p-3 font-medium text-gray-300 text-right">Tamanho</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700/50 bg-gray-800/50">
                        ${files.map(f => `
                            <tr class="hover:bg-gray-700/30">
                                <td class="p-3 truncate max-w-[200px]" title="${f.name}">${f.name}</td>
                                <td class="p-3 whitespace-nowrap">${new Date(f.created_at).toLocaleString()}</td>
                                <td class="p-3 text-right font-mono text-xs">${formatSize(f.metadata?.size || 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<div class="text-center py-8 text-gray-500 bg-gray-900 rounded-lg">Este bucket está vazio.</div>';

        openModal(`
            <h2 class="text-xl font-bold text-white mb-4">Inspeção de Storage</h2>
            ${listHTML}
            <div class="flex justify-end mt-6 pt-4 border-t border-gray-700">
                <button class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors" onclick="window.closeModal()">Fechar</button>
            </div>
        `);
    } catch (error) {
        showNotification("Erro ao listar arquivos: " + error.message, 'error');
        window.closeModal();
    }
};

const handleAppVersionUpdate = async (e) => {
    e.preventDefault();
    const version = e.target.new_version.value;
    try {
        await api.updateAppVersion({ new_version: version });
        showNotification('Versão atualizada com sucesso!', 'success');
        e.target.reset();
    } catch (error) {
        showNotification(error.message, 'error');
    }
};

const showRestoreModal = async () => {
    const records = await api.getDeletedRecords();
    
    const listHTML = records.length > 0 ? `
        <ul class="divide-y divide-gray-700 max-h-96 overflow-y-auto">
            ${records.map(r => `
                <li class="flex justify-between items-center py-3 px-2 hover:bg-gray-700/50">
                    <div>
                        <p class="text-white text-sm font-medium">${r.nome_info}</p>
                        <p class="text-xs text-gray-500">${r.tabela} • Deletado em: ${r.data_delecao}</p>
                    </div>
                    <button class="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded transition-colors" 
                            onclick="window.restoreItem('${r.tabela}', '${r.id}')">
                        Restaurar
                    </button>
                </li>
            `).join('')}
        </ul>
    ` : '<p class="text-gray-500 text-center py-4">Lixeira vazia.</p>';

    openModal(`
        <h2 class="text-xl font-bold text-white mb-4">Itens na Lixeira</h2>
        ${listHTML}
        <div class="flex justify-end mt-4 pt-4 border-t border-gray-700">
            <button class="px-4 py-2 bg-gray-700 text-white rounded" onclick="window.closeModal()">Fechar</button>
        </div>
    `);
};

window.restoreItem = async (table, id) => {
    try {
        await api.restoreRecord(table, id);
        showNotification('Item restaurado!', 'success');
        closeModal();
        if(renderPageRef) renderPageRef();
    } catch(e) { showNotification(e.message, 'error'); }
};

const confirmPermanentCleanup = () => {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-red-400">AÇÃO DESTRUTIVA</h2>
        <p class="text-gray-300">Você tem certeza que deseja limpar permanentemente todos os registros da lixeira?</p>
        <p class="text-sm text-gray-400 mt-2"><strong>Esta ação é irreversível.</strong> Todos os dados marcados como excluídos serão removidos para sempre.</p>
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" id="cancel-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
            <button type="button" id="confirm-cleanup-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 transition-all">Sim, Limpar Tudo</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-cleanup-btn').addEventListener('click', async () => {
        try {
            const res = await api.executeCleanup();
            showNotification(res.message, 'success');
            closeModal();
            if(renderPageRef) renderPageRef();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });
};

const confirmDocsCleanup = () => {
    const modalHTML = `
        <h2 class="text-2xl font-bold mb-4 text-amber-400">Limpeza de Arquivos Antigos</h2>
        <p class="text-gray-300">O sistema irá buscar e remover arquivos armazenados (PDFs, Imagens) vinculados a:</p>
        <ul class="list-disc list-inside text-gray-400 my-3 text-sm">
            <li>Documentos de Agenda (Anexos)</li>
            <li>Documentos de Info Mensal</li>
        </ul>
        <p class="text-gray-300">Critério: Arquivos criados há mais de <strong>40 dias</strong>.</p>
        <p class="text-sm text-gray-400 mt-4">Isso pode levar alguns segundos dependendo da quantidade de arquivos.</p>
        
        <div class="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700/50">
            <button type="button" id="cancel-doc-btn" class="py-2 px-4 rounded-lg bg-gray-600/50 hover:bg-gray-500/50 transition-colors">Cancelar</button>
            <button type="button" id="confirm-doc-btn" class="py-2 px-4 rounded-lg text-white font-bold bg-amber-600 hover:bg-amber-700 transition-all">Confirmar Limpeza</button>
        </div>
    `;
    openModal(modalHTML);

    document.getElementById('cancel-doc-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-doc-btn').addEventListener('click', async () => {
        const btn = document.getElementById('confirm-doc-btn');
        const originalText = btn.innerText;
        btn.innerHTML = 'Processando...';
        btn.disabled = true;

        try {
            const res = await api.cleanupOldDocuments();
            closeModal();
            
            const resultHTML = `
                <h2 class="text-2xl font-bold mb-4 text-green-400">Limpeza Concluída</h2>
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <p class="text-gray-300">Total de arquivos removidos: <strong class="text-white">${res.total_deleted}</strong></p>
                    <p class="text-gray-300">Erros encontrados: <strong class="text-red-400">${res.errors}</strong></p>
                    <p class="text-xs text-gray-500 mt-2">Data de corte: ${res.cutoff_date}</p>
                </div>
                <div class="flex justify-end mt-6">
                    <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="py-2 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg">OK</button>
                </div>
            `;
            openModal(resultHTML);
            
        } catch (error) {
            showNotification(error.message, 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            closeModal(); 
        }
    });
};