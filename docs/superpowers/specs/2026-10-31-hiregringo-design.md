# HireGringo — Design do MVP

Data: 2026-10-31

## Intenção

O HireGringo é uma plataforma web onde um profissional brasileiro **de tecnologia/software** que se candidatou a uma vaga no exterior faz uma **entrevista simulada por voz, em inglês**, com um entrevistador de IA. O objetivo é que ele entenda duas coisas antes da entrevista de verdade:

1. Como está o **nível técnico** dele em relação ao que **aquela vaga específica** pede.
2. Como está o **inglês falado** dele.

No fim, ele recebe um veredito com nota para cada frente e dicas concretas do que praticar.

O diferencial é ser específico para a vaga: as perguntas técnicas saem dos requisitos da vaga que o usuário enviou e do currículo dele, não de um banco genérico de perguntas.

## Metas

- O usuário faz login, sobe o currículo (PDF), informa a vaga, faz uma entrevista de voz de ~5 minutos e recebe o resultado.
- A conversa parece uma ligação real: fala → resposta falada em menos de ~1s percebido.
- Custo de centavos de real por entrevista, viável para um plano gratuito.
- O usuário vê o histórico das próprias entrevistas.

## Fora do escopo (MVP)

- Pagamento, planos e upgrade.
- Nota de pronúncia fonema por fonema (avaliação de pronúncia dedicada).
- Vídeo/câmera.
- Momento "do you have any questions for me?" do candidato.
- Vagas fora de tecnologia/software (marketing, design, finanças etc.).
- Suporte a iPhone/iOS Safari.
- Interromper o entrevistador enquanto ele fala (barge-in).
- Gravação/armazenamento do áudio.

## Anti-metas (seria um fracasso mesmo funcionando)

- Perguntas técnicas genéricas que ignoram a vaga e o currículo.
- Dicas genéricas ("pratique mais seu inglês") em vez de dicas amarradas ao que o usuário realmente falou.
- Latência que faz a conversa parecer walkie-talkie.
- Entrevistador bonzinho demais. Ele deve ser realista e exigente.
- Chaves de API dos provedores expostas no navegador.

## Decisões tomadas pelo usuário

### Público
- **Somente vagas de tecnologia/software** no MVP. A extração da vaga, a parte técnica da entrevista e a nota técnica assumem esse domínio (stack, ferramentas, práticas de engenharia).

### Stack
- **Frontend:** React, hospedado na **Vercel**.
- **Backend:** **Node.js**, em **funções serverless na Vercel**. (Go foi considerado e descartado: o suporte a streaming de resposta é mais fraco no runtime Go da Vercel, e a conversa depende de streaming de áudio.) *Minha decisão:* TypeScript, compartilhando tipos com o frontend.
- **Supabase:** banco de dados (Postgres), autenticação (login) e armazenamento dos PDFs.
- Não haverá servidor sempre ligado. Por isso a chamada **não** usa um WebSocket entre navegador e backend (ver "Arquitetura da chamada").

### Pipeline de voz (modular, sem modelo nativo de voz)
- **STT:** Deepgram (streaming via WebSocket), conectado **direto do navegador** com uma **chave temporária** emitida pelo backend.
- **LLM do entrevistador:** modelo aberto rápido e barato via **Groq ou OpenRouter** (ex.: DeepSeek-V3, Qwen 2.5 72B, Llama 3.x 70B).
- **TTS:** **Deepgram Aura ou Cartesia**.
- Motivo: a OpenAI Realtime API custa ~US$0,60–1,20 por 10 min, o que inviabiliza o plano gratuito. O pipeline sai na casa de ~US$0,07–0,09 por 10 min (preços a confirmar nos sites dos provedores antes de fechar o modelo de negócio).

### Entrada da vaga — três formas aceitas
1. Texto colado da descrição.
2. Link da vaga.
3. PDF ou print (imagem) da vaga.

### Entrevista
- Duração: **5 minutos**.
- Segue o roteiro de uma entrevista comum de mercado. A parte técnica é baseada na vaga enviada.
- Tom: **realista e exigente, como um recrutador gringo de verdade**.
- **O comportamento do entrevistador precisa ser fácil de editar** (tom, roteiro, rigor) sem mexer em código de lógica.

