// frontend/assets/imobiliaria_modules/scheduling.js

// Nota: Imports de lógica removidos temporariamente, pois é apenas uma página de "Coming Soon"
export const renderSchedulingPage = async (container) => {
    
    // Renderiza a tela de "Em Desenvolvimento"
    container.innerHTML = `
        <div class="fade-in max-w-4xl mx-auto pb-20 pt-10">
            <div class="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/20 rounded-2xl p-10 shadow-2xl backdrop-blur-sm text-center relative overflow-hidden">
                
                <!-- Background Decoration -->
                <div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                    <div class="absolute -top-24 -right-24 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
                    <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
                </div>

                <div class="relative z-10 flex flex-col items-center justify-center">
                    
                    <!-- Icon Badge -->
                    <div class="p-4 bg-purple-500/20 rounded-full text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.3)] mb-6 ring-1 ring-purple-500/40">
                        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                        </svg>
                    </div>

                    <h2 class="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                        Funcionalidade em Desenvolvimento
                    </h2>
                    
                    <p class="text-gray-300 text-lg mb-10 max-w-2xl leading-relaxed">
                        Estamos preparando uma nova experiência de agendamento que tornará o processo automático e inteligente para você e seus clientes.
                    </p>

                    <!-- Explicação do fluxo -->
                    <div class="w-full max-w-2xl bg-gray-900/60 border border-gray-700/50 rounded-xl p-8 text-left hover:border-purple-500/30 transition-colors">
                        <h3 class="text-lg font-bold text-purple-300 mb-6 flex items-center gap-2 uppercase tracking-wide text-sm">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            Como vai funcionar?
                        </h3>

                        <div class="space-y-6">
                            <!-- Passo 1 -->
                            <div class="flex gap-4">
                                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-sm font-bold text-gray-300">1</div>
                                <div>
                                    <h4 class="text-white font-medium mb-1">Seleção Rápida</h4>
                                    <p class="text-gray-400 text-sm">A imobiliária seleciona o imóvel e o cliente cadastrado em poucos cliques, sem formulários complexos.</p>
                                </div>
                            </div>

                            <!-- Passo 2 -->
                            <div class="flex gap-4">
                                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-sm font-bold text-gray-300">2</div>
                                <div>
                                    <h4 class="text-white font-medium mb-1">Link Mágico</h4>
                                    <p class="text-gray-400 text-sm">O sistema gera um link exclusivo de agendamento para ser enviado via WhatsApp ou E-mail.</p>
                                </div>
                            </div>

                            <!-- Passo 3 -->
                            <div class="flex gap-4">
                                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-sm font-bold text-white shadow-lg">3</div>
                                <div>
                                    <h4 class="text-white font-medium mb-1">Autoatendimento Inteligente</h4>
                                    <p class="text-gray-400 text-sm">O cliente acessa o link e escolhe o horário disponível baseando-se nas regras de agenda dos vistoriadores e regiões.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Rodapé informativo -->
                    <div class="mt-8 flex items-center gap-3 opacity-60">
                        <span class="px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] uppercase font-bold tracking-wider">Breve</span>
                        <span class="text-gray-500 text-xs">Previsão de lançamento nas próximas atualizações.</span>
                    </div>

                </div>
            </div>
        </div>
    `;
};