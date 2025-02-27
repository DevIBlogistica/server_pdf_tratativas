const express = require('express');
const cors = require('cors');
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const pdf = require('html-pdf');
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
    allowedHeaders: ['Content-Type', 'Authorization']
};

router.use(cors(corsOptions));

// ROTA: Para criar um registro de tratativa no Supabase e gerar o PDF
router.post('/create', async (req, res) => {
    let browser;
    const tempPdfPath = path.join(tempPdfDir, `${uuidv4()}.pdf`);
    
    try {
        const data = req.body;
        console.log('[Tratativa] ✅ Iniciando criação de tratativa:', data.numero_documento);
        console.log('[Tratativa] 🌐 IP de Origem:', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
        console.log('[Tratativa] 🔗 Origem:', req.headers['origin'] || req.headers['referer'] || 'Origem desconhecida');
        console.log('[Tratativa] Dados recebidos:', data);

        // Validação dos dados recebidos - apenas campos obrigatórios
        if (!data.numero_documento || !data.data_infracao || !data.hora_infracao || 
            !data.codigo_infracao || !data.infracao_cometida || !data.penalidade_aplicada || !data.nome_lider) {
            throw new Error('Dados incompletos. É necessário fornecer: número do documento, data, hora, código da infração, descrição da infração, penalidade e líder.');
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
        console.log('[1/5] Criando registro no Supabase');
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
                mock: data.mock || false
            }])
            .select()
            .single();

        if (dbError) throw dbError;
        
        const tratativaId = newTratativa.id;
        console.log(`[2/5] Registro criado com ID: ${tratativaId}`);
        
        // 2. Gerar PDF da tratativa
        // Adicionar logo aos dados
        const dadosComLogo = {
            ...data,
            logo_src: LOGO_BASE64
        };

        console.log('[3/5] Iniciando navegador Puppeteer');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais e URLs externas
        await page.setBypassCSP(true);

        console.log('[4/5] Renderizando template e gerando PDF');
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

        console.log('[5/5] Fazendo upload do PDF para Supabase');
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

        console.log('\n[Upload do PDF] ✅ Upload concluído com sucesso');
        console.log(`[Upload do PDF] 📂 Arquivo: ${fileName}`);
        console.log(`[Upload do PDF] 🔗 URL pública gerada: ${publicUrl}\n`);

        // Atualizar o registro com a URL do PDF
        console.log('[Atualização] 🔄 Tentando atualizar registro com URL do documento');
        console.log(`[Atualização] 📝 ID do registro: ${tratativaId}`);
        console.log(`[Atualização] 🔗 URL a ser salva: ${publicUrl}`);
        
        const { error: updateError } = await supabase
            .from('tratativas')
            .update({ documento_url: publicUrl })
            .eq('id', tratativaId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            message: 'Tratativa criada e documento gerado com sucesso',
            tratativa_id: tratativaId,
            url: publicUrl
        });

    } catch (error) {
        console.error('Erro ao criar tratativa:', error);
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

// Rota de teste com dados mockados
router.post('/test', async (req, res) => {
    try {
        // Obter informações da origem da requisição
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const origin = req.headers['origin'] || req.headers['referer'] || 'Origem desconhecida';
        const userAgent = req.headers['user-agent'] || 'User-Agent desconhecido';
        
        console.log('\n[Teste de PDF] ✅ Iniciando geração de documento de teste');
        console.log(`[Teste de PDF] 🌐 IP de Origem: ${ip}`);
        console.log(`[Teste de PDF] 🔗 Origem: ${origin}`);
        console.log(`[Teste de PDF] 📱 User-Agent: ${userAgent}`);
        console.log('[Teste de PDF] 📄 Content-Type:', req.headers['content-type']);
        
        // Validação mais detalhada do body
        if (!req.body || Object.keys(req.body).length === 0) {
            throw new Error('Body vazio. Certifique-se de enviar os dados no formato JSON correto e com Content-Type: application/json');
        }

        // Processar data da ocorrência (se fornecida)
        const data = req.body;

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

            console.log('[Teste de PDF] 📊 Valores processados:');
            if (data.texto_limite) console.log(`[Teste de PDF] ⬇️ ${data.texto_limite}`);
            if (data.texto_infracao) console.log(`[Teste de PDF] 📝 ${data.texto_infracao}`);
        }

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
                
                console.log('[Teste de PDF] 📅 Data formatada:', data.data_formatada);
                console.log('[Teste de PDF] 🕒 Hora formatada:', data.hora_infracao);
                console.log('[Teste de PDF] 📝 Data por extenso:', data.data_formatada_extenso);
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
                
                console.log('[Teste de PDF] 📅 Data formatada:', data.data_formatada);
                console.log('[Teste de PDF] 📝 Data por extenso:', data.data_formatada_extenso);
            }
        }

        const dadosTeste = {
            ...data,
            logo_src: LOGO_BASE64
        };

        console.log('[Teste de PDF] 📋 Dados preparados');

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
            },
            preferCSSPageSize: true,
            scale: 1.0,
            displayHeaderFooter: false,
            landscape: false
        });

        await browser.close();
        console.log('[7/8] Navegador fechado');

        const dataFormatada = new Date().toLocaleDateString('pt-BR').split('/').join('-');
        const nomeFormatado = normalizarTexto(data.nome_funcionario).replace(/\s+/g, '_').toUpperCase();
        const setorFormatado = normalizarTexto(data.setor).replace(/\s+/g, '_').toUpperCase();
        const fileName = `mocks/${data.numero_documento}-${nomeFormatado}-${setorFormatado}-${dataFormatada}.pdf`;
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

