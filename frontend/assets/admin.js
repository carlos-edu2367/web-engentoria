// frontend/assets/admin.js
import { initRouter } from './admin_modules/router.js';

document.addEventListener('DOMContentLoaded', () => {
    // Verifica se window.protectTiPage existe (deve vir do auth.js global)
    if (typeof window.protectTiPage === 'function') {
        protectTiPage();
    }

    const navLinks = document.querySelectorAll('.nav-link');
    const pageContent = document.getElementById('page-content');
    const adminNav = document.getElementById('admin-nav');

    // Inicializa o roteador que gerencia a navegação e carregamento de módulos
    initRouter(navLinks, pageContent, adminNav);
});