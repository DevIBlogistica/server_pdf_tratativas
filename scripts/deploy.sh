#!/bin/bash

echo "Iniciando deploy do servidor PDF Tratativas em ambiente local..."

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar e instalar dependências necessárias
check_dependencies() {
    echo "Verificando dependências..."
    
    # Verificar Node.js
    if ! command_exists node; then
        echo "Node.js não encontrado. Por favor, instale o Node.js"
        exit 1
    fi
    
    # Verificar npm
    if ! command_exists npm; then
        echo "npm não encontrado. Por favor, instale o npm"
        exit 1
    fi
    
    # Verificar PM2
    if ! command_exists pm2; then
        echo "PM2 não encontrado. Instalando..."
        npm install -g pm2
    fi
}

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

# Verificar arquivo .env
check_env_file() {
    if [ ! -f ".env" ]; then
        echo "Arquivo .env não encontrado. Criando arquivo .env padrão..."
        cat > .env << EOL
PORT=3000
NODE_ENV=development
HOST=localhost
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:3001
ENABLE_HTTPS=false

# Adicione suas credenciais do Supabase abaixo
SUPABASE_URL=
SUPABASE_KEY=
EOL
        echo "Arquivo .env criado. Por favor, atualize com suas credenciais."
        exit 1
    fi
}

# Criar diretório public/images se não existir
create_directories() {
    echo "Criando diretórios necessários..."
    mkdir -p public/images
    # Copiar imagem placeholder se não existir
    if [ ! -f "public/images/evidence-placeholder.png" ]; then
        cp public/images/logo.png public/images/evidence-placeholder.png || echo "Aviso: Não foi possível criar imagem placeholder"
    fi
}

# Verificar dependências
check_dependencies

# Para o servidor atual (se estiver rodando)
echo "Parando servidor atual..."
pm2 stop server_tratativas || true
pm2 delete server_tratativas || true

# Instala dependências
echo "Instalando dependências..."
npm install

# Verifica arquivo .env
check_env_file

# Criar diretórios necessários
create_directories

# Inicia o servidor com PM2
echo "Iniciando servidor..."
pm2 start server.js --name "server_tratativas" --time

# Salva a configuração do PM2
echo "Salvando configuração do PM2..."
pm2 save

# Mostra status do servidor
echo "Status do servidor:"
pm2 show server_tratativas

# Mostra os logs desde o início do servidor
echo "Logs do servidor desde o início:"
pm2 log server_tratativas --lines 20

echo "Deploy concluído! O servidor está rodando em http://localhost:3000"
echo "Para testar, acesse: http://localhost:3000/api/tratativa/test-connection"