// Rota de teste de conexão
router.post('/test-connection', (req, res) => {
    try {
        // Obter informações da origem da requisição
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const origin = req.headers['origin'] || req.headers['referer'] || 'Origem desconhecida';
        const userAgent = req.headers['user-agent'] || 'User-Agent desconhecido';
        
        console.log('\n[Teste de Conexão] ✅ Requisição recebida');
        console.log(`[Teste de Conexão] 🌐 IP de Origem: ${ip}`);
        console.log(`[Teste de Conexão] 🔗 Origem: ${origin}`);
        console.log(`[Teste de Conexão] 📱 User-Agent: ${userAgent}`);

        res.json({
            success: true,
            message: 'Conexão estabelecida com sucesso',
            ip,
            origin,
            userAgent
        });
    } catch (error) {
        console.error('[Erro] Falha no teste de conexão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao testar conexão',
            error: error.message
        });
    }
});

// New route using Puppeteer with preview HTML
router.post('/mock-pdf', async (req, res) => {
    try {
        console.log('\n[Mock PDF] ✅ Iniciando geração de documento de teste com Puppeteer');
        
        // Dados mockados para teste
        const mockData = {
            numero_documento: '2024001',
            nome_funcionario: 'JOÃO DA SILVA',
            funcao: 'OPERADOR DE PRODUÇÃO',
            setor: 'PRODUÇÃO',
            data_infracao: '23/02/2024',
            hora_infracao: '09:40',
            codigo_infracao: 'A001',
            infracao_cometida: 'EXCESSO DE VELOCIDADE NA EMPILHADEIRA',
            penalidade_aplicada: 'ADV',
            nome_lider: 'MARIA OLIVEIRA',
            url_imagem_temporaria: 'https://kjlwqezxzqjfhacmjhbh.supabase.co/storage/v1/object/public/tratativas/temp/f87643c3-cbc0-4135-8322-13b317a98120-Captura%20de%20tela%202025-02-23%20094045.png',
            valor_praticado: '15',
            valor_limite: '10',
            metrica: 'km/h',
            mock: true
        };

        // Processar data e hora
        if (mockData.data_infracao && mockData.hora_infracao) {
            mockData.data_ocorrencia = `${mockData.data_infracao}T${mockData.hora_infracao}:00`;
        }

        // Processar penalidade
        const penalidade = processarPenalidade(mockData.penalidade_aplicada);
        mockData.penalidade = penalidade.codigo;
        mockData.penalidade_descricao = penalidade.descricao;

        // Processar data por extenso
        const [dia, mes, ano] = mockData.data_infracao.split('/');
        if (dia && mes && ano) {
            mockData.data_infracao = `${dia}/${mes}/${ano}`;
            mockData.data_formatada = `${dia}/${mes}/${ano}`;
            
            const mesesPorExtenso = [
                'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
            ];
            mockData.data_formatada_extenso = `${dia} de ${mesesPorExtenso[parseInt(mes) - 1]} de ${ano}`;
        }

        // Adicionar logo aos dados
        const dadosTeste = {
            ...mockData,
            logo_src: LOGO_BASE64
        };

        console.log('[Mock PDF] 📋 Dados preparados');

        // Ler o template HTML e CSS
        const htmlPath = path.join(__dirname, '../public/tratativa-preview.html');
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        
        let html = fs.readFileSync(htmlPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');

        // Substituir placeholders no template
        Object.keys(dadosTeste).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(regex, dadosTeste[key] || '');
        });

        // Adicionar CSS inline
        html = html.replace('</head>', `
            <style>
                ${css}
                @page {
                    margin: 0;
                    size: A4;
                }
                body {
                    margin: 0;
                    padding: 25px;
                    width: 210mm;
                    height: 297mm;
                    box-sizing: border-box;
                }
                .container {
                    max-width: 100%;
                    margin: 0 auto;
                }
            </style>
        </head>`);

        // Iniciar Puppeteer
        console.log('[Mock PDF] 🚀 Iniciando navegador Puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Configurar viewport para A4 com DPI correto
        await page.setViewport({
            width: 794,  // A4 width at 96 DPI
            height: 1123,  // A4 height at 96 DPI
            deviceScaleFactor: 1
        });

        // Permitir acesso a arquivos locais e URLs externas
        await page.setBypassCSP(true);

        // Carregar o conteúdo HTML
        console.log('[Mock PDF] 📄 Carregando conteúdo');
        await page.setContent(html, {
            waitUntil: ['load', 'networkidle0'],
            timeout: 30000
        });

        // Gerar PDF
        console.log('[Mock PDF] 📑 Gerando PDF');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '25px',
                right: '25px',
                bottom: '25px',
                left: '25px'
            },
            scale: 1,
            preferCSSPageSize: true
        });

        await browser.close();
        console.log('[Mock PDF] 🔒 Navegador fechado');

        // Preparar nome do arquivo
        const dataFormatada = new Date().toLocaleDateString('pt-BR').split('/').join('-');
        const nomeFormatado = normalizarTexto(mockData.nome_funcionario).replace(/\s+/g, '_').toUpperCase();
        const setorFormatado = normalizarTexto(mockData.setor).replace(/\s+/g, '_').toUpperCase();
        const fileName = `mockpdf/${mockData.numero_documento}-${nomeFormatado}-${setorFormatado}-${dataFormatada}.pdf`;
        
        console.log('[Mock PDF] 📤 Iniciando upload para Supabase:', fileName);
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

        const { data: { publicUrl } } = supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .getPublicUrl(fileName);

        console.log('\n[Mock PDF] ✅ Processo concluído com sucesso');
        console.log(`[Mock PDF] 📂 Arquivo: ${fileName}`);
        console.log(`[Mock PDF] 🔗 URL pública gerada: ${publicUrl}\n`);

        res.json({
            success: true,
            message: 'Documento de teste gerado com sucesso usando Puppeteer',
            url: publicUrl
        });

    } catch (error) {
        console.error('[Mock PDF] ❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar documento de teste',
            error: error.message
        });
    }
});

