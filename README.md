# Servidor de Geração de PDF - Tratativas

Servidor Node.js para geração de PDFs de tratativas disciplinares.

## Ambientes

### Desenvolvimento (Local)
```
http://localhost:3001/api/tratativa/...
```

### Produção
```
https://tratativas.iblogistica.com/api/tratativa/...
```

## Configuração do Ambiente de Produção

### 1. Proxy Reverso (Nginx)
```nginx
# /etc/nginx/sites-available/tratativas
server {
    listen 80;
    server_name tratativas.iblogistica.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name tratativas.iblogistica.com;

    ssl_certificate /etc/letsencrypt/live/tratativas.iblogistica.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tratativas.iblogistica.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Certificado SSL
1. Instalar Certbot:
```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

2. Gerar certificado:
```bash
sudo certbot --nginx -d tratativas.iblogistica.com
```

### 3. Configuração DNS
Adicione um registro A no seu provedor DNS:
```
tratativas.iblogistica.com.  A  159.112.182.31
```

## Fluxo de Teste e Desenvolvimento

### 1. Teste Inicial (Postman)

1. **Ambiente de Desenvolvimento**
   ```
   http://localhost:3001/api/tratativa/test-connection
   ```

2. **Ambiente de Produção**
   ```
   https://tratativas.iblogistica.com/api/tratativa/test-connection
   ```

Crie dois ambientes no Postman:
- Development
  - BASE_URL: http://localhost:3001
- Production
  - BASE_URL: https://159.112.182.31

### 2. Desenvolvimento Frontend

1. **Configuração do ambiente (.env)**
```javascript
// Development (.env.development)
VITE_API_URL=http://localhost:3001

// Production (.env.production)
VITE_API_URL=https://tratativas.iblogistica.com
```

2. **Exemplo de serviço de API**
```javascript
// src/services/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

export const generatePDF = async (data) => {
    try {
        const response = await api.post('/api/tratativa/generate', data);
        return response.data;
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        throw error;
    }
};
```

## Endpoints Disponíveis

### 1. Teste de Conexão
Verifica se o servidor está online e respondendo.

```
POST http://159.112.182.31:3001/api/tratativa/test-connection
Content-Type: application/json
Body: {} (vazio)
```

Resposta esperada:
```json
{
    "success": true,
    "message": "Conexão bem-sucedida!",
    "server": "PDF Generator Server",
    "timestamp": "2024-02-24T12:00:00.000Z"
}
```

### 2. Gerar PDF (Ambiente de Teste)
Gera um PDF e salva na pasta "mocks/" do Supabase.

```
POST http://159.112.182.31:3001/api/tratativa/test
Content-Type: application/json

Body:
{
    "numero_documento": "MD-2024-001",
    "nome_funcionario": "João Silva",
    "funcao": "Desenvolvedor",
    "setor": "TI",
    "data_formatada_extenso": "24 de fevereiro de 2024",
    "codigo_infracao": "ATR-001",
    "infracao_cometida": "Atraso no horário de trabalho",
    "data_infracao": "24/02/2024",
    "hora_infracao": "09:15",
    "penalidade": "Advertência",
    "penalidade_aplicada": "Advertência verbal por atraso injustificado",
    "nome_lider": "Maria Gestora",
    "evidencias": [
        {
            "url": "https://via.placeholder.com/320x400/2196F3/FFFFFF?text=Evidencia+1"
        },
        {
            "url": "https://via.placeholder.com/320x400/4CAF50/FFFFFF?text=Evidencia+2"
        }
    ],
    "texto_excesso": "Tempo em excesso: 00:45:32",
    "texto_limite": "Limite permitido: 00:15:00"
}
```

### 3. Gerar PDF (Produção)
Gera um PDF e salva na raiz do bucket do Supabase.

```
POST http://159.112.182.31:3001/api/tratativa/generate
Content-Type: application/json
```
Utiliza o mesmo body do endpoint de teste.

Resposta esperada para ambos endpoints de geração:
```json
{
    "success": true,
    "message": "Documento de tratativa gerado com sucesso",
    "url": "https://kjlwqezxzqjfhacmjhbh.supabase.co/storage/v1/object/public/tratativas/[nome_do_arquivo].pdf"
}
```

## Como Testar com Postman

1. Crie uma nova coleção chamada "PDF Tratativas"
2. Adicione as três requisições conforme descrito acima
3. Configure o header Content-Type como application/json
4. Cole os bodies fornecidos
5. Execute os testes na seguinte ordem:
   - Primeiro `/test-connection` para verificar se o servidor está online
   - Depois `/test` para gerar um PDF de teste
   - Por fim `/generate` para testar a geração em produção

## Estrutura do Projeto

- `server.js`: Arquivo principal do servidor
- `routes/tratativa.routes.js`: Rotas da API
- `views/templateTratativa.handlebars`: Template do PDF
- `public/tratativa-styles.css`: Estilos do PDF
- `scripts/deploy.sh`: Script de deploy

## Deploy

Para fazer deploy do servidor:

1. Conecte-se à instância:
```bash
ssh usuario@159.112.182.31
```

2. Execute o script de deploy:
```bash
cd ~/server_pdf_tratativas
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## Monitoramento

Para monitorar o servidor:
```bash
# Ver logs
pm2 logs server_tratativas

# Status do servidor
pm2 status

# Monitoramento detalhado
pm2 monit
```

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:
```
PORT=3001
SUPABASE_URL=sua_url_do_supabase
SUPABASE_KEY=sua_chave_do_supabase
SUPABASE_TRATATIVAS_BUCKET_NAME=nome_do_bucket
```

## Segurança

### CORS
O servidor está configurado para aceitar requisições apenas de origens permitidas:

```javascript
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://seu-frontend.iblogistica.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
```

### Headers de Segurança
O Nginx está configurado com headers de segurança:
```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-XSS-Protection "1; mode=block";
add_header X-Content-Type-Options "nosniff";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```
