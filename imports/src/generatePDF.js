const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

async function generatePDF(data) {
    try {
        // Lê o template Handlebars
        const templatePath = path.join(__dirname, '../templates/medida-disciplinar.hbs');
        const templateHtml = await readFile(templatePath, 'utf8');
        
        // Compila o template
        const template = handlebars.compile(templateHtml);
        
        // Converte a logo para base64 se for um arquivo local
        if (data.logoUrl && !data.logoUrl.startsWith('http')) {
            const logoPath = path.resolve(data.logoUrl);
            const logoBase64 = await readFile(logoPath, { encoding: 'base64' });
            data.logoUrl = `data:image/png;base64,${logoBase64}`;
        }

        // Converte as evidências para base64 se forem arquivos locais
        if (data.evidencias) {
            for (let i = 0; i < data.evidencias.length; i++) {
                if (data.evidencias[i].url && !data.evidencias[i].url.startsWith('http')) {
                    const imagePath = path.resolve(data.evidencias[i].url);
                    const imageBase64 = await readFile(imagePath, { encoding: 'base64' });
                    data.evidencias[i].url = `data:image/png;base64,${imageBase64}`;
                }
            }
        }

        // Renderiza o template com os dados
        const html = template(data);

        // Inicia o Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Cria uma nova página
        const page = await browser.newPage();

        // Configura o viewport para A4
        await page.setViewport({
            width: 794, // Aproximadamente 210mm em pixels
            height: 1123, // Aproximadamente 297mm em pixels
            deviceScaleFactor: 2
        });

        // Configura para emular mídia de impressão
        await page.emulateMediaType('print');

        // Carrega o HTML
        await page.setContent(html, {
            waitUntil: ['load', 'networkidle0']
        });

        // Espera todas as imagens carregarem
        await page.evaluate(async () => {
            const selectors = Array.from(document.getElementsByTagName('img'));
            await Promise.all(selectors.map(img => {
                if (img.complete) return;
                return new Promise((resolve, reject) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', reject);
                });
            }));
        });

        // Gera o PDF
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0',
                right: '0',
                bottom: '0',
                left: '0'
            }
        });

        // Fecha o navegador
        await browser.close();

        return pdf;
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        throw error;
    }
}

// Exemplo de uso
const dadosExemplo = {
    titulo: 'ACR-003_Medida_Disciplinar',
    anexo: 'Anexo',
    tipoDocumento: 'Controlado',
    codigoDocumento: 'PRO_003',
    numeroDocumento: '1099',
    logoUrl: 'logo.png',
    nome: 'João Silva',
    dataFormatada: '24 de fevereiro de 2024',
    funcao: 'Desenvolvedor',
    setor: 'TI',
    textoNotificacao: 'Pelo presente o notificamos que nesta data está recebendo uma medida disciplinar, em razão da não conformidade abaixo discriminada.',
    codigoInfracao: '51',
    descricaoInfracao: 'Excesso de velocidade',
    dataOcorrencia: '24/02/2024',
    horaOcorrencia: '09:15',
    codigoMedida: 'P2',
    descricaoMedida: 'Advertência Escrita',
    textosLegais: [
        'Lembramos que caso haja incidência na mesma falta, será penalizado(a), conforme a CONSOLIDAÇÃO DAS LEIS TRABALHISTAS e o procedimento disciplinar da empresa.',
        'Esclarecemos que, a reiteração no cometimento de irregularidades autoriza a rescisão do contrato de trabalho por justa causa, razão pela qual esperamos que evite a reincidência da não conformidade, para que não tenhamos no futuro, de tomar medidas que são facultadas por lei à empresa.'
    ],
    evidencias: [
        {
            url: 'caminho/para/evidencia1.png'
        }
    ],
    informacoesEvidencia: [
        'Valor registrado: 19km/h',
        'Limite permitido: 15km/h'
    ],
    assinaturas: [
        {
            cargo: 'Funcionário',
            nome: 'João Silva',
            data: '',
            assinatura: ''
        },
        {
            cargo: 'Líder',
            nome: 'Maria Gestora',
            data: '',
            assinatura: ''
        },
        {
            cargo: 'Testemunha',
            nome: '',
            data: '',
            assinatura: ''
        }
    ]
};

module.exports = generatePDF; 