// Keep only this implementation of the mock-test route
router.post('/mock-test', async (req, res) => {
    try {
        console.log('\n[Mock Test] ✅ Iniciando geração de documento de teste');
        
        // Dados mockados para teste
        const mockData = {
            numero_documento: '2024001',
            nome_funcionario: 'JOÃO DA SILVA',
            funcao: 'OPERADOR DE PRODUÇÃO',
            setor: 'PRODUÇÃO',
            data_infracao: '23/02/2024',
            hora_infracao: '09:40',
            codigo_infracao: 'A001',
            infracao_cometida: 'EXCESSO DE VELOCIDADE NA EMPILHADEIRA',
            penalidade_aplicada: 'ADV',
            nome_lider: 'MARIA OLIVEIRA',
            url_imagem_temporaria: 'https://kjlwqezxzqjfhacmjhbh.supabase.co/storage/v1/object/public/tratativas/temp/f87643c3-cbc0-4135-8322-13b317a98120-Captura%20de%20tela%202025-02-23%20094045.png',
            valor_praticado: '15',
            valor_limite: '10',
            metrica: 'km/h',
            mock: true
        };

        // Processar data e hora
        if (mockData.data_infracao && mockData.hora_infracao) {
            // Combinar data e hora em um único timestamp
            mockData.data_ocorrencia = `${mockData.data_infracao}T${mockData.hora_infracao}:00`;
        }

        // Processar penalidade
        const penalidade = processarPenalidade(mockData.penalidade_aplicada);
        mockData.penalidade = penalidade.codigo;
        mockData.penalidade_descricao = penalidade.descricao;

        // Processar data por extenso
        const [dia, mes, ano] = mockData.data_infracao.split('/');
        if (dia && mes && ano) {
            mockData.data_infracao = `${ano}-${mes}-${dia}`;
            mockData.data_formatada = `${dia}/${mes}/${ano}`;
            
            const mesesPorExtenso = [
                'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
            ];
            mockData.data_formatada_extenso = `${dia} de ${mesesPorExtenso[parseInt(mes) - 1]} de ${ano}`;
            
            console.log('[Mock Test] 📅 Data formatada:', mockData.data_formatada);
            console.log('[Mock Test] 🕒 Hora formatada:', mockData.hora_infracao);
            console.log('[Mock Test] 📝 Data por extenso:', mockData.data_formatada_extenso);
        }

        const dadosTeste = {
            ...mockData,
            logo_src: LOGO_BASE64
        };

        console.log('[Mock Test] 📋 Dados preparados');
        console.log('[Mock Test] 🖼️ URL da imagem:', dadosTeste.url_imagem_temporaria);

        console.log('[Mock Test] 🚀 Iniciando navegador Puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais e URLs externas
        await page.setBypassCSP(true);

        console.log('[Mock Test] 📄 Renderizando template');
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', dadosTeste, (err, html) => {
                if (err) {
                    console.error('[Erro] Falha na renderização do template:', err);
                    reject(err);
                } else resolve(html);
            });
        });

        console.log('[Mock Test] 🎨 Injetando CSS');
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const htmlWithStyles = html.replace('</head>', `
            <base href="file://${path.join(__dirname, '../public')}/">
            <style>${css}</style>
        </head>`);

        console.log('[Mock Test] 🔄 Configurando conteúdo na página');
        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('[Mock Test] 📑 Gerando PDF');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0',
                right: '0',
                bottom: '0',
                left: '0'
            },
            preferCSSPageSize: true
        });

        await browser.close();
        console.log('[Mock Test] 🔒 Navegador fechado');

        const dataFormatada = new Date().toLocaleDateString('pt-BR').split('/').join('-');
        const nomeFormatado = normalizarTexto(mockData.nome_funcionario).replace(/\s+/g, '_').toUpperCase();
        const setorFormatado = normalizarTexto(mockData.setor).replace(/\s+/g, '_').toUpperCase();
        const fileName = `mocktest/${mockData.numero_documento}-${nomeFormatado}-${setorFormatado}-${dataFormatada}.pdf`;
        
        console.log('[Mock Test] 📤 Iniciando upload para Supabase:', fileName);
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

        const { data: { publicUrl } } = supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .getPublicUrl(fileName);

        console.log('\n[Mock Test] ✅ Processo concluído com sucesso');
        console.log(`[Mock Test] 📂 Arquivo: ${fileName}`);
        console.log(`[Mock Test] 🔗 URL pública gerada: ${publicUrl}\n`);

        res.json({
            success: true,
            message: 'Documento de teste gerado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('[Mock Test] ❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar documento de teste',
            error: error.message
        });
    }
});

