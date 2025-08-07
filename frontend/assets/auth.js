// frontend/assets/auth.js

/**
 * Funções para gerenciar a autenticação do usuário.
 * Lidamos com o token JWT, guardando e removendo do localStorage.
 */

const TOKEN_KEY = 'engentoria_vist_token';

// Função para salvar o token no localStorage
function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

// Função para obter o token do localStorage
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// Função para remover o token (logout)
function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
}

// Função para verificar se o usuário está logado
function isUserLoggedIn() {
    return !!getToken();
}

// Função para fazer logout
function logout() {
    // Lógica de logout inteligente
    // Decodifica o token para saber qual era o tipo de usuário
    const payload = decodeToken(getToken());
    
    removeToken();

    // Redireciona para a página de login apropriada
    if (payload && (payload.dashboard === 'ti' || payload.dashboard === 'admin')) {
        window.location.href = 'login-ti.html';
    } else {
        window.location.href = 'login.html';
    }
}

/**
 * Decodifica um token JWT para extrair seu payload.
 * ATENÇÃO: Isso não valida a assinatura do token. A validação é feita no backend.
 * Esta função serve apenas para ler os dados (como o tipo de usuário) no frontend.
 */
function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}


/**
 * Proteção de Rotas:
 * Verifica se o usuário está logado antes de carregar páginas protegidas.
 */
function protectPage() {
    const currentPage = window.location.pathname.split('/').pop();
    const publicPages = ['index.html', 'login.html', 'login-ajuda.html', 'login-ti.html'];
    
    // A página de admin tem sua própria guarda em admin.js
    if (currentPage === 'admin-dashboard.html') {
        return;
    }

    const isProtectedPage = !publicPages.includes(currentPage);
    const token = getToken();
    const payload = decodeToken(token);

    if (isProtectedPage) {
        if (!isUserLoggedIn()) {
            // Não está logado, vai para a página de login
            window.location.href = 'login.html';
            return;
        }
        
        // CORREÇÃO: Se um gestor de TI ou ADM logado tentar aceder a uma página de vistoriador,
        // ele é redirecionado para o seu dashboard correto.
        if (payload && (payload.dashboard === 'ti' || payload.dashboard === 'admin')) {
            window.location.href = 'admin-dashboard.html';
            return;
        }
    }
}

/**
 * Proteção de Rotas para o Painel de Gestão de TI.
 * Esta função é chamada a partir de admin.js
 */
function protectAdminPage() {
    const token = getToken();
    if (!token) {
        // Se não há token, redireciona para o login de TI
        window.location.href = 'login-ti.html';
        return;
    }

    const payload = decodeToken(token);
    // Se o tipo não for 'ti' ou 'admin', o acesso é negado.
    if (!payload || (payload.dashboard !== 'ti' && payload.dashboard !== 'admin')) {
        alert('Acesso negado. Você não tem permissão para acessar esta página.');
        // Redireciona para a página de login de TI para que o usuário possa tentar novamente.
        window.location.href = 'login-ti.html'; 
    }
}


// Executa a proteção em todas as páginas
protectPage();
