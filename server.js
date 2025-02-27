// Importação das dependências necessárias
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
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

// Adiciona headers de segurança e CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

// Trust proxy - necessário para trabalhar atrás de um proxy reverso
app.enable('trust proxy');

// Configuração para aceitar dados JSON
app.use(express.json({ 
    limit: '50mb',
    type: ['application/json', 'text/plain']
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '50mb' 
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

// Middleware para log detalhado de requisições
app.use((req, res, next) => {
    console.log('\n[Request] ✨ Nova requisição recebida');
    console.log('[Request] 📡 Método:', req.method);
    console.log('[Request] 🔗 Path:', req.path);
    console.log('[Request] 🌐 IP:', req.ip);
    console.log('[Request] 🌍 Origin:', req.get('origin') || 'N/A');
    console.log('[Request] 📱 User-Agent:', req.get('user-agent'));
    console.log('[Request] 📄 Content-Type:', req.get('content-type'));
    if (Object.keys(req.body).length > 0) {
        console.log('[Request] 📦 Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Configuração das rotas
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Servidor de Tratativas - API',
        version: '1.0.0',
        endpoints: {
            test: '/api/tratativa/test-connection',
            create: '/api/tratativa/create',
            generate: '/api/tratativa/generate',
            list: '/api/tratativa/list',
            mockPdf: '/api/tratativa/mock-pdf',
            mockTest: '/api/tratativa/mock-test',
            mockTemplate: '/api/tratativa/mock-template'
        }
    });
});

// Configuração das rotas da API
app.use('/api/tratativa', tratativaRoutes);

// Middleware para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada',
        path: req.path,
        method: req.method,
        availableEndpoints: {
            test: '/api/tratativa/test-connection',
            create: '/api/tratativa/create',
            generate: '/api/tratativa/generate',
            list: '/api/tratativa/list',
            mockPdf: '/api/tratativa/mock-pdf',
            mockTest: '/api/tratativa/mock-test',
            mockTemplate: '/api/tratativa/mock-template'
        }
    });
});

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
const httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

// Iniciar servidor HTTPS
const server = https.createServer(httpsOptions, app).listen(port, 'localhost', () => {
    console.log(`Servidor HTTPS rodando em https://localhost:${port}`);
    console.log('Acesse:');
    console.log(`- API: https://localhost:${port}/api/tratativa/test-connection`);
    console.log(`- Documentação: https://localhost:${port}/api-docs`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Recebido sinal SIGTERM. Encerrando servidor...');
    server.close(() => {
        console.log('Servidor encerrado.');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('Erro não tratado:', error);
    process.exit(1);
});