// New route for mock template testing
router.post('/mock-template', async (req, res) => {
    try {
        console.log('\n[Mock Template] ✅ Iniciando geração de documento de teste');
        
        // Dados mockados para teste
        const mockData = {
            numero_documento: '2024001',
            nome_funcionario: 'JOÃO DA SILVA',
            funcao: 'OPERADOR DE PRODUÇÃO',
            setor: 'PRODUÇÃO',
            data_infracao: '23/02/2024',
            hora_infracao: '09:40',
            codigo_infracao: 'A001',
            infracao_cometida: 'EXCESSO DE VELOCIDADE NA EMPILHADEIRA',
            penalidade_aplicada: 'ADV',
            nome_lider: 'MARIA OLIVEIRA',
            url_imagem_temporaria: 'https://kjlwqezxzqjfhacmjhbh.supabase.co/storage/v1/object/public/tratativas/temp/f87643c3-cbc0-4135-8322-13b317a98120-Captura%20de%20tela%202025-02-23%20094045.png',
            valor_praticado: '15',
            valor_limite: '10',
            metrica: 'km/h',
            mock: true
        };

        // Processar data e hora
        if (mockData.data_infracao && mockData.hora_infracao) {
            // Combinar data e hora em um único timestamp
            mockData.data_ocorrencia = `${mockData.data_infracao}T${mockData.hora_infracao}:00`;
        }

        // Processar penalidade
        const penalidade = processarPenalidade(mockData.penalidade_aplicada);
        mockData.penalidade = penalidade.codigo;
        mockData.penalidade_descricao = penalidade.descricao;

        // Processar data por extenso
        const [dia, mes, ano] = mockData.data_infracao.split('/');
        if (dia && mes && ano) {
            mockData.data_infracao = `${ano}-${mes}-${dia}`;
            mockData.data_formatada = `${dia}/${mes}/${ano}`;
            
            const mesesPorExtenso = [
                'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
            ];
            mockData.data_formatada_extenso = `${dia} de ${mesesPorExtenso[parseInt(mes) - 1]} de ${ano}`;
            
            console.log('[Mock Template] 📅 Data formatada:', mockData.data_formatada);
            console.log('[Mock Template] 📝 Data por extenso:', mockData.data_formatada_extenso);
        }

        // Adicionar logo aos dados
        const dadosTeste = {
            ...mockData,
            logo_src: LOGO_BASE64
        };

        console.log('[Mock Template] 📋 Dados preparados');
        console.log('[Mock Template] 🖼️ URL da imagem:', dadosTeste.url_imagem_temporaria);

        console.log('[Mock Template] 🚀 Iniciando navegador Puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais e URLs externas
        await page.setBypassCSP(true);

        console.log('[Mock Template] 📄 Renderizando template');
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', dadosTeste, (err, html) => {
                if (err) {
                    console.error('[Erro] Falha na renderização do template:', err);
                    reject(err);
                } else resolve(html);
            });
        });

        console.log('[Mock Template] 🎨 Injetando CSS');
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const htmlWithStyles = html.replace('</head>', `
            <base href="file://${path.join(__dirname, '../public')}/">
            <style>${css}</style>
        </head>`);

        console.log('[Mock Template] 🔄 Configurando conteúdo na página');
        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('[Mock Template] 📑 Gerando PDF');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0',
                right: '0',
                bottom: '0',
                left: '0'
            },
            preferCSSPageSize: true
        });

        await browser.close();
        console.log('[Mock Template] 🔒 Navegador fechado');

        const dataFormatada = new Date().toLocaleDateString('pt-BR').split('/').join('-');
        const nomeFormatado = normalizarTexto(mockData.nome_funcionario).replace(/\s+/g, '_').toUpperCase();
        const setorFormatado = normalizarTexto(mockData.setor).replace(/\s+/g, '_').toUpperCase();
        const fileName = `mocktemplate/${mockData.numero_documento}-${nomeFormatado}-${setorFormatado}-${dataFormatada}.pdf`;
        
        console.log('[Mock Template] 📤 Iniciando upload para Supabase:', fileName);
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

        const { data: { publicUrl } } = supabase.storage
            .from(process.env.SUPABASE_TRATATIVAS_BUCKET_NAME)
            .getPublicUrl(fileName);

        console.log('\n[Mock Template] ✅ Processo concluído com sucesso');
        console.log(`[Mock Template] 📂 Arquivo: ${fileName}`);
        console.log(`[Mock Template] 🔗 URL pública gerada: ${publicUrl}\n`);

        res.json({
            success: true,
            message: 'Documento de teste gerado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('[Mock Template] ❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar documento de teste',
            error: error.message
        });
    }
});

module.exports = router;