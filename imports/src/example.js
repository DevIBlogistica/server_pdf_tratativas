const generatePDF = require('./generatePDF');
const fs = require('fs').promises;
const path = require('path');

async function example() {
    try {
        // Dados de exemplo (você pode substituir com seus próprios dados)
        const dados = {
            titulo: 'ACR-003_Medida_Disciplinar',
            anexo: 'Anexo',
            tipoDocumento: 'Controlado',
            codigoDocumento: 'PRO_003',
            numeroDocumento: '1099',
            logoUrl: path.join(__dirname, '../logo.png'),
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

        // Gera o PDF
        const pdf = await generatePDF(dados);

        // Formata o nome do arquivo: numeroDocumento_nomeFuncionario_data
        const nomeArquivo = `${dados.numeroDocumento}_${dados.nome.replace(/\s+/g, '_')}_${dados.dataOcorrencia.replace(/\//g, '-')}.pdf`;
        
        // Salva o PDF
        const outputPath = path.join(__dirname, '../output', nomeArquivo);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, pdf);

        console.log(`PDF gerado com sucesso: ${outputPath}`);
    } catch (error) {
        console.error('Erro ao gerar o PDF:', error);
    }
}

// Executa o exemplo
example(); 