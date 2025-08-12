// frontend/assets/auth.js

const TOKEN_KEY = 'engentoria_vist_token';

function saveToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function removeToken() { localStorage.removeItem(TOKEN_KEY); }
function isUserLoggedIn() { return !!getToken(); }

function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { return null; }
}

// NOVO: Função centralizada para redirecionar após o login
function redirectToDashboard(token) {
    const payload = decodeToken(token);
    if (payload && (payload.dashboard === 'ti' || payload.dashboard === 'admin')) {
        window.location.href = 'admin-dashboard.html';
    } else if (payload && payload.dashboard === 'imobiliaria') {
        window.location.href = 'imobiliaria-dashboard.html';
    } else {
        window.location.href = 'agenda.html';
    }
}

function logout() {
    const payload = decodeToken(getToken());
    removeToken();
    if (payload && (payload.dashboard === 'ti' || payload.dashboard === 'admin')) {
        window.location.href = 'login-ti.html';
    } else if (payload && payload.dashboard === 'imobiliaria') {
        window.location.href = 'login-imobiliaria.html';
    } else {
        window.location.href = 'login.html';
    }
}

function protectPage() {
    const currentPage = window.location.pathname.split('/').pop();
    const publicPages = ['index.html', 'login.html', 'login-ajuda.html', 'login-ti.html', 'login-imobiliaria.html'];
    
    if (publicPages.includes(currentPage)) return;

    if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }
    
    // Se o usuário está logado, mas na página errada, redireciona
    const payload = decodeToken(getToken());
    const dashboardMap = {
        'admin-dashboard.html': ['ti', 'admin'],
        'imobiliaria-dashboard.html': ['imobiliaria'],
        'agenda.html': ['vistoriador'],
        'ajuda.html': ['vistoriador']
    };
    
    const allowedDashboards = dashboardMap[currentPage];
    if (allowedDashboards && !allowedDashboards.includes(payload.dashboard)) {
        // Redireciona para o dashboard correto se estiver na página errada
        redirectToDashboard(getToken());
    }
}

function protectAdminPage() {
    const token = getToken();
    if (!token) {
        window.location.href = 'login-ti.html';
        return;
    }
    const payload = decodeToken(token);
    if (!payload || (payload.dashboard !== 'ti' && payload.dashboard !== 'admin')) {
        alert('Acesso negado.');
        window.location.href = 'login-ti.html';
    }
}

function protectImobiliariaPage() {
    const token = getToken();
    if (!token) {
        window.location.href = 'login-imobiliaria.html';
        return;
    }
    const payload = decodeToken(token);
    if (!payload || payload.dashboard !== 'imobiliaria') {
        alert('Acesso negado.');
        window.location.href = 'login-imobiliaria.html';
    }
}

// Executa a proteção em todas as páginas
protectPage();
