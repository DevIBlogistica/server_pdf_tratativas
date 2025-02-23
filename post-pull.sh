#!/bin/bash
echo "Gerando novos certificados..."
npm run cert

echo "Reiniciando servidor..."
pm2 restart server # ou o comando que você usa para reiniciar o servidor 