const fs = require('fs');
const handlebars = require('handlebars');
const { supabase } = require('../config/supabase');
const { generatePDF } = require('../utils/pdf-generator');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const path = require('path');

class TratativaService {
  constructor() {
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }

  async generatePDF(data) {
    try {
      // Carregar template
      const template = fs.readFileSync('./public/tratativa-preview.html', 'utf8');
      const compiledTemplate = handlebars.compile(template);

      // Formatar dados
      const formattedData = this.formatData(data);

      // Gerar HTML
      const html = compiledTemplate(formattedData);

      // Configurações do PDF
      const pdfOptions = {
        format: 'A4',
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      };

      // Gerar PDF
      const pdfBuffer = await generatePDF(html, pdfOptions);

      // Upload para o Supabase
      const { data: uploadResult, error: uploadError } = await this.uploadPDF(
        pdfBuffer,
        data.numero_documento
      );

      if (uploadError) throw uploadError;

      // Atualizar registro na tabela
      await this.updateTratativa(data.tratativa_id, uploadResult.path);

      return {
        success: true,
        message: 'Tratativa gerada e enviada com sucesso',
        pdf_url: uploadResult.path
      };

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      throw error;
    }
  }

  formatData(data) {
    return {
      ...data,
      texto_excesso: `${data.descricao_ocorrencia}: ${data.valor_praticado}${data.unidade}`,
      texto_limite: `Limite estabelecido: ${data.limite}${data.unidade}`
    };
  }

  async uploadPDF(pdfBuffer, numeroDocumento) {
    return await supabase
      .storage
      .from('tratativas')
      .upload(`${numeroDocumento}.pdf`, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });
  }

  async updateTratativa(tratativaId, pdfPath) {
    const { error } = await supabase
      .from('tratativas')
      .update({ 
        pdf_enviado: true,
        pdf_url: pdfPath
      })
      .eq('id', tratativaId);

    if (error) throw error;
  }

  async listTratativas() {
    try {
      const { data, error } = await this.supabase
        .from('tratativas')
        .select(`
          *,
          funcionario:funcionarios(nome, funcao, setor),
          tipo_ocorrencia:tipos_ocorrencia(descricao, codigo, medida_disciplinar)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao listar tratativas:', error);
      throw error;
    }
  }

  async getTratativaById(id) {
    try {
      const { data, error } = await this.supabase
        .from('tratativas')
        .select(`
          *,
          funcionario:funcionarios(nome, funcao, setor),
          tipo_ocorrencia:tipos_ocorrencia(descricao, codigo, medida_disciplinar)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao buscar tratativa:', error);
      throw error;
    }
  }

  async updateTratativaStatus(id, status, justificativa = null) {
    try {
      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      if (justificativa) {
        updateData.justificativa = justificativa;
      }

      const { data, error } = await this.supabase
        .from('tratativas')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao atualizar status da tratativa:', error);
      throw error;
    }
  }

  async listTiposOcorrencia() {
    try {
      const { data, error } = await this.supabase
        .from('tipos_ocorrencia')
        .select('*')
        .order('codigo');

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao listar tipos de ocorrência:', error);
      throw error;
    }
  }

  async getDashboardStats() {
    try {
      const { data: enviadas, error: error1 } = await this.supabase
        .from('tratativas')
        .select('count')
        .eq('status', 'Enviada');

      const { data: devolvidas, error: error2 } = await this.supabase
        .from('tratativas')
        .select('count')
        .eq('status', 'Devolvida');

      const { data: canceladas, error: error3 } = await this.supabase
        .from('tratativas')
        .select('count')
        .eq('status', 'Cancelada');

      if (error1 || error2 || error3) throw error1 || error2 || error3;

      return {
        enviadas: enviadas[0]?.count || 0,
        devolvidas: devolvidas[0]?.count || 0,
        canceladas: canceladas[0]?.count || 0
      };
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      throw error;
    }
  }

  async getRecentActivity() {
    try {
      const { data: novasTratativas, error: error1 } = await this.supabase
        .from('tratativas')
        .select(`
          id,
          created_at,
          funcionario:funcionarios(nome),
          tipo_ocorrencia:tipos_ocorrencia(descricao)
        `)
        .eq('status', 'Enviada')
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: tratativasDevolvidas, error: error2 } = await this.supabase
        .from('tratativas')
        .select(`
          id,
          updated_at,
          funcionario:funcionarios(nome),
          tipo_ocorrencia:tipos_ocorrencia(descricao)
        `)
        .eq('status', 'Devolvida')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (error1 || error2) throw error1 || error2;

      return {
        novasTratativas: novasTratativas || [],
        tratativasDevolvidas: tratativasDevolvidas || []
      };
    } catch (error) {
      console.error('Erro ao buscar atividades recentes:', error);
      throw error;
    }
  }
}

module.exports = new TratativaService();
