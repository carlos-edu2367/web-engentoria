// /assets/gestao.js

// REMOVIDA A LINHA DE IMPORTAÇÃO DO AUTH.JS, POIS SUAS FUNÇÕES SÃO GLOBAIS
import { showLoader, renderPageContent } from './ui.js';
import { initDashboard } from './modules/dashboard.js';
import { initImobiliarias } from './modules/imobiliarias.js';
import { initVistoriadores } from './modules/vistoriadores.js';
import { initClientes } from './modules/clientes.js';
import { initImoveis } from './modules/imoveis.js';
// import { initAgenda } from './modules/agenda.js';
// import { initRelatorios } from './modules/relatorios.js';
// import { initConfiguracoes } from './modules/configuracoes.js';

// Estado global simples da aplicação (para caching)
const AppState = {
    imobiliarias: null,
    vistoriadores: null,
    clientes: null,
};

const navLinks = document.querySelectorAll('.nav-link');
const pageContent = document.getElementById('page-content');

// Definição das rotas da aplicação
const routes = {
    '#dashboard': initDashboard,
    '#imobiliarias': initImobiliarias,
    '#vistoriadores': initVistoriadores,
    '#clientes': initClientes,
    '#imoveis': initImoveis,
    // '#agenda': initAgenda,
    // '#relatorios': initRelatorios,
    // '#configuracoes': initConfiguracoes
};

function setActiveLink(hash) {
    navLinks.forEach(link => {
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Router: Função que carrega o conteúdo da página com base na URL hash
function router() {
    const hash = window.location.hash || '#dashboard';
    const routeHandler = routes[hash];
    
    setActiveLink(hash);

    if (routeHandler) {
        showLoader();
        try {
            // Passamos o estado global para cada módulo, permitindo compartilhamento de dados
            routeHandler(pageContent, AppState);
        } catch (error) {
            console.error(`Erro ao carregar a rota ${hash}:`, error);
            renderPageContent('<h1 class="text-2xl font-bold text-red-400">Erro ao carregar a página.</h1>');
        }
    } else {
        renderPageContent('<h1 class="text-2xl font-bold text-yellow-400">Página não encontrada.</h1>');
    }
}

// Função de inicialização
function init() {
    // 1. Proteger a página (chama a função global de auth.js)
    protectAdminPage();

    // 2. Preencher informações do usuário (chama a função global de auth.js)
    const userInfo = getUserInfo();
    if (userInfo) {
        document.getElementById('user-name').textContent = userInfo.nome || 'Usuário';
        document.getElementById('user-email').textContent = userInfo.email || '';
    }
    
    // 3. Adicionar listeners de eventos
    window.addEventListener('hashchange', router);
    // Chama a função global de auth.js
    document.getElementById('logout-button').addEventListener('click', logout); 
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const hash = e.currentTarget.getAttribute('href');
            if(hash && routes[hash]) {
                // Apenas muda o hash, o 'hashchange' listener fará o resto
                window.location.hash = hash;
            }
        });
    });

    // 4. Carregar a rota inicial
    router();
}

// Inicia a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
