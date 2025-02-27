const express = require('express');
const cors = require('cors');
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const supabase = require('../config/supabase');
const fs = require('fs');
const handlebars = require('handlebars');
const { v4: uuidv4 } = require('uuid');

// Função para remover acentos e caracteres especiais
function normalizarTexto(texto) {
    const caracteresEspeciais = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ý': 'y', 'ÿ': 'y',
        'ñ': 'n',
        'ç': 'c',
        'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
        'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
        'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
        'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
        'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
        'Ý': 'Y',
        'Ñ': 'N',
        'Ç': 'C'
    };

    return texto
        .split('')
        .map(char => caracteresEspeciais[char] || char)
        .join('')
        .replace(/[^a-zA-Z0-9\s_-]/g, '')
        .trim();
}

// Logo local path
const LOGO_PATH = path.join(__dirname, '../public/images/logo.png');
// Converte a imagem para base64
const LOGO_BASE64 = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;

// Diretório temporário para PDFs
const tempPdfDir = path.join(__dirname, '../temp/pdfs');
if (!fs.existsSync(tempPdfDir)) {
    fs.mkdirSync(tempPdfDir, { recursive: true });
}

// Function to generate PDF buffer
const generatePDF = async (page) => {
    try {
        // Generate PDF buffer directly
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0',
                right: '0',
                bottom: '0',
                left: '0'
            },
            preferCSSPageSize: true,
            scale: 1.0,
            displayHeaderFooter: false,
            landscape: false
        });
        
        console.log(`[PDF] Generated PDF buffer`);
        return pdfBuffer;
    } catch (error) {
        console.error('[PDF] Error generating PDF:', error);
        throw error;
    }
};

// Função para limpar arquivos temporários de PDF
const cleanupTempDirs = () => {
    try {
        if (fs.existsSync(tempPdfDir)) {
            const files = fs.readdirSync(tempPdfDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempPdfDir, file));
            }
        }
    } catch (error) {
        console.error('[Cleanup] Erro ao limpar diretório temporário de PDFs:', error);
    }
};

// Limpa os diretórios temporários a cada 24 horas
setInterval(cleanupTempDirs, 24 * 60 * 60 * 1000);

// Função para processar o campo de penalidade
function processarPenalidade(codigo) {
    if (!codigo) return { codigo: '', descricao: '' };
    
    // Mapeamento de códigos para descrições
    const descricoes = {
        'P1': 'Advertência Verbal',
        'P2': 'Advertência Escrita',
        'P3': 'Suspensão',
        'P4': 'Demissão'
    };
    
    // Se o código já vier no formato "P2 - Descrição"
    const match = codigo.match(/^(P\d+)\s*-\s*(.+)$/);
    if (match) {
        return {
            codigo: match[1],
            descricao: match[2]
        };
    }
    
    // Se for apenas o código, busca a descrição no mapeamento
    if (descricoes[codigo]) {
        return {
            codigo: codigo,
            descricao: descricoes[codigo]
        };
    }
    
    // Caso não encontre, retorna o código como está
    return {
        codigo: codigo,
        descricao: codigo
    };
}

// Configura o CORS
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Length', 'Content-Type']
};

// Aplica CORS para todas as rotas
router.use(cors(corsOptions));

// Middleware para validar Content-Type
router.use((req, res, next) => {
    if (req.method === 'POST') {
        const contentType = req.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            return res.status(415).json({
                success: false,
                message: 'Content-Type deve ser application/json',
                received: contentType
            });
        }
    }
    next();
});

// Middleware para log de requisições da API
router.use((req, res, next) => {
    console.log(`\n📡 [Requisição] ${req.method} ${req.path}`);
    console.log(`🌐 [IP] ${req.ip}`);
    console.log(`🔗 [Origem] ${req.get('origin') || 'N/A'}`);
    if (req.method === 'POST' && Object.keys(req.body).length > 0) {
        console.log(`📦 [Corpo]`, JSON.stringify(req.body, null, 2));
    }
    next();
});

