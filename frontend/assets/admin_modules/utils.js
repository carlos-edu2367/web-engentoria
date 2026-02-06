// frontend/assets/admin_modules/utils.js

/**
 * Exibe um modal centralizado com o conteúdo fornecido.
 * Garante que a estrutura DOM exista corretamente antes de injetar conteúdo.
 * @param {string} content - HTML do conteúdo do modal.
 */
export function openModal(content) {
    let modal = document.getElementById('modal-overlay');
    
    // Tenta encontrar o container APENAS dentro do modal capturado
    let contentContainer = modal ? modal.querySelector('#modal-content') : null;

    // Se o modal não existir OU se existir mas não tiver o container interno (estrutura quebrada/antiga)
    if (!modal || !contentContainer) {
        // Se existir algo quebrado com esse ID, removemos para criar do zero e evitar conflitos
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modal-overlay';
        // Z-Index alto para garantir que fique sobre tudo
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 fade-in hidden';
        
        // Estrutura base
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-lg p-6 transform transition-all scale-100 relative max-h-[90vh] overflow-y-auto custom-scrollbar" onclick="event.stopPropagation()">
                <button type="button" onclick="window.closeModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10 p-1 rounded-md hover:bg-gray-700">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div id="modal-content"></div>
            </div>
        `;
        
        // Fecha o modal ao clicar fora (no overlay escuro)
        modal.onclick = (e) => {
            if (e.target.id === 'modal-overlay') window.closeModal();
        };

        document.body.appendChild(modal);
        // Captura o container recém-criado
        contentContainer = modal.querySelector('#modal-content');
    }

    // Injeta o conteúdo e exibe
    if (contentContainer) {
        contentContainer.innerHTML = content;
        modal.classList.remove('hidden');
        // Trava o scroll da página de fundo
        document.body.style.overflow = 'hidden';
    } else {
        console.error("Erro crítico: Não foi possível inicializar o container do modal.");
        // Fallback de emergência: remove e tenta de novo (auto-recuperação)
        if(modal) modal.remove();
    }
}

/**
 * Fecha o modal ativo e restaura a rolagem da página.
 */
export function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
        modal.classList.add('hidden');
        
        // Limpa o conteúdo para evitar IDs duplicados ou lixo de memória
        const contentContainer = modal.querySelector('#modal-content');
        if (contentContainer) contentContainer.innerHTML = '';
        
        // Restaura o scroll da página
        document.body.style.overflow = '';
    }
}

/**
 * Exibe uma notificação toast no canto inferior direito.
 * @param {string} message - Mensagem a ser exibida.
 * @param {'info'|'success'|'error'} type - Tipo da notificação.
 */
export function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    
    let colors;
    switch(type) {
        case 'error':
            colors = 'bg-red-500/90 text-white shadow-red-900/20';
            break;
        case 'success':
            colors = 'bg-green-500/90 text-white shadow-green-900/20';
            break;
        default:
            colors = 'bg-blue-500/90 text-white shadow-blue-900/20';
    }

    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl transform transition-all translate-y-10 opacity-0 ${colors} z-[10000] font-medium flex items-center gap-2 backdrop-blur-sm`;
    toast.innerHTML = message;
    
    document.body.appendChild(toast);
    
    // Animação de entrada
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    // Remove após 3 segundos
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Expõe globalmente para compatibilidade com onclick inline no HTML
window.openModal = openModal;
window.closeModal = closeModal;
window.showNotification = showNotification;