import { api } from './api.js';
import { sanitizeHTML, formatDate } from './utils.js';

export async function renderPendencias(container) {
    // ... existing header code ...
    container.innerHTML = `
        <div class="space-y-6 fade-in">
            <div class="flex justify-between items-end border-b border-slate-800 pb-4">
                <div>
                    <h2 class="text-2xl font-bold text-white">Pendências</h2>
                    <p class="text-slate-400 text-sm">Continue de onde parou.</p>
                </div>
                <div class="text-xs font-bold bg-slate-800 px-3 py-1 rounded-full text-slate-300">
                    <span id="pendencias-count">0</span> itens
                </div>
            </div>
            
            <div id="pendencias-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- Skeleton Loader -->
                ${[1,2].map(() => `<div class="bg-slate-800/50 h-32 rounded-xl animate-pulse"></div>`).join('')}
            </div>
        </div>
    `;

    try {
        const data = await api.getPendencias();
        const list = document.getElementById('pendencias-list');
        const pendentes = data.pendentes || [];
        
        document.getElementById('pendencias-count').textContent = pendentes.length;
        // updateBadges(pendentes.length); // Assume imported or defined

        if (pendentes.length === 0) {
            list.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
                    <div class="bg-slate-800 p-4 rounded-full mb-3">
                        <svg class="h-8 w-8 text-teal-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <p class="text-sm font-medium">Tudo limpo! Nenhuma pendência.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = pendentes.map(p => `
            <!-- *** ATUALIZADO: Link SPA *** -->
            <a href="#laudo?laudo_id=${p.id}&agendamento_id=${p.agenda_id || ''}" 
               class="group block bg-slate-800 border border-slate-700/50 hover:border-teal-500/50 rounded-xl p-5 transition-all active:scale-[0.98] shadow-lg relative overflow-hidden">
                
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600"></div>

                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs font-bold text-amber-400 uppercase tracking-wider">Em Andamento</span>
                    <svg class="h-5 w-5 text-slate-500 group-hover:text-teal-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </div>

                <h3 class="text-xl font-bold text-white mb-1 group-hover:text-teal-300 transition-colors">CT ${sanitizeHTML(p.cod_imovel || 'N/A')}</h3>
                <p class="text-sm text-slate-400 mb-4 line-clamp-1">${sanitizeHTML(p.imobiliaria || 'Imobiliária N/A')}</p>
                
                <div class="flex items-center justify-between text-xs text-slate-500 border-t border-slate-700/50 pt-3">
                    <span class="flex items-center">
                        <svg class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        ${formatDate(p.created_at?.split('T')[0])}
                    </span>
                    <span class="font-bold text-teal-500 group-hover:underline">Continuar</span>
                </div>
            </a>
        `).join('');

    } catch (error) {
        document.getElementById('pendencias-list').innerHTML = `<p class="col-span-full text-red-400 bg-red-900/10 p-4 rounded-lg text-center text-sm">${error.message}</p>`;
    }
}

export async function checkPendenciasBadge() {
    try {
        const data = await api.getPendencias();
        const count = data.pendentes ? data.pendentes.length : 0;
        const badges = document.querySelectorAll('#sidebar-badge, #header-badge');
        badges.forEach(b => {
            if(count > 0) {
                b.textContent = count > 9 ? '9+' : count;
                b.classList.remove('hidden');
            } else {
                b.classList.add('hidden');
            }
        });
    } catch(e) {}
}