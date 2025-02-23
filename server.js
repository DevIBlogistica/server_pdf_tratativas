// Importação das dependências necessárias
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cors = require('cors');
const https = require('https'); // Import the https module
const fs = require('fs'); // Import the fs module
require('dotenv').config();

// Importação das rotas
const asoRoutes = require('./routes/aso.routes');
const tratativaRoutes = require('./routes/tratativa.routes');

// Inicialização do Express
const app = express();
const port = process.env.PORT || 3000;

// Configuração do CORS para permitir requisições de qualquer origem
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Type']
};

// Aplica CORS globalmente
app.use(cors(corsOptions));

// Configuração para aceitar dados JSON e aumentar o limite
app.use(express.json({ 
    limit: '50mb',
    type: ['application/json', 'text/plain'] // Aceitar também text/plain
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
app.use('/api/aso', asoRoutes);
app.use('/', tratativaRoutes);

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Voltar para a versão com HTTPS
if (process.env.NODE_ENV === 'production') {
    try {
        const sslOptions = {
            key: fs.readFileSync('server.key'),
            cert: fs.readFileSync('server.cert')
        };

        https.createServer(sslOptions, app).listen(port, () => {
            console.log(`Servidor HTTPS rodando na porta ${port}`);
        });
    } catch (error) {
        console.error('Erro ao iniciar servidor HTTPS:', error);
        process.exit(1);
    }
} else {
    app.listen(port, () => {
        console.log(`Servidor HTTP rodando na porta ${port}`);
    });
}