### Resultado
- **Nota técnica de 0 a 10**, em relação ao que a vaga pede.
- **Nota de inglês de 0 a 10.**
- **Dicas** do que praticar em cada frente.

### Uso
- **Histórico** de entrevistas por usuário.
- **Limite de 3 entrevistas grátis por usuário.**

## Detalhamento (sugestões minhas aceitas na conversa; o usuário não se opôs)

### Idiomas
- Interface (telas, botões, mensagens) em **português**.
- Entrevista em **inglês**. Resultado detalhado (justificativas, correções de frases) em inglês; os títulos e a moldura da tela de resultado seguem a interface em português.

### Fluxo do usuário
1. Login (Supabase Auth).
2. Nova entrevista: upload do currículo (PDF) + informação da vaga (texto, link ou PDF/print).
3. **Tela de confirmação:** o sistema mostra um resumo extraído da vaga (cargo, requisitos principais, stack) e do currículo. O usuário pode corrigir antes de começar.
4. Permissão de microfone → entrevista de 5 min com cronômetro visível.
5. Tela de resultado.
6. Histórico: lista com vaga, data e as duas notas. Cada item abre o resultado completo.

### Extração da vaga
- **Texto:** usado direto, passando pelo LLM para estruturar.
- **PDF:** extração de texto no backend.
- **Print/imagem:** modelo com visão (via o mesmo provedor de LLM ou equivalente barato).
- **Link:** tentar buscar e ler a página. Funciona bem em Greenhouse, Lever e páginas de carreira; **LinkedIn normalmente falha** (bloqueia leitura automática). Quando falhar, a tela pede para o usuário colar o texto, em vez de travar.

### Arquitetura da chamada (opção "tudo na Vercel")
1. Ao iniciar, o navegador pede ao backend uma **sessão de entrevista** e uma **chave temporária do Deepgram**. Nesse momento o backend verifica a cota grátis.
2. O navegador abre o WebSocket **direto com o Deepgram** e transcreve a fala do usuário em tempo real.
3. Quando o Deepgram detecta o fim da fala (endpointing), o navegador envia o turno para uma função do backend: o texto e as **métricas de fala** daquele turno (ver "Avaliação do inglês").
4. A função do backend monta o contexto (prompt do entrevistador + vaga + currículo + histórico da conversa + tempo restante), chama o LLM em streaming e, **frase a frase**, envia cada frase ao TTS, devolvendo o áudio ao navegador em streaming. O navegador começa a tocar a primeira frase enquanto o resto é gerado.
5. Os turnos (usuário e entrevistador) são salvos no Supabase.
6. Ao final, uma função do backend gera a avaliação a partir da transcrição completa + métricas e salva o resultado.

Observação: cada turno é um pedido HTTP curto, compatível com funções serverless. As funções que fazem streaming precisam de duração máxima configurada adequadamente na Vercel.

**Primeira etapa do plano (minha decisão):** um spike de latência ponta a ponta (fala → transcrição → LLM → TTS → áudio tocando) em Node na Vercel, medindo também o cold start, antes de construir o resto. Meta: resposta percebida em ~1s.

**Revezamento de fala (minha decisão):** no MVP, cada um fala na sua vez. O microfone/transcrição pausa enquanto o entrevistador fala, o que evita eco e dispensa cancelar streams no meio. O usuário não pode interromper o entrevistador.

### Controle de tempo
- Cronômetro visível na tela.
- O entrevistador recebe o tempo restante a cada turno e conduz a conversa para encerrar com naturalidade perto dos 5 min.
- Limite duro no backend um pouco acima de 5 min (ex.: 6 min), para conter custo.
- Silêncio prolongado do usuário: o entrevistador reformula a pergunta ou segue para a próxima.

### Roteiro padrão (5 min)
1. **Abertura (~30s):** o entrevistador se apresenta, cita a vaga, pede "tell me about yourself".
2. **Comportamental (~1min30):** uma pergunta sobre experiência passada, puxada do currículo.
3. **Técnica (~2min30):** 2–3 perguntas baseadas nos requisitos da vaga, com aprofundamento (follow-up) quando a resposta for rasa.
4. **Encerramento (~30s):** agradece e encerra.

