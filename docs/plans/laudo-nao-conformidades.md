# Plano: Laudo de Não Conformidades (IA) a partir do Laudo de Entrada

> Status: **proposta — nada implementado ainda**.
> Legenda: **[verificado]** = visto no código; **[externo]** = verificado em documentação
> do provider; **[proposta]** = decisão de design a validar; **[aberto]** = depende do usuário.

## 1. Objetivo

Quando existir um laudo de **ENTRADA**, gerar automaticamente um segundo documento,
o **Laudo de Não Conformidades (NC)**, que lista somente os **problemas funcionais**:
o que não funciona, vaza, não trava ou oferece risco ao inquilino. Exemplos: sifão
danificado, tomada sem funcionamento, descarga que não aciona, porta que não tranca,
fiação exposta.

O NC **não** lista defeitos estéticos ou desgaste natural, como riscos, manchas,
pintura gasta ou furos de bucha. Esses itens já estão no laudo de entrada.

A partir daí, a vistoria de entrada passa a ter dois documentos:
1. o laudo de entrada (como hoje);
2. o laudo de não conformidades (novo, gerado por IA e **revisado por um admin** antes de ir para a imobiliária).

Deve funcionar com as duas formas de laudo de entrada que existem hoje (ver §2.2).

---

## 2. Estudo do sistema atual

### 2.1 Stack [verificado]
- Backend FastAPI + SQLAlchemy síncrono (`backend/`), PostgreSQL, Supabase Storage (buckets `documentos` e `imagens`).
- Frontend em HTML + ES modules + Tailwind via CDN (`frontend/`).
- Schema criado com `Base.metadata.create_all()` em `backend/main.py`, que **cria tabelas novas, mas não adiciona colunas a tabelas existentes**. Colunas novas exigem SQL manual (`backend/migrations/add_cpf_nome_proprietario.sql`).
- APScheduler já roda no processo (`main.py` → `job_limpeza_diaria` às 03:00).
- Dependências úteis já presentes: `requests` e `reportlab`. `Pillow` é usado em `agenda_routes.py`, mas **não está** no `requirements.txt` (dívida pré-existente).
- Já existe uso de IA: `GET /admin-panel/dashboard/analise-ia` usa `google-generativeai` com `GEMINI_API_KEY` e modelo fixo no código (`admin_panel_routes.py` ~3033). Não existe abstração de provider.

### 2.2 Como o laudo existe hoje [verificado]
Modelo `Laudo` (`models.py`): `agenda_id`, `imovel_id`, `imobiliaria_id`, `vistoriador_id`, `finalizado`, `aprovado`, `obs_adm`, `file_path`. O tipo da vistoria vem de `laudo.agenda.tipo` (`'ENTRADA'`, `'SAIDA'`, ...).

O conteúdo de um laudo pode chegar de **duas fontes**, e as duas precisam ser suportadas:

| Fonte | Onde | Conteúdo |
|---|---|---|
| **A. Laudo digital** | `CategoriaLaudo` (= ambiente) → `ItemCategoria.descricao` (texto) + `ImagemCategoria` (fotos) | Texto estruturado por ambiente, digitado ou ditado (speech-to-text) pelo vistoriador em `vistoriador_modules/laudo.js` |
| **B. Laudo anexado** | `Laudo.file_path` (bucket `documentos`), enviado por `POST /agenda/laudo/adicionar_laudo_pdf` | PDF ou DOCX de até 100 MB, normalmente gerado por outro app de vistoria, com texto e fotos |

Ciclo de vida:
1. O vistoriador cria o laudo, preenche e/ou anexa o arquivo e chama `PUT /agenda/laudos/laudo/status?finalizado=true`.
2. O laudo aparece para o admin em `GET /admin-panel/laudos/pendentes` (`gestao.html` → `modules/laudos.js`).
3. O admin aprova ou recusa em `PUT /admin-panel/laudo/status`. A recusa grava `obs_adm` e devolve o laudo ao vistoriador (`finalizado=false`).
4. A imobiliária vê só laudos aprovados (`GET /imobiliaria/laudos` e `GET /imobiliaria/laudo/{id}`, em `imobiliaria_modules/laudos.js`).

O PDF do laudo digital é gerado sob demanda com reportlab em `GET /laudo/{id}/pdf` (`laudo_pdf_routes.py`).