// ROTA: Para criar um registro de tratativa no Supabase e gerar o PDF
router.post('/create', async (req, res) => {
    let browser;
    const tempPdfPath = path.join(tempPdfDir, `${uuidv4()}.pdf`);
    
    try {
        const data = req.body;
        console.log('✅ [Início] Iniciando criação de tratativa:', data.numero_documento);
        console.log('🌐 [IP de Origem]', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
        console.log('🔗 [Origem]', req.headers['origin'] || req.headers['referer'] || 'Origem desconhecida');
        console.log('📄 [Dados Recebidos]', data);

        // Validação dos dados recebidos - apenas campos obrigatórios
        if (!data.numero_documento || !data.data_infracao || !data.hora_infracao || 
            !data.codigo_infracao || !data.infracao_cometida || !data.penalidade_aplicada || 
            !data.nome_lider || !data.evidence1_url) {
            throw new Error('Dados incompletos. É necessário fornecer: número do documento, data, hora, código da infração, descrição da infração, penalidade, líder e evidência principal.');
        }

        // Processar data se estiver no formato dd/mm/aaaa
        if (data.data_infracao && data.data_infracao.includes('/')) {
            const [dia, mes, ano] = data.data_infracao.split('/');
            
            if (dia && mes && ano) {
                data.data_infracao = `${ano}-${mes}-${dia}`;
                data.data_formatada = `${dia}/${mes}/${ano}`;
                
                // Criar data por extenso
                const mesesPorExtenso = [
                    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
                ];
                data.data_formatada_extenso = `${dia} de ${mesesPorExtenso[parseInt(mes) - 1]} de ${ano}`;
            }
        }

        // 1. Criar registro no Supabase
        console.log('📝 [1/5] Criando registro no Supabase');
        const { imagem, ...dadosParaSalvar } = data;
        const { data: newTratativa, error: dbError } = await supabase
            .from('tratativas')
            .insert([{
                numero_documento: data.numero_documento,
                nome_funcionario: data.nome_funcionario,
                data_infracao: data.data_infracao,
                hora_infracao: data.hora_infracao,
                codigo_infracao: data.codigo_infracao,
                infracao_cometida: data.infracao_cometida,
                penalidade_aplicada: data.penalidade_aplicada,
                nome_lider: data.nome_lider,
                status: 'ENVIADA',
                texto_infracao: data.texto_infracao,
                texto_limite: data.texto_limite,
                funcao: data.funcao,
                setor: data.setor,
                metrica: data.metrica,
                valor_praticado: data.valor_praticado,
                valor_limite: data.valor_limite,
                evidence1_url: data.evidence1_url,
                evidence2_url: data.evidence2_url || null,
                evidence3_url: data.evidence3_url || null,
                mock: data.mock || false
            }])
            .select()
            .single();

        if (dbError) throw dbError;
        
        const tratativaId = newTratativa.id;
        console.log(`📝 [2/5] Registro criado com ID: ${tratativaId}`);
        
        // 2. Gerar PDF da tratativa
        // Adicionar logo aos dados
        const dadosComLogo = {
            ...data,
            logo_src: LOGO_BASE64
        };

        console.log('🖥️ [3/5] Iniciando navegador Puppeteer');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais e URLs externas
        await page.setBypassCSP(true);

        console.log('🖨️ [4/5] Renderizando template e gerando PDF');
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', dadosComLogo, (err, html) => {
                if (err) reject(err);
                else resolve(html);
            });
        });

        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const htmlWithStyles = html.replace('</head>', `
            <base href="file://${path.join(__dirname, '../public')}/">
            <style>${css}</style>
        </head>`);

        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Generate PDF buffer
        const pdfBuffer = await generatePDF(page);
        await browser.close();

        // Gera nome do arquivo incluindo o ID do registro
        const dataFormatada = new Date().toLocaleDateString('pt-BR').split('/').join('-');
        const nomeFormatado = normalizarTexto(data.nome_funcionario).replace(/\s+/g, '_').toUpperCase();
        const setorFormatado = normalizarTexto(data.setor).replace(/\s+/g, '_').toUpperCase();
        const fileName = `enviadas/${data.numero_documento}-${nomeFormatado}-${setorFormatado}-${dataFormatada}.pdf`;

        console.log('📤 [5/5] Fazendo upload do PDF para Supabase');
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

        console.log('🔗 [Link do Documento]\n' + publicUrl + '\n');

        res.json({
            success: true,
            message: 'Tratativa criada e documento gerado com sucesso',
            tratativa_id: tratativaId,
            url: publicUrl
        });

    } catch (error) {
        console.error('🚨 [Erro] Erro ao criar tratativa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar tratativa e gerar documento',
            error: error.message
        });
    }
});

