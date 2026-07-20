#!/usr/bin/env bash
# Cria o repositório no GitHub e envia o projeto — em um comando.
# Pré-requisitos:
#   1) git instalado
#   2) GitHub CLI instalado e autenticado:  gh auth login
#
# Uso:   bash setup.sh [nome-do-repo]     (padrão: criapramim)

set -e
REPO_NAME="${1:-criapramim}"

# checagens rápidas
command -v git >/dev/null || { echo "❌ git não encontrado. Instale o git primeiro."; exit 1; }
command -v gh  >/dev/null || { echo "❌ GitHub CLI (gh) não encontrado. Instale: https://cli.github.com  e rode 'gh auth login'."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ Você não está logado no GitHub. Rode: gh auth login"; exit 1; }

echo "→ Inicializando repositório..."
git init -q
git add .
git commit -q -m "CriaPraMim: primeira versão" || echo "  (nada novo para commitar)"

echo "→ Criando repo '$REPO_NAME' no GitHub e enviando..."
gh repo create "$REPO_NAME" --private --source=. --remote=origin --push

echo ""
echo "✅ Pronto! Repositório no ar: $(gh repo view "$REPO_NAME" --json url -q .url 2>/dev/null)"
echo ""
echo "Próximos passos na Vercel:"
echo "  1) vercel.com → Add New → Project → Import  →  escolha '$REPO_NAME'"
echo "  2) Framework: Other (sem build)"
echo "  3) Settings → Environment Variables → adicione OPENAI_API_KEY (sk-...)"
echo "  4) Deploy. A URL sai como https://$REPO_NAME.vercel.app"
