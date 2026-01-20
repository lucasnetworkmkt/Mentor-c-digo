
import { SYSTEM_INSTRUCTION } from "../constants";

async function callBackend(action: string, payload: any) {
  // URLs para tentar:
  // 1. Relativa (funciona na Netlify se Functions estiverem deployadas)
  // 2. Localhost 3001 (fallback para dev local se o proxy não estiver configurado)
  const endpoints = [
    "/.netlify/functions/chat",
    "http://localhost:3001/.netlify/functions/chat"
  ];

  let lastError;

  for (const endpoint of endpoints) {
    // Se não estiver em localhost, pular a tentativa localhost para evitar erro de Mixed Content em prod
    if (endpoint.includes("localhost") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      continue;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });

      const contentType = response.headers.get("content-type");
      
      // Verifica se é HTML (erro 404/500 padrão do servidor web)
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        // Se for 404 na Netlify, significa que a Função não existe (não foi deployada)
        if (response.status === 404 && endpoint.includes("netlify")) {
             throw new Error("Netlify Functions não encontradas. Se você fez upload manual (drag & drop), as funções backend não funcionam. Use 'netlify deploy' via CLI ou conecte ao Git.");
        }
        throw new Error(`Resposta inválida do servidor (${response.status}). Verifique o console.`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erro do Servidor: ${response.status}`);
      }

      return data; // Sucesso!

    } catch (error: any) {
      console.warn(`Tentativa em ${endpoint} falhou:`, error.message);
      lastError = error;
      // Se for erro de rede (fetch failed), tenta o próximo. Se for erro da API (500), para.
      if (error.message.includes("Netlify Functions não encontradas")) break;
    }
  }

  // Se chegou aqui, todas as tentativas falharam
  throw lastError || new Error("Não foi possível conectar ao Mentor. Verifique se o Backend está rodando.");
}

// --- PUBLIC SERVICES ---

export const getVoiceApiKey = async (): Promise<string> => {
  const data = await callBackend("get_voice_key", {});
  if (!data || !data.apiKey) throw new Error("A Netlify não retornou a chave de API.");
  return data.apiKey;
};

export const generateTextResponse = async (history: {role: string, parts: {text: string}[]}[], userMessage: string) => {
  const data = await callBackend("chat", {
    history,
    message: userMessage,
    systemInstruction: SYSTEM_INSTRUCTION
  });
  return data.text;
};

export const generateMentalMapStructure = async (topic: string) => {
  const data = await callBackend("mental_map", { topic });
  return data.text;
};
