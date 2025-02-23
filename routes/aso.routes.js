const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Para fazer requisições HTTP
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const supabase = require('../config/supabase');
const fs = require('fs');
const handlebars = require('handlebars');
const { PDFDocument } = require('pdf-lib');
const fetch = require('node-fetch');

// Configura o CORS para permitir requisições de qualquer origem
const corsOptions = {
    origin: true, // Permite todas as origens
    credentials: true, // Permite credenciais
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400
};

// Use o middleware CORS nas rotas
router.use(cors(corsOptions));

// Registra o helper para manter o valor "NA" sem transformação
handlebars.registerHelper('keepNA', function(value) {
    return value;
});

// Função auxiliar para trocar caracteres acentuados e caracteres especiais
const troquePor = (str) => {
    const acentos = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', // Substituição do "ç" por "c"
        'Ç': 'C', // Substituição do "Ç" por "C"
        'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
        'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
        'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
        'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
        'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U'
    };
    
    // Substitui cada caractere acentuado por seu equivalente sem acento
    return str.split('').map(char => acentos[char] || char).join('').replace(/\//g, '_'); // Substitui '/' por '_'
};

// Função auxiliar para gerar nome único para o arquivo
const generateUniqueFileName = (natureza, nome, data) => {
    console.log('\n[Gerando nome do arquivo]');
    console.log('Dados recebidos:', { natureza, nome, data });
    
    const dataFormatada = data.split('-').reverse().join('-');
    console.log('Data formatada:', dataFormatada);
    
    // Mantendo a formatação original dos dados recebidos
    const nomeFormatado = nome.trim().toUpperCase(); 
    console.log('Nome formatado:', nomeFormatado);
    
    const naturezaFormatada = troquePor(natureza.trim()).toUpperCase(); 
    console.log('Natureza formatada:', naturezaFormatada);
    
    // Gerando o nome do arquivo na nova ordem: data, nome, natureza
    const fileName = `${dataFormatada} ${nomeFormatado} ${naturezaFormatada}.pdf`
        .replace(/\s+/g, '_') // Substitui espaços por underscores
        .replace(/[^a-zA-Z0-9_.-]/g, ''); // Remove caracteres inválidos
    console.log('Nome final do arquivo:', fileName);
    
    return fileName;
};

// Função auxiliar para fazer upload do PDF para o Supabase Storage
const uploadPDFToSupabase = async (pdfBuffer, fileName) => {
    try {
        console.log('\n[Verificando duplicidade do arquivo]');
        
        // Verifica se o arquivo já existe
        const { data: existingFiles, error: listError } = await supabase.storage
            .from('asos') // Usando o bucket correto 'asos'
            .list(fileName.includes('unificados/') ? 'unificados' : '');

        if (listError) {
            console.error('Erro ao listar arquivos:', listError);
            throw listError;
        }

        const existingFile = existingFiles?.find(file => file.name === fileName.split('/').pop());
        
        // Se o arquivo existir, deleta ele primeiro
        if (existingFile) {
            console.log('Arquivo com mesmo nome encontrado:', existingFile.name);
            
            // Obtém a URL do arquivo existente
            const { data: { publicUrl: oldUrl } } = supabase.storage
                .from('asos')
                .getPublicUrl(fileName);
                
            // Deleta o arquivo existente
            console.log('Deletando arquivo existente...');
            const { error: deleteError } = await supabase.storage
                .from('asos')
                .remove([fileName]);
                
            if (deleteError) {
                console.error('Erro ao deletar arquivo:', deleteError);
                throw deleteError;
            }
        }
        
        // Faz upload do novo arquivo
        console.log('Realizando upload do novo arquivo...');
        const { error: uploadError } = await supabase.storage
            .from('asos')
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            console.error('Erro ao fazer upload:', uploadError);
            throw uploadError;
        }
        
        // Gera a nova URL pública
        const { data: { publicUrl } } = supabase.storage
            .from('asos')
            .getPublicUrl(fileName);

        console.log('Upload concluído com sucesso');
        return publicUrl;

    } catch (error) {
        console.error('Erro no uploadPDFToSupabase:', error);
        throw error;
    }
};

