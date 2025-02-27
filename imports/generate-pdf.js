const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  // Lê o template HTML gerado (pode ser um arquivo com as variáveis já interpoladas ou um template Handlebars renderizado)
  const templateHtml = fs.readFileSync('template.html', 'utf8');

  // Inicia o navegador em modo headless
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();

  // Define a viewport com as dimensões de uma página A4 em milímetros convertidos para pixels (ajuste se necessário)
  await page.setViewport({ width: 1240, height: 1754 });

  // Configura a mídia para 'print' para que o CSS de impressão seja aplicado exatamente
  await page.emulateMediaType('print');

  // Carrega o conteúdo do template HTML
  await page.setContent(templateHtml, { waitUntil: 'networkidle0' });

  // Opcional: aguarde que imagens sejam carregadas para evitar que não apareçam no PDF
  await page.waitForSelector('img');

  // Gera o PDF usando o layout exato da página para impressão
  const pdfBuffer = await page.pdf({
    path: 'medida_disciplinar.pdf',  // ou omita o path para retornar um buffer
    format: 'A4',
    printBackground: true,           // Garante que cores e imagens de fundo sejam incluídas
    margin: { top: 0, right: 0, bottom: 0, left: 0 }  // Margens já definidas no CSS
  });

  await browser.close();
  console.log('PDF gerado com sucesso!');
})();
