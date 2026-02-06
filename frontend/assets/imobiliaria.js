// frontend/assets/imobiliaria.js
import { initRouter } from './imobiliaria_modules/router.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificação de Segurança Corrigida
    // Usa a função global do auth.js que verifica o token correto ('engentoria_vist_token')
    if (typeof window.protectImobiliariaPage === 'function') {
        window.protectImobiliariaPage();
    } else {
        // Fallback caso auth.js não carregue
        if (!localStorage.getItem('engentoria_vist_token')) {
            window.location.href = 'index.html';
            return;
        }
    }

    const navLinks = document.querySelectorAll('.nav-link');
    const pageContent = document.getElementById('page-content');

    // Inicializa o roteador
    initRouter(navLinks, pageContent);
});