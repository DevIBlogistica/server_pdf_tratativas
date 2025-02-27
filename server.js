// Importação das dependências necessárias
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cors = require('cors');
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
    next();
});

// Trust proxy - necessário para trabalhar atrás de um proxy reverso
app.enable('trust proxy');

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
    console.log('Protocol:', req.protocol);
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

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});