const express = require('express');
const cors = require('cors');
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const supabase = require('../config/supabase');
const fs = require('fs');
const handlebars = require('handlebars');

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

// Logo local path
const LOGO_PATH = path.join(__dirname, '../public/images/logo.png');
// Converte a imagem para base64
const LOGO_BASE64 = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;

// Configura o CORS
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

router.use(cors(corsOptions));

// NOVA ROTA: Para criar um registro de tratativa no Supabase e gerar o PDF
router.post('/create', async (req, res) => {
    try {
        // Obter informações da origem da requisição
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const origin = req.headers['origin'] || req.headers['referer'] || 'Origem desconhecida';
        
        // Recebe os dados do frontend
        const data = req.body;
        console.log('\n[Tratativa] ✅ Iniciando criação de tratativa:', data.numero_documento);
        console.log(`[Tratativa] 🌐 IP de Origem: ${ip}`);
        console.log(`[Tratativa] 🔗 Origem: ${origin}`);

        // Validação do payload
        if (!data || !data.numero_documento || !data.nome_funcionario) {
            throw new Error('Dados incompletos. É necessário fornecer pelo menos número do documento e nome do funcionário.');
        }

        // Processar data e hora
        if (data.data_infracao && data.hora_infracao) {
            // Combinar data e hora em um único timestamp
            data.data_ocorrencia = `${data.data_infracao}T${data.hora_infracao}:00`;
        }

        // Processar penalidade
        const penalidade = processarPenalidade(data.penalidade_aplicada || data.penalidade);
        data.penalidade_aplicada = `${penalidade.codigo} - ${penalidade.descricao}`;

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

            // Formatar texto_excesso se valor_praticado estiver presente
            if (data.valor_praticado) {
                data.texto_excesso = `Valor praticado: ${data.valor_praticado}${data.metrica}`;
            }

            console.log('[Tratativa] 📊 Valores processados:');
            if (data.texto_limite) console.log(`[Tratativa] ⬇️ ${data.texto_limite}`);
            if (data.texto_excesso) console.log(`[Tratativa] ⬆️ ${data.texto_excesso}`);
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
                
                console.log('[Tratativa] 📅 Data ISO:', data.data_infracao);
                console.log('[Tratativa] 📅 Data formatada:', data.data_formatada);
                console.log('[Tratativa] 🕒 Hora formatada:', data.hora_infracao);
                console.log('[Tratativa] 📝 Data por extenso:', data.data_formatada_extenso);
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
                
                console.log('[Tratativa] 📅 Data ISO:', data.data_infracao);
                console.log('[Tratativa] 📅 Data formatada:', data.data_formatada);
                console.log('[Tratativa] 📝 Data por extenso:', data.data_formatada_extenso);
            }
        }

        // 1. Criar registro no Supabase
        console.log('[1/9] Criando registro no Supabase');
        const { data: newTratativa, error: dbError } = await supabase
            .from('tratativas')
            .insert([
                {
                    numero_documento: data.numero_documento,
                    nome_funcionario: data.nome_funcionario,
                    funcao: data.funcao,
                    setor: data.setor,
                    data_formatada: data.data_formatada_extenso,
                    codigo_infracao: data.codigo_infracao,
                    infracao_cometida: data.infracao_cometida,
                    data_infracao: data.data_infracao ? new Date(data.data_infracao).toISOString() : null,
                    data_devolvida: new Date().toISOString(),
                    hora_infracao: data.hora_infracao,
                    penalidade_aplicada: data.penalidade_aplicada,
                    nome_lider: data.nome_lider,
                    texto_excesso: data.texto_excesso,
                    texto_limite: data.texto_limite,
                    status: 'pendente',
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (dbError) throw dbError;
        
        const tratativaId = newTratativa[0].id;
        console.log(`[2/9] Registro criado com ID: ${tratativaId}`);
        
        // 2. Gerar PDF da tratativa
        // Adicionar logo aos dados
        const dadosComLogo = {
            ...data,
            logo_src: LOGO_BASE64
        };

        console.log('[3/9] Iniciando navegador Puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Permitir acesso a arquivos locais
        await page.setBypassCSP(true);

        console.log('[4/9] Renderizando template com Handlebars');
        // Renderiza o template
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', dadosComLogo, (err, html) => {
                if (err) reject(err);
                else resolve(html);
            });
        });

        console.log('[5/9] Carregando e injetando CSS');
        // Lê o CSS
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const htmlWithStyles = html.replace('</head>', `
            <base href="file://${path.join(__dirname, '../public')}/">
            <style>${css}</style>
        </head>`);

        console.log('[6/9] Configurando conteúdo na página');
        // Configura o conteúdo
        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('[7/9] Gerando PDF');
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

        // Gera nome do arquivo incluindo o ID do registro
        const fileName = `tratativa_${tratativaId}_${Date.now()}.pdf`;

        console.log('[8/9] Fazendo upload do PDF para Supabase');
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

        console.log('[9/9] Atualizando registro com URL do documento');
        // Atualizar o registro com a URL do PDF
        const { error: updateError } = await supabase
            .from('tratativas')
            .update({ 
                documento_url: publicUrl,
                status: 'concluido' 
            })
            .eq('id', tratativaId);

        if (updateError) throw updateError;

        console.log('\n[Link do documento] 🔗\n' + publicUrl + '\n');

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

            // Formatar texto_excesso se valor_praticado estiver presente
            if (data.valor_praticado) {
                data.texto_excesso = `Valor praticado: ${data.valor_praticado}${data.metrica}`;
            }

            console.log('[Geração de PDF] 📊 Valores processados:');
            if (data.texto_limite) console.log(`[Geração de PDF] ⬇️ ${data.texto_limite}`);
            if (data.texto_excesso) console.log(`[Geração de PDF] ⬆️ ${data.texto_excesso}`);
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

            // Formatar texto_excesso se valor_praticado estiver presente
            if (data.valor_praticado) {
                data.texto_excesso = `Valor praticado: ${data.valor_praticado}${data.metrica}`;
            }

            console.log('[Teste de PDF] 📊 Valores processados:');
            if (data.texto_limite) console.log(`[Teste de PDF] ⬇️ ${data.texto_limite}`);
            if (data.texto_excesso) console.log(`[Teste de PDF] ⬆️ ${data.texto_excesso}`);
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
        
        res.status(200).json({ 
            success: true,
            message: 'Conexão bem-sucedida!',
            server: 'PDF Generator Server',
            timestamp: new Date().toISOString(),
            client: {
                ip: ip,
                origin: origin,
                userAgent: userAgent
            }
        });
    } catch (error) {
        console.error('Erro no teste de conexão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao testar conexão',
            error: error.message
        });
    }
});

module.exports = router;