// Função auxiliar para atualizar a URL do ASO na tabela
const updateASOUrlInTable = async (tableId, asoUrl) => {
    const { data, error } = await supabase
        .from('bookings')
        .update({ aso_url: asoUrl })
        .eq('id', tableId);

    if (error) throw error;
    return data;
};

// Função auxiliar para formatar data considerando timezone
const formatarData = (dataStr) => {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
};

// Função para buscar exames necessários e riscos
const fetchExamesNecessarios = async (funcao, natureza) => {
    console.log(`[Exames] Buscando para função: ${funcao}`);
    const { data: examesData, error: examesError } = await supabase
        .from('exames_necessarios')
        .select('exame, codigo, valor')
        .eq('funcao', funcao)
        .eq('natureza', natureza);

    if (examesError) throw examesError;

    const exames = examesData.map(item => `${item.codigo} - ${item.exame.toUpperCase()}`);
    const custoTotal = examesData.reduce((total, item) => total + Number(item.valor), 0);

    try {
        const { data: riscosData, error: riscosError } = await supabase
            .from('riscos')
            .select('*')
            .eq('funcao', funcao.trim().toUpperCase())
            .single();

        if (riscosError) {
            console.log(`[Riscos] Não encontrados para função: ${funcao}`);
            return {
                exames,
                custoTotal,
                risco_fisico: "NAO ENCONTRADO",
                risco_quimico: "NAO ENCONTRADO",
                risco_ergonomico: "NAO ENCONTRADO",
                risco_acidente: "NAO ENCONTRADO",
                risco_biologico: "NAO ENCONTRADO"
            };
        }

        // Se encontrou os riscos, mantém o "NA" quando for o valor original
        return {
            exames,
            custoTotal,
            risco_fisico: riscosData.fisico || "NA",
            risco_quimico: riscosData.quimico || "NA",
            risco_ergonomico: riscosData.ergonomico || "NA",
            risco_acidente: riscosData.acidente || "NA",
            risco_biologico: riscosData.biologico || "NA"
        };
    } catch (error) {
        console.log(`[Riscos] Erro ao buscar riscos: ${error.message}`);
        return {
            exames,
            custoTotal,
            risco_fisico: "NAO ENCONTRADO",
            risco_quimico: "NAO ENCONTRADO",
            risco_ergonomico: "NAO ENCONTRADO",
            risco_acidente: "NAO ENCONTRADO",
            risco_biologico: "NAO ENCONTRADO"
        };
    }
};

// Função para processar informações da clínica
const processarClinica = (clinicaStr) => {
    const [nome, telefoneCompleto] = clinicaStr.split('TELEFONE:');
    return {
        nome: nome.trim(),
        endereco: `TELEFONE:${telefoneCompleto.trim()}`
    };
};

