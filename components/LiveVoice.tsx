
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Radio, StopCircle, AlertCircle, ShieldAlert, Loader2 } from 'lucide-react';
import { SYSTEM_INSTRUCTION } from '../constants';
import { getVoiceApiKey } from '../services/geminiService';

const LiveVoice: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Audio Context Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    return () => stopSession();
  }, []);

  const stopSession = () => {
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close().catch(() => {});
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close().catch(() => {});
        outputAudioContextRef.current = null;
    }
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    
    setIsActive(false);
    setIsSpeaking(false);
    setStatus('disconnected');
    
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
  };

  const attemptConnection = async (retryCount = 0) => {
    try {
      // 1. Check HTTPS
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
          throw new Error("HTTPS é obrigatório para voz.");
      }

      // Timeout Safety: Se não conectar em 10s, abortar
      connectionTimeoutRef.current = setTimeout(() => {
         if (status === 'connecting') {
             console.error("Timeout de conexão");
             setStatus('error');
             setErrorMsg("Tempo limite excedido. Tente novamente.");
             stopSession();
         }
      }, 10000);

      // 2. Fetch Key (Testing Connection)
      const apiKey = await getVoiceApiKey().catch(e => {
        throw new Error(`Falha no Backend: ${e.message}`);
      });
      
      if (!apiKey) throw new Error("Backend não retornou chave de API.");

      // 3. Setup Client
      const ai = new GoogleGenAI({ apiKey });
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
              channelCount: 1,
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: true
          } 
      });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nNOTA: Você está falando com o aluno. Use uma voz masculina firme (Puck). Seja direto e interativo.",
        },
        callbacks: {
          onopen: () => {
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            setStatus('connected');
            setIsActive(true);
            setErrorMsg('');
            
            if (!inputAudioContextRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                  try {
                    session.sendRealtimeInput({ media: pcmBlob });
                  } catch (e) {
                    console.warn("Send input failed", e);
                  }
              });
            };
            
            const gainNode = inputAudioContextRef.current.createGain();
            gainNode.gain.value = 0;
            source.connect(processor);
            processor.connect(gainNode);
            gainNode.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
             const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current) {
                setIsSpeaking(true);
                const ctx = outputAudioContextRef.current;
                
                if (ctx.state === 'suspended') await ctx.resume();

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                try {
                    const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(ctx.destination);
                    source.addEventListener('ended', () => {
                        sourcesRef.current.delete(source);
                        if (sourcesRef.current.size === 0) setIsSpeaking(false);
                    });
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(source);
                } catch (e) {
                    console.error("Decode error", e);
                }
             }
          },
          onclose: () => {
            console.log("Session closed");
            stopSession();
          },
          onerror: (err) => {
            console.error("Live Error:", err);
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            if (retryCount < 1) {
               setTimeout(() => attemptConnection(retryCount + 1), 1000);
            } else {
               setStatus('error');
               setErrorMsg("Conexão perdida.");
               stopSession();
            }
          }
        }
      });
      sessionRef.current = sessionPromise;

    } catch (error: any) {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      console.error("Connection failed:", error);
      setStatus('error');
      setErrorMsg(error.message || "Erro de Conexão.");
    }
  };

  const startSession = () => {
     setStatus('connecting');
     setErrorMsg('');
     attemptConnection();
  };

  // --- Helpers ---
  function createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return { data: b64, mimeType: 'audio/pcm;rate=16000' };
  }

  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#0A0A0A] text-white p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter text-[#E50914] uppercase mb-2">Comando de Voz</h2>
          <p className="text-[#9FB4C7]">Interação em tempo real. Sem atrasos. Direção imediata.</p>
        </div>

        <div className={`relative w-48 h-48 mx-auto flex items-center justify-center rounded-full border-4 transition-all duration-300 
          ${isActive ? (isSpeaking ? 'border-[#E50914] scale-110 shadow-[0_0_80px_rgba(229,9,20,0.6)]' : 'border-[#E50914] shadow-[0_0_50px_rgba(229,9,20,0.3)]') : status === 'error' ? 'border-red-900' : 'border-[#333]'}`}>
           {status === 'connecting' ? (
             <div className="flex flex-col items-center">
                <Loader2 className="animate-spin text-[#E50914] mb-2" size={32} />
                <span className="text-[#E50914] text-xs font-mono uppercase tracking-widest">Conectando...</span>
             </div>
           ) : status === 'error' ? (
             <ShieldAlert size={48} className="text-red-700" />
           ) : isActive ? (
             <div className="flex gap-1 items-end h-16">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className={`w-3 bg-[#E50914] animate-pulse`} 
                      style={{
                        height: isSpeaking ? `${Math.random() * 100}%` : '20%', 
                        animationDuration: isSpeaking ? `${0.2 + Math.random() * 0.3}s` : '1.5s'
                      }} 
                    />
                ))}
             </div>
           ) : (
             <MicOff size={48} className="text-[#555]" />
           )}
        </div>

        {status === 'error' && (
           <div className="text-red-500 font-bold bg-red-900/20 p-4 rounded border border-red-900/50 flex flex-col items-center gap-2 justify-center text-center">
              <div className="flex items-center gap-2">
                 <AlertCircle size={20} />
                 <span className="text-sm uppercase tracking-wider">{errorMsg}</span>
              </div>
              {errorMsg.includes("Backend") && (
                 <span className="text-[10px] font-mono text-red-300">Verifique se o server.js está rodando (Porta 3001) ou se a Function da Netlify está ativa.</span>
              )}
           </div>
        )}

        <div className="flex justify-center gap-4">
          {!isActive ? (
            <button 
              onClick={startSession}
              disabled={status === 'connecting'}
              className="bg-[#E50914] hover:bg-red-700 text-white px-8 py-4 rounded-full font-bold uppercase tracking-widest flex items-center gap-3 transition-all shadow-[0_0_20px_rgba(229,9,20,0.3)] disabled:opacity-50"
            >
              <Radio size={24} />
              Iniciar Sessão
            </button>
          ) : (
            <button 
              onClick={stopSession}
              className="bg-[#333] hover:bg-[#222] text-white border border-[#555] px-8 py-4 rounded-full font-bold uppercase tracking-widest flex items-center gap-3 transition-all"
            >
              <StopCircle size={24} />
              Encerrar
            </button>
          )}
        </div>
        
        {isActive && (
           <div className="space-y-1">
             <p className="text-xs text-[#555] font-mono uppercase">Microfone Ativo • Latência Baixa</p>
             <p className="text-[10px] text-[#E50914] font-bold uppercase tracking-widest">
               {isSpeaking ? 'O MENTOR ESTÁ FALANDO' : 'AGUARDANDO COMANDO...'}
             </p>
           </div>
        )}
      </div>
    </div>
  );
};

export default LiveVoice;
