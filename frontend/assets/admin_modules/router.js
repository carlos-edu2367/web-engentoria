// frontend/assets/admin_modules/router.js
import { renderDashboard } from './dashboard.js';
import { renderUsersPage } from './users.js';
import { renderImobiliariasPage } from './imobiliarias.js';
import { renderSupportPage } from './support.js';
import { renderMaintenancePage } from './maintenance.js';
import { showNotification } from './utils.js';

export const initRouter = (navLinks, pageContent, adminNav) => {
    
    const loadPage = async (pageId) => {
        // Atualiza navegação
        navLinks.forEach(link => link.classList.remove('active'));
        const activeLink = adminNav.querySelector(`a[href="#${pageId}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Loader
        pageContent.innerHTML = `
            <div class="text-center py-20 fade-in">
                <svg class="animate-spin h-10 w-10 text-orange-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-4 text-gray-400 font-medium">Carregando módulo...</p>
            </div>
        `;

        try {
            switch (pageId) {
                case 'dashboard': await renderDashboard(pageContent); break;
                case 'users': await renderUsersPage(pageContent); break;
                case 'imobiliarias': await renderImobiliariasPage(pageContent); break;
                case 'support': await renderSupportPage(pageContent); break;
                case 'maintenance': await renderMaintenancePage(pageContent); break;
                default: await renderDashboard(pageContent);
            }
        } catch (error) {
            console.error("Erro ao carregar página:", error);
            showNotification(error.message || "Erro ao carregar conteúdo", 'error');
            pageContent.innerHTML = `
                <div class="text-center py-20 text-red-400 fade-in">
                    <p class="text-xl font-bold mb-2">Ops!</p>
                    <p>${error.message}</p>
                    <button onclick="window.location.reload()" class="mt-6 px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors">Tentar Novamente</button>
                </div>
            `;
        }
    };

    // Router baseada em hash
    const handleHashChange = () => {
        const hash = window.location.hash.substring(1) || 'dashboard';
        loadPage(hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Inicia na página correta
    handleHashChange();
};