### 2.3 Achados relevantes para o design [verificado]
- **Limpeza automática:** o `job_limpeza_diaria` apaga `DocumentoAgenda` e `DocumentosInfoMensal` com mais de 40 dias. `Laudo.file_path` não é afetado. **O NC não deve ser salvo como `DocumentoAgenda`**, senão some em 40 dias.
- **Configurações:** a tabela `configuracoes` (id=1) é editada em `/admin-panel/configuracoes/`. Novas colunas nela exigiriam migração manual. Uma **tabela nova** é criada sozinha pelo `create_all`.
- **Dívidas pré-existentes de autorização** (fora do escopo, mas o novo código **não** deve repeti-las):
  - `PUT /agenda/laudos/laudo/status` (`agenda_routes.py` ~637) busca o laudo só pelo id, sem conferir `vistoriador_id == current_user.id`.
  - `GET /imobiliaria/laudo/{id}` e `GET /imobiliaria/categoria/{id}` (`imobiliaria_routes.py` ~1059/1095) não conferem se o laudo pertence a uma imobiliária do grupo logado. A única proteção é o UUID ser difícil de adivinhar.
  - `GET /laudo/{id}/pdf` é público, sem autenticação (documentado no próprio código).

---

## 3. Providers de IA [externo]

| | Ollama Cloud | OpenRouter |
|---|---|---|
| Endpoint | `POST https://ollama.com/api/chat` | `POST https://openrouter.ai/api/v1/chat/completions` |
| Auth | `Authorization: Bearer $OLLAMA_API_KEY` | `Authorization: Bearer $OPENROUTER_API_KEY` |
| Modelo padrão | `gemma4:31b` (sem sufixo `-cloud` na API direta) | `google/gemma-4-31b-it` |
| Saída estruturada | `format: <JSON Schema>` | `response_format: {type: "json_schema", ...}` (depende do provider da rota; usar `provider.require_parameters: true`) |
| Contexto | 256K | 256K |
| Entrada | texto + imagem | texto + imagem |
| Custo de referência | assinatura / cota de uso | ~US$ 0,12 por 1M tokens de entrada e ~US$ 0,35 por 1M de saída (há variante `:free`) |

**Atenção:** o **mesmo modelo tem ids diferentes** em cada provider. Ao trocar o provider na UI, o campo de modelo deve ser preenchido com o padrão do novo provider (§6.3).

Estimativa de custo: um laudo de 60 páginas tem ~40k tokens de texto, o que dá **cerca de US$ 0,01 por análise** no OpenRouter. O custo é desprezível.

As chamadas usam `requests`, que já é dependência. Não é preciso SDK novo.

---

## 4. Decisões de arquitetura [proposta]

1. **A IA sugere e o admin decide.** O NC só fica visível para a imobiliária depois de revisado e aprovado por um admin. A saída do modelo nunca é tratada como verdade.
2. **Processamento assíncrono.** Um PDF longo pode levar minutos. A rota só **enfileira** o trabalho; o processamento roda em background com o status gravado no banco.
3. **Análise só de texto na v1.** Descrições como "tomada sem funcionamento" ou "sifão com vazamento" estão no texto do laudo. Analisar centenas de fotos por visão é caro e lento, e fica para a fase 4.
4. **PDF do NC gerado sob demanda** a partir dos itens no banco, no mesmo padrão de `laudo_pdf_routes.py`. Assim o PDF sempre reflete as edições do admin e não há arquivo para limpar ou sincronizar.
5. **Provider e modelo configuráveis pelo admin; chaves no ambiente.** `OLLAMA_API_KEY` e `OPENROUTER_API_KEY` ficam em variáveis de ambiente e nunca vão para o banco ou para o front. O admin escolhe só o provider e o modelo.
6. **Tabelas novas em vez de colunas novas**, para o `create_all` cuidar do schema sem migração manual.

---

## 5. Modelo de dados [proposta]

