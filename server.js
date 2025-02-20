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

// Inicialização do Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware para verificar API key
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid API key'
        });
    }
    
    next();
};

// Configuração do CORS para permitir requisições de qualquer origem
const corsOptions = {
    origin: true, // Permite todas as origens
    credentials: true, // Permite credenciais
    methods: ['GET', 'POST', 'OPTIONS'], // Inclui OPTIONS para preflight requests
    allowedHeaders: ['Content-Type', 'Authorization'], // Remove x-api-key pois não estamos usando
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400 // Cache preflight por 24 horas
};

// Aplica CORS globalmente
app.use(cors(corsOptions));

// Adiciona headers específicos para cada requisição
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    
    // Handle OPTIONS method
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Configuração para aceitar dados JSON e aumentar o limite
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Adicione este middleware antes das rotas
app.use((req, res, next) => {
    console.log('Requisição recebida:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Configuração das rotas com verificação de API key
app.use('/api/aso', checkApiKey, asoRoutes);

// Rota de teste/status do servidor
app.get('/status', (req, res) => {
    res.json({ status: 'Server is running' });
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

// Verifica se estamos em ambiente de produção
if (process.env.NODE_ENV === 'production') {
    try {
        // Carregar o certificado SSL apenas em produção
        const sslOptions = {
            key: fs.readFileSync('server.key'), // Relative path to the private key
            cert: fs.readFileSync('server.cert') // Relative path to the certificate
        };

        // Inicialização do servidor HTTPS
        https.createServer(sslOptions, app).listen(port, () => {
            console.log(`Servidor HTTPS rodando na porta ${port}`);
            console.log('CORS configurado para aceitar todas as origens...');
        });
    } catch (error) {
        console.error('Erro ao iniciar servidor HTTPS:', error);
        process.exit(1);
    }
} else {
    // Em desenvolvimento, usa HTTP simples
    app.listen(port, () => {
        console.log(`Servidor HTTP rodando na porta ${port}`);
        console.log('CORS configurado para aceitar todas as origens...');
    });
}