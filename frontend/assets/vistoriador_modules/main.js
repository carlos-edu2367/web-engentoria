import { renderAgenda } from './agenda.js';
import { renderPendencias, checkPendenciasBadge } from './pendencias.js';
import { renderRelatorios } from './relatorios.js';
import { renderLaudo } from './laudo.js'; // Novo Módulo

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof protectVistoriadorPage === 'function') protectVistoriadorPage();

    setupNavigation();
    setupMobileMenu();
    
    const user = JSON.parse(localStorage.getItem('user_info') || '{}');
    if(user.nome) document.getElementById('user-name').textContent = user.nome;

    handleRouting();
    checkPendenciasBadge();
});

function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            window.location.hash = view;
            if(window.closeMobileMenu) window.closeMobileMenu();
        });
    });

    window.addEventListener('hashchange', handleRouting);

    document.getElementById('btn-logout').addEventListener('click', () => {
        if(typeof logout === 'function') logout();
    });
}

// Roteador Central
async function handleRouting() {
    const hash = window.location.hash.replace('#', '') || 'agenda';
    
    // Suporte a query params (ex: laudo?id=123)
    const [viewName, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString);
    const viewParams = Object.fromEntries(params.entries());

    loadView(viewName, viewParams);
}

async function loadView(viewName, params = {}) {
    const container = document.getElementById('app-content');
    const navLinks = document.querySelectorAll('.nav-link');

    // UI Updates
    navLinks.forEach(link => {
        link.classList.remove('active', 'bg-slate-800', 'text-white');
        if (link.dataset.view === viewName) link.classList.add('active', 'bg-slate-800', 'text-white');
    });

    // Reset Container
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[60vh] text-slate-500 animate-pulse">
            <div class="h-12 w-12 rounded-full border-4 border-slate-700 border-t-teal-500 animate-spin mb-4"></div>
            <p class="text-sm font-medium">Carregando...</p>
        </div>
    `;

    try {
        switch (viewName) {
            case 'agenda': await renderAgenda(container); break;
            case 'pendencias': await renderPendencias(container); break;
            case 'relatorios': await renderRelatorios(container); break;
            case 'laudo': await renderLaudo(container, params); break; // Rota Laudo
            default: await renderAgenda(container);
        }
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="p-6 text-center text-red-400">Erro: ${error.message}</div>`;
    }
}

function setupMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    const openMenu = () => {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    };

    const closeMenu = () => {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    };

    btn.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    window.closeMobileMenu = closeMenu;
}