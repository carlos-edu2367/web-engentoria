// /config.js

// Define a URL base da API, alternando entre ambiente local e de produção.
// Esta variável será importada por todos os outros módulos que precisam fazer chamadas à API.
const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
export const API_BASE_URL_ADMIN = isLocal ? 'http://127.0.0.1:8000/api/v1/admin-panel' : '/api/v1/admin-panel';

