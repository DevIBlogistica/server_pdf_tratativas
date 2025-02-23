const { execSync } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');

// Remover certificados antigos se existirem
console.log('Removendo certificados antigos...');
if (fs.existsSync('server.key')) fs.unlinkSync('server.key');
if (fs.existsSync('server.cert')) fs.unlinkSync('server.cert');

// Gerar certificado
console.log('Gerando novo certificado SSL...');
execSync('openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.cert -days 365 -nodes -subj "/CN=localhost"');

// Iniciar servidor
console.log('Iniciando servidor...');
spawn('node', ['server.js'], { stdio: 'inherit' }); 