// NOVA ROTA: Listar todas as tratativas
router.get('/list', async (req, res) => {
    try {
        console.log('[Tratativa] Listando todas as tratativas');
        
        const { data, error } = await supabase
            .from('tratativas')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            message: 'Tratativas listadas com sucesso',
            tratativas: data
        });
    } catch (error) {
        console.error('Erro ao listar tratativas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar tratativas',
            error: error.message
        });
    }
});

// NOVA ROTA: Obter detalhes de uma tratativa específica
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Tratativa] Buscando tratativa com ID: ${id}`);
        
        const { data, error } = await supabase
            .from('tratativas')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        
        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Tratativa não encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Tratativa encontrada',
            tratativa: data
        });
    } catch (error) {
        console.error(`Erro ao buscar tratativa: ${error}`);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar tratativa',
            error: error.message
        });
    }
});

// Rota para gerar PDF da tratativa
router.post('/generate', async (req, res) => {
    try {
        // Obter informações da origem da requisição
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const origin = req.headers['origin'] || req.headers['referer'] || 'Origem desconhecida';
        
        const data = req.body;
        console.log('\n[Geração de PDF] ✅ Solicitação recebida');
        console.log(`[Geração de PDF] 🌐 IP de Origem: ${ip}`);
        console.log(`[Geração de PDF] 🔗 Origem: ${origin}`);
        console.log('[Geração de PDF] 📄 Documento:', data.numero_documento);

        // Processar data e hora
        if (data.data_infracao && data.hora_infracao) {
            // Combinar data e hora em um único timestamp
            data.data_ocorrencia = `${data.data_infracao}T${data.hora_infracao}:00`;
        }

        // Processar penalidade
        const penalidade = processarPenalidade(data.penalidade_aplicada || data.penalidade);
        data.penalidade_aplicada = `${penalidade.codigo} - ${penalidade.descricao}`;
        // Split penalidade for template display
        data.penalidade = penalidade.codigo;
        data.penalidade_descricao = penalidade.descricao;

        // Processar valores de limite e excesso
        if (data.valor_limite || data.valor_praticado) {
            // Garantir que a métrica esteja presente se houver valores
            if (!data.metrica) {
                data.metrica = 'unidade';
                console.warn('[Alerta] Métrica não fornecida, usando "unidade" como padrão');
            }

            // Formatar texto_limite se valor_limite estiver presente
            if (data.valor_limite) {
                data.texto_limite = `Limite estabelecido: ${data.valor_limite}${data.metrica}`;
            }

            // Gerar texto_infracao baseado nos valores
            if (data.valor_limite && data.valor_praticado) {
                // Se não houver texto_infracao do frontend, criar um texto padrão
                if (!data.texto_infracao) {
                    data.texto_infracao = `Excedeu o limite estabelecido`;
                }
                
                // Adicionar os valores ao texto_infracao
                data.texto_infracao = `${data.texto_infracao}. Valor praticado de ${data.valor_praticado}${data.metrica}, excedendo o limite estabelecido de ${data.valor_limite}${data.metrica}.`;
            }

            console.log('[Geração de PDF] 📊 Valores processados:');
            if (data.texto_limite) console.log(`[Geração de PDF] ⬇️ ${data.texto_limite}`);
            if (data.texto_infracao) console.log(`[Geração de PDF] 📝 ${data.texto_infracao}`);
        }

        // Processar data da ocorrência (se fornecida)
        if (data.data_ocorrencia) {
            const dataObj = new Date(data.data_ocorrencia);
            if (!isNaN(dataObj.getTime())) {
                // Extrair data no formato DD/MM/YYYY para exibição
                const dia = String(dataObj.getDate()).padStart(2, '0');
                const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
                const ano = dataObj.getFullYear();
                data.data_formatada = `${dia}/${mes}/${ano}`;
                
                // Manter data no formato ISO para o banco
                data.data_infracao = `${ano}-${mes}-${dia}`;
                
                // Extrair hora no formato HH:MM
                const hora = String(dataObj.getHours()).padStart(2, '0');
                const minutos = String(dataObj.getMinutes()).padStart(2, '0');
                data.hora_infracao = `${hora}:${minutos}`;
                
                // Criar data por extenso
                const mesesPorExtenso = [
                    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
                ];
                data.data_formatada_extenso = `${dia} de ${mesesPorExtenso[dataObj.getMonth()]} de ${ano}`;
                
                console.log('[Geração de PDF] 📅 Data ISO:', data.data_infracao);
                console.log('[Geração de PDF] 📅 Data formatada:', data.data_formatada);
                console.log('[Geração de PDF] 🕒 Hora formatada:', data.hora_infracao);
                console.log('[Geração de PDF] 📝 Data por extenso:', data.data_formatada_extenso);
            } else {
                console.warn('[Alerta] Data de ocorrência inválida:', data.data_ocorrencia);
            }
        } else if (data.data_infracao) {
            // Se receber a data diretamente, converter para ISO
            const [dia, mes, ano] = data.data_infracao.split('/');
            if (dia && mes && ano) {
                data.data_infracao = `${ano}-${mes}-${dia}`;
                data.data_formatada = `${dia}/${mes}/${ano}`;
                
                // Criar data por extenso
                const mesesPorExtenso = [
                    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
                ];
                data.data_formatada_extenso = `${dia} de ${mesesPorExtenso[parseInt(mes) - 1]} de ${ano}`;
                
                console.log('[Geração de PDF] 📅 Data ISO:', data.data_infracao);
                console.log('[Geração de PDF] 📅 Data formatada:', data.data_formatada);
                console.log('[Geração de PDF] 📝 Data por extenso:', data.data_formatada_extenso);
            }
        }

        // Adicionar logo aos dados
        const dadosComLogo = {
            ...data,
            logo_src: LOGO_BASE64
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
            },
            preferCSSPageSize: true,
            scale: 1.0,
            displayHeaderFooter: false,
            landscape: false
        });

        await browser.close();

        // Gera nome do arquivo
        const dataFormatada = new Date().toLocaleDateString('pt-BR').split('/').join('-');
        const nomeFormatado = normalizarTexto(data.nome_funcionario).replace(/\s+/g, '_').toUpperCase();
        const setorFormatado = normalizarTexto(data.setor).replace(/\s+/g, '_').toUpperCase();
        const fileName = `enviadas/${data.numero_documento}-${nomeFormatado}-${setorFormatado}-${dataFormatada}.pdf`;

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

// Rota de teste de conexão
router.get('/test-connection', async (req, res) => {
    try {
        // Log detalhado da requisição
        console.log('\n[Test Connection] ✅ Requisição recebida');
        console.log('[Test Connection] 🌐 IP:', req.ip);
        console.log('[Test Connection] 📡 Método:', req.method);
        console.log('[Test Connection] 🔗 Path:', req.path);
        console.log('[Test Connection] 🌍 Origin:', req.get('origin') || 'N/A');
        console.log('[Test Connection] 📱 User-Agent:', req.get('user-agent'));

        // Resposta com informações detalhadas
        res.json({
            success: true,
            message: 'Conexão estabelecida com sucesso',
            serverInfo: {
                time: new Date().toISOString(),
                baseUrl: `${req.protocol}://${req.get('host')}`,
                nodeEnv: process.env.NODE_ENV || 'development',
                apiVersion: '1.0.0'
            },
            requestInfo: {
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                origin: req.get('origin') || 'N/A'
            }
        });
    } catch (error) {
        console.error('[Test Connection] ❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao testar conexão',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
        });
    }
});