// Rota POST para gerar PDF do ASO (unificado)
router.post('/generate-unified', async (req, res) => {
    try {
        const { bookingIds } = req.body;
        
        if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'É necessário fornecer ao menos um ID de agendamento'
            });
        }

        console.log(`[Unificado] Iniciando geração para ${bookingIds.length} bookings`);

        // Busca todos os bookings
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('*')
            .in('id', bookingIds);

        if (bookingsError) throw bookingsError;
        if (!bookings || bookings.length === 0) {
            throw new Error('Nenhum agendamento encontrado');
        }

        // Pega o primeiro booking para gerar o nome do arquivo
        const firstBooking = bookings[0];
        
        // Formata a data do agendamento (YYYY-MM-DD para DD-MM-YYYY)
        const dataFormatada = firstBooking.data_agendamento.split('-').reverse().join('-');
        
        // Extrai e formata o nome da clínica
        const clinicaNome = firstBooking.clinica
            .split('TELEFONE:')[0]  // Remove a parte do telefone
            .trim()
            .replace(/\s+/g, '-')   // Substitui espaços por hífens
            .normalize('NFD')        // Normaliza caracteres acentuados
            .replace(/[\u0300-\u036f]/g, '')  // Remove acentos
            .toUpperCase();          // Converte para maiúsculas

        // Gera o nome do arquivo unificado
        const unifiedFileName = `unificados/${dataFormatada}_${clinicaNome}_AGENDADOS.pdf`;
        console.log('[Unificado] Nome do arquivo:', unifiedFileName);

        // Separa bookings que já têm ASO dos que não têm
        const existingAsos = bookings.filter(b => b.aso_url);
        const missingAsos = bookings.filter(b => !b.aso_url);

        console.log(`[Unificado] ASOs existentes: ${existingAsos.length}, Faltantes: ${missingAsos.length}`);

        // Gera ASOs faltantes
        const generatedUrls = [];
        for (const booking of missingAsos) {
            console.log(`[Unificado] Gerando ASO para booking ID: ${booking.id}`);
            const response = await generatePDFFromBooking(booking, req);
            generatedUrls.push(response.url);
        }

        // Combina URLs de ASOs existentes e recém-gerados
        const allUrls = [...existingAsos.map(b => b.aso_url), ...generatedUrls];
        
        console.log(`[Unificado] Mesclando ${allUrls.length} PDFs`);
        const mergedPdfBuffer = await mergePDFs(allUrls);

        // Faz upload do PDF unificado
        const unifiedUrl = await uploadPDFToSupabase(mergedPdfBuffer, unifiedFileName);

        res.json({
            success: true,
            message: 'ASO unificado gerado com sucesso',
            url: unifiedUrl,
            total: bookingIds.length,
            generated: missingAsos.length,
            existing: existingAsos.length
        });

    } catch (error) {
        console.error('[Erro] Geração unificada:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar ASO unificado',
            error: error.message
        });
    }
});

// Rota GET para renderizar o template (usado internamente pelo Puppeteer)
router.get('/render-aso', (req, res) => {
    try {
        console.log('[INFO] Renderizando template ASO...');
        const templateData = JSON.parse(decodeURIComponent(req.query.data));
        
        // Garantir que os valores dos riscos sejam mantidos exatamente como estão
        const riscos = ['risco_fisico', 'risco_quimico', 'risco_ergonomico', 'risco_acidente', 'risco_biologico'];
        riscos.forEach(risco => {
            if (templateData[risco] === 'NA') {
                templateData[risco] = 'NA';
            }
        });
        
        res.render('templateASO', { ...templateData, layout: false });
    } catch (error) {
        console.error('[ERRO] Erro ao renderizar template:', error.message);
        res.status(500).send('Erro ao renderizar template');
    }
});

