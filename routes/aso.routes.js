const express = require('express');
const router = express.Router();
const path = require('path');
const puppeteer = require('puppeteer');
const supabase = require('../config/supabase');
const fs = require('fs');

// Função auxiliar para gerar nome único para o arquivo
const generateUniqueFileName = () => {
    return `aso_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
};

// Função auxiliar para fazer upload do PDF para o Supabase Storage
const uploadPDFToSupabase = async (pdfBuffer, fileName) => {
    const { data, error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET_NAME)
        .upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true
        });

    if (error) throw error;
    
    // Gera URL pública do arquivo
    const { data: { publicUrl } } = supabase.storage
        .from(process.env.SUPABASE_BUCKET_NAME)
        .getPublicUrl(fileName);

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
    // Busca exames necessários
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
    console.log('[4.3] Buscando riscos para função:', funcao);
    const { data: riscosData, error: riscosError } = await supabase
        .from('riscos')
        .select('*')
        .eq('funcao', funcao)
        .single();

    if (riscosError) {
        console.log('[AVISO] Riscos não encontrados para a função:', funcao);
        return {
            exames,
            custoTotal,
            risco_fisico: "NÃO APLICÁVEL",
            risco_quimico: "NÃO APLICÁVEL",
            risco_ergonomico: "NÃO APLICÁVEL",
            risco_acidente: "NÃO APLICÁVEL",
            risco_biologico: "NÃO APLICÁVEL"
        };
    }

    console.log('[4.4] Riscos encontrados:', riscosData);

    // Retorna os exames e riscos encontrados
    return {
        exames,
        custoTotal,
        risco_fisico: riscosData.fisico?.toUpperCase() || "NÃO APLICÁVEL",
        risco_quimico: riscosData.quimico?.toUpperCase() || "NÃO APLICÁVEL",
        risco_ergonomico: riscosData.ergonomico?.toUpperCase() || "NÃO APLICÁVEL",
        risco_acidente: riscosData.acidente?.toUpperCase() || "NÃO APLICÁVEL",
        risco_biologico: riscosData.biologico?.toUpperCase() || "NÃO APLICÁVEL"
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
            tableId, // ID do registro na tabela
            natureza_exame,
            cpf,
            nome,
            data_nascimento,
            funcao,
            setor,
            empresa,
            risco_fisico,
            risco_quimico,
            risco_ergonomico,
            risco_acidente,
            risco_biologico,
            exames,
            procedimentos_medicos,
            parecer_medico,
            parecer_altura,
            medico_coordenador,
            medico_examinador,
            clinica
        } = req.body;

        // Renderiza o template com os dados
        const templateData = {
            natureza_exame,
            cpf,
            nome,
            data_nascimento,
            funcao,
            setor,
            empresa,
            risco_fisico,
            risco_quimico,
            risco_ergonomico,
            risco_acidente,
            risco_biologico,
            exames,
            procedimentos_medicos,
            parecer_medico,
            parecer_altura,
            medico_coordenador,
            medico_examinador,
            clinica
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
        const fileName = generateUniqueFileName();

        // Faz upload do PDF para o Supabase Storage
        const publicUrl = await uploadPDFToSupabase(pdfBuffer, fileName);

        // Atualiza a URL do ASO na tabela
        await updateASOUrlInTable(tableId, publicUrl);

        // Retorna sucesso com a URL pública
        res.json({
            success: true,
            message: 'PDF gerado e armazenado com sucesso',
            url: publicUrl
        });

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
        const fileName = generateUniqueFileName();

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
            headless: 'new',
            args: ['--no-sandbox']
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
            waitUntil: 'networkidle0'
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
        const fileName = generateUniqueFileName();
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

module.exports = router; 