// Também suportar POST para compatibilidade
router.post('/test-connection', async (req, res) => {
    try {
        // Log detalhado da requisição
        console.log('\n[Test Connection] ✅ Requisição POST recebida');
        console.log('[Test Connection] 🌐 IP:', req.ip);
        console.log('[Test Connection] 📡 Método:', req.method);
        console.log('[Test Connection] 🔗 Path:', req.path);
        console.log('[Test Connection] 🌍 Origin:', req.get('origin') || 'N/A');
        console.log('[Test Connection] 📱 User-Agent:', req.get('user-agent'));

        // Resposta com informações detalhadas
        res.json({
            success: true,
            message: 'Conexão POST estabelecida com sucesso',
            serverInfo: {
                time: new Date().toISOString(),
                baseUrl: `${req.protocol}://${req.get('host')}`,
                nodeEnv: process.env.NODE_ENV || 'development',
                apiVersion: '1.0.0'
            },
            requestInfo: {
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                origin: req.get('origin') || 'N/A'
            }
        });
    } catch (error) {
        console.error('[Test Connection] ❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao testar conexão POST',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
        });
    }
});

// Adicionar uma nova rota para gerar PDF com dados mockados
router.post('/mock-pdf', async (req, res) => {
    try {
        // Gerar dados aleatórios para o mock
        const mockData = generateRandomMockData();

        // Gerar o PDF usando os dados mockados
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais
        await page.setBypassCSP(true);

        // Renderiza o template usando tratativa-template.handlebars
        const html = await new Promise((resolve, reject) => {
            req.app.render('tratativa-template', mockData, (err, html) => {
                if (err) reject(err);
                else resolve(html);
            });
        });

        // Lê o CSS
        const cssPath = path.join(__dirname, '../public/tratativa-template-styles.css');
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
        const pdfBuffer = await generatePDF(page);

        await browser.close();

        // Garantir que o diretório temporário exista
        if (!fs.existsSync(tempPdfDir)) {
            fs.mkdirSync(tempPdfDir, { recursive: true });
        }

        // Salvar o PDF em um arquivo temporário
        const tempPdfPath = path.join(tempPdfDir, `${uuidv4()}.pdf`);
        fs.writeFileSync(tempPdfPath, pdfBuffer);

        // Gera nome do arquivo para o Supabase
        const fileName = `mockpdf/${uuidv4()}.pdf`;

        // Upload do PDF para o Supabase
        const { error: uploadError } = await supabase.storage
            .from('tratativas')
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            console.error('🚨 [Erro] Erro ao fazer upload do PDF para o Supabase:', uploadError);
            throw uploadError;
        }

        // Gera URL pública
        const { data: { publicUrl } } = supabase.storage
            .from('tratativas')
            .getPublicUrl(fileName);

        console.log('✅ [Sucesso] PDF mockado gerado e salvo no Supabase com sucesso');
        console.log('🔗 [Link] URL pública do arquivo:', publicUrl);

        // Enviar a URL pública como resposta
        res.json({
            success: true,
            message: 'PDF mockado gerado e salvo no Supabase com sucesso',
            url: publicUrl
        });

        // Limpar o arquivo temporário
        fs.unlinkSync(tempPdfPath);
    } catch (error) {
        console.error('🚨 [Erro] Erro ao gerar PDF mockado:', error.message);
        res.status(500).json({ error: 'Erro ao gerar PDF mockado' });
    }
});

