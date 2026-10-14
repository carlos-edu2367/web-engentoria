# Fluxo de Laudos e uso de IA (descobertas)

## Laudo (verificado em `backend/models.py` e `backend/routes/agenda_routes.py`)
- `Laudo` (1 por agenda): `finalizado`, `aprovado`, `obs_adm`, `file_path` (PDF/DOCX anexado pelo vistoriador, bucket `documentos`).
- Conteúdo digital: `CategoriaLaudo` (ambiente) → `ItemCategoria.descricao` + `ImagemCategoria` (bucket `imagens`).
- Tipo da vistoria: `laudo.agenda.tipo` ('ENTRADA', 'SAIDA', 'CONFERENCIA', ...).
- Fluxo: vistoriador cria, preenche e/ou anexa, depois `PUT /agenda/laudos/laudo/status` (finalizado) → admin `PUT /admin-panel/laudo/status` (aprova ou recusa com `obs_adm`) → imobiliária vê só os aprovados.
- O PDF do laudo digital é gerado sob demanda em `GET /laudo/{id}/pdf` (`laudo_pdf_routes.py`, reportlab, rota pública).

## Restrições
- `create_all` não adiciona colunas a tabelas existentes. Para isso é preciso SQL manual em `backend/migrations/`. Tabelas novas são criadas automaticamente.
- `job_limpeza_diaria` (03:00) apaga `DocumentoAgenda` e `DocumentosInfoMensal` com mais de 40 dias. Não guardar documentos permanentes nessas tabelas.
- Frontend admin "Gestão" = `gestao.html` + `assets/gestao.js` + `assets/modules/*`. `admin-dashboard.html` é o painel de TI (`UsuarioTI`).

## Dívidas de autorização pré-existentes (não corrigidas)
- `PUT /agenda/laudos/laudo/status` não confere o dono (`vistoriador_id`).
- `GET /imobiliaria/laudo/{id}` e `GET /imobiliaria/categoria/{id}` não conferem o tenant (grupo).

## IA
- Uso existente: `GET /admin-panel/dashboard/analise-ia` com `google-generativeai`, `GEMINI_API_KEY` e modelo fixo no código.
- Ollama Cloud (docs.ollama.com/cloud): `POST https://ollama.com/api/chat`, `Authorization: Bearer $OLLAMA_API_KEY`, modelo `gemma4:31b` (o sufixo `-cloud` é só para o app/CLI), `format` aceita JSON Schema.
- OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions`, modelo `google/gemma-4-31b-it` (256K de contexto, texto e imagem).
- Plano da feature de não conformidades: `docs/plans/laudo-nao-conformidades.md`.
