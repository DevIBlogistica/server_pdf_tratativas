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
};

// Aplica CORS globalmente
app.use(cors(corsOptions));

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

// Middleware para log de requisições
app.use((req, res, next) => {
    console.log('Requisição recebida:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Configuração das rotas sem verificação de API key
app.use('/api/aso', asoRoutes);

// Novas rotas para tratativas
app.use('/', tratativaRoutes);

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