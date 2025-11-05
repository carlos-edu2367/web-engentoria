const TOKEN_KEY = 'engentoria_vist_token';
const USER_INFO_KEY = 'engentoria_user_info';

function saveLoginData(token, userInfo) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUserInfo() {
    try {
        return JSON.parse(localStorage.getItem(USER_INFO_KEY));
    } catch (e) {
        return null;
    }
}

function removeLoginData() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_INFO_KEY);
}

function isUserLoggedIn() {
    return !!getToken();
}

function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

function redirectToDashboard() {
    const userInfo = getUserInfo();
    if (!userInfo) {
        window.location.href = 'index.html';
        return;
    }

    const dashboard = userInfo.dashboard_type;

    if (dashboard === 'admin') {
        window.location.href = 'gestao.html';
    } else if (dashboard === 'ti') {
        window.location.href = 'admin-dashboard.html';
    } else if (dashboard === 'imobiliaria') {
        window.location.href = 'imobiliaria-dashboard.html';
    } else { // 'vistoriador'
        window.location.href = 'agenda.html';
    }
}

function logout() {
    removeLoginData();
    window.location.href = 'index.html';
}

function protectPage() {
    if (!isUserLoggedIn()) {
        const currentPage = window.location.pathname.split('/').pop();
        const publicPages = [
            'index.html',
            'login.html',
            'login-imobiliaria.html',
            'login-ti.html',
            'login-ajuda.html',
            'recuperar-senha.html',
            'redefinir-senha.html'
        ];
        if (!publicPages.includes(currentPage)) {
            window.location.href = 'index.html';
        }
    }
}

function protectAdminPage() {
    const userInfo = getUserInfo();
    if (!userInfo || userInfo.dashboard_type !== 'admin') {
        alert('Acesso negado. Requer perfil de administrador.');
        logout();
    }
}

/**
 * NOVA FUNÇÃO: Protege a página de TI, verificando o dashboard_type 'ti'.
 */
function protectTiPage() {
    const userInfo = getUserInfo();
    if (!userInfo || userInfo.dashboard_type !== 'ti') {
        alert('Acesso negado. Requer perfil de gestor de TI.');
        logout();
    }
}

function protectImobiliariaPage() {
    const userInfo = getUserInfo();
    if (!userInfo || userInfo.dashboard_type !== 'imobiliaria') {
        alert('Acesso negado. Requer perfil de imobiliária.');
        logout();
    }
}

function protectVistoriadorPage() {
    const userInfo = getUserInfo();
    if (!userInfo || userInfo.dashboard_type !== 'vistoriador') {
        alert('Acesso negado. Requer perfil de vistoriador.');
        logout();
    }
}

// Executa a proteção em todas as páginas
protectPage();

