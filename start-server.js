const { spawn } = require('child_process');

// Iniciar servidor
console.log('Iniciando servidor...');
spawn('node', ['server.js'], { stdio: 'inherit' }); 