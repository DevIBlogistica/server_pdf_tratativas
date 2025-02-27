@echo off
echo Iniciando deploy do servidor PDF Tratativas para testes locais...

# Para o servidor atual (se estiver rodando)
echo Parando servidor atual...
call pm2 stop server_tratativas
call pm2 delete server_tratativas
call pm2 save

# Instala dependências
echo Instalando dependências...
call npm install

# Inicia o servidor com PM2
echo Iniciando servidor...
call pm2 start server.js --name "server_tratativas"

# Salva a configuração do PM2
echo Salvando configuração do PM2...
call pm2 save

# Mostra status do servidor
echo Status do servidor:
call pm2 status

echo Deploy concluído! O servidor está rodando.
echo Para testar o PDF, use a rota: /api/tratativa/mock-pdf
pause