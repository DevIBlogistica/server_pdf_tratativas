const express = require('express');
const cors = require('cors');
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const supabase = require('../config/supabase');
const fs = require('fs');

// Logo em base64
const LOGO_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAAC0AAAAjCAYAAAAULK0sAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF0WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4yLWMwMDAgNzkuMWI2NWE3OWI0LCAyMDIyLzA2LzEzLTIyOjAxOjAxICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjQuMCAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDI0LTAyLTI4VDE0OjE4OjE1LTAzOjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDI0LTAyLTI4VDE0OjE4OjE1LTAzOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyNC0wMi0yOFQxNDoxODoxNS0wMzowMCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo4ZjE0ZjE4Yy1kZjE4LTQ4NGUtODY5Ni1kZjE4ZjE4ZjE4ZjEiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDo4ZjE4ZjE4Zi1kZjE4LTQ4NGUtODY5Ni1kZjE4ZjE4ZjE4ZjEiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo4ZjE4ZjE4Zi1kZjE4LTQ4NGUtODY5Ni1kZjE4ZjE4ZjE4ZjEiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIj4gPHhtcE1NOkhpc3Rvcnk+IDxyZGY6U2VxPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY3JlYXRlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo4ZjE0ZjE4Zi1kZjE4LTQ4NGUtODY5Ni1kZjE4ZjE4ZjE4ZjEiIHN0RXZ0OndoZW49IjIwMjQtMDItMjhUMTQ6MTg6MTUtMDM6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyNC4wIChXaW5kb3dzKSIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz4+0HxnAAABhUlEQVRYhe2Y0U3DMBCGv1QdgBHYgBHYACagGwATwAZ0A2ACYALYADaADcIG7QbX8WFZVhInTkjVSvdLlhL77t799jk+O6qqSsQVcAvcANfAJXAOnAHHwAnQA/rAEBgBY2AKzIEF8A18Ah/AB/AO/LQNrm0QXQEPwD1wK6EtWQJvwCvwArw2NWwSPQAegUdJdJUv4Bl4AtZNDarR+8AcWLUIbpN4BQyBnb8VfeBZkZwkELwRr8AgFH0oW0wlODXxd3wAZ1p9z8Bdwo5b8a4TvgZGOkG3EsN/4FVjnwCnwIWOdQwPgWf5/0xH5FjH5Ba4l9iZGnwrQXXEYsfxCDwB3zXtxsCjKmPH8QK8/VHXBrpWxsA6oO0SWKr0rcXMo2+hyrgG1qr9oX0L4EcVMbTvGfhVyVuImWffXP4e2jdVyVuImVffXJVxaN9EJW8hZl59M1XG0L6xSt5CzLz65qqMQ/t+VfIWYubVN1NlHNq3VMlbiJlX30KVcWjfXCVvIWZefb/qxH+xBfF/AAAAAElFTkSuQmCC`;
const LOGO_SRC = `data:image/png;base64,${LOGO_BASE64}`;

// Configura o CORS
const corsOptions = {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400
};

router.use(cors(corsOptions));

// Rota para gerar PDF da tratativa
router.post('/api/tratativa/generate', async (req, res) => {
    try {
        const data = req.body;

        // Adicionar logo aos dados
        const dadosComLogo = {
            ...data,
            logo_src: LOGO_SRC
        };

        // Gera PDF usando a estrutura existente
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais
        await page.setBypassCSP(true);

        // Renderiza o template
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', dadosComLogo, (err, html) => {
                if (err) reject(err);
                else resolve(html);
            });
        });

        // Lê o CSS
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const htmlWithStyles = html.replace('</head>', `
            <base href="file://${path.join(__dirname, '../public')}/">
            <style>${css}</style>
        </head>`);

        // Configura o conteúdo
        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Gera PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '25px',
                right: '25px',
                bottom: '25px',
                left: '25px'
            }
        });

        await browser.close();

        // Gera nome do arquivo
        const fileName = `tratativa_${Date.now()}.pdf`;

        // Upload do PDF
        const { error: uploadError } = await supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .getPublicUrl(fileName);

        console.log('\n[Link do documento] 🔗\n' + publicUrl + '\n');

        res.json({
            success: true,
            message: 'Documento de tratativa gerado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('Erro ao gerar tratativa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar documento de tratativa',
            error: error.message
        });
    }
});

// Rota de teste com dados mockados
router.post('/api/tratativa/test', async (req, res) => {
    try {
        console.log('\n[Tratativa] Iniciando geração de documento de teste');
        console.log('Headers recebidos:', req.headers);
        console.log('Content-Type:', req.headers['content-type']);
        console.log('Body recebido:', req.body);
        console.log('Body é objeto vazio?', Object.keys(req.body).length === 0);
        
        // Validação mais detalhada do body
        if (!req.body || Object.keys(req.body).length === 0) {
            throw new Error('Body vazio. Certifique-se de enviar os dados no formato JSON correto e com Content-Type: application/json');
        }

        const dadosTeste = {
            ...req.body,
            logo_src: LOGO_SRC
        };

        console.log('Dados preparados:', dadosTeste);

        console.log('[2/8] Iniciando navegador Puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        console.log('[3/8] Renderizando template com Handlebars');
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', dadosTeste, (err, html) => {
                if (err) {
                    console.error('[Erro] Falha na renderização do template:', err);
                    reject(err);
                } else resolve(html);
            });
        });

        console.log('[4/8] Carregando e injetando CSS');
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const htmlWithStyles = html.replace('</head>', `
            <base href="file://${path.join(__dirname, '../public')}/">
            <style>${css}</style>
        </head>`);

        console.log('[5/8] Configurando conteúdo na página');
        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('[6/8] Gerando PDF');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '25px',
                right: '25px',
                bottom: '25px',
                left: '25px'
            }
        });

        await browser.close();
        console.log('[7/8] Navegador fechado');

        const fileName = `mocks/tratativa_teste_${Date.now()}.pdf`;
        console.log('[8/8] Iniciando upload para Supabase:', fileName);

        console.log('Tentando upload com bucket:', process.env.SUPABASE_TRATATIVAS_BUCKET_NAME);
        const { error: uploadError } = await supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            console.error('[Erro] Upload falhou:', uploadError);
            throw uploadError;
        }

        console.log('Upload concluído, gerando URL pública');
        const { data: { publicUrl } } = supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .getPublicUrl(fileName);

        console.log('Processo concluído com sucesso');
        console.log('\n[Link do documento] 🔗\n' + publicUrl + '\n');

        res.json({
            success: true,
            message: 'Documento de tratativa de teste gerado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('\n[Erro] Detalhes completos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar documento de tratativa de teste',
            error: error.message,
            details: error
        });
    }
});

module.exports = router;
