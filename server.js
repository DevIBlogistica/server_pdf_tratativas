// Importação das dependências necessárias
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cors = require('cors');
const https = require('https'); // Import the https module
const fs = require('fs'); // Import the fs module
require('dotenv').config();

// Importação das rotas
const tratativaRoutes = require('./routes/tratativa.routes');

// Inicialização do Express
const app = express();
const port = process.env.PORT || 3000;

// Configuração do CORS para permitir requisições de todas as origens
const corsOptions = {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Type']
};

// Aplica CORS globalmente
app.use(cors(corsOptions));

// Adiciona headers de segurança
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// Configuração para aceitar dados JSON
app.use(express.json({ 
    limit: '1mb',
    type: ['application/json']
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '1mb' 
}));

// Configuração do Handlebars como template engine
app.engine('handlebars', engine({
    defaultLayout: false,
    helpers: {
        json: function(context) {
            return JSON.stringify(context);
        },
        keepNA: function(value) {
            return value;
        },
        add: function(value, addend) {
            return value + addend;
        }
    }
}));
app.set('view engine', 'handlebars');
app.set('views', './views');

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// Middleware para log de requisições - manter apenas informações essenciais
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Log middleware para debug
app.use((req, res, next) => {
    console.log('Request recebida:');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body:', req.body);
    next();
});

// Configuração das rotas
app.use('/api/tratativa', tratativaRoutes);

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Configuração do servidor HTTPS com certificado do Let's Encrypt
const httpsOptions = {
    key: fs.readFileSync('certificates/privkey.pem'),
    cert: fs.readFileSync('certificates/fullchain.pem'),
    secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
    minVersion: 'TLSv1.2',
    ciphers: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'DHE-RSA-AES128-GCM-SHA256',
        'DHE-RSA-AES256-GCM-SHA384'
    ].join(':'),
    honorCipherOrder: true
};

// Iniciar servidor HTTPS
const httpsServer = https.createServer(httpsOptions, app);

// Configurar para escutar em IPv4
httpsServer.listen(port, '0.0.0.0', () => {
    console.log(`Servidor HTTPS rodando na porta ${port}`);
    console.log('Endereço:', httpsServer.address());
}).on('error', (err) => {
    console.error('Erro ao iniciar servidor HTTPS:', err);
});

// Criar servidor HTTP apenas para redirecionamento HTTPS
const httpApp = express();

// Redirecionar todas as requisições HTTP para HTTPS
httpApp.all('*', (req, res) => {
    const httpsUrl = `https://${req.hostname}:${port}${req.url}`;
    console.log(`Redirecionando para: ${httpsUrl}`);
    res.redirect(301, httpsUrl);
});

// Iniciar servidor HTTP na porta 80
httpApp.listen(80, () => {
    console.log(`Servidor HTTP rodando na porta 80 (apenas para redirecionamento HTTPS)`);
}).on('error', (err) => {
    console.error('Erro ao iniciar servidor HTTP:', err);
});