```python
class ConfiguracaoIA(Base):            # tabela: configuracoes_ia (linha única, id=1)
    id                   = Integer, pk, default=1
    provider             = TEXT, default 'ollama_cloud'     # 'ollama_cloud' | 'openrouter'
    modelo               = TEXT, default 'gemma4:31b'
    habilitado           = Boolean, default True
    auto_gerar_entrada   = Boolean, default True           # gera ao finalizar laudo de ENTRADA
    temperatura          = Numeric(3,2), default 0.1
    timeout_segundos     = Integer, default 180
    updated_at, updated_by_id (FK usuarios, nullable)

class AnaliseNaoConformidade(Base):    # tabela: analises_nao_conformidade
    id
    laudo_id             = FK laudos.id ON DELETE CASCADE, UNIQUE   # 1 análise ativa por laudo
    status               = TEXT  # PENDENTE | PROCESSANDO | CONCLUIDA | ERRO | APROVADA
    fontes               = JSON  # ex.: ["LAUDO_DIGITAL", "ARQUIVO_ANEXO"]
    provider, modelo, prompt_versao     # rastreabilidade: o que gerou o resultado
    tentativas           = Integer, default 0
    erro                 = Text, nullable    # mensagem amigável; detalhe vai para o log
    tokens_entrada, tokens_saida = Integer, nullable
    iniciado_em, concluido_em
    aprovado_por_id      = FK usuarios, nullable
    aprovado_em          = TIMESTAMP, nullable
    created_at, updated_at

class ItemNaoConformidade(Base):       # tabela: itens_nao_conformidade
    id
    analise_id           = FK ON DELETE CASCADE
    ambiente             = TEXT          # "Banheiro social"
    item                 = TEXT          # "Sifão da pia"
    descricao            = Text          # "Sifão solto, com vazamento na conexão"
    categoria            = TEXT          # HIDRAULICA | ELETRICA | ESQUADRIAS | GAS | SEGURANCA_ESTRUTURA | EQUIPAMENTOS | OUTROS
    gravidade            = TEXT          # CRITICA | ALTA | MEDIA | BAIXA
    tipo                 = TEXT          # NAO_CONFORMIDADE | NAO_VERIFICADO
    trecho_origem        = Text, nullable   # citação literal do laudo (evidência)
    pagina               = Integer, nullable
    evidencia_validada   = Boolean      # o trecho foi encontrado no texto de origem?
    origem               = TEXT          # IA | MANUAL
    removido             = Boolean, default False   # soft delete feito pelo admin
    ordem                = Integer
    created_at, updated_at
```

**Itens não verificados:** laudos costumam dizer "sem energia, não foi possível testar" ou "água cortada". Esses itens não são NC, mas são relevantes para o inquilino. Eles entram com `tipo = NAO_VERIFICADO` e aparecem numa seção separada do documento.

---

## 6. Backend [proposta]

### 6.1 Novo pacote `backend/ia/`
```
backend/ia/
  providers.py         # LLMProvider (interface) + OllamaCloudProvider + OpenRouterProvider + get_provider(config)
  extracao.py          # texto do laudo digital, do PDF (pypdf) e do DOCX (python-docx)
  nao_conformidades.py # prompt, schema JSON, chunking, validação de evidência, merge e persistência
  pdf_nc.py            # geração do PDF do NC (reportlab, reaproveitando estilos e rodapé do laudo_pdf_routes)
```

**Interface do provider:**
```python
class LLMProvider(Protocol):
    def gerar_json(self, system: str, user: str, schema: dict) -> tuple[dict, Uso]: ...
```
- Timeout configurável. Retry com backoff (2s, 4s, 8s) em 429, 5xx e timeout. Não há retry em 4xx de configuração (chave inválida ou modelo inexistente), que vira `ERRO` com mensagem clara.
- **Ollama:** `{"model", "messages", "format": schema, "stream": false, "options": {"temperature": t}}`. O thinking mode do Gemma 4 é configurável; desligá-lo pode reduzir a latência, mas isso precisa ser validado.
- **OpenRouter:** `response_format` json_schema com `provider: {"require_parameters": true, "data_collection": "deny"}`, para usar só rotas que suportam o schema e que não retêm dados. Inclui os headers `HTTP-Referer` e `X-Title: Engentoria`.
- Se o JSON vier inválido: parse tolerante, validação Pydantic e **uma** nova tentativa pedindo para corrigir o JSON.

### 6.2 Pipeline de análise (`nao_conformidades.py`)
1. **Coletar fontes.** O texto do laudo digital é montado como `## {categoria.titulo}` seguido de `- {item.descricao}`, sem dados pessoais. Se houver `file_path`, o arquivo é baixado do Supabase e o texto é extraído página a página (`pypdf` para PDF, `python-docx` para DOCX). Se existirem as duas fontes, as duas são usadas.
2. **Detectar PDF escaneado.** Se a maioria das páginas tiver menos de ~50 caracteres de texto, o PDF é provavelmente imagem. Na v1 isso vira `ERRO` com a mensagem "PDF sem texto extraível (digitalizado)". A fase 4 adiciona OCR por visão.
3. **Mascarar dados pessoais (LGPD)** antes de enviar: CPF, e-mail e telefone via regex. O conteúdo do laudo continua; o que sai são os identificadores.
4. **Chunking:** blocos de ~60k caracteres (~15k tokens), cortados em fronteira de página ou ambiente, com um pouco de sobreposição. Um laudo típico precisa de 1 a 4 chamadas. Blocos menores dão mais precisão a um modelo de 31B do que mandar 200 páginas de uma vez.
5. **Chamar o LLM** por bloco, com o schema `{nao_conformidades: [...], nao_verificados: [...]}`.
6. **Validar a evidência:** cada item precisa trazer o `trecho_origem` literal. O código confere com `difflib` (stdlib) se o trecho existe no texto, após normalizar acentos, caixa e espaços. Itens não encontrados **não são descartados**: ficam com `evidencia_validada=false` e aparecem destacados para o admin.
7. **Merge e dedupe** entre blocos, usando chave normalizada (ambiente, item) e similaridade da descrição.
8. **Persistir** os itens e marcar `status=CONCLUIDA`, gravando tokens, provider, modelo e `prompt_versao`.

### 6.3 Prompt (rascunho, versão `nc-v1`)
- **Papel:** perito em vistoria imobiliária para locação residencial.
- **Tarefa:** a partir de um laudo de ENTRADA, listar só os itens com **falha de funcionamento, vazamento, ausência de peça funcional ou risco à segurança ou à saúde**.
- **Incluir** (exemplos): vazamento ou infiltração ativa, sifão solto ou danificado, torneira pingando ou sem funcionamento, descarga ou caixa acoplada que não aciona, ralo entupido, chuveiro sem funcionamento, tomada ou interruptor sem funcionamento, fiação exposta, disjuntor desarmando, luminária que não acende, porta ou janela que não fecha ou não trava, fechadura com defeito, chave ausente, vidro trincado ou quebrado, guarda-corpo solto, telha quebrada com goteira, interfone, portão eletrônico ou aquecedor sem funcionamento.
- **Não incluir:** riscos, manchas, sujeira, pintura desgastada, pequenos furos, desgaste natural, divergência de cor e qualquer descrição de item "em bom estado" ou "funcionando".
- **Separar** em `nao_verificados` o que não pôde ser testado (sem energia, sem água, sem chave).
- **Gravidade:**
  - CRITICA: risco à segurança ou à saúde (fiação exposta, gás, vidro quebrado, guarda-corpo);
  - ALTA: impede o uso (sem água, vaso inutilizável, porta de entrada não tranca);
  - MEDIA: uso prejudicado (tomada sem funcionar, torneira pingando, sifão vazando);
  - BAIXA: reparo simples (lâmpada queimada, puxador solto).
- **Regras:** não inventar; citar o trecho literal; se não houver nada, devolver lista vazia; responder em pt-BR.
- Incluir 4 a 6 exemplos curtos (few-shot) com casos positivos, negativos e de fronteira.

O prompt fica versionado no código (`PROMPT_VERSAO = "nc-v1"`) para dar para comparar resultados entre versões.

### 6.4 Execução em background
- Na hora de enfileirar, criar ou resetar a `AnaliseNaoConformidade` com `PENDENTE` e chamar `BackgroundTasks.add_task(processar_analise, analise_id)`. A função é **síncrona** (roda no threadpool) e abre a própria `SessionLocal()`.
- **Claim atômico** contra duplicidade (mais de um worker ou re-clique):
  `UPDATE analises_nao_conformidade SET status='PROCESSANDO', iniciado_em=now(), tentativas=tentativas+1 WHERE id=:id AND status IN ('PENDENTE','ERRO') RETURNING id`.
- **Varredura de segurança** no APScheduler a cada 5 min: reprocessa `PENDENTE` com mais de 2 min e `PROCESSANDO` travado há mais de 15 min (por exemplo, depois de um deploy), sempre com `tentativas < 3`.

### 6.5 Gatilhos
| Evento | Ação |
|---|---|
| Vistoriador finaliza laudo cuja `agenda.tipo == 'ENTRADA'` (`PUT /agenda/laudos/laudo/status`, `finalizado=true`) com `habilitado` e `auto_gerar_entrada` ligados | Enfileira (ou re-enfileira, se o laudo foi reaberto e refinalizado) |
| Admin clica em "Gerar" ou "Regerar" | Enfileira manualmente, para qualquer laudo de entrada finalizado |
| Laudo recusado e reaberto | Análise existente vira `PENDENTE` na próxima finalização |

