// frontend/assets/imobiliaria_modules/router.js
import { renderDashboard } from './dashboard.js';
import { renderLaudosPage } from './laudos.js';
import { renderSchedulingPage } from './scheduling.js';
import { renderReportsPage } from './reports.js';
import { showNotification } from './utils.js';

export const initRouter = (navLinks, pageContent) => {
    
    // Verificação de Segurança Inicial
    // Impede "piscar" a tela de carregamento se o usuário não estiver logado
    const token = localStorage.getItem('engentoria_vist_token');
    if (!token && typeof window.logout === 'function') {
        window.logout();
        return;
    }

    const loadPage = async (pageId) => {
        // Compatibilidade com links antigos ou bookmarks
        if (pageId === 'overview' || !pageId) pageId = 'dashboard';

        // Atualiza navegação
        navLinks.forEach(link => {
            // Reset styles
            link.classList.remove('bg-gray-800', 'text-white');
            const icon = link.querySelector('svg');
            if(icon) {
                icon.classList.remove('text-green-400', 'text-blue-400', 'text-yellow-400', 'text-purple-400');
                icon.classList.add('text-gray-500');
            }

            // Set Active
            if(link.getAttribute('href') === `#${pageId}`) {
                link.classList.add('bg-gray-800', 'text-white');
                if(icon) {
                    icon.classList.remove('text-gray-500');
                    // Restaura cor original baseada no contexto do link (lógica simples baseada no href)
                    if(pageId === 'dashboard') icon.classList.add('text-green-400');
                    if(pageId === 'laudos') icon.classList.add('text-blue-400');
                    if(pageId === 'relatorios') icon.classList.add('text-yellow-400');
                    if(pageId === 'agendar') icon.classList.add('text-purple-400');
                }
            }
        });

        // Loader
        pageContent.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center fade-in">
                <svg class="animate-spin h-12 w-12 text-green-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="text-gray-500 animate-pulse font-medium">Carregando conteúdo...</p>
            </div>
        `;

        try {
            switch (pageId) {
                case 'dashboard': await renderDashboard(pageContent); break;
                case 'laudos': await renderLaudosPage(pageContent); break;
                case 'relatorios': await renderReportsPage(pageContent); break;
                case 'agendar': await renderSchedulingPage(pageContent); break;
                default: await renderDashboard(pageContent);
            }
        } catch (error) {
            console.error(error);
            showNotification(error.message, 'error');
            pageContent.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-red-400 fade-in">
                    <div class="bg-red-900/20 p-6 rounded-xl border border-red-500/30 text-center shadow-lg">
                        <svg class="w-12 h-12 mb-3 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        <h3 class="text-lg font-bold text-white mb-2">Erro ao carregar página</h3>
                        <p class="text-sm text-red-200 mb-4">${error.message}</p>
                        <button onclick="location.reload()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium">
                            Tentar Novamente
                        </button>
                    </div>
                </div>
            `;
        }
    };

    const handleHashChange = () => {
        const hash = window.location.hash.substring(1);
        loadPage(hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    // Inicia na rota atual
    handleHashChange();
};