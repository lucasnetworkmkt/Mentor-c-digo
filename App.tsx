
import React, { useState, useEffect, useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import LiveVoice from './components/LiveVoice';
import MentalMap from './components/MentalMap';
import ExecutionTimer from './components/ExecutionTimer';
import ChatHistory from './components/ChatHistory';
import EagleEmblem from './components/EagleEmblem';
import ProgressionModal from './components/ProgressionModal';
import { AppView, UserStats, TimerState, ChatSession, Message, UserProfile } from './types';
import { MessageSquare, Mic, Map, Timer, Menu, X, Terminal, Trophy, Star, Zap, Clock, LogIn, Lock, UserPlus, Mail, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { INITIAL_MESSAGE } from './constants';
import { authService } from './services/authService';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [progressionModalOpen, setProgressionModalOpen] = useState(false);
  
  // --- Auth State ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Added confirm password
  const [name, setName] = useState('');

  // --- Auth Handlers ---
  
  // Check session on mount
  useEffect(() => {
    const initSession = async () => {
      const session = await authService.getSession();
      if (session) {
        setUser(session);
        setCurrentView(AppView.CHAT);
      }
    };
    initSession();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    setAuthLoading(true);

    try {
      // Basic Validation
      if (!email.includes('@')) throw new Error('Formato de e-mail inválido.');
      if (password.length < 6) throw new Error('A senha deve ter no mínimo 6 caracteres.');

      let profile: UserProfile;

      if (authMode === 'LOGIN') {
        profile = await authService.login(email, password);
      } else {
        // Register Validation
        if (!name.trim()) throw new Error("O Codinome é obrigatório.");
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");
        
        profile = await authService.register(name, email, password);
        setAuthSuccessMsg("Conta criada com sucesso. Iniciando...");
      }
      
      // Artificial delay for UX
      setTimeout(() => {
          setUser(profile);
          setCurrentView(AppView.CHAT);
          // Clear forms
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setName('');
      }, 500);

    } catch (err: any) {
      setAuthError(err.message || "Erro desconhecido.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setCurrentView(AppView.LOGIN);
    setSidebarOpen(false);
    // Reset Data States to prevent flashing old data
    setSessions([]);
    setUserStats({ userId: '', points: 0, level: 1, streak: 0, achievements: [] });
  };

  // --- Data Loading Logic (Scoped by userId) ---
  
  // Helper to load data only when user is present
  const loadUserData = <T,>(userId: string, key: string, defaultVal: T): T => {
    const saved = localStorage.getItem(`mentor_data_${userId}_${key}`);
    try {
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error(`Error loading ${key}`, e); }
    return defaultVal;
  };

  const saveUserData = (userId: string, key: string, data: any) => {
    localStorage.setItem(`mentor_data_${userId}_${key}`, JSON.stringify(data));
  };

  // State Declarations
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [userStats, setUserStats] = useState<UserStats>({ userId: '', points: 0, level: 1, streak: 0, achievements: [] });
  const [timer, setTimer] = useState<TimerState>({ minutes: 25, seconds: 0, isActive: false, mode: 'FOCUS', deliverable: '' });

  // Load Data Effect (Runs whenever user changes)
  useEffect(() => {
    if (!user) return;

    // Load Sessions
    const loadedSessions = loadUserData<ChatSession[]>(user.id, 'sessions', [{
      id: Date.now().toString(),
      title: 'Sessão Inicial',
      messages: [{ id: 'init', role: 'model', text: INITIAL_MESSAGE, timestamp: new Date() }],
      lastModified: new Date()
    }]);
    
    // Fix Dates from JSON
    const parsedSessions = loadedSessions.map(s => ({
        ...s,
        lastModified: new Date(s.lastModified),
        messages: s.messages.map(m => ({...m, timestamp: new Date(m.timestamp)}))
    }));
    
    setSessions(parsedSessions);
    setActiveSessionId(parsedSessions[0].id);

    // Load Stats
    const loadedStats = loadUserData<UserStats>(user.id, 'stats', {
      userId: user.id,
      points: 0,
      level: 1,
      streak: 0,
      achievements: []
    });
    setUserStats(loadedStats);

  }, [user]);

  // Persistence Effects
  useEffect(() => {
    if (user && sessions.length > 0) saveUserData(user.id, 'sessions', sessions);
  }, [sessions, user]);

  useEffect(() => {
    if (user) saveUserData(user.id, 'stats', userStats);
  }, [userStats, user]);


  // --- Logic Functions ---

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Nova Estratégia',
      messages: [{ id: 'init', role: 'model', text: INITIAL_MESSAGE, timestamp: new Date() }],
      lastModified: new Date()
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setCurrentView(AppView.CHAT);
    setSidebarOpen(false);
  };

  const updateSession = (updatedSession: ChatSession) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  };

  const getActiveSession = () => {
    // SAFEGUARD: If sessions haven't loaded yet (race condition on login), return a dummy session
    if (sessions.length === 0) {
        return {
            id: 'loading',
            title: 'Carregando...',
            messages: [],
            lastModified: new Date()
        };
    }
    return sessions.find(s => s.id === activeSessionId) || sessions[0];
  };

  const addPoints = (amount: number, reason?: string) => {
    if (amount <= 0) return;
    setUserStats(prev => {
      const newPoints = Math.min(prev.points + amount, 10000);
      const newLevel = Math.floor(newPoints / 500) + 1;
      const newAchievements = [...prev.achievements];
      
      if (newPoints >= 500 && !newAchievements.find(a => a.id === 'milestone_500')) {
        newAchievements.push({
          id: 'milestone_500',
          title: 'Primeira Quebra',
          description: 'Atingiu 500 pontos. Você saiu da inércia.',
          icon: '🥉',
          unlockedAt: new Date()
        });
      }
      return { ...prev, points: newPoints, level: newLevel, achievements: newAchievements };
    });
  };

  const updateTimer = (newState: Partial<TimerState>) => {
    setTimer(prev => ({ ...prev, ...newState }));
  };

  // Timer Interval
  useEffect(() => {
    let interval: any = null;
    if (timer.isActive) {
      interval = setInterval(() => {
        setTimer(prev => {
          if (prev.seconds === 0) {
            if (prev.minutes === 0) {
              clearInterval(interval);
              const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
              audio.play().catch(() => {});
              return { ...prev, isActive: false };
            }
            return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
          }
          return { ...prev, seconds: prev.seconds - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer.isActive]);


  // --- Render Helpers ---

  const renderView = () => {
    switch (currentView) {
      case AppView.CHAT:
        return (
          <ChatInterface 
            activeSession={getActiveSession()}
            onUpdateSession={updateSession}
            onAwardPoints={addPoints}
          />
        );
      case AppView.VOICE:
        return <LiveVoice />;
      case AppView.MAPS:
        return <MentalMap />;
      case AppView.TIMER:
        return (
          <ExecutionTimer 
            timer={timer}
            updateTimer={updateTimer}
            onComplete={addPoints}
          />
        );
      case AppView.HISTORY:
        return (
          <ChatHistory 
            sessions={sessions}
            currentSessionId={activeSessionId}
            onSelectSession={(id) => {
              setActiveSessionId(id);
              setCurrentView(AppView.CHAT);
            }}
            onNewChat={createNewSession}
            userPoints={userStats.points}
          />
        );
      default:
        return null;
    }
  };

  const NavItem = ({ view, icon: Icon, label }: { view: AppView, icon: any, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSidebarOpen(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all uppercase tracking-wider text-sm font-bold ${
        currentView === view 
          ? 'bg-[#E50914] text-white shadow-[0_0_15px_rgba(229,9,20,0.3)]' 
          : 'text-[#9FB4C7] hover:bg-[#1a1a1a] hover:text-white'
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
      {view === AppView.TIMER && timer.isActive && (
        <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </button>
  );

  // --- LOGIN VIEW ---
  if (currentView === AppView.LOGIN) {
    return (
      <div className="flex h-[100dvh] bg-[#0A0A0A] items-center justify-center p-6 text-white overflow-hidden relative">
         {/* Background Eagle */}
         <div className="absolute opacity-5 pointer-events-none scale-150">
            <EagleEmblem points={10000} size="xl" />
         </div>

         <div className="max-w-md w-full bg-[#111] border border-[#333] rounded-2xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 backdrop-blur-md">
            
            {/* Header */}
            <div className="text-center mb-8">
               <div className="w-16 h-16 bg-[#E50914] rounded-full mx-auto flex items-center justify-center shadow-[0_0_20px_#E50914] mb-4">
                  <Terminal size={32} className="text-white" />
               </div>
               <h1 className="text-2xl font-bold uppercase tracking-widest">Acesso ao Mentor</h1>
               <p className="text-[#9FB4C7] text-sm mt-2">Identidade Verificada & Dados Persistentes</p>
            </div>

            {/* Error Message */}
            {authError && (
              <div className="mb-6 bg-red-900/20 border border-red-900/50 p-3 rounded flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="text-red-500 shrink-0" size={16} />
                <p className="text-xs text-red-200">{authError}</p>
              </div>
            )}

            {/* Success Message */}
            {authSuccessMsg && (
              <div className="mb-6 bg-green-900/20 border border-green-900/50 p-3 rounded flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="text-green-500 shrink-0" size={16} />
                <p className="text-xs text-green-200">{authSuccessMsg}</p>
              </div>
            )}

            {/* Toggle Tabs */}
            <div className="flex bg-[#050505] rounded-lg p-1 mb-6 border border-[#333]">
              <button 
                onClick={() => { setAuthMode('LOGIN'); setAuthError(''); setAuthSuccessMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all ${authMode === 'LOGIN' ? 'bg-[#333] text-white shadow' : 'text-[#555] hover:text-[#9FB4C7]'}`}
              >
                Login
              </button>
              <button 
                onClick={() => { setAuthMode('REGISTER'); setAuthError(''); setAuthSuccessMsg(''); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all ${authMode === 'REGISTER' ? 'bg-[#E50914] text-white shadow' : 'text-[#555] hover:text-[#9FB4C7]'}`}
              >
                Criar Conta
              </button>
            </div>

            {/* AUTH FORM */}
            <form onSubmit={handleAuthSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
               
               {/* Register Name Field */}
               {authMode === 'REGISTER' && (
                 <div>
                    <label className="block text-[10px] font-mono text-[#9FB4C7] uppercase mb-1 ml-1">Como devemos chamá-lo?</label>
                    <div className="relative">
                      <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" size={18} />
                      <input 
                        type="text" 
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Seu Codinome"
                        className="w-full bg-[#050505] border border-[#333] rounded-lg py-4 pl-12 pr-4 text-white placeholder-[#333] focus:outline-none focus:border-[#E50914] focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all font-mono"
                        required
                        disabled={authLoading}
                      />
                    </div>
                 </div>
               )}

               {/* Email Field */}
               <div>
                  <label className="block text-[10px] font-mono text-[#9FB4C7] uppercase mb-1 ml-1">E-mail de Acesso</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" size={18} />
                    <input 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full bg-[#050505] border border-[#333] rounded-lg py-4 pl-12 pr-4 text-white placeholder-[#333] focus:outline-none focus:border-[#E50914] focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all font-mono"
                      required
                      autoFocus
                      disabled={authLoading}
                    />
                  </div>
               </div>

               {/* Password Field */}
               <div>
                  <label className="block text-[10px] font-mono text-[#9FB4C7] uppercase mb-1 ml-1">Senha Segura</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" size={18} />
                    <input 
                      type="password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#050505] border border-[#333] rounded-lg py-4 pl-12 pr-4 text-white placeholder-[#333] focus:outline-none focus:border-[#E50914] focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all font-mono"
                      required
                      minLength={6}
                      disabled={authLoading}
                    />
                  </div>
               </div>

               {/* Confirm Password Field (REGISTER ONLY) */}
               {authMode === 'REGISTER' && (
                 <div>
                    <label className="block text-[10px] font-mono text-[#9FB4C7] uppercase mb-1 ml-1">Confirme a Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" size={18} />
                      <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full bg-[#050505] border rounded-lg py-4 pl-12 pr-4 text-white placeholder-[#333] focus:outline-none focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all font-mono ${
                            confirmPassword && password !== confirmPassword 
                            ? 'border-red-500 focus:border-red-500' 
                            : 'border-[#333] focus:border-[#E50914]'
                        }`}
                        required
                        minLength={6}
                        disabled={authLoading}
                      />
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                        <p className="text-red-500 text-[10px] mt-1 ml-1 font-mono">As senhas não coincidem.</p>
                    )}
                 </div>
               )}

               <button 
                 type="submit"
                 disabled={authLoading || (authMode === 'REGISTER' && password !== confirmPassword)}
                 className="w-full bg-[#333] hover:bg-[#E50914] hover:shadow-[0_0_20px_rgba(229,9,20,0.4)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-4"
               >
                 {authLoading ? (
                   <Loader2 className="animate-spin" size={20} />
                 ) : (
                   <>
                     {authMode === 'LOGIN' ? <LogIn size={18} /> : <UserPlus size={18} />}
                     {authMode === 'LOGIN' ? 'Acessar Sistema' : 'Registrar Identidade'}
                   </>
                 )}
               </button>
            </form>

            <div className="mt-8 text-center border-t border-[#333] pt-4">
               <p className="text-[10px] text-[#555] uppercase font-mono flex items-center justify-center gap-2">
                  <Lock size={10} /> Segurança: Salted SHA-256 (Local)
               </p>
            </div>
         </div>
      </div>
    );
  }

  // --- APP VIEW ---
  return (
    <div className="flex h-[100dvh] bg-[#0A0A0A] overflow-hidden font-sans text-white">
      <ProgressionModal 
        isOpen={progressionModalOpen} 
        onClose={() => setProgressionModalOpen(false)} 
        currentPoints={userStats.points} 
      />

      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-30 w-72 bg-[#050505] border-r border-[#9FB4C7]/20 transform transition-transform duration-300 ease-in-out flex flex-col h-full
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-[#9FB4C7]/20 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-[#E50914] rounded flex items-center justify-center shadow-[0_0_15px_#E50914]">
            <Terminal className="text-white" size={24} />
          </div>
          <div>
             <h1 className="text-white font-bold tracking-tighter uppercase leading-none text-lg">O Mentor</h1>
             <span className="text-[#FFD700] text-[10px] font-mono tracking-widest uppercase truncate max-w-[150px] block" title={user?.email || ''}>
               {user?.name.split(' ')[0] || 'Usuário'}
             </span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden ml-auto text-[#9FB4C7]">
            <X size={24} />
          </button>
        </div>

        {/* User Stats Widget */}
        <div 
          onClick={() => setProgressionModalOpen(true)}
          className="p-4 mx-4 mt-4 bg-[#111] border border-[#9FB4C7]/20 rounded-lg shrink-0 relative overflow-hidden cursor-pointer group hover:border-[#E50914]/50 transition-all active:scale-95"
        >
           <div className="absolute -right-4 -bottom-4 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity">
              <EagleEmblem points={userStats.points} size="lg" />
           </div>

           <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                  <span className="text-xs text-[#9FB4C7] uppercase font-mono block group-hover:text-[#E50914] transition-colors">Patente</span>
                  <span className="text-white font-bold uppercase tracking-wider text-sm">
                    {userStats.points < 500 ? "Iniciado" : 
                     userStats.points < 2500 ? "Aprendiz" :
                     userStats.points < 5000 ? "Praticante" :
                     userStats.points < 10000 ? "Dominante" : "Lenda"}
                  </span>
              </div>
              <div className="bg-black/40 rounded-full p-1 border border-[#333] group-hover:border-[#E50914] transition-colors">
                 <EagleEmblem points={userStats.points} size="sm" />
              </div>
           </div>

           <div className="flex justify-between items-end mb-2 relative z-10">
              <span className="text-xs text-[#9FB4C7] uppercase font-mono">Nível {userStats.level}</span>
              <div className="flex items-center gap-1 text-[#FFD700]">
                 <Trophy size={14} />
                 <span className="font-bold text-sm">{userStats.points} PTS</span>
              </div>
           </div>
           
           <div className="w-full bg-[#333] h-1.5 rounded-full overflow-hidden relative z-10">
              <div 
                className="bg-[#E50914] h-full transition-all duration-500" 
                style={{ width: `${(userStats.points % 500) / 5}%` }}
              />
           </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333]">
          <div className="text-[10px] font-bold text-[#555] px-4 py-2 uppercase tracking-widest mb-1">Comando Central</div>
          <NavItem view={AppView.CHAT} icon={MessageSquare} label="Direção (Chat)" />
          <NavItem view={AppView.VOICE} icon={Mic} label="Ao Vivo (Voz)" />
          
          <div className="text-[10px] font-bold text-[#555] px-4 py-2 uppercase tracking-widest mb-1 mt-6">Ferramentas</div>
          <NavItem view={AppView.HISTORY} icon={Clock} label="Histórico" />
          <NavItem view={AppView.MAPS} icon={Map} label="Mapas Mentais" />
          <NavItem view={AppView.TIMER} icon={Timer} label="Execução" />
        </nav>

        <div className="p-6 border-t border-[#9FB4C7]/20 shrink-0">
           <button onClick={handleLogout} className="w-full text-center text-[#555] hover:text-white text-xs font-mono uppercase mb-2 flex items-center justify-center gap-2">
              <Lock size={10} /> Encerrar Sessão
           </button>
           <div className="bg-[#0A0A0A] rounded p-3 border border-[#9FB4C7]/10 flex flex-col items-center gap-2">
              <Zap size={16} className="text-[#FFD700]" />
              <p className="text-[#9FB4C7] text-[10px] text-center font-mono uppercase">
                 "A dor passa. A honra fica."
              </p>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative w-full overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden p-4 bg-[#050505] border-b border-[#9FB4C7]/20 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-2">
              <Terminal className="text-[#E50914]" size={20} />
              <span className="text-white font-bold uppercase tracking-wider">O Mentor</span>
           </div>
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-1 text-[#FFD700] text-xs font-bold">
                 <Star size={12} fill="#FFD700" /> {userStats.points}
             </div>
             <button onClick={() => setSidebarOpen(true)} className="text-white">
               <Menu size={24} />
             </button>
           </div>
        </div>

        <main className="flex-1 overflow-hidden relative">
           {user ? renderView() : null}
        </main>
      </div>
    </div>
  );
};

export default App;
