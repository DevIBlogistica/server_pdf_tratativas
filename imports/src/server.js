const express = require('express');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000;

// Dados de exemplo
const dadosExemplo = {
    titulo: 'ACR-003_Medida_Disciplinar',
    anexo: 'Anexo',
    tipoDocumento: 'Controlado',
    codigoDocumento: 'PRO_003',
    numeroDocumento: '1099',
    logoUrl: '/logo.png',
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
            url: 'https://kjlwqezxzqjfhacmjhbh.supabase.co/storage/v1/object/public/sourcefiles//Captura%20de%20tela%202025-02-24%20133232.png'
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

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '..')));

// Rota para preview
app.get('/preview', async (req, res) => {
    try {
        // Lê o template
        const templatePath = path.join(__dirname, '../templates/medida-disciplinar.hbs');
        const templateContent = await fs.readFile(templatePath, 'utf8');
        
        // Compila e renderiza o template
        const template = handlebars.compile(templateContent);
        const html = template(dadosExemplo);
        
        res.send(html);
    } catch (error) {
        console.error('Erro ao renderizar preview:', error);
        res.status(500).send('Erro ao gerar preview');
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor de preview rodando em http://localhost:${port}/preview`);
    console.log('Pressione Ctrl+C para parar o servidor');
}); 