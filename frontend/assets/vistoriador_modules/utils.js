export function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(dateStr) {
    if(!dateStr) return 'N/D';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function sanitizeHTML(str) {
    if(!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

export function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-emerald-600 border-emerald-500',
        error: 'bg-red-600 border-red-500',
        info: 'bg-sky-600 border-sky-500'
    };

    toast.className = `
        ${colors[type] || 'bg-slate-700'} text-white 
        px-4 py-3 rounded-xl shadow-2xl border border-white/10
        transform transition-all duration-300 translate-y-[-20px] opacity-0 
        flex items-center gap-3 backdrop-blur-md bg-opacity-95 z-[70]
    `;
    
    toast.innerHTML = `
        <span class="text-sm font-medium flex-1">${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-[-20px]', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// NOVA FUNÇÃO SHOWLOADER
export function showLoader(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full min-h-[200px] text-slate-500 animate-pulse">
            <div class="h-10 w-10 rounded-full border-4 border-slate-700 border-t-teal-500 animate-spin mb-4"></div>
            <p class="text-sm font-medium">Processando...</p>
        </div>
    `;
}

// Modal responsivo (Bottom Sheet no mobile)
export function openModal(contentHTML, sizeClass = 'max-w-2xl') {
    const modal = document.getElementById('generic-modal');
    modal.innerHTML = `
        <!-- Overlay Click to Close -->
        <div class="absolute inset-0" onclick="document.getElementById('close-modal-btn')?.click()"></div>
        
        <!-- Modal Content -->
        <div class="bg-slate-900 md:bg-slate-800 w-full md:rounded-2xl shadow-2xl 
                    ${sizeClass} md:border border-slate-700/50 
                    h-[90vh] md:h-auto md:max-h-[85vh] 
                    rounded-t-2xl md:rounded-b-2xl
                    overflow-hidden flex flex-col relative
                    transform transition-transform duration-300 translate-y-full md:translate-y-0
                    neon-border"
             id="modal-card">
             
            <!-- Mobile Drag Handle -->
            <div class="md:hidden w-full flex justify-center pt-3 pb-1 bg-slate-900 cursor-grab" onclick="document.getElementById('close-modal-btn')?.click()">
                <div class="w-12 h-1.5 bg-slate-700 rounded-full"></div>
            </div>

            <!-- Content Scroll Area -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 bg-slate-900 md:bg-transparent">
                ${contentHTML}
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Animação de entrada
    const card = modal.querySelector('#modal-card');
    requestAnimationFrame(() => {
        card.classList.remove('translate-y-full');
    });
}

export function closeModal() {
    const modal = document.getElementById('generic-modal');
    const card = modal.querySelector('#modal-card');
    
    if(card) {
        card.classList.add('translate-y-full'); // Slide down
    }
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.innerHTML = '';
    }, 200);
}