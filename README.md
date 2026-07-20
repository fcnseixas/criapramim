# CriaPraMim

Gerador de posts para Instagram com IA. Lê o perfil (paleta), gera posts com texto e imagem, e exporta em PNG. Você publica onde quiser.

## Estrutura

```
index.html          # landing page
app.html            # o app (gerador)
logo.svg            # marca
api/
  generate-text.js  # função serverless: textos (OpenAI gpt-4o-mini)
  generate-image.js # função serverless: imagens (OpenAI gpt-image-1)
```

O front (`app.html`) chama `/api/generate-text` e `/api/generate-image`. A chave da OpenAI fica só no servidor, como variável de ambiente — nunca no navegador.

## Publicar via GitHub → Vercel (recomendado)

Conecta o repo uma vez; depois todo `git push` faz deploy sozinho.

1. Nesta pasta, inicie o repositório:
   ```bash
   git init
   git add .
   git commit -m "CriaPraMim: primeira versão"
   ```
2. Crie um repositório vazio no GitHub (pelo site, ou `gh repo create criapramim --private --source=. --push`).
   Se criou pelo site:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/criapramim.git
   git branch -M main
   git push -u origin main
   ```
3. Na Vercel: **Add New → Project → Import** o repositório do GitHub. Framework: **Other** (sem build).
4. Em **Settings → Environment Variables**, adicione `OPENAI_API_KEY` com sua chave `sk-...` (Production + Preview).
5. **Deploy**. Pronto — a URL fica tipo `https://criapramim.vercel.app`.

> A chave **nunca** vai pro GitHub: o `.gitignore` já bloqueia `.env`. A chave vive só nas variáveis da Vercel.

---

## Alternativa: Deploy pela CLI (≈2 min)

1. Instale a CLI (ou use `npx`):
   ```bash
   npm i -g vercel
   ```
2. Dentro desta pasta, rode:
   ```bash
   vercel
   ```
   Aceite os padrões (projeto novo, framework: **Other**, sem build). Ele devolve uma URL de preview.
3. Adicione sua chave da OpenAI:
   ```bash
   vercel env add OPENAI_API_KEY
   ```
   Cole a chave (começa com `sk-...`) e escolha os ambientes (Production, Preview, Development).
4. Publique em produção:
   ```bash
   vercel --prod
   ```

Pronto: `https://SEU-PROJETO.vercel.app` abre a landing, e o botão "Começar grátis" leva ao app.

### Rodar localmente com as funções
```bash
vercel dev
```
Isso sobe o site + as funções em `http://localhost:3000` usando a mesma env var.

## Custos por post (aprox.)
- Texto (gpt-4o-mini): centavos por lote.
- Imagem (gpt-image-1): ~US$0,02–0,04 por imagem.

## Trocar de modelo
- Imagem: em `api/generate-image.js`, troque `'gpt-image-1'` por `'dall-e-3'` se sua conta ainda não tiver acesso.
- Texto: em `api/generate-text.js`, o `model` pode virar outro (ex.: `gpt-4o`). Para usar Claude/Anthropic, troque a URL e o formato da requisição.

## Observação
Sem a variável `OPENAI_API_KEY` (ou abrindo o `app.html` direto como arquivo, sem servidor), o app continua funcionando em modo rascunho: textos de exemplo e fundo em degradê no lugar da imagem.
