import { NextResponse } from 'next/server';
import https from 'https';

const agent = new https.Agent({
    rejectUnauthorized: false // Ignora certificado auto-assinado
});

export async function POST(req: Request) {
    try {
        const data = await req.json();
        
        const response = await fetch('https://159.112.182.31:3000/api/tratativa/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            // @ts-ignore
            agent
        });

        const result = await response.json();
        return NextResponse.json(result);
    } catch (error) {
        console.error('Erro:', error);
        return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 500 });
    }
} 