// Rota de teste com dados mockados
router.get('/test-generate', async (req, res) => {
    try {
        console.log('[11] Iniciando geração de PDF de teste...');
        // Dados mockados para teste
        const templateData = {
            natureza_exame: "EXAME ADMISSIONAL",
            cpf: "123.456.789-00",
            nome: "João da Silva",
            data_nascimento: "01/01/1990",
            funcao: "Desenvolvedor de Software",
            setor: "Tecnologia da Informação",
            empresa: "Empresa Teste LTDA",
            risco_fisico: "RUÍDO, CALOR, RADIAÇÃO NÃO IONIZANTE",
            risco_quimico: "POEIRA MINERAL",
            risco_ergonomico: "POSTURA INADEQUADA, MOVIMENTOS REPETITIVOS",
            risco_acidente: "QUEDA DE MESMO NÍVEL, CHOQUE ELÉTRICO",
            risco_biologico: "VÍRUS, BACTÉRIAS",
            exames: [
                "EXAME CLÍNICO",
                "AUDIOMETRIA",
                "ACUIDADE VISUAL",
                "HEMOGRAMA COMPLETO",
                "GLICEMIA EM JEJUM"
            ],
            procedimentos_medicos: [
                "ANAMNESE OCUPACIONAL",
                "EXAME FÍSICO",
                "AVALIAÇÃO OSTEOMUSCULAR"
            ],
            parecer_medico: [
                "APTO",
                "INAPTO",
                "APTO COM RESTRIÇÕES"
            ],
            parecer_altura: [
                "APTO PARA TRABALHO EM ALTURA",
                "INAPTO PARA TRABALHO EM ALTURA"
            ],
            medico_coordenador: {
                nome: "Dr. José Santos",
                crm: "CRM 12345"
            },
            medico_examinador: "Dra. Maria Oliveira - CRM 54321",
            clinica: {
                nome: "Clínica Saúde Ocupacional",
                endereco: "Rua das Clínicas, 123 - Centro"
            }
        };

        // Inicia o navegador Puppeteer
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Configura a rota temporária para renderizar o template
        const fullUrl = `${req.protocol}://${req.get('host')}`;
        await page.goto(`${fullUrl}/render-aso?data=${encodeURIComponent(JSON.stringify(templateData))}`, {
            waitUntil: 'networkidle0'
        });

        // Gera o PDF
        console.log('[12] Gerando PDF de teste...');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            }
        });

        await browser.close();
        console.log('[13] Navegador fechado.');

        // Gera nome único para o arquivo
        const fileName = generateUniqueFileName(templateData.natureza_exame, templateData.nome, new Date().toLocaleDateString('pt-BR'));
        console.log(`[14] Nome do arquivo de teste gerado: ${fileName}`);

        // Faz upload do PDF para o Supabase Storage
        console.log('[15] Fazendo upload do PDF de teste para o Supabase...');
        const publicUrl = await uploadPDFToSupabase(pdfBuffer, fileName);
        console.log('[16] Upload de teste concluído. URL pública:', publicUrl);

        // Retorna sucesso com a URL pública
        res.json({
            success: true,
            message: 'PDF de teste gerado e armazenado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('[ERRO] Erro ao gerar PDF de teste:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar PDF de teste',
            error: error.message
        });
    }
});

// Rota para visualizar estrutura de um booking
router.get('/view-booking', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .limit(1);

        if (error) throw error;

        res.json({
            success: true,
            data: data[0]
        });
    } catch (error) {
        console.error('Erro ao buscar booking:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar booking',
            error: error.message
        });
    }
});

