export const renderSchedulingPage = async (container) => {
    // Injetando estilos específicos para animações personalizadas
    const styles = `
    <style>
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.1); }
        }
        .anim-slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-delay-100 { animation-delay: 100ms; }
        .anim-delay-200 { animation-delay: 200ms; }
        .anim-delay-300 { animation-delay: 300ms; }
        .anim-float { animation: float 6s ease-in-out infinite; }
        .anim-pulse-glow { animation: pulse-glow 4s ease-in-out infinite; }
        
        /* Grid Background Pattern */
        .bg-grid-slate {
            background-size: 40px 40px;
            background-image: linear-gradient(to right, rgba(34, 211, 238, 0.05) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(34, 211, 238, 0.05) 1px, transparent 1px);
        }
    </style>
    `;

    container.innerHTML = `
        ${styles}
        <div class="relative w-full min-h-[600px] flex items-center justify-center p-6 overflow-hidden">
            
            <div class="absolute inset-0 bg-slate-950 bg-grid-slate pointer-events-none"></div>
            <div class="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[100px] anim-pulse-glow"></div>
            <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] anim-pulse-glow" style="animation-delay: 2s;"></div>

            <div class="relative z-10 w-full max-w-3xl anim-slide-up">
                
                <div class="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 p-8 md:p-12 backdrop-blur-xl shadow-2xl shadow-cyan-900/20 transition-all duration-500 hover:border-cyan-500/30 hover:shadow-cyan-500/10">
                    
                    <div class="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50"></div>

                    <div class="flex flex-col items-center text-center">

                        <div class="relative mb-8 anim-float">
                            <div class="absolute inset-0 rounded-full bg-cyan-400 blur-xl opacity-20"></div>
                            <div class="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-slate-800 to-slate-900 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                                <svg class="h-10 w-10 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 12c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z" opacity="0.5" />
                                </svg>
                            </div>
                            <div class="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-slate-900 ring-2 ring-slate-900">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                        </div>

                        <div class="anim-slide-up anim-delay-100">
                            <h2 class="mb-4 text-3xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-cyan-200 to-slate-100 drop-shadow-sm">
                                Agendamento Inteligente
                            </h2>
                            <p class="mb-10 max-w-xl mx-auto text-lg text-slate-400 leading-relaxed">
                                Estamos codificando o futuro. Uma experiência automatizada que sincroniza imobiliária, vistoriador e cliente em <span class="text-cyan-400 font-semibold">segundos</span>.
                            </p>
                        </div>

                        <div class="w-full text-left anim-slide-up anim-delay-200">
                            <div class="rounded-2xl border border-slate-700/50 bg-slate-950/50 p-6 md:p-8">
                                <h3 class="mb-8 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                                    <span class="flex h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse"></span>
                                    Workflow em Construção
                                </h3>

                                <div class="relative space-y-8 pl-2">
                                    <div class="absolute left-[19px] top-2 bottom-6 w-[2px] bg-slate-800"></div>

                                    <div class="relative flex gap-5 group/step">
                                        <div class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-900 text-slate-400 transition-colors duration-300 group-hover/step:border-cyan-500 group-hover/step:text-cyan-300 shadow-lg">
                                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                                        </div>
                                        <div>
                                            <h4 class="text-base font-semibold text-slate-200 group-hover/step:text-cyan-200 transition-colors">Seleção Instantânea</h4>
                                            <p class="mt-1 text-sm text-slate-500 leading-relaxed">Match direto entre imóvel e vistoriador sem burocracia.</p>
                                        </div>
                                    </div>

                                    <div class="relative flex gap-5 group/step">
                                        <div class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-900 text-slate-400 transition-colors duration-300 group-hover/step:border-cyan-500 group-hover/step:text-cyan-300 shadow-lg">
                                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                        </div>
                                        <div>
                                            <h4 class="text-base font-semibold text-slate-200 group-hover/step:text-cyan-200 transition-colors">Magic Link</h4>
                                            <p class="mt-1 text-sm text-slate-500 leading-relaxed">Geração automática de link único enviado via WhatsApp.</p>
                                        </div>
                                    </div>

                                    <div class="relative flex gap-5 group/step">
                                        <div class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-cyan-500 bg-cyan-950/30 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <div>
                                            <h4 class="text-base font-semibold text-white">Autoatendimento</h4>
                                            <p class="mt-1 text-sm text-slate-400">O cliente define o horário baseado na sua regra de negócio real-time.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-10 flex items-center justify-center gap-2 opacity-60 anim-slide-up anim-delay-300 hover:opacity-100 transition-opacity">
                            <span class="h-px w-8 bg-slate-700"></span>
                            <span class="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                                Powered by <a href="https://www.neectify.com" class="text-cyan-500 hover:text-cyan-300 hover:underline decoration-cyan-500/50 underline-offset-4 transition-all">Neectify</a>
                            </span>
                            <span class="h-px w-8 bg-slate-700"></span>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;
};