#!/bin/bash

echo "Iniciando deploy do servidor PDF Tratativas..."

# Para o servidor atual (se estiver rodando)
pm2 stop server_tratativas || true

# Atualiza o código
echo "Atualizando código..."
git pull

# Limpa o console
clear

# Instala dependências (caso necessário)
echo "Instalando dependências..."
npm install

# Inicia o servidor com PM2
echo "Iniciando servidor..."
pm2 start server.js --name "server_tratativas"

# Salva a configuração do PM2
echo "Salvando configuração do PM2..."
pm2 save

# Mostra os logs
echo "Logs do servidor:"
pm2 logs server_tratativas 