// Função para gerar dados aleatórios para o mock
function generateRandomMockData() {
    const randomNames = ['João Silva', 'Maria Oliveira', 'Pedro Santos', 'Ana Souza'];
    const randomFunctions = ['Desenvolvedor', 'Analista', 'Gerente', 'Engenheiro'];
    const randomSectors = ['TI', 'RH', 'Financeiro', 'Produção'];
    const randomInfractions = ['Atraso no horário de trabalho', 'Uso inadequado de equipamentos', 'Descumprimento de normas de segurança'];

    return {
        nome_colaborador: randomNames[Math.floor(Math.random() * randomNames.length)],
        matricula: Math.floor(Math.random() * 100000).toString().padStart(5, '0'),
        cargo: randomFunctions[Math.floor(Math.random() * randomFunctions.length)],
        setor: randomSectors[Math.floor(Math.random() * randomSectors.length)],
        data_ocorrencia: new Date().toISOString().split('T')[0],
        horario_ocorrencia: `${Math.floor(Math.random() * 24).toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
        descricao_ocorrencia: randomInfractions[Math.floor(Math.random() * randomInfractions.length)],
        justificativa: 'Problemas com o transporte público',
        data_atual: new Date().toLocaleDateString('pt-BR'),
        nome_gestor: 'Maria Gestora',
        cargo_gestor: 'Gerente de TI'
    };
}

// Rota de documentação da API
router.get('/docs', (req, res) => {
    res.json({
        api_version: '1.0.0',
        description: 'API de Tratativas - Documentação',
        base_url: `${req.protocol}://${req.get('host')}/api/tratativa`,
        endpoints: {
            test_connection: {
                path: '/test-connection',
                methods: ['GET', 'POST'],
                description: 'Testa a conexão com o servidor',
                response: {
                    success: true,
                    message: 'String',
                    serverInfo: 'Object',
                    requestInfo: 'Object'
                }
            },
            create: {
                path: '/create',
                method: 'POST',
                description: 'Cria uma nova tratativa e gera o PDF',
                required_fields: [
                    'numero_documento',
                    'data_infracao',
                    'hora_infracao',
                    'codigo_infracao',
                    'infracao_cometida',
                    'penalidade_aplicada',
                    'nome_lider',
                    'evidence1_url'
                ],
                optional_fields: [
                    'evidence2_url',
                    'evidence3_url',
                    'funcao',
                    'setor',
                    'metrica',
                    'valor_praticado',
                    'valor_limite',
                    'texto_infracao',
                    'texto_limite'
                ],
                response: {
                    success: true,
                    message: 'String',
                    tratativa_id: 'Number',
                    url: 'String'
                }
            },
            generate: {
                path: '/generate',
                method: 'POST',
                description: 'Gera um PDF de tratativa sem salvar no banco',
                required_fields: [
                    'numero_documento',
                    'data_infracao',
                    'hora_infracao',
                    'codigo_infracao',
                    'infracao_cometida',
                    'penalidade_aplicada',
                    'nome_lider',
                    'evidence1_url'
                ],
                optional_fields: [
                    'evidence2_url',
                    'evidence3_url',
                    'funcao',
                    'setor',
                    'metrica',
                    'valor_praticado',
                    'valor_limite',
                    'texto_infracao',
                    'texto_limite'
                ],
                response: {
                    success: true,
                    message: 'String',
                    url: 'String'
                }
            },
            list: {
                path: '/list',
                method: 'GET',
                description: 'Lista todas as tratativas',
                response: {
                    success: true,
                    message: 'String',
                    tratativas: 'Array'
                }
            },
            get_by_id: {
                path: '/:id',
                method: 'GET',
                description: 'Obtém detalhes de uma tratativa específica',
                params: {
                    id: 'Number - ID da tratativa'
                },
                response: {
                    success: true,
                    message: 'String',
                    tratativa: 'Object'
                }
            },
            mock_pdf: {
                path: '/mock-pdf',
                method: 'POST',
                description: 'Gera um PDF de exemplo para testes',
                response: {
                    success: true,
                    message: 'String',
                    url: 'String'
                }
            }
        }
    });
});

module.exports = router;