// Rota para gerar PDF baseado em um booking específico
router.get('/generate-from-booking/:id', async (req, res) => {
    try {
        console.log(`\n[1] Iniciando geração de PDF para booking ID: ${req.params.id}`);

        // Busca o booking
        console.log('[2] Buscando dados do booking...');
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (bookingError) throw bookingError;
        if (!booking) throw new Error('Booking não encontrado');
        
        console.log('[3] Dados do booking encontrados:', {
            nome: booking.nome,
            funcao: booking.funcao,
            natureza: booking.natureza,
            data_nasc: booking.data_nasc
        });

        // Busca exames e riscos necessários
        console.log('[4] Buscando exames necessários...');
        const examesRiscos = await fetchExamesNecessarios(booking.funcao, booking.natureza);
        console.log('[5] Exames encontrados:', examesRiscos.exames);

        // Processa informações da clínica
        console.log('[6] Processando informações da clínica...');
        const clinicaInfo = processarClinica(booking.clinica);
        console.log('[7] Informações da clínica processadas:', clinicaInfo);

        // Formata a data atual
        const dataAtual = new Date().toLocaleDateString('pt-BR');

        // Monta os dados para o template
        console.log('[8] Montando dados para o template...');
        const templateData = {
            natureza_exame: booking.natureza.toUpperCase(),
            cpf: booking.cpf,
            nome: booking.nome.toUpperCase(),
            data_nascimento: formatarData(booking.data_nasc),
            funcao: booking.funcao.toUpperCase(),
            setor: booking.setor.toUpperCase(),
            empresa: booking.empresa.toUpperCase(),
            ...examesRiscos,
            clinica: clinicaInfo,
            data_exame: dataAtual
        };

        console.log('[9] Dados do template montados:', templateData);

        // Inicia o navegador Puppeteer
        console.log('[10] Iniciando navegador Puppeteer...');
        const browser = await puppeteer.launch({
            headless: true, // Set to true for headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Add these arguments for compatibility
        });
        const page = await browser.newPage();

        // Renderiza o template diretamente
        console.log('[11] Renderizando template...');
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateASO', { ...templateData, layout: false }, (err, html) => {
                if (err) {
                    console.error('[ERRO] Erro ao renderizar template:', err);
                    reject(err);
                } else {
                    resolve(html);
                }
            });
        });

        // Lê o arquivo CSS
        const cssPath = path.join(__dirname, '../public/styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');

        // Injeta o CSS diretamente no HTML
        const htmlWithStyles = html.replace('</head>', `<style>${css}</style></head>`);

        // Configura o conteúdo HTML na página
        await page.setContent(htmlWithStyles, {
            waitUntil: 'networkidle0',
            timeout: 60000 // Increase timeout to 60 seconds
        });

        // Gera o PDF
        console.log('[12] Gerando PDF...');
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
            displayHeaderFooter: false
        });

        await browser.close();
        console.log('[13] Navegador fechado');

        // Gera nome único para o arquivo
        const fileName = generateUniqueFileName(templateData.natureza_exame, templateData.nome, booking.data_agendamento);
        console.log('[14] Nome do arquivo gerado:', fileName);

        // Faz upload do PDF para o Supabase Storage
        console.log('[15] Fazendo upload do PDF para o Supabase...');
        const publicUrl = await uploadPDFToSupabase(pdfBuffer, fileName);
        console.log('[16] Upload concluído. URL pública:', publicUrl);

        // Atualiza a URL do ASO na tabela bookings
        console.log('[17] Atualizando URL do ASO no booking...');
        await updateASOUrlInTable(req.params.id, publicUrl);
        console.log('[18] URL do ASO atualizada com sucesso');

        // Retorna sucesso com a URL pública
        console.log('[19] Processo concluído com sucesso!\n');
        res.json({
            success: true,
            message: 'PDF gerado e armazenado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('\n[ERRO] Erro ao gerar PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar PDF',
            error: error.message
        });
    }
});

// Rota proxy para chamar a API externa
router.get('/proxy/generate-from-booking/:id', async (req, res) => {
    try {
        const bookingId = req.params.id;
        const response = await axios.get(`URL_DA_API/generate-from-booking/${bookingId}`); // Substitua pela URL da sua API
        res.json(response.data);
    } catch (error) {
        console.error('Erro ao chamar a API externa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao chamar a API externa',
            error: error.message,
        });
    }
});

