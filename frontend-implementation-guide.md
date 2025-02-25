# Guia de Implementação do Frontend (Next.js)

Este guia fornece instruções detalhadas para implementar o frontend do Sistema de Tratativas Disciplinares utilizando Next.js.

## 1. Configuração do Projeto

### Criação do Projeto
```bash
# Criar novo projeto Next.js
npx create-next-app@latest tratativas-frontend
cd tratativas-frontend

# Instalar dependências necessárias
npm install axios
npm install react-hook-form
npm install @hookform/resolvers yup
npm install react-pdf
npm install react-datepicker
npm install react-toastify
npm install react-icons
```

### Estrutura de Diretórios
```
/src
  /app
    /api
    /tratativas
      /[id]
        page.jsx
      /create
        page.jsx
      /history
        page.jsx
      page.jsx
    page.jsx
  /components
    /forms
      TratativaForm.jsx
    /ui
      Button.jsx
      Card.jsx
      InputField.jsx
    /tratativas
      TratativaCard.jsx
      TratativaDetail.jsx
      PDFViewer.jsx
  /lib
    /services
      api.js
    /utils
      formatters.js
      validators.js
  /styles
    globals.css
```

### Configuração do Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```plaintext
# Development
NEXT_PUBLIC_API_URL=https://localhost:3000

# Production (quando for fazer deploy)
# NEXT_PUBLIC_API_URL=https://iblogistica.ddns.net:3000
```

## 2. Implementação do Serviço de API

Crie o arquivo `src/lib/services/api.js`:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Para lidar com certificados autoassinados (em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  // No ambiente browser, o Next.js lida com isso automaticamente
  // Esta configuração é para chamadas no lado do servidor
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Serviços para Tratativas
export const tratativaService = {
  // Teste de conexão
  testConnection: async () => {
    const response = await api.post('/api/tratativa/test-connection', {});
    return response.data;
  },
  
  // Criar nova tratativa (inclui criação no DB e geração de PDF)
  createTratativa: async (data) => {
    const response = await api.post('/api/tratativa/create', data);
    return response.data;
  },
  
  // Listar todas as tratativas
  listTratativas: async () => {
    const response = await api.get('/api/tratativa/list');
    return response.data;
  },
  
  // Obter detalhes de uma tratativa
  getTratativa: async (id) => {
    const response = await api.get(`/api/tratativa/${id}`);
    return response.data;
  },
  
  // Apenas gerar PDF (usa a rota existente, sem persistir no DB)
  generatePDF: async (data) => {
    const response = await api.post('/api/tratativa/generate', data);
    return response.data;
  }
};

export default api;
```

## 3. Componentes Principais

### Formulário de Tratativa

Crie o arquivo `src/components/forms/TratativaForm.jsx`:

```jsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';
import { tratativaService } from '@/lib/services/api';

// Schema de validação
const schema = yup.object({
  numero_documento: yup.string().required('Número do documento é obrigatório'),
  nome_funcionario: yup.string().required('Nome do funcionário é obrigatório'),
  funcao: yup.string().required('Função é obrigatória'),
  setor: yup.string().required('Setor é obrigatório'),
  data_formatada_extenso: yup.string().required('Data é obrigatória'),
  codigo_infracao: yup.string().required('Código de infração é obrigatório'),
  infracao_cometida: yup.string().required('Infração cometida é obrigatória'),
  data_infracao: yup.string().required('Data da infração é obrigatória'),
  hora_infracao: yup.string().required('Hora da infração é obrigatória'),
  penalidade: yup.string().required('Penalidade é obrigatória'),
  penalidade_aplicada: yup.string().required('Descrição da penalidade é obrigatória'),
  nome_lider: yup.string().required('Nome do líder é obrigatório'),
  // Campos opcionais
  texto_excesso: yup.string(),
  texto_limite: yup.string(),
  // Array de evidências
  evidencias: yup.array().of(
    yup.object().shape({
      url: yup.string().required('URL da evidência é obrigatória')
    })
  )
});

export default function TratativaForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evidencias, setEvidencias] = useState([{ url: '' }]);
  
  const { register, handleSubmit, formState: { errors }, setValue } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      evidencias: [{ url: '' }]
    }
  });
  
  // Adicionar campo de evidência
  const addEvidencia = () => {
    setEvidencias([...evidencias, { url: '' }]);
    setValue('evidencias', [...evidencias, { url: '' }]);
  };
  
  // Remover campo de evidência
  const removeEvidencia = (index) => {
    if (evidencias.length > 1) {
      const newEvidencias = evidencias.filter((_, i) => i !== index);
      setEvidencias(newEvidencias);
      setValue('evidencias', newEvidencias);
    }
  };
  
  // Processar upload de imagem (convertendo para URL ou base64)
  const handleImageUpload = async (e, index) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // Converter para URL ou base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const newEvidencias = [...evidencias];
        newEvidencias[index].url = reader.result;
        setEvidencias(newEvidencias);
        setValue(`evidencias[${index}].url`, reader.result);
      };
    } catch (error) {
      toast.error('Erro ao processar imagem');
      console.error(error);
    }
  };
  
  // Enviar formulário
  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      // Chama a API para criar a tratativa e gerar o PDF
      const response = await tratativaService.createTratativa(data);
      
      toast.success('Tratativa criada com sucesso!');
      
      // Redireciona para a página de detalhes da tratativa
      router.push(`/tratativas/${response.tratativa_id}`);
    } catch (error) {
      toast.error(`Erro ao criar tratativa: ${error.response?.data?.message || error.message}`);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Detalhes do Funcionário */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Dados do Funcionário</h3>
          
          <div>
            <label htmlFor="numero_documento">Número do Documento</label>
            <input
              id="numero_documento"
              type="text"
              {...register('numero_documento')}
              className="w-full p-2 border rounded"
            />
            {errors.numero_documento && (
              <p className="text-red-500 text-sm">{errors.numero_documento.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="nome_funcionario">Nome do Funcionário</label>
            <input
              id="nome_funcionario"
              type="text"
              {...register('nome_funcionario')}
              className="w-full p-2 border rounded"
            />
            {errors.nome_funcionario && (
              <p className="text-red-500 text-sm">{errors.nome_funcionario.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="funcao">Função</label>
            <input
              id="funcao"
              type="text"
              {...register('funcao')}
              className="w-full p-2 border rounded"
            />
            {errors.funcao && (
              <p className="text-red-500 text-sm">{errors.funcao.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="setor">Setor</label>
            <input
              id="setor"
              type="text"
              {...register('setor')}
              className="w-full p-2 border rounded"
            />
            {errors.setor && (
              <p className="text-red-500 text-sm">{errors.setor.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="data_formatada_extenso">Data por Extenso</label>
            <input
              id="data_formatada_extenso"
              type="text"
              {...register('data_formatada_extenso')}
              className="w-full p-2 border rounded"
              placeholder="24 de fevereiro de 2024"
            />
            {errors.data_formatada_extenso && (
              <p className="text-red-500 text-sm">{errors.data_formatada_extenso.message}</p>
            )}
          </div>
        </div>
        
        {/* Detalhes da Infração */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Dados da Infração</h3>
          
          <div>
            <label htmlFor="codigo_infracao">Código da Infração</label>
            <input
              id="codigo_infracao"
              type="text"
              {...register('codigo_infracao')}
              className="w-full p-2 border rounded"
            />
            {errors.codigo_infracao && (
              <p className="text-red-500 text-sm">{errors.codigo_infracao.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="infracao_cometida">Infração Cometida</label>
            <input
              id="infracao_cometida"
              type="text"
              {...register('infracao_cometida')}
              className="w-full p-2 border rounded"
            />
            {errors.infracao_cometida && (
              <p className="text-red-500 text-sm">{errors.infracao_cometida.message}</p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="data_infracao">Data da Infração</label>
              <input
                id="data_infracao"
                type="text"
                {...register('data_infracao')}
                className="w-full p-2 border rounded"
                placeholder="24/02/2024"
              />
              {errors.data_infracao && (
                <p className="text-red-500 text-sm">{errors.data_infracao.message}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="hora_infracao">Hora da Infração</label>
              <input
                id="hora_infracao"
                type="text"
                {...register('hora_infracao')}
                className="w-full p-2 border rounded"
                placeholder="09:15"
              />
              {errors.hora_infracao && (
                <p className="text-red-500 text-sm">{errors.hora_infracao.message}</p>
              )}
            </div>
          </div>
          
          <div>
            <label htmlFor="penalidade">Penalidade</label>
            <select
              id="penalidade"
              {...register('penalidade')}
              className="w-full p-2 border rounded"
            >
              <option value="">Selecione...</option>
              <option value="Advertência">Advertência</option>
              <option value="Suspensão">Suspensão</option>
              <option value="Demissão">Demissão</option>
            </select>
            {errors.penalidade && (
              <p className="text-red-500 text-sm">{errors.penalidade.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="penalidade_aplicada">Descrição da Penalidade</label>
            <textarea
              id="penalidade_aplicada"
              {...register('penalidade_aplicada')}
              className="w-full p-2 border rounded"
              rows="3"
            ></textarea>
            {errors.penalidade_aplicada && (
              <p className="text-red-500 text-sm">{errors.penalidade_aplicada.message}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="nome_lider">Nome do Líder</label>
            <input
              id="nome_lider"
              type="text"
              {...register('nome_lider')}
              className="w-full p-2 border rounded"
            />
            {errors.nome_lider && (
              <p className="text-red-500 text-sm">{errors.nome_lider.message}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Campos adicionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="texto_excesso">Texto Excesso</label>
          <input
            id="texto_excesso"
            type="text"
            {...register('texto_excesso')}
            className="w-full p-2 border rounded"
            placeholder="Tempo em excesso: 00:45:32"
          />
        </div>
        
        <div>
          <label htmlFor="texto_limite">Texto Limite</label>
          <input
            id="texto_limite"
            type="text"
            {...register('texto_limite')}
            className="w-full p-2 border rounded"
            placeholder="Limite permitido: 00:15:00"
          />
        </div>
      </div>
      
      {/* Evidências */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Evidências</h3>
          <button
            type="button"
            onClick={addEvidencia}
            className="py-1 px-3 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Adicionar Evidência
          </button>
        </div>
        
        {evidencias.map((item, index) => (
          <div key={index} className="flex items-start space-x-4">
            <div className="flex-1">
              <div className="mb-2">
                <label>Imagem {index + 1}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, index)}
                  className="w-full p-2 border rounded"
                />
              </div>
              
              {item.url && (
                <div className="relative w-40 h-40 overflow-hidden border rounded">
                  <img
                    src={item.url}
                    alt={`Evidência ${index + 1}`}
                    className="object-contain w-full h-full"
                  />
                </div>
              )}
              
              <input
                type="hidden"
                {...register(`evidencias[${index}].url`)}
                value={item.url}
              />
              
              {errors.evidencias?.[index]?.url && (
                <p className="text-red-500 text-sm">
                  {errors.evidencias[index].url.message}
                </p>
              )}
            </div>
            
            {evidencias.length > 1 && (
              <button
                type="button"
                onClick={() => removeEvidencia(index)}
                className="py-1 px-3 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Remover
              </button>
            )}
          </div>
        ))}
      </div>
      
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => router.push('/tratativas')}
          className="py-2 px-4 bg-gray-300 rounded hover:bg-gray-400"
        >
          Cancelar
        </button>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className={`py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isSubmitting ? 'Criando...' : 'Criar Tratativa'}
        </button>
      </div>
    </form>
  );
}
```

### Página de Listagem de Tratativas

Crie o arquivo `src/app/tratativas/page.jsx`:

```jsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { tratativaService } from '@/lib/services/api';
import { toast } from 'react-toastify';