**Regerar substitui os itens.** Se houver itens `MANUAL` ou editados, a UI pede confirmação antes.

### 6.6 Endpoints

**Admin** (`/admin-panel`, já protegido por `get_current_admin_user`):

| Método | Rota | Função |
|---|---|---|
| GET/PUT | `/admin-panel/ia/config` | Lê e altera provider, modelo e flags. Valida o enum de provider. Informa se a chave do provider está configurada no ambiente, sem expor a chave |
| POST | `/admin-panel/ia/testar` | Chamada mínima ao provider e modelo configurados ("responda OK"), com latência e erro |
| POST | `/admin-panel/laudo/{id}/nao-conformidades/gerar` | Enfileira. Responde 409 se estiver `PROCESSANDO` e 400 se o laudo não for de ENTRADA ou não estiver finalizado |
| GET | `/admin-panel/laudo/{id}/nao-conformidades` | Status, metadados e itens |
| POST | `/admin-panel/laudo/{id}/nao-conformidades/itens` | Admin adiciona item (`origem=MANUAL`) |
| PUT/DELETE | `/admin-panel/nao-conformidades/itens/{item_id}` | Edita ou remove item (soft delete) |
| PUT | `/admin-panel/laudo/{id}/nao-conformidades/aprovar` | `status=APROVADA`, grava `aprovado_por_id` e `aprovado_em` |
| GET | `/admin-panel/laudo/{id}/nao-conformidades/pdf` | PDF sob demanda (permite pré-visualizar antes de aprovar) |

**Imobiliária** (`/imobiliaria`), **com isolamento de tenant**: o laudo precisa ter `imobiliaria_id` entre as imobiliárias do grupo logado; caso contrário, 404.

| Método | Rota | Regra |
|---|---|---|
| GET | `/imobiliaria/laudo/{id}/nao-conformidades` | Só se `laudo.aprovado` **e** `analise.status == APROVADA` |
| GET | `/imobiliaria/laudo/{id}/nao-conformidades/pdf` | Mesma regra |
| — | `GET /imobiliaria/laudos` (existente) | Adicionar `qtd_nao_conformidades: int \| null` em `LaudoAprovadoItem`. A mudança é aditiva e não quebra o contrato |

### 6.7 PDF do NC
- Cabeçalho: título "LAUDO DE NÃO CONFORMIDADES", imóvel (código e endereço), imobiliária, data da vistoria de entrada e vistoriador.
- Resumo: total de itens por gravidade.
- Tabela agrupada por ambiente com colunas **Item**, **Não conformidade**, **Categoria** e **Gravidade** (cor por gravidade).
- Seção "Itens não verificados na vistoria".
- Aviso: "Documento gerado com auxílio de inteligência artificial a partir do laudo de entrada e revisado pela equipe Engentoria em dd/mm/aaaa." O texto exato está em aberto (§10).
- Rodapé reaproveitando `_draw_footer`.

---

## 7. Frontend [proposta]

### 7.1 Admin — `gestao.html`
- **`modules/configuracoes.js`:** novo card "Inteligência Artificial" com:
  - provider (select Ollama Cloud / OpenRouter);
  - modelo (texto, preenchido com o padrão do provider ao trocar);
  - "Habilitado" e "Gerar automaticamente ao finalizar laudo de entrada";
  - indicador "chave configurada: sim/não";
  - botão **Testar conexão**.
- **`modules/laudos.js` (`renderLaudoDetails`):** novo card "Laudo de Não Conformidades" que só aparece quando o tipo é ENTRADA, com:
  - status (spinner com polling a cada ~5s enquanto `PENDENTE` ou `PROCESSANDO`);
  - lista agrupada por ambiente com badge de gravidade;
  - destaque para `evidencia_validada=false` ("conferir no laudo"), com o trecho de origem expansível;
  - editar, remover e adicionar item;
  - botões **Regerar**, **Pré-visualizar PDF** e **Aprovar não conformidades**.
- **`api.js`:** funções correspondentes.

