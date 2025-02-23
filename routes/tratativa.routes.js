const express = require('express');
const cors = require('cors');
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const supabase = require('../config/supabase');
const fs = require('fs');

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
            req.app.render('templateTratativa', data, (err, html) => {
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
            .from('tratativas')
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('tratativas')
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

        let logo_src;
        try {
            // Tentar diferentes caminhos possíveis
            const possiblePaths = [
                path.resolve(__dirname, '../public/images/logoib.png'),
                path.resolve(process.cwd(), 'public/images/logoib.png'),
                '/var/www/html/server_pdf/public/images/logoib.png', // caminho absoluto em produção
                path.join(process.cwd(), 'server_pdf/public/images/logoib.png')
            ];

            console.log('Diretório atual:', process.cwd());
            console.log('Diretório do arquivo:', __dirname);
            console.log('Tentando carregar logo dos seguintes caminhos:');
            possiblePaths.forEach(p => {
                console.log(`- ${p} (existe: ${fs.existsSync(p)})`);
            });

            // Tentar cada caminho até encontrar a logo
            let logoPath;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    console.log('Logo encontrada em:', p);
                    logoPath = p;
                    break;
                }
            }

            if (!logoPath) {
                throw new Error('Logo não encontrada em nenhum dos caminhos testados');
            }

            const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });
            logo_src = `data:image/png;base64,${logoBase64}`;
            console.log('Logo carregada com sucesso');
        } catch (error) {
            console.error('Erro ao carregar logo:', error);
            // URL de uma imagem placeholder como fallback
            logo_src = 'https://placehold.co/45x35/png';
            console.log('Usando imagem placeholder como fallback');
        }

        console.log('[1/8] Preparando dados de teste');
        
        // Dados para o template
        const dadosTeste = {
            nome_funcionario: req.body.nome_funcionario,
            nome_lider: req.body.nome_lider,
            funcao: req.body.funcao,
            setor: req.body.setor,
            codigo_infracao: req.body.codigo_infracao,
            infracao_cometida: req.body.infracao_cometida,
            data_infracao: req.body.data_infracao,
            hora_infracao: req.body.hora_infracao,
            penalidade: req.body.penalidade,
            penalidade_aplicada: req.body.penalidade_aplicada,
            numero_documento: req.body.numero_documento,
            data_formatada_extenso: req.body.data_formatada_extenso,
            logo_src: logo_src,
            evidencias: {
                imagem_evidencia: req.body.evidencias.imagem_evidencia,
                texto_excesso: req.body.evidencias.texto_excesso,
                texto_limite: req.body.evidencias.texto_limite
            }
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
