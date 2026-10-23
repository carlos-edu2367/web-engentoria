# Fluxo de Laudos e uso de IA (descobertas)

## Laudo (verificado em `backend/models.py` e `backend/routes/agenda_routes.py`)
- `Laudo` (1 por agenda): `finalizado`, `aprovado`, `obs_adm`, `file_path` (PDF/DOCX anexado pelo vistoriador, bucket `documentos`).
- Conteúdo digital: `CategoriaLaudo` (ambiente) → `ItemCategoria.descricao` + `ImagemCategoria` (bucket `imagens`).
- Tipo da vistoria: `laudo.agenda.tipo` ('ENTRADA', 'SAIDA', 'CONFERENCIA', ...).
- Fluxo: vistoriador cria, preenche e/ou anexa, depois `PUT /agenda/laudos/laudo/status` (finalizado) → admin `PUT /admin-panel/laudo/status` (aprova ou recusa com `obs_adm`) → imobiliária vê só os aprovados.
- O PDF do laudo digital é gerado sob demanda em `GET /laudo/{id}/pdf` (`laudo_pdf_routes.py`, reportlab, rota pública).

## Restrições
- `create_all` não adiciona colunas a tabelas existentes. Para isso, crie uma migration SQL em `backend/migrations/` (aplicada automaticamente no deploy, ver `backend/migrar.py`). Tabelas novas são criadas automaticamente.
- `job_limpeza_diaria` (03:00) apaga `DocumentoAgenda` e `DocumentosInfoMensal` com mais de 40 dias. Não guardar documentos permanentes nessas tabelas.
- Frontend admin "Gestão" = `gestao.html` + `assets/gestao.js` + `assets/modules/*`. `admin-dashboard.html` é o painel de TI (`UsuarioTI`).

## Autorização (corrigido junto com o laudo de não conformidades)
- `PUT /agenda/laudos/laudo/status` agora exige `vistoriador_id == current_user.id`.
- `GET /imobiliaria/laudo/{id}`, `GET /imobiliaria/categoria/{id}` e `GET /imobiliaria/agenda/{id}/laudo` agora filtram pelas imobiliárias do grupo logado (404 fora do tenant).
- Continua público: `GET /laudo/{id}/pdf` (não é usado pelo frontend web).
- `DELETE /agenda/laudo/pdf/{id}` gravava `file_path = False`; agora grava `None`. Registros antigos podem ter `"false"`, e `servico.arquivo_anexado()` trata esse caso.

## Laudo de não conformidades (implementado)
- Gatilho: finalização de laudo cuja `agenda.tipo == 'ENTRADA'`, com `configuracoes_ia.habilitado`. Roda em `BackgroundTasks`, e o APScheduler faz uma varredura a cada 5 min.
- Fila no banco: `analises_nao_conformidade.status` (PENDENTE, PROCESSANDO, CONCLUIDA ou ERRO). Claim atômico por UPDATE; `execucao_id` descarta resultados de execuções substituídas.
- Erros não recuperáveis (sem chave, sem texto, PDF digitalizado) recebem `tentativas = MAX_TENTATIVAS` e não são re-tentados automaticamente.
- A imobiliária vê o documento quando o laudo está aprovado e a análise está CONCLUIDA.
- Testes rodam localmente com Postgres 16 (`service postgresql start`) e `DATABASE_URL`/`SECRET_KEY`/`SUPABASE_*` no ambiente. `test_cpf_nome_proprietario.py` já falhava no teardown (FK de `solicitacoes_agendamento`) antes desta feature.

## IA
- Configuração única em `configuracoes_ia` (provider + modelo), usada pelo laudo de não conformidades **e** pelo Insight IA da agenda (`GET /admin-panel/dashboard/analise-ia`). O flag `habilitado` vale só para a geração automática de NC.
- O insight usava `google-generativeai` com `GEMINI_API_KEY` e modelo fixo; foi migrado para `backend/ia/providers.criar_provider`, e a dependência do Gemini saiu do `requirements.txt`. Erro de provider responde 502 (401/403 deslogam o admin no frontend).
- Lista de modelos: `GET /admin-panel/ia/modelos?provider=&atualizar=` → `providers.listar_modelos` (cache em memória de 24h por provider; se o provider falhar, devolve o cache antigo com `desatualizado: true`). O frontend também guarda a lista por 24h no `localStorage` (`engentoria_ia_modelos_v1_<provider>`).
- Endpoints públicos de listagem (sem chave): Ollama `GET https://ollama.com/api/tags` (`models[].name`, `capabilities`); OpenRouter `GET https://openrouter.ai/api/v1/models` (`data[].id`, `context_length`, `pricing` por token, `supported_parameters`).
- `providers.limpar_resposta` remove blocos `<think>...</think>` que modelos com raciocínio às vezes incluem no conteúdo.
- Ollama Cloud (docs.ollama.com/cloud): `POST https://ollama.com/api/chat`, `Authorization: Bearer $OLLAMA_API_KEY`, modelo `gemma4:31b` (o sufixo `-cloud` é só para o app/CLI), `format` aceita JSON Schema.
- OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions`, modelo `google/gemma-4-31b-it` (256K de contexto, texto e imagem).
- Plano da feature de não conformidades: `docs/plans/laudo-nao-conformidades.md`.

## Uso da IA (painel de Gestão → Sistema → "Uso da IA")
- `GET /admin-panel/ia/uso?dias=30&limite=200` (`servico.relatorio_uso`): resumo, agregado por modelo e lista dos laudos com análise no período (`coalesce(concluido_em, updated_at, created_at)`). Frontend: `assets/modules/uso-ia.js`, rota `#uso-ia`.
- "Gerado pela IA" = `status CONCLUIDA` com `provider` preenchido (o provider só é gravado quando a IA conclui; análise montada à mão pelo admin fica sem provider).
- Só a última execução de cada laudo fica gravada: regerar substitui tokens/modelo. O Insight IA da agenda e o teste de conexão não são registrados em lugar nenhum.
- Custo estimado: só OpenRouter, com os preços atuais de `listar_modelos` (cache de 24h); se a lista falhar, o custo sai `null`. Ollama Cloud é por assinatura (sem custo por token).
- Testes completos: `test_cpf_nome_proprietario.py` quebra a fixture de sessão e derruba o resto em cascata; rode com `--ignore tests/test_cpf_nome_proprietario.py`.
