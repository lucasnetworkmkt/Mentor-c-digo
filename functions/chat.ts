
import { GoogleGenAI } from "@google/genai";

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter((key) => !!key && key.trim() !== "");

const getClient = (apiKey) => new GoogleGenAI({ apiKey });

async function executeWithFallback(operation) {
  if (API_KEYS.length === 0) {
    throw new Error("No API keys configured. Adicione GEMINI_API_KEY_1 nas variáveis de ambiente da Netlify.");
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

export const handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    const { action, payload } = JSON.parse(event.body);

    if (action === "chat") {
      const { history, message, systemInstruction } = payload;
      
      const responseText = await executeWithFallback(async (apiKey) => {
        const ai = getClient(apiKey);
        const contents = [
          ...history,
          { role: 'user', parts: [{ text: message }] }
        ];

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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: responseText }),
      };
    }

    if (action === "mental_map") {
      const { topic } = payload;
      const prompt = `
      Crie um MAPA MENTAL ESTRUTURADO em formato de ÁRVORE DE TEXTO (ASCII) sobre: "${topic}".
      Regras: Use ├──, └──, │. Sem markdown blocks (apenas texto puro). Estilo Hacker/Terminal.
      Limite a profundidade para garantir clareza.
      `;

      const mapText = await executeWithFallback(async (apiKey) => {
        const ai = getClient(apiKey);
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: { parts: [{ text: prompt }] }
        });
        return response.text;
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: mapText }),
      };
    }

    if (action === "get_voice_key") {
        if (API_KEYS.length === 0) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: "No API keys configured" }) };
        }
        const key = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ apiKey: key })
        };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Ação desconhecida" }) };

  } catch (error) {
    console.error("Erro na Function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};