// Rota para gerar documento de tratativa
router.post('/generate-tratativa', async (req, res) => {
    try {
        const {
            funcionario_id,
            codigo,
            descricao_ocorrencia,
            hora_ocorrencia,
            tipo_medida,
            evidencias
        } = req.body;

        // Busca último número de documento
        const { data: ultimoDoc, error: docError } = await supabase
            .from('tratativas')
            .select('numero_documento')
            .order('numero_documento', { ascending: false })
            .limit(1);

        const numero_documento = ultimoDoc.length > 0 ? ultimoDoc[0].numero_documento + 1 : 1000;

        // Busca dados do funcionário
        const { data: funcionario, error: funcError } = await supabase
            .from('funcionarios')
            .select('*, lider:lider_id(*)')
            .eq('id', funcionario_id)
            .single();

        if (funcError) throw funcError;

        // Formata data atual
        const dataAtual = new Date();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Monta dados para o template
        const templateData = {
            numero_documento,
            data_extenso: dataFormatada,
            nome_funcionario: funcionario.nome,
            funcao: funcionario.funcao,
            setor: funcionario.setor,
            codigo,
            descricao_ocorrencia,
            data_ocorrencia: dataAtual.toLocaleDateString('pt-BR'),
            hora_ocorrencia,
            tipo_medida,
            evidencias,
            nome_lider: funcionario.lider.nome,
            logo_url: process.env.LOGO_URL
        };

        // Gera PDF usando a estrutura existente
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Renderiza o template
        const html = await new Promise((resolve, reject) => {
            req.app.render('templateTratativa', templateData, (err, html) => {
                if (err) reject(err);
                else resolve(html);
            });
        });

        // Lê o CSS
        const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
        const css = fs.readFileSync(cssPath, 'utf8');

        // Injeta o CSS
        const htmlWithStyles = html.replace('</head>', `<style>${css}</style></head>`);

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
        const fileName = `tratativa_${numero_documento}_${funcionario.nome.replace(/\s+/g, '_')}.pdf`;

        // Upload do PDF
        const publicUrl = await uploadPDFToSupabase(pdfBuffer, `tratativas/${fileName}`);

        // Salva registro no banco
        await supabase.from('tratativas').insert({
            numero_documento,
            funcionario_id,
            tipo_medida,
            data_ocorrencia: dataAtual.toISOString(),
            pdf_url: publicUrl
        });

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

// Função auxiliar para baixar PDF da URL
const downloadPDF = async (url) => {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer'
        });
        return response.data;
    } catch (error) {
        console.error('Erro ao baixar PDF:', error);
        throw error;
    }
};

// Função para criar diretório temporário
const createTempDirectory = () => {
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    return tempDir;
};

// Função para limpar diretório temporário
const cleanTempDirectory = () => {
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            const filePath = path.join(tempDir, file);
            fs.unlinkSync(filePath);
        });
        console.log('[Temp] Diretório temporário limpo');
    }
};

// Função para mesclar PDFs
const mergePDFs = async (pdfUrls) => {
    try {
        console.log('[Merge PDFs] Iniciando mesclagem de PDFs...');
        
        // Limpar diretório temporário antes de começar
        cleanTempDirectory();
        const tempDir = createTempDirectory();
        
        // Criar novo documento PDF
        const mergedPdf = await PDFDocument.create();
        
        // Para cada URL de PDF
        for (const url of pdfUrls) {
            console.log('[Merge PDFs] Baixando PDF:', url);
            // Baixar o PDF
            const pdfBytes = await downloadPDF(url);
            
            // Salvar temporariamente
            const tempFile = path.join(tempDir, `temp_${Date.now()}.pdf`);
            fs.writeFileSync(tempFile, Buffer.from(pdfBytes));
            
            // Carregar o PDF
            console.log('[Merge PDFs] Carregando PDF no documento...');
            const pdf = await PDFDocument.load(pdfBytes);
            
            // Copiar todas as páginas
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            
            // Adicionar cada página ao documento final
            pages.forEach((page) => {
                mergedPdf.addPage(page);
            });
        }
        
        console.log('[Merge PDFs] Gerando PDF final...');
        // Gerar o PDF final
        const mergedPdfFile = await mergedPdf.save();
        
        // Limpar arquivos temporários
        cleanTempDirectory();
        
        console.log('[Merge PDFs] Mesclagem concluída com sucesso');
        return Buffer.from(mergedPdfFile);
    } catch (error) {
        // Garantir que os arquivos temporários sejam limpos mesmo em caso de erro
        cleanTempDirectory();
        console.error('[Merge PDFs] Erro ao mesclar PDFs:', error);
        throw error;
    }
};

