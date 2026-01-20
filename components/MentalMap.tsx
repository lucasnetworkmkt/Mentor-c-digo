
import React, { useState } from 'react';
import { generateMentalMapStructure } from '../services/geminiService';
import { Network, Loader2, Copy, Terminal } from 'lucide-react';

const MentalMap: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [mapContent, setMapContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setMapContent(null);
    try {
      const textMap = await generateMentalMapStructure(topic);
      setMapContent(textMap || "Falha ao gerar estrutura.");
    } catch (e) {
      console.error(e);
      setMapContent("ERRO: Sistema indisponível. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (mapContent) {
      navigator.clipboard.writeText(mapContent);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] p-6 overflow-y-auto text-white">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider flex items-center justify-center gap-2">
            <Network className="text-[#E50914]" />
            Estruturas de Comando
          </h2>
          <p className="text-[#9FB4C7] text-sm">Arquitetura tática em formato de texto.</p>
        </div>

        <div className="flex gap-2">
           <input 
             type="text" 
             value={topic}
             onChange={(e) => setTopic(e.target.value)}
             placeholder="Ex: Rotina Matinal, Plano de Vendas..."
             className="flex-1 bg-[#1a1a1a] border border-[#333] text-white p-4 rounded-lg focus:outline-none focus:border-[#E50914] placeholder-[#555]"
           />
           <button 
             onClick={handleGenerate}
             disabled={loading || !topic}
             className="bg-[#E50914] hover:bg-red-700 disabled:opacity-50 text-white px-6 rounded-lg font-bold uppercase tracking-wide min-w-[120px] flex items-center justify-center shadow-[0_0_10px_rgba(229,9,20,0.3)]"
           >
             {loading ? <Loader2 className="animate-spin" /> : 'Gerar'}
           </button>
        </div>

        <div className="bg-[#050505] border border-[#333] rounded-xl min-h-[400px] flex flex-col relative overflow-hidden shadow-inner">
          <div className="bg-[#111] p-3 border-b border-[#333] flex justify-between items-center">
             <div className="flex items-center gap-2">
                <Terminal size={14} className="text-[#E50914]" />
                <span className="text-xs text-[#555] font-mono uppercase">TERMINAL DE ESTRUTURA</span>
             </div>
             {mapContent && (
                <button onClick={copyToClipboard} className="text-[#9FB4C7] hover:text-white transition-colors">
                   <Copy size={16} />
                </button>
             )}
          </div>

          <div className="flex-1 p-6 font-mono text-sm leading-relaxed overflow-auto scrollbar-thin scrollbar-thumb-[#333]">
             {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-[#E50914]">
                   <Loader2 className="animate-spin" size={32} />
                   <div className="text-xs animate-pulse uppercase">Compilando Estrutura...</div>
                </div>
             ) : mapContent ? (
                <pre className="text-[#FFD700] whitespace-pre-wrap">{mapContent}</pre>
             ) : (
                <div className="h-full flex items-center justify-center text-[#333] uppercase text-2xl font-bold select-none">
                   Aguardando Input
                </div>
             )}
          </div>
        </div>
        
        <div className="text-xs text-[#555] text-center font-mono">
           PROCESSAMENTO VIA GEMINI GROUP C
        </div>
      </div>
    </div>
  );
};

export default MentalMap;
