#!/bin/bash

set -x  # Ativa debug mode para mostrar todos os comandos

echo "🛑 Parando servidor..."
pm2 stop server || true  # || true permite continuar mesmo se o servidor já estiver parado

echo "🗑️ Removendo certificados antigos..."
rm -f server.key server.cert

echo "⬇️ Atualizando código..."
git pull

echo "📦 Instalando dependências..."
npm install

echo "🔒 Gerando novos certificados..."
npm run cert

echo "🧹 Limpando console..."
clear

echo "🚀 Iniciando servidor..."
pm2 delete server || true  # Remove processo antigo se existir
pm2 start server.js --name server  # Especifica o arquivo .js

echo "📋 Status do servidor:"
pm2 status

echo "📝 Logs do servidor:"
pm2 logs server --lines 20

set +x  # Desativa debug mode 