### Entrevistador editável
- A persona, o tom, o rigor e o roteiro ficam em **arquivo(s) de prompt separados do código** (ex.: Markdown/texto versionado no repositório), com variáveis para vaga, currículo e tempo restante.
- O mesmo vale para o prompt do avaliador (critérios das notas e formato das dicas).
- Ajustar o comportamento não deve exigir mexer na lógica do backend, só no texto do prompt (e um redeploy).

### Avaliação do inglês
- Num pipeline, o LLM lê a transcrição e não ouve o áudio. A pronúncia é aproximada por sinais que o Deepgram devolve:
  - confiança por palavra (palavra mal pronunciada tende a vir com confiança baixa);
  - pausas e tempo até começar a responder;
  - velocidade da fala (palavras por minuto);
  - hesitações/filler words ("um", "uh").
- Com a transcrição, o LLM avalia também gramática, vocabulário e naturalidade.
- A nota de inglês combina fluidez, clareza, gramática e vocabulário.

### Formato do resultado
- Duas notas de 0 a 10, cada uma com uma justificativa curta e específica (ex.: "explicou bem APIs, mas ficou vago em testes automatizados, que a vaga exige").
- Dicas concretas e amarradas à fala do usuário, citando o trecho e a versão melhor. Ex.: *"I have 5 years of experience in React"* → *"I've been working with React for 5 years"*.
- O resultado completo e a transcrição ficam salvos para o histórico.

### Cota de 3 entrevistas grátis
- Verificada e aplicada **no backend**, não só na interface.
- Conta como usada apenas a entrevista que **gerou resultado**. Se a conexão cair no meio, o usuário não perde a tentativa.
- **Encerramento antecipado (minha decisão):** se o usuário encerrar a entrevista com **pelo menos 2 minutos** de conversa, ela gera resultado e conta na cota. Abaixo de 2 minutos, não gera resultado nem conta.
- **Anti-abuso (minha decisão):** no máximo **3 entrevistas inacabadas por usuário por dia**, já que cada uma consome STT/LLM/TTS.
- **Confirmação de e-mail obrigatória** no cadastro (Supabase Auth), para dificultar contas duplicadas atrás de mais entrevistas grátis (minha decisão).
- Ao esgotar, a tela informa que o limite grátis acabou (sem fluxo de pagamento no MVP).

### Dados pessoais / LGPD (minhas decisões)
- O áudio **não é guardado**; só a transcrição, as métricas de fala e o resultado.
- No cadastro, o usuário aceita explicitamente o uso dos dados (currículo, transcrição) para gerar a avaliação.
- O usuário pode **apagar uma entrevista** do histórico e **apagar a conta** com todos os dados (incluindo os PDFs no storage).

### Segurança
- Chaves de Deepgram, LLM e TTS só no backend. O navegador recebe apenas a chave temporária e de curta duração do Deepgram.
- Dados do usuário (currículos, transcrições, resultados) isolados por usuário via políticas de acesso do Supabase (RLS).
- O backend valida o JWT do Supabase em todas as rotas.

## Restrições

- Funções serverless na Vercel: sem conexões longas no backend; cada chamada é curta e com tempo máximo.
- Custo por entrevista deve ficar na casa de centavos.
- **Navegadores (minha decisão):** foco em desktop (Chrome, Edge, Firefox, Safari no Mac). Chrome no Android é "deve funcionar", sem garantia. iPhone/iOS Safari fica fora do MVP.

## Deixado para quem for construir

- Escolha exata do modelo de LLM, da voz de TTS (Aura vs Cartesia) e do modelo com visão para prints.
- Estrutura de pastas e organização do repositório (ex.: um único projeto Vercel com o frontend React e as funções em `api/`).
- Biblioteca de UI e estilo visual do frontend.
- Esquema detalhado das tabelas no Supabase.
- Formato de streaming do áudio de volta ao navegador (chunks HTTP, formato do áudio).
- Parâmetros de endpointing do Deepgram e de detecção de silêncio.
- Estratégia de testes.
