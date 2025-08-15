// /assets/ui.js

const pageContent = document.getElementById('page-content');
const modal = document.getElementById('generic-modal');
const modalContent = document.getElementById('modal-content');

/**
 * Sanitiza uma string de HTML para prevenir ataques XSS.
 * @param {string} str A string a ser sanitizada.
 * @returns {string} A string sanitizada.
 */
export function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

/**
 * Exibe um spinner de carregamento na área de conteúdo principal.
 */
export function showLoader() {
    pageContent.innerHTML = `
        <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400"></div>
        </div>
    `;
}

/**
 * Renderiza o conteúdo HTML na página principal.
 * @param {string} html O conteúdo HTML para renderizar.
 */
export function renderPageContent(html) {
    pageContent.innerHTML = '';
    pageContent.className = 'fade-in';
    pageContent.innerHTML = html;
}

/**
 * Mostra o modal genérico com o conteúdo HTML fornecido.
 * @param {string} html O conteúdo HTML para exibir no modal.
 * @param {string} [size='max-w-2xl'] A classe de tamanho do Tailwind para o modal.
 */
export function showModal(html, size = 'max-w-2xl') {
    modalContent.className = `bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl p-6 w-full ${size} border border-gray-700/50 max-h-[90vh] overflow-y-auto neon-border`;
    modalContent.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Esconde o modal genérico.
 */
export function hideModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modalContent.innerHTML = '';
}

// Adiciona um listener para fechar o modal ao clicar fora do conteúdo
modal.addEventListener('click', (event) => {
    if (event.target === modal) {
        hideModal();
    }
});

/**
 * Exibe um alerta simples no topo da página.
 * @param {string} message A mensagem a ser exibida.
 * @param {string} [type='success'] O tipo do alerta ('success', 'error', 'info').
 */
export function showAlert(message, type = 'success') {
    const colorClasses = {
        success: 'bg-green-500/20 border-green-500 text-green-300',
        error: 'bg-red-500/20 border-red-500 text-red-300',
        info: 'bg-blue-500/20 border-blue-500 text-blue-300',
    };

    const alertDiv = document.createElement('div');
    alertDiv.className = `fixed top-5 right-5 p-4 rounded-lg border ${colorClasses[type]} shadow-lg z-50 animate-pulse`;
    alertDiv.textContent = message;
    
    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 4000);
}