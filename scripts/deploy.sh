#!/bin/bash

echo "Iniciando deploy do servidor PDF Tratativas..."

# Função para verificar e gerar certificados
check_and_generate_certificates() {
    echo "Verificando certificados SSL..."
    if [ ! -f "certificates/cert.pem" ] || [ ! -f "certificates/key.pem" ]; then
        echo "Certificados não encontrados. Gerando novos certificados..."
        
        # Criar diretório para certificados
        mkdir -p certificates

        # Gerar chave privada
        openssl genpkey -algorithm RSA -out certificates/key.pem

        # Gerar certificado autoassinado
        openssl req -new -x509 -key certificates/key.pem -out certificates/cert.pem -days 365 -subj "/CN=localhost"

        echo "Certificados gerados com sucesso!"
    else
        echo "Certificados SSL encontrados, continuando com o deploy..."
    fi
}

# Para o servidor atual (se estiver rodando)
echo "Parando servidor atual..."
pm2 stop server_tratativas || true

# Atualiza o código
echo "Atualizando código..."
git pull

# Limpa o console
clear

# Instala dependências (caso necessário)
echo "Instalando dependências..."
npm install

# Verifica e gera certificados se necessário
check_and_generate_certificates

# Inicia o servidor com PM2
echo "Iniciando servidor..."
pm2 start server.js --name "server_tratativas"

# Salva a configuração do PM2
echo "Salvando configuração do PM2..."
pm2 save

# Mostra os logs
echo "Logs do servidor:"
pm2 logs server_tratativas 