// Função para gerar nome do arquivo unificado
const generateUnifiedFileName = (filters) => {
    const { data, clinica } = filters;
    if (!data || !clinica) {
        throw new Error('Data e clínica são obrigatórios para gerar o nome do arquivo unificado');
    }
    
    // Formata a data (de YYYY-MM-DD para DD-MM-YYYY)
    const dataFormatada = data.split('-').reverse().join('-');
    
    // Extrai e formata o nome da clínica (remove a parte do telefone e formata)
    const clinicaFormatada = troquePor(clinica.split('TELEFONE:')[0].trim()).toUpperCase();
    
    // Retorna o nome do arquivo no formato: DATA_CLINICA_AGENDADOS.pdf
    return `${dataFormatada}_${clinicaFormatada}_AGENDADOS.pdf`;
};

// Função para gerar PDF a partir de um booking
const generatePDFFromBooking = async (booking, req) => {
    console.log(`[1] Iniciando geração de PDF para booking:`, booking.id);

    // Busca exames e riscos necessários
    console.log('[2] Buscando exames necessários...');
    const examesRiscos = await fetchExamesNecessarios(booking.funcao, booking.natureza);
    console.log('[3] Exames encontrados:', examesRiscos.exames);

    // Processa informações da clínica
    console.log('[4] Processando informações da clínica...');
    const clinicaInfo = processarClinica(booking.clinica);
    console.log('[5] Informações da clínica processadas:', clinicaInfo);

    // Formata a data atual
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    // Monta os dados para o template
    console.log('[6] Montando dados para o template...');
    const templateData = {
        natureza_exame: booking.natureza.toUpperCase(),
        cpf: booking.cpf,
        nome: booking.nome.toUpperCase(),
        data_nascimento: formatarData(booking.data_nasc),
        funcao: booking.funcao.toUpperCase(),
        setor: booking.setor.toUpperCase(),
        empresa: booking.empresa.toUpperCase(),
        ...examesRiscos,
        clinica: clinicaInfo,
        data_exame: dataAtual
    };

    // Inicia o navegador Puppeteer
    console.log('[7] Iniciando navegador Puppeteer...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Renderiza o template
    console.log('[8] Renderizando template...');
    const html = await new Promise((resolve, reject) => {
        const handlebarsTemplate = handlebars.compile(fs.readFileSync(path.join(__dirname, '../views/templateASO.handlebars'), 'utf8'));
        try {
            const renderedHtml = handlebarsTemplate(templateData);
            resolve(renderedHtml);
        } catch (err) {
            console.error('[ERRO] Erro ao renderizar template:', err);
            reject(err);
        }
    });

    // Lê o arquivo CSS
    const cssPath = path.join(__dirname, '../public/styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Injeta o CSS diretamente no HTML
    const htmlWithStyles = html.replace('</head>', `<style>${css}</style></head>`);

    // Configura o conteúdo HTML na página
    await page.setContent(htmlWithStyles, {
        waitUntil: 'networkidle0',
        timeout: 60000
    });

    // Gera o PDF
    console.log('[9] Gerando PDF...');
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
        displayHeaderFooter: false
    });

    await browser.close();
    console.log('[10] Navegador fechado');

    // Gera nome único para o arquivo
    const fileName = generateUniqueFileName(templateData.natureza_exame, templateData.nome, booking.data_agendamento);
    console.log('[11] Nome do arquivo gerado:', fileName);

    // Faz upload do PDF para o Supabase Storage
    console.log('[12] Fazendo upload do PDF para o Supabase...');
    const publicUrl = await uploadPDFToSupabase(pdfBuffer, fileName);
    console.log('[13] Upload concluído. URL pública:', publicUrl);

    // Atualiza a URL do ASO na tabela bookings
    console.log('[14] Atualizando URL do ASO no booking...');
    await updateASOUrlInTable(booking.id, publicUrl);
    console.log('[15] URL do ASO atualizada com sucesso');

    return { url: publicUrl };
};

// Mantendo a instância ativa
setInterval(() => {
    console.log('[INFO] Servidor ativo - mantendo a instância em execução...');
}, 60000);

module.exports = router; 