### 7.2 Imobiliária — `imobiliaria_modules/laudos.js`
- Na coluna "Documento", ao lado de "Ver laudo", entra o botão **Não conformidades (N)** quando houver NC aprovado. Ele abre o PDF via a nova rota.
- `api-imob.js`: funções correspondentes.

### 7.3 Vistoriador
- Sem mudança na v1. O fluxo de anexar e finalizar continua igual. A análise roda depois, sem bloquear o vistoriador.

---

## 8. Fases de entrega

| Fase | Escopo | Entregável |
|---|---|---|
| **1. Núcleo backend** | Tabelas, `backend/ia/` (providers, extração digital/PDF/DOCX, pipeline), gatilho na finalização, endpoints admin, `requirements.txt` (+`pypdf`, `python-docx`) | Analisa laudos e salva itens; testável por API |
| **2. Revisão admin** | Card de config IA, card de NC no detalhe do laudo, edição e aprovação, PDF do NC | Admin revisa e aprova |
| **3. Imobiliária** | Endpoints com tenant, botão e download na lista de laudos | Imobiliária recebe o NC |
| **4. Evoluções** (opcional) | OCR por visão para PDF escaneado (renderizar páginas com `pypdfium2`, licença Apache/BSD, e enviar como imagem ao Gemma 4); análise de fotos; upload avulso de laudo de entrada externo; NC visível ao vistoriador; migrar `dashboard/analise-ia` (Gemini) para a mesma abstração | — |

---

## 9. Testes e validação

- **Unitários (sem rede):**
  - extração de texto (fixtures PDF, DOCX e laudo digital);
  - mascaramento de dados pessoais;
  - chunking;
  - validação de evidência;
  - merge e dedupe;
  - parse tolerante de JSON;
  - `FakeProvider` com respostas fixas.
- **Integração** (padrão de `tests/conftest.py`, com Supabase mockado):
  - gatilho na finalização de ENTRADA (e não de SAIDA);
  - claim atômico (duas chamadas, um processamento);
  - permissões: imobiliária de outro grupo recebe 404; NC não aprovado não aparece para a imobiliária.
- **Avaliação de qualidade (essencial):** montar um **conjunto de 10 a 20 laudos de entrada reais**, anonimizados, com as NC esperadas marcadas por alguém da operação. Medir precisão (itens estéticos classificados como NC) e recall (NC reais perdidas) a cada mudança de prompt ou modelo. Aceite sugerido: recall ≥ 90% nas gravidades CRITICA e ALTA.

---

## 10. Riscos e pontos em aberto

**Riscos**
- **Alucinação ou classificação errada** (estético tratado como funcional). Mitigações: regras e exemplos no prompt, temperatura baixa, evidência literal validada no código e **revisão humana obrigatória**.
- **PDFs escaneados** não têm texto na v1. São detectados e sinalizados; o OCR fica para a fase 4.
- **LGPD:** o texto do laudo vai para um terceiro. Mitigações: mascarar identificadores, `data_collection: deny` no OpenRouter e conferir os termos do Ollama Cloud.
- **Disponibilidade e cota do provider:** as tags cloud do Ollama aparecem como "Low Usage". Retry, status `ERRO` visível e botão Regerar cobrem isso; trocar de provider na config é o fallback manual.
- **Execução em background no mesmo processo:** um deploy no meio da análise a interrompe. A varredura de 5 min retoma.

**Perguntas para o usuário** [aberto]
1. **Visibilidade:** o NC deve exigir **aprovação separada** (proposta) ou ser aprovado junto com o laudo no mesmo botão?
2. **Quem recebe:** só a imobiliária ou também o inquilino ou o proprietário (por e-mail ou link)?
3. **"Ao anexar o laudo de entrada":** além do PDF do vistoriador, existe o caso de a imobiliária ou o admin enviar um laudo de entrada **feito por terceiros** (outra empresa)? Isso define se o upload avulso entra antes da fase 4.
4. **Gatilho:** gerar ao **finalizar** (proposta, pois o laudo está completo) ou já no momento do **upload** do PDF?
5. **Texto do aviso** de "gerado com IA" no PDF e se a marca Engentoria assina o documento.
6. Pode compartilhar **alguns laudos de entrada reais** (PDF do app que os vistoriadores usam e laudos digitais) para calibrar o prompt?
7. Devo **corrigir na mesma entrega** as falhas de autorização pré-existentes de §2.3 (status do laudo sem checar dono; laudo e categoria da imobiliária sem checar tenant)? São correções pequenas e de baixo risco.
