// Importação das dependências necessárias
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
require('dotenv').config();

// Importação das rotas
const tratativaRoutes = require('./routes/tratativa.routes');

// Inicialização do Express
const app = express();
const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 3443;

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

// Middleware para log de requisições
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

// Configuração HTTPS
let httpsServer;
try {
    const privateKey = fs.readFileSync('ssl/private.key', 'utf8');
    const certificate = fs.readFileSync('ssl/certificate.crt', 'utf8');
    const credentials = { key: privateKey, cert: certificate };
    
    // Criar servidor HTTPS
    httpsServer = https.createServer(credentials, app);
    
    // Iniciar servidor HTTPS
    httpsServer.listen(httpsPort, () => {
        console.log(`Servidor HTTPS rodando em https://localhost:${httpsPort}`);
    });
} catch (error) {
    console.warn('Certificados SSL não encontrados. Apenas o servidor HTTP será iniciado.');
}

// Iniciar servidor HTTP
const httpServer = http.createServer(app);
httpServer.listen(port, () => {
    console.log(`Servidor HTTP rodando em http://localhost:${port}`);
});

// Redirecionar HTTP para HTTPS em produção
if (process.env.NODE_ENV === 'production' && httpsServer) {
    app.use((req, res, next) => {
        if (!req.secure) {
            return res.redirect(['https://', req.get('Host'), req.url].join(''));
        }
        next();
    });
}