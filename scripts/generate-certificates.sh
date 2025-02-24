#!/bin/bash

# Criar diretório para certificados
mkdir -p certificates

# Gerar chave privada
openssl genpkey -algorithm RSA -out certificates/key.pem

# Gerar certificado autoassinado
openssl req -new -x509 -key certificates/key.pem -out certificates/cert.pem -days 365 -subj "/CN=localhost"

echo "Certificados gerados com sucesso!"
echo "Importante: Adicione uma exceção de segurança no seu navegador para este certificado autoassinado" 