export default function TratativasPage() {
  const [tratativas, setTratativas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTratativas() {
      try {
        const response = await tratativaService.listTratativas();
        setTratativas(response.tratativas || []);
      } catch (err) {
        setError('Erro ao carregar tratativas');
        toast.error('Não foi possível carregar as tratativas');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadTratativas();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-500">Erro</h2>
        <p className="mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tratativas Disciplinares</h1>
        <Link
          href="/tratativas/create"
          className="py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Nova Tratativa
        </Link>
      </div>

      {tratativas.length === 0 ? (
        <div className="text-center p-8 bg-gray-100 rounded-lg">
          <p className="text-gray-500">Nenhuma tratativa encontrada</p>
          <p className="mt-2">
            <Link
              href="/tratativas/create"
              className="text-blue-500 hover:underline"
            >
              Criar sua primeira tratativa
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tratativas.map((tratativa) => (
            <div
              key={tratativa.id}
              className="border rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="p-4">
                <h3 className="font-bold text-lg mb-2">{tratativa.numero_documento}</h3>
                <p className="text-gray-700 mb-1">
                  <span className="font-medium">Funcionário:</span> {tratativa.nome_funcionario}
                </p>
                <p className="text-gray-700 mb-1">
                  <span className="font-medium">Infração:</span> {tratativa.infracao_cometida}
                </p>
                <p className="text-gray-700 mb-1">
                  <span className="font-medium">Data:</span> {tratativa.data_infracao}
                </p>
                <p className="text-gray-700 mb-1">
                  <span className="font-medium">Penalidade:</span> {tratativa.penalidade}
                </p>
                <p className="text-gray-700 mb-3">
                  <span className="font-medium">Status:</span>{' '}
                  <span className={`px-2 py-1 rounded text-xs ${
                    tratativa.status === 'concluido'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {tratativa.status === 'concluido' ? 'Concluído' : 'Pendente'}
                  </span>
                </p>
                <div className="flex justify-between">
                  <Link
                    href={`/tratativas/${tratativa.id}`}
                    className="text-blue-500 hover:underline"
                  >
                    Ver detalhes
                  </Link>
                  {tratativa.documento_url && (
                    <a
                      href={tratativa.documento_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-500 hover:underline"
                    >
                      Visualizar PDF
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Página de Criação de Tratativa

Crie o arquivo `src/app/tratativas/create/page.jsx`:

```jsx
'use client';

import TratativaForm from '@/components/forms/TratativaForm';

export default function CreateTratativaPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Nova Tratativa Disciplinar</h1>
      <TratativaForm />
    </div>
  );
}
```

### Página de Detalhes da Tratativa

Crie o arquivo `src/app/tratativas/[id]/page.jsx`:

```jsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { tratativaService } from '@/lib/services/api';
import { toast } from 'react-toastify';

export default function TratativaDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [tratativa, setTratativa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTratativa() {
      try {
        const response = await tratativaService.getTratativa(id);
        setTratativa(response.tratativa);
      } catch (err) {
        setError('Erro ao carregar tratativa');
        toast.error('Não foi possível carregar os detalhes da tratativa');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadTratativa();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !tratativa) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-500">Erro</h2>
        <p className="mb-4">{error || 'Tratativa não encontrada'}</p>
        <button
          onClick={() => router.push('/tratativas')}
          className="py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Voltar para Lista
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <Link
          href="/tratativas"
          className="text-blue-500 hover:underline flex items-center"
        >
          ← Voltar para lista
        </Link>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl font-bold">{tratativa.numero_documento}</h1>
            <span className={`px-3 py-1 rounded text-sm ${
              tratativa.status === 'concluido'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {tratativa.status === 'concluido' ? 'Concluído' : 'Pendente'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3 border-b pb-2">Dados do Funcionário</h2>
              <div className="space-y-2">
                <p><span className="font-medium">Nome:</span> {tratativa.nome_funcionario}</p>
                <p><span className="font-medium">Função:</span> {tratativa.funcao}</p>
                <p><span className="font-medium">Setor:</span> {tratativa.setor}</p>
                <p><span className="font-medium">Data:</span> {tratativa.data_formatada}</p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3 border-b pb-2">Dados da Infração</h2>
              <div className="space-y-2">
                <p><span className="font-medium">Código:</span> {tratativa.codigo_infracao}</p>
                <p><span className="font-medium">Infração:</span> {tratativa.infracao_cometida}</p>
                <p><span className="font-medium">Data:</span> {tratativa.data_infracao}</p>
                <p><span className="font-medium">Hora:</span> {tratativa.hora_infracao}</p>
                <p><span className="font-medium">Penalidade:</span> {tratativa.penalidade}</p>
                <p><span className="font-medium">Descrição:</span> {tratativa.penalidade_aplicada}</p>
                <p><span className="font-medium">Líder:</span> {tratativa.nome_lider}</p>
              </div>
            </div>
          </div>

          {(tratativa.texto_excesso || tratativa.texto_limite) && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-3 border-b pb-2">Informações Adicionais</h2>
              <div className="space-y-2">
                {tratativa.texto_excesso && (
                  <p><span className="font-medium">Excesso:</span> {tratativa.texto_excesso}</p>
                )}
                {tratativa.texto_limite && (
                  <p><span className="font-medium">Limite:</span> {tratativa.texto_limite}</p>
                )}
              </div>
            </div>
          )}

          {tratativa.documento_url && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-3 border-b pb-2">Documento</h2>
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <a
                  href={tratativa.documento_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600 inline-flex items-center"
                >
                  Visualizar PDF
                </a>
                <p className="text-sm text-gray-500">
                  Criado em: {new Date(tratativa.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## 4. Exemplos de Requisições para Testes no Postman

### 1. Testar Conexão
```
POST https://iblogistica.ddns.net:3000/api/tratativa/test-connection
Content-Type: application/json
Body: {}
```

### 2. Criar Nova Tratativa
```
POST https://iblogistica.ddns.net:3000/api/tratativa/create
Content-Type: application/json
Body:
{
    "numero_documento": "MD-2024-003",
    "nome_funcionario": "Ana Silva",
    "funcao": "Analista Financeiro",
    "setor": "Financeiro",
    "data_formatada_extenso": "28 de fevereiro de 2024",
    "codigo_infracao": "DSC-001",
    "infracao_cometida": "Descumprimento de procedimento interno",
    "data_infracao": "28/02/2024",
    "hora_infracao": "11:20",
    "penalidade": "Advertência",
    "penalidade_aplicada": "Advertência verbal por descumprimento de procedimento",
    "nome_lider": "Carlos Supervisor",
    "evidencias": [
        {
            "url": "https://via.placeholder.com/320x400/FF5722/FFFFFF?text=Evidencia+1"
        }
    ],
    "texto_excesso": "Ocorrências: 3 vezes no mês",
    "texto_limite": "Limite tolerado: 1 vez por trimestre"
}
```

### 3. Listar Todas as Tratativas
```
GET https://iblogistica.ddns.net:3000/api/tratativa/list
```

### 4. Obter Detalhes de uma Tratativa
```
GET https://iblogistica.ddns.net:3000/api/tratativa/1
```

## 5. Fluxo da Aplicação

1. **Usuário acessa a página inicial**
   - Redireciona para `/tratativas`
   - Exibe a lista de tratativas existentes

2. **Usuário cria nova tratativa**
   - Acessa `/tratativas/create`
   - Preenche o formulário
   - Ao enviar, os dados são salvos no banco e o PDF é gerado
   - Usuário é redirecionado para a página de detalhes

3. **Usuário visualiza detalhes**
   - Acessa `/tratativas/:id`
   - Vê todas as informações e pode visualizar/baixar o PDF

4. **Usuário visualiza histórico**
   - Acessa `/tratativas`
   - Vê todas as tratativas em formato de lista/cards

## 6. Considerações para Produção

1. **Certificados SSL**
   - Certifique-se de configurar o Next.js para aceitar certificados autoassinados
   - Como você está usando HTTPS com certificado autoassinado, adicione configuração para o Axios aceitar
   - Talvez seja necessário adicionar o certificado ao repositório de certificados confiáveis do sistema

2. **Variáveis de Ambiente**
   - Para produção, altere `.env.local` para apontar para o servidor de produção usando HTTPS:
     ```
     NEXT_PUBLIC_API_URL=https://iblogistica.ddns.net:3000
     ```

3. **Deploy**
   - Recomendado usar Vercel para deploy do Next.js
   - Configure corretamente os domínios e redirecionamentos

4. **Monitoramento**
   - Adicione ferramentas de logging/monitoramento para acompanhar erros

## 7. Próximos Passos

1. Implementar autenticação (quando necessário)
2. Adicionar filtragem e busca na lista de tratativas
3. Implementar edição de tratativas
4. Criar dashboard com métricas (ex: número de tratativas por setor, por tipo, etc)
5. Melhorar design e responsividade

## 8. Comandos Úteis

### Iniciar o servidor de desenvolvimento
```bash
npm run dev
```

### Construir para produção
```bash
npm run build
```

### Iniciar em produção
```bash
npm run start
``` 