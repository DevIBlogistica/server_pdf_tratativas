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
    origin: '*', // Aceita todas as origens
    methods: ['GET', 'POST'], // Métodos permitidos
    allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
};

// Use o middleware CORS
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
    console.log('\n[Verificando duplicidade do arquivo]');
    
    // Verifica se o arquivo já existe
    const { data: existingFiles } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET_NAME)
        .list();

    const existingFile = existingFiles?.find(file => file.name === fileName);
    
    if (existingFile) {
        console.log('Arquivo com mesmo nome encontrado:', existingFile.name);
        
        // Obtém a URL do arquivo existente para buscar agendamentos que a utilizam
        const { data: { publicUrl: oldUrl } } = supabase.storage
            .from(process.env.SUPABASE_BUCKET_NAME)
            .getPublicUrl(fileName);
            
        console.log('Buscando agendamentos que utilizam o arquivo...');
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('id')
            .eq('aso_url', oldUrl);
            
        if (bookingsError) {
            console.error('Erro ao buscar agendamentos:', bookingsError);
            throw bookingsError;
        }

        // Deleta o arquivo existente
        console.log('Deletando arquivo existente...');
        const { error: deleteError } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET_NAME)
            .remove([fileName]);
            
        if (deleteError) {
            console.error('Erro ao deletar arquivo:', deleteError);
            throw deleteError;
        }
        
        // Faz upload do novo arquivo
        console.log('Realizando upload do novo arquivo...');
        const { error: uploadError } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET_NAME)
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            console.error('Erro ao fazer upload:', uploadError);
            throw uploadError;
        }
        
        // Gera a nova URL pública
        const { data: { publicUrl: newUrl } } = supabase.storage
            .from(process.env.SUPABASE_BUCKET_NAME)
            .getPublicUrl(fileName);
            
        // Atualiza a URL em todos os agendamentos que utilizavam o arquivo antigo
        if (bookings && bookings.length > 0) {
            console.log(`Atualizando URL em ${bookings.length} agendamento(s)...`);
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ aso_url: newUrl })
                .in('id', bookings.map(b => b.id));
                
            if (updateError) {
                console.error('Erro ao atualizar agendamentos:', updateError);
                throw updateError;
            }
        }
        
        console.log('Processo de substituição concluído com sucesso');
        return newUrl;
    }

    console.log('Arquivo não encontrado, realizando upload...');
    
    // Se não existir, faz o upload normalmente
    const { error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET_NAME)
        .upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: false
        });

    if (uploadError) throw uploadError;
    
    // Gera URL pública do arquivo
    const { data: { publicUrl } } = supabase.storage
        .from(process.env.SUPABASE_BUCKET_NAME)
        .getPublicUrl(fileName);

    console.log('Upload concluído com sucesso');
    return publicUrl;
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
    console.log('[4.1] Buscando exames para função:', funcao, 'natureza:', natureza);
    const { data: examesData, error: examesError } = await supabase
        .from('exames_necessarios')
        .select('exame, codigo, valor')
        .eq('funcao', funcao)
        .eq('natureza', natureza);

    if (examesError) {
        console.error('[ERRO] Erro ao buscar exames:', examesError);
        throw examesError;
    }

    console.log('[4.2] Exames encontrados:', examesData);

    // Lista de exames formatados com código
    const exames = examesData.map(item => `${item.codigo} - ${item.exame.toUpperCase()}`);

    // Calcula o custo total dos exames
    const custoTotal = examesData.reduce((total, item) => total + Number(item.valor), 0);

    // Busca riscos ocupacionais
    console.log('\n[4.3] Iniciando busca de riscos...');
    console.log('Função recebida:', funcao);
    console.log('Função após trim e uppercase:', funcao.trim().toUpperCase());

    // Faz a consulta
    const { data: riscosData, error: riscosError } = await supabase
        .from('riscos')
        .select('*')
        .eq('funcao', funcao.trim().toUpperCase())
        .single();

    if (riscosError) {
        console.error('[ERRO] Detalhes do erro ao buscar riscos:', {
            codigo: riscosError.code,
            mensagem: riscosError.message,
            detalhes: riscosError.details,
            dica: riscosError.hint
        });

        // Faz uma busca geral para ver todas as funções disponíveis
        const { data: todasFuncoes } = await supabase
            .from('riscos')
            .select('funcao');
        
        console.log('\n[DEBUG] Funções disponíveis na tabela riscos:', 
            todasFuncoes?.map(f => f.funcao));

        return {
            exames,
            custoTotal,
            risco_fisico: "NA",
            risco_quimico: "NA",
            risco_ergonomico: "NA",
            risco_acidente: "NA",
            risco_biologico: "NA"
        };
    }

    console.log('[4.4] Riscos encontrados:', riscosData);

    // Retorna os exames e riscos encontrados
    return {
        exames,
        custoTotal,
        risco_fisico: riscosData.fisico || "NA",
        risco_quimico: riscosData.quimico || "NA",
        risco_ergonomico: riscosData.ergonomico || "NA",
        risco_acidente: riscosData.acidente || "NA",
        risco_biologico: riscosData.biologico || "NA"
    };
};

// Função para processar informações da clínica
const processarClinica = (clinicaStr) => {
    const [nome, telefoneCompleto] = clinicaStr.split('TELEFONE:');
    return {
        nome: nome.trim(),
        endereco: `TELEFONE:${telefoneCompleto.trim()}`
    };
};

// Rota POST para gerar PDF do ASO
router.post('/generate', async (req, res) => {
    try {
        // Extrai os dados necessários do corpo da requisição
        const {
            tableId,
            natureza_exame,
            cpf,
            nome,
            data_nascimento,
            funcao,
            setor,
            empresa,
            clinica
        } = req.body;

        // Busca exames e riscos necessários
        const examesRiscos = await fetchExamesNecessarios(funcao, natureza_exame);

        // Garante que os valores dos riscos sejam mantidos exatamente como estão
        const riscos = ['risco_fisico', 'risco_quimico', 'risco_ergonomico', 'risco_acidente', 'risco_biologico'];
        riscos.forEach(risco => {
            if (examesRiscos[risco] === 'NA') {
                examesRiscos[risco] = 'NA';
            }
        });

        // Monta os dados para o template
        const templateData = {
            natureza_exame,
            cpf,
            nome,
            data_nascimento,
            funcao,
            setor,
            empresa,
            ...examesRiscos, // Inclui exames e riscos
            clinica
        };

        console.log('[9] Dados do template montados:', templateData);

        // Renderiza o template com os dados
        // (Continue with the rest of your logic here)
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar PDF',
            error: error.message
        });
    }
});

// Rota GET para renderizar o template (usado internamente pelo Puppeteer)
router.get('/render-aso', (req, res) => {
    try {
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
        console.error('Erro ao renderizar template:', error);
        res.status(500).send('Erro ao renderizar template');
    }
});

// Rota de teste com dados mockados
router.get('/test-generate', async (req, res) => {
    try {
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

        // Gera nome único para o arquivo
        const fileName = generateUniqueFileName(templateData.natureza_exame, templateData.nome, new Date().toLocaleDateString('pt-BR'));

        // Faz upload do PDF para o Supabase Storage
        const publicUrl = await uploadPDFToSupabase(pdfBuffer, fileName);

        // Retorna sucesso com a URL pública
        res.json({
            success: true,
            message: 'PDF de teste gerado e armazenado com sucesso',
            url: publicUrl
        });

    } catch (error) {
        console.error('Erro ao gerar PDF de teste:', error);
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

// Teste da função removeAcentos
const teste = "MUDANÇA DE FUNÇÃO";
const resultado = troquePor(teste);
console.log('Resultado do teste:', resultado); // Deve imprimir "MUDANCA DE FUNCAO"

// Adicionando log periódico para manter a instância ativa
setInterval(() => {
    console.log('[INFO] Servidor ativo - mantendo a instância em execução...');
}, 60000); // 1 minuto

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

// Nova rota para gerar ASO unificado
router.post('/generate-unified', async (req, res) => {
    try {
        const { bookingIds, filters } = req.body;
        
        if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'É necessário fornecer ao menos um ID de agendamento'
            });
        }

        console.log('[1] Iniciando geração de ASO unificado');
        console.log('IDs recebidos:', bookingIds);
        console.log('Filtros:', filters);

        // Buscar todos os agendamentos
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('*')
            .in('id', bookingIds);

        if (bookingsError) throw bookingsError;

        // Separar ASOs existentes e faltantes
        const existingAsos = bookings.filter(b => b.aso_url);
        const missingAsos = bookings.filter(b => !b.aso_url);

        console.log(`[2] ASOs existentes: ${existingAsos.length}, Faltantes: ${missingAsos.length}`);

        // Gerar ASOs faltantes
        const generatedUrls = [];
        for (const booking of missingAsos) {
            console.log(`[3] Gerando ASO para booking ID: ${booking.id}`);
            const response = await generatePDFFromBooking(booking, req);
            generatedUrls.push(response.url);
        }

        // Coletar todas as URLs (existentes + geradas)
        const allUrls = [...existingAsos.map(b => b.aso_url), ...generatedUrls];
        
        console.log('[4] Unificando PDFs...');
        const mergedPdfBuffer = await mergePDFs(allUrls);

        // Gerar nome do arquivo unificado
        const fileName = generateUnifiedFileName(filters);
        console.log('[5] Nome do arquivo unificado:', fileName);

        // Upload do PDF unificado
        console.log('[6] Fazendo upload do PDF unificado...');
        const unifiedUrl = await uploadPDFToSupabase(mergedPdfBuffer, `unified/${fileName}`);

        console.log('[7] Processo concluído com sucesso');
        res.json({
            success: true,
            message: 'ASO unificado gerado com sucesso',
            url: unifiedUrl,
            total: bookingIds.length,
            generated: missingAsos.length,
            existing: existingAsos.length
        });

    } catch (error) {
        console.error('[ERRO] Erro ao gerar ASO unificado:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar ASO unificado',
            error: error.message
        });
    }
});

module.exports = router; 