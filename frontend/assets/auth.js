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
    removeToken();
    // Redireciona para a página de login
    window.location.href = 'login.html';
}

/**
 * Proteção de Rotas:
 * Verifica se o usuário está logado antes de carregar páginas protegidas.
 */
function protectPage() {
    const currentPage = window.location.pathname.split('/').pop();
    const protectedPages = ['agenda.html', 'ajuda.html'];

    if (protectedPages.includes(currentPage) && !isUserLoggedIn()) {
        // Se tentar acessar uma página protegida sem token, redireciona para o login.
        window.location.href = 'login.html';
    } else if (currentPage === 'login.html' && isUserLoggedIn()) {
        // Se tentar acessar o login já estando logado, redireciona para a agenda.
        window.location.href = 'agenda.html';
    }
}

// Executa a proteção em todas as páginas
protectPage();
