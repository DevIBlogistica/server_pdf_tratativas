const axios = require('axios');

const mockData = {
    nome_colaborador: "João Silva",
    matricula: "12345",
    cargo: "Desenvolvedor",
    setor: "TI",
    data_ocorrencia: "2024-02-24",
    horario_ocorrencia: "09:00",
    descricao_ocorrencia: "Atraso no horário de trabalho",
    justificativa: "Problemas com o transporte público",
    data_atual: new Date().toLocaleDateString('pt-BR'),
    nome_gestor: "Maria Gestora",
    cargo_gestor: "Gerente de TI"
};

async function testPdfGeneration() {
    try {
        console.log('Testando geração de PDF com dados mockados...');
        const response = await axios.post('http://localhost:3001/api/tratativa/generate', mockData);
        console.log('PDF gerado com sucesso:', response.data);
    } catch (error) {
        console.error('Erro ao gerar PDF:', error.message);
    }
}

testPdfGeneration(); 