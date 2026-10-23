// /assets/gestao.js

// REMOVIDA A LINHA DE IMPORTAÇÃO DO AUTH.JS, POIS SUAS FUNÇÕES SÃO GLOBAIS
import { showLoader, renderPageContent } from './ui.js';
import { initDashboard } from './modules/dashboard.js';
// INÍCIO DA PARTE 3: Alteração da importação
import { initGrupos } from './modules/grupos.js';
// FIM DA PARTE 3
import { initVistoriadores } from './modules/vistoriadores.js';
import { initClientes } from './modules/clientes.js';
import { initImoveis } from './modules/imoveis.js';
import { initAgenda } from './modules/agenda.js';
import { initRelatorios } from './modules/relatorios.js';
import { initConfiguracoes } from './modules/configuracoes.js';
// NOVO MÓDULO DE LAUDOS
import { initLaudos } from './modules/laudos.js';
// NOVO MÓDULO DE IMPRODUTIVAS
import { initImprodutivas } from './modules/improdutivas.js';
import { initVistoriasPendentes } from './modules/vistorias-pendentes.js';
import { initUsoIA } from './modules/uso-ia.js';

// Estado global simples da aplicação (para caching)
const AppState = {
    imobiliarias: null, // Este cache será usado pelo novo módulo de grupos
    vistoriadores: null,
    clientes: null,
};

const navLinks = document.querySelectorAll('.nav-link');
const pageContent = document.getElementById('page-content');

// Definição das rotas da aplicação
const routes = {
    '#dashboard': initDashboard,
    '#grupos': initGrupos,
    '#vistoriadores': initVistoriadores,
    '#clientes': initClientes,
    '#imoveis': initImoveis,
    '#agenda': initAgenda,
    '#laudos': initLaudos,
    '#improdutivas': initImprodutivas, // NOVA ROTA
    '#relatorios': initRelatorios,
    '#uso-ia': initUsoIA,
    '#configuracoes': initConfiguracoes,
    '#vistorias-pendentes': initVistoriasPendentes
};

function setActiveLink(hash) {
    navLinks.forEach(link => {
        // Limpa o hash de query params (ex: #laudos?view=123 -> #laudos)
        const linkHash = link.getAttribute('href').split('?')[0];
        const pageHash = hash.split('?')[0];
        
        if (linkHash === pageHash) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Router: Função que carrega o conteúdo da página com base na URL hash
function router() {
    const hash = window.location.hash || '#dashboard';
    const routeKey = hash.split('?')[0]; // Pega a rota base, ex: '#laudos'
    const routeHandler = routes[routeKey];
    
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
            if(hash && routes[hash.split('?')[0]]) {
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