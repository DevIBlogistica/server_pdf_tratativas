const supabase = require('../config/supabase-tratativas');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

class TratativaService {
  // Função para normalizar o nome do arquivo
  normalizeFileName(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9]/g, '_') // Substitui caracteres especiais por _
      .replace(/_{2,}/g, '_') // Remove underscores duplicados
      .toUpperCase(); // Converte para maiúsculas
  }

  // Função para tratar caracteres especiais
  troquePor(str) {
    const acentos = {
      'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
      'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
      'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
      'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
      'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
      'ç': 'c',
      'Ç': 'C',
      'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
      'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
      'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
      'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
      'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U'
    };
    
    return str.split('').map(char => acentos[char] || char).join('').replace(/\//g, '_');
  }

  // Função para gerar nome único do arquivo
  generateUniqueFileName(numero, nome, setor, data) {
    console.log('\n[Gerando nome do arquivo]');
    console.log('Dados recebidos:', { numero, nome, setor, data });
    
    const dataFormatada = data.split('/').join('-');
    console.log('Data formatada:', dataFormatada);
    
    const nomeFormatado = this.troquePor(nome.trim()).toUpperCase();
    console.log('Nome formatado:', nomeFormatado);
    
    const setorFormatado = this.troquePor(setor.trim()).toUpperCase();
    console.log('Setor formatado:', setorFormatado);
    
    const fileName = `${numero}_${nomeFormatado}_${setorFormatado}_${dataFormatada}.pdf`
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '');
    
    console.log('Nome final do arquivo:', fileName);
    return fileName;
  }

  async generatePDF(data) {
    try {
      // Formatar dados
      const formattedData = this.formatData(data);

      // Inicia o navegador Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();

      // Renderiza o template
      const templatePath = path.join(__dirname, '../views/templateTratativa.handlebars');
      const template = fs.readFileSync(templatePath, 'utf8');
      const compiledTemplate = handlebars.compile(template);
      const html = compiledTemplate(formattedData);

      // Lê o arquivo CSS
      const cssPath = path.join(__dirname, '../public/tratativa-styles.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Injeta o CSS diretamente no HTML
      const htmlWithStyles = html.replace('</head>', `<style>${css}</style></head>`);

      // Configura o conteúdo HTML na página
      await page.setContent(htmlWithStyles, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      // Gera o PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm'
        }
      });

      await browser.close();

      // Gera nome do arquivo
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      const fileName = this.generateUniqueFileName(
        data.numero_documento,
        data.nome_funcionario,
        data.setor,
        dataAtual
      );

      // Upload para o Supabase
      const { data: uploadResult, error: uploadError } = await supabase.storage
        .from('tratativas')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Gera URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('tratativas')
        .getPublicUrl(fileName);

      return {
        success: true,
        message: 'Tratativa gerada e enviada com sucesso',
        url: publicUrl
      };

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      throw error;
    }
  }

  formatData(data) {
    return {
      ...data,
      texto_excesso: data.valor_praticado ? `${data.descricao_ocorrencia}: ${data.valor_praticado}${data.unidade}` : data.descricao_ocorrencia,
      texto_limite: data.limite ? `Limite estabelecido: ${data.limite}${data.unidade}` : ''
    };
  }

  async listTratativas() {
    try {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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

      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      const { data: enviadas, error: error1 } = await supabase
        .from('tratativas')
        .select('count')
        .eq('status', 'Enviada');

      const { data: devolvidas, error: error2 } = await supabase
        .from('tratativas')
        .select('count')
        .eq('status', 'Devolvida');

      const { data: canceladas, error: error3 } = await supabase
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
      const { data: novasTratativas, error: error1 } = await supabase
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

      const { data: tratativasDevolvidas, error: error2 } = await supabase
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
