
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: '*', 
    methods: ['POST', 'GET', 'OPTIONS']
}));

app.use(express.json());

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter((key) => !!key);

const getClient = (apiKey) => new GoogleGenAI({ apiKey });

async function executeWithFallback(operation) {
  if (API_KEYS.length === 0) {
     throw new Error("Nenhuma API Key encontrada no arquivo .env (GEMINI_API_KEY_1)");
  }
  let lastError = null;
  for (const apiKey of API_KEYS) {
    try {
      return await operation(apiKey);
    } catch (error) {
      console.error(`Chave falhou: ...${apiKey.slice(-4)}`);
      lastError = error;
      if (error?.status === 400) throw error;
    }
  }
  throw new Error(`Serviço Indisponível. Erro: ${lastError?.message}`);
}

app.post('/.netlify/functions/chat', async (req, res) => {
    try {
        const { action, payload } = req.body;
        console.log(`[Request] Action: ${action}`);

        if (action === "chat") {
            const { history, message, systemInstruction } = payload;
            const responseText = await executeWithFallback(async (apiKey) => {
                const ai = getClient(apiKey);
                const contents = [...history, { role: 'user', parts: [{ text: message }] }];
                
                // Usando modelo rápido para garantir resposta imediata
                const response = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: contents,
                    config: {
                        systemInstruction: systemInstruction,
                        temperature: 0.7,
                    }
                });
                return response.text;
            });
            return res.json({ text: responseText });
        }

        if (action === "mental_map") {
            const { topic } = payload;
            const prompt = `Crie um MAPA MENTAL ESTRUTURADO em formato de ÁRVORE DE TEXTO (ASCII) sobre: "${topic}". Regras: Use ├──, └──, │. Sem markdown blocks. Estilo Hacker.`;
            
            const mapText = await executeWithFallback(async (apiKey) => {
                const ai = getClient(apiKey);
                const response = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: { parts: [{ text: prompt }] }
                });
                return response.text;
            });
            return res.json({ text: mapText });
        }

        if (action === "get_voice_key") {
            const key = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
            return res.json({ apiKey: key });
        }

        return res.status(400).json({ error: "Ação desconhecida" });

    } catch (error) {
        console.error("Erro no Servidor:", error);
        res.status(500).json({ error: error.message || "Erro Interno" });
    }
});

app.get('/', (req, res) => {
    res.send('Mentor Backend Online. Endpoint ativo: /.netlify/functions/chat');
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse o frontend em outro terminal.`);
});
