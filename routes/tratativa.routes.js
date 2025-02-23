const express = require('express');
const router = express.Router();
const tratativaService = require('../services/tratativa.service');

// Rota para gerar PDF da tratativa
router.post('/generate-tratativas', async (req, res) => {
  try {
    const data = req.body;
    
    // Log da requisição
    console.log('Recebendo solicitação de geração de tratativa:', {
      funcionario: data.nome_funcionario,
      data: data.data_formatada_extenso,
      tipo: data.descricao_ocorrencia
    });

    // Chama o serviço para gerar o PDF
    const result = await tratativaService.generatePDF(data);

    res.json(result);
  } catch (error) {
    console.error('Erro na rota de geração de tratativa:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao gerar tratativa',
      error: error.message 
    });
  }
});

// Rota para listar todas as tratativas
router.get('/tratativas', async (req, res) => {
  try {
    const tratativas = await tratativaService.listTratativas();
    res.json(tratativas);
  } catch (error) {
    console.error('Erro ao listar tratativas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar tratativas',
      error: error.message
    });
  }
});

// Rota para buscar uma tratativa específica
router.get('/tratativas/:id', async (req, res) => {
  try {
    const tratativa = await tratativaService.getTratativaById(req.params.id);
    if (!tratativa) {
      return res.status(404).json({
        success: false,
        message: 'Tratativa não encontrada'
      });
    }
    res.json(tratativa);
  } catch (error) {
    console.error('Erro ao buscar tratativa:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar tratativa',
      error: error.message
    });
  }
});

// Rota para atualizar status da tratativa
router.patch('/tratativas/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, justificativa } = req.body;
    const result = await tratativaService.updateTratativaStatus(id, status, justificativa);
    res.json(result);
  } catch (error) {
    console.error('Erro ao atualizar status da tratativa:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status da tratativa',
      error: error.message
    });
  }
});

// Rota para listar tipos de ocorrência
router.get('/tipos-ocorrencia', async (req, res) => {
  try {
    const tipos = await tratativaService.listTiposOcorrencia();
    res.json(tipos);
  } catch (error) {
    console.error('Erro ao listar tipos de ocorrência:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar tipos de ocorrência',
      error: error.message
    });
  }
});

// Rota para buscar estatísticas do dashboard
router.get('/dashboard/stats', async (req, res) => {
  try {
    const stats = await tratativaService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas do dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas do dashboard',
      error: error.message
    });
  }
});

// Rota para buscar atividades recentes
router.get('/dashboard/recent-activity', async (req, res) => {
  try {
    const activities = await tratativaService.getRecentActivity();
    res.json(activities);
  } catch (error) {
    console.error('Erro ao buscar atividades recentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar atividades recentes',
      error: error.message
    });
  }
});

module.exports = router;
