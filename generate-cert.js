const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Comando OpenSSL para gerar certificado autoassinado
const command = `openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.cert -days 365 -nodes -subj "/CN=localhost"`;

console.log('Gerando novo certificado SSL...');

// Remover certificados antigos se existirem
if (fs.existsSync('server.key')) fs.unlinkSync('server.key');
if (fs.existsSync('server.cert')) fs.unlinkSync('server.cert');

// Executar comando OpenSSL
exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error('Erro ao gerar certificado:', error);
        return;
    }
    console.log('Certificado gerado com sucesso!');
    console.log('Arquivos criados:');
    console.log('- server.key');
    console.log('- server.cert');
}); 