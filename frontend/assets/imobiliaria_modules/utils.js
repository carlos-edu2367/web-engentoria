// frontend/assets/imobiliaria_modules/utils.js

export function openModal(content) {
    let modal = document.getElementById('modal-overlay');
    let contentContainer = modal ? modal.querySelector('#modal-content') : null;

    if (!modal || !contentContainer) {
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modal-overlay';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 fade-in hidden';
        
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-lg p-6 transform transition-all scale-100 relative max-h-[90vh] overflow-y-auto custom-scrollbar" onclick="event.stopPropagation()">
                <button onclick="window.closeModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10 p-1 rounded-md hover:bg-gray-700">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div id="modal-content"></div>
            </div>
        `;
        
        modal.onclick = (e) => {
            if (e.target.id === 'modal-overlay') window.closeModal();
        };

        document.body.appendChild(modal);
        contentContainer = modal.querySelector('#modal-content');
    }

    if (contentContainer) {
        contentContainer.innerHTML = content;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

export function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
        modal.classList.add('hidden');
        const contentContainer = modal.querySelector('#modal-content');
        if (contentContainer) contentContainer.innerHTML = '';
        document.body.style.overflow = '';
    }
}

export function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = type === 'error' ? 'bg-red-500/90 text-white shadow-red-900/20' : 
                   type === 'success' ? 'bg-green-500/90 text-white shadow-green-900/20' : 
                   'bg-blue-500/90 text-white shadow-blue-900/20';

    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl transform transition-all translate-y-10 opacity-0 ${colors} z-[10000] font-medium flex items-center gap-2 backdrop-blur-sm`;
    toast.innerHTML = message;
    
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Expor para window para onclicks inline antigos
window.openModal = openModal;
window.closeModal = closeModal;
window.showNotification = showNotification;