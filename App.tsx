
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer, XAxis, Tooltip, ReferenceLine } from 'recharts';
import { ShieldAlert, Activity, Eye, Mic, Power, Cpu, ScanLine, Fingerprint, Lock, Ear, ShieldCheck, AlertTriangle, Radio } from 'lucide-react';
import { geminiLive } from './services/geminiLiveService';
import { LogEntry, SessionStatus, BiometricData } from './types';
import { Panel, Button } from './components/HolographicComponents';

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [biometrics, setBiometrics] = useState<BiometricData>({ heartRate: 75, stressLevel: 15, pupilDilation: 3.2 });
  const [lieProbability, setLieProbability] = useState<number>(0);
  const [history, setHistory] = useState<{time: number, value: number}[]>([]);
  const [lastAnalysis, setLastAnalysis] = useState<string>('系统待机...');
  const [inputVolume, setInputVolume] = useState<number>(0);
  
  // Visual states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Derived state
  const isDanger = lieProbability > 75;
  const isSuspicious = lieProbability >= 50 && lieProbability <= 75;
  const isTruth = lieProbability < 50 && status === SessionStatus.ACTIVE && lastAnalysis !== '系统待机...';

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Biometrics simulation
  useEffect(() => {
    if (status !== SessionStatus.ACTIVE) return;

    const interval = setInterval(() => {
      setBiometrics(prev => {
        const stressFactor = lieProbability / 100;
        return {
          heartRate: Math.max(60, Math.min(180, prev.heartRate + (Math.random() - 0.5) * 5 + (stressFactor * 5))),
          stressLevel: Math.max(0, Math.min(100, (stressFactor * 80) + (Math.random() * 20))),
          pupilDilation: Math.max(2, Math.min(8, prev.pupilDilation + (Math.random() - 0.5) * 0.5)),
        };
      });
      
      setHistory(prev => {
        const newHistory = [...prev, { time: Date.now(), value: lieProbability }];
        if (newHistory.length > 50) newHistory.shift();
        return newHistory;
      });

    }, 1000);
    return () => clearInterval(interval);
  }, [status, lieProbability]);

  // Handle Log Message - FIXED LOGIC
  const handleLog = useCallback((text: string, isModel: boolean, isTurnComplete: boolean = false) => {
    if (!text) return;

    if (isModel) {
      setIsAnalyzing(true);
      setTimeout(() => setIsAnalyzing(false), 500);
      setIsUserSpeaking(false);
    } else {
      setIsUserSpeaking(true);
      setTimeout(() => setIsUserSpeaking(false), 2000);
    }

    setLogs(prev => {
      const lastLog = prev[prev.length - 1];
      
      // Strict check: Is the last log from the SAME speaker category?
      // User is 'neutral', Model is 'system' | 'truth' | 'deception'
      const lastIsModelLog = lastLog && lastLog.type !== 'neutral';
      const currentIsModel = isModel;

      // Merge if same speaker AND the previous turn isn't forcibly completed
      if (lastLog && (lastIsModelLog === currentIsModel) && !text.includes('[')) { // Don't merge if new text starts with [Tag] (new analysis)
        const updatedLogs = [...prev];
        updatedLogs[updatedLogs.length - 1] = {
          ...lastLog,
          message: lastLog.message + text
        };
        return updatedLogs;
      } else {
        // New Entry
        const type: 'neutral' | 'truth' | 'deception' | 'system' = isModel ? 'system' : 'neutral';
        return [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            message: text,
            type
          }
        ];
      }
    });
  }, []);

  const handleDisconnect = useCallback(() => {
     setStatus(SessionStatus.ERROR);
     setLogs(prev => [...prev, { id: 'sys-disc', timestamp: new Date().toLocaleTimeString(), message: '连接已中断 / CONNECTION LOST', type: 'deception' }]);
     cleanupSession();
  }, []);

  // Parse Logs for Logic
  useEffect(() => {
    if (logs.length === 0) return;
    const lastLog = logs[logs.length - 1];
    
    if (lastLog.type !== 'neutral') {
        // Match [欺骗率:80%] or variations
        const match = lastLog.message.match(/\[\s*欺骗率\s*[:：]\s*(\d+)\s*%\s*\]/);
        
        if (match) {
          const prob = parseInt(match[1], 10);
          setLieProbability(prob);

          let newType: 'neutral' | 'truth' | 'deception' | 'system' = 'system';
          if (prob > 75) newType = 'deception';
          else if (prob < 50) newType = 'truth';
          else newType = 'system'; 
          
          const cleanMsg = lastLog.message.replace(/\[\s*欺骗率\s*[:：]\s*\d+\s*%\s*\]/, '').trim();
          setLastAnalysis(cleanMsg || '数据分析中...');

          if (lastLog.type !== newType) {
             setLogs(prev => {
                const updated = [...prev];
                updated[updated.length - 1].type = newType;
                return updated;
             });
          }
        }
    }
  }, [logs]);

  const cleanupSession = async () => {
    try {
        await geminiLive.disconnect();
    } catch (e) {
        console.warn("Error disconnecting gemini service:", e);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLieProbability(0);
    setBiometrics({ heartRate: 75, stressLevel: 15, pupilDilation: 3.2 });
    setInputVolume(0);
  }

  const startSession = async () => {
    if (status === SessionStatus.CONNECTING) return; // Prevent double click
    
    // Ensure any previous session is cleaned up first
    await cleanupSession();

    try {
      setStatus(SessionStatus.CONNECTING);
      setLogs([]); 
      setLieProbability(0);
      setLastAnalysis('系统待机...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      geminiLive.setOnLog(handleLog);
      geminiLive.setOnDisconnect(handleDisconnect);
      geminiLive.setOnVolume(setInputVolume);
      
      if (videoRef.current && canvasRef.current) {
        await geminiLive.connect(stream, videoRef.current, canvasRef.current);
      }

      setStatus(SessionStatus.ACTIVE);
      setLogs(prev => [...prev, { id: 'sys-start', timestamp: new Date().toLocaleTimeString(), message: '系统初始化完成。音频监听中...', type: 'system' }]);

    } catch (err) {
      console.error("Start Session Error:", err);
      // Clean up if start failed
      await cleanupSession(); 
      setStatus(SessionStatus.ERROR);
      setLogs(prev => [...prev, { id: 'sys-err', timestamp: new Date().toLocaleTimeString(), message: '初始化失败：网络错误或权限不足。', type: 'deception' }]);
    }
  };

  const endSession = async () => {
    await cleanupSession();
    setStatus(SessionStatus.IDLE);
    setLastAnalysis('系统待机...');
  };

  const getThemeColor = () => {
    if (isDanger) return '#ff003c'; 
    if (isSuspicious) return '#ffaa00'; 
    return '#00f3ff'; 
  };

  const getVerdictText = () => {
      if (isDanger) return '【 谎 言 确 认 】';
      if (isSuspicious) return '【 高 度 可 疑 】';
      if (isTruth) return '【 诚 实 】';
      return '【 待 机 】';
  }

  return (
    <div className={`h-screen w-full flex flex-col p-4 overflow-hidden crt-flicker transition-colors duration-1000`}>
      <div className="scanlines"></div>
      
      {/* Background Ambience */}
      <div className={`absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,${getThemeColor()},transparent_70%)] transition-colors duration-1000`}></div>

      {/* Header */}
      <header className="flex-none flex justify-between items-center mb-2 z-10 border-b border-opacity-30 border-current pb-2" style={{ color: getThemeColor() }}>
        <div className="flex items-center gap-4">
          <div className={`relative ${isDanger ? 'animate-pulse' : ''}`}>
            {isDanger ? <ShieldAlert className="w-8 h-8 md:w-10 md:h-10" /> : 
             isSuspicious ? <AlertTriangle className="w-8 h-8 md:w-10 md:h-10" /> :
             <ShieldCheck className="w-8 h-8 md:w-10 md:h-10" />}
          </div>
          <div>
            <h1 className="text-xl md:text-3xl font-chinese font-bold tracking-tighter" style={{ textShadow: `0 0 10px ${getThemeColor()}` }}>
              神经测谎仪 <span className="text-sm align-top opacity-70 font-display">2077</span>
            </h1>
            <p className="text-[10px] tracking-[0.5em] opacity-70 font-display">VERITAS_V9_PROTOCOL</p>
          </div>
        </div>
        <div className="text-right hidden md:block">
          <div className="text-xs opacity-50 mb-1">系统状态 / SYSTEM STATUS</div>
          <div className="font-bold text-base md:text-lg flex items-center justify-end gap-2 font-display">
            {status === SessionStatus.ACTIVE && <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>}
            {status === SessionStatus.IDLE ? 'STANDBY' : 
             status === SessionStatus.CONNECTING ? 'CONNECTING...' : 
             status === SessionStatus.ACTIVE ? 'MONITORING' : 'DISCONNECTED'}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 z-10">
        
        {/* Left: Biometrics & Logs */}
        <div className="lg:col-span-3 flex flex-col gap-4 h-full min-h-0">
          
          <Panel title="生物遥测 / BIO_METRICS" className="flex-none" alert={isDanger}>
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs opacity-70 mb-1">
                  <span className="flex items-center gap-2"><Activity size={14}/> 心率 / BPM</span>
                  <span>{biometrics.heartRate > 120 ? '危急' : (biometrics.heartRate > 90 ? '升高' : '正常')}</span>
                </div>
                <div className="text-2xl font-display font-bold tabular-nums relative">
                  {Math.round(biometrics.heartRate)}
                </div>
                <div className="h-1 bg-gray-900 mt-2 overflow-hidden">
                  <div className="h-full transition-all duration-300" style={{ width: `${(biometrics.heartRate / 200) * 100}%`, backgroundColor: getThemeColor() }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs opacity-70 mb-1">
                  <span className="flex items-center gap-2"><Cpu size={14}/> 皮质醇 / STRESS</span>
                </div>
                <div className="text-2xl font-display font-bold tabular-nums">
                   {Math.round(biometrics.stressLevel)}%
                </div>
                <div className="h-1 bg-gray-900 mt-2">
                  <div className="h-full transition-all duration-300" style={{ width: `${biometrics.stressLevel}%`, backgroundColor: biometrics.stressLevel > 60 ? '#ff003c' : getThemeColor() }}></div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="实时日志 / LIVE_LOG" className="flex-1 min-h-0 flex flex-col relative" alert={isDanger}>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs custom-scrollbar">
              {logs.length === 0 && <div className="text-center opacity-30 mt-10">等待数据流...</div>}
              {logs.map((log) => (
                <div key={log.id} className={`p-2 border-l-2 text-xs leading-relaxed break-words ${
                  log.type === 'deception' ? 'border-[#ff003c] bg-[#ff003c]/10 text-[#ff003c]' : 
                  log.type === 'truth' ? 'border-[#00f3ff] bg-[#00f3ff]/10 text-[#00f3ff]' :
                  log.type === 'system' ? 'border-[#ffaa00] text-[#ffaa00]' : 
                  'border-current opacity-80'
                }`} style={{ borderColor: log.type === 'neutral' ? getThemeColor() : undefined }}>
                  <span className="opacity-50 select-none">[{log.timestamp}] {log.type === 'neutral' ? '受审者' : 'V9_系统'}:</span><br/>
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </Panel>
        </div>

        {/* Center: Video Feed */}
        <div className="lg:col-span-6 flex flex-col gap-4 h-full min-h-0">
          <div className={`relative flex-1 bg-black border-2 overflow-hidden group transition-colors duration-500 ${
            status === SessionStatus.ERROR ? 'border-red-600 shadow-none' :
            isDanger ? 'border-[#ff003c] shadow-[0_0_20px_rgba(255,0,60,0.3)]' : 
            isSuspicious ? 'border-[#ffaa00] shadow-[0_0_20px_rgba(255,170,0,0.2)]' :
            'border-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.2)]'
          }`}>
             {/* Video Content */}
            <div className="absolute inset-0">
               <video 
                ref={videoRef} 
                muted 
                className={`w-full h-full object-cover transition-opacity duration-300 ${status === SessionStatus.ACTIVE ? 'opacity-80' : 'opacity-20'} mix-blend-screen grayscale-[30%] contrast-125`}
              />
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlays */}
            {status === SessionStatus.ACTIVE && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Face Box */}
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[70%] transition-all duration-300 border border-opacity-50 ${
                  isDanger ? 'border-[#ff003c]' : isSuspicious ? 'border-[#ffaa00]' : 'border-[#00f3ff]'
                } p-1`}>
                   <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-current"></div>
                   <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-current"></div>
                   <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-current"></div>
                   <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-current"></div>
                   
                   <div className={`absolute -bottom-6 left-0 text-[10px] px-1 font-bold ${
                     isDanger ? 'bg-[#ff003c] text-black' : 
                     isSuspicious ? 'bg-[#ffaa00] text-black' : 
                     'bg-[#00f3ff] text-black'
                   }`}>TARGET_LOCKED</div>
                </div>
                {/* Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,243,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,243,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
                {/* Glitch on Lie */}
                {isDanger && <div className="absolute inset-0 glitch-effect pointer-events-none bg-red-900/10 mix-blend-overlay"></div>}
              </div>
            )}
            
            {status !== SessionStatus.ACTIVE && (
               <div className="absolute inset-0 flex items-center justify-center flex-col bg-black/50 backdrop-blur-sm text-center p-4">
                  {status === SessionStatus.ERROR ? (
                    <>
                       <ShieldAlert className="w-24 h-24 text-red-500 mb-4" />
                       <p className="tracking-[0.3em] text-red-500 font-bold">CONNECTION LOST</p>
                       <p className="text-xs text-red-400 mt-2">PLEASE RE-INITIALIZE SYSTEM</p>
                    </>
                  ) : (
                    <>
                      <ScanLine className="w-24 h-24 animate-pulse mb-4 text-[#00f3ff]" strokeWidth={1} />
                      <p className="tracking-[0.3em] text-sm animate-pulse">AWAITING INPUT STREAM</p>
                    </>
                  )}
               </div>
            )}
          </div>

          <div className="flex-none flex justify-center gap-4">
            {status === SessionStatus.ACTIVE ? (
              <Button onClick={endSession} variant="danger" className="w-full flex items-center justify-center gap-2 text-lg py-4 shadow-[0_0_20px_rgba(255,0,60,0.3)] border-2 border-[#ff003c]">
                <Power size={20} /> 中止连接 / DISCONNECT
              </Button>
            ) : (
              <Button onClick={startSession} className={`w-full flex items-center justify-center gap-2 text-lg py-4 shadow-[0_0_20px_rgba(0,243,255,0.3)] bg-[#00f3ff]/10 ${status === SessionStatus.ERROR ? 'animate-pulse' : ''}`}>
                <Mic size={20} /> {status === SessionStatus.ERROR ? '重试 / RETRY' : '启动神经连接 / INITIALIZE'}
              </Button>
            )}
          </div>
        </div>

        {/* Right: Analysis & Graph */}
        <div className="lg:col-span-3 flex flex-col gap-4 h-full min-h-0">
          
          <div className={`relative p-4 border-2 backdrop-blur-md transition-colors duration-300 ${
            isDanger ? 'border-[#ff003c] bg-[#ff003c]/5' : 
            isSuspicious ? 'border-[#ffaa00] bg-[#ffaa00]/5' :
            'border-[#00f3ff] bg-[#00f3ff]/5'
          }`}>
             
             <div className="flex flex-col items-center justify-center py-4">
                <div className="text-sm opacity-70 mb-2 tracking-widest font-chinese">欺骗概率 / DECEPTION RATE</div>
                
                <div className={`text-xl md:text-2xl font-black mb-2 animate-pulse font-chinese tracking-widest ${
                    isDanger ? 'text-[#ff003c]' : isSuspicious ? 'text-[#ffaa00]' : 'text-[#00f3ff]'
                }`}>
                    {getVerdictText()}
                </div>

                <div className={`text-6xl lg:text-7xl font-display font-black tracking-tighter transition-all duration-300 ${isDanger ? 'glitch-effect' : ''}`} style={{ color: getThemeColor(), textShadow: `0 0 20px ${getThemeColor()}` }}>
                  {lieProbability}<span className="text-3xl">%</span>
                </div>

                <div className="w-full h-4 bg-gray-900 mt-4 relative border border-gray-700">
                   <div 
                      className="h-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${lieProbability}%`, 
                        background: `linear-gradient(90deg, transparent, ${getThemeColor()})` 
                      }}
                   ></div>
                   <div className="absolute top-0 bottom-0 w-[1px] bg-white/30 left-[50%]"></div>
                   <div className="absolute top-0 bottom-0 w-[1px] bg-white/30 left-[75%]"></div>
                </div>
                <div className="w-full flex justify-between text-[10px] mt-1 opacity-50 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                </div>

                <div className="mt-4 font-chinese font-bold text-sm text-center min-h-[3rem] flex items-center justify-center border-t border-white/10 w-full pt-2 leading-tight">
                   {lastAnalysis}
                </div>
             </div>
          </div>

          <Panel title="真实度趋势 / VERACITY_GRAPH" className="flex-1 min-h-0 flex flex-col" alert={isDanger}>
            <div className="flex-1 w-full mt-2 relative">
              <div className="absolute inset-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <YAxis domain={[0, 100]} hide />
                    <XAxis hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#000', borderColor: getThemeColor(), color: getThemeColor(), fontFamily: 'monospace' }}
                      itemStyle={{ color: getThemeColor() }}
                      formatter={(value: number) => [`${value}%`, '欺骗率']}
                      labelFormatter={() => ''}
                    />
                    <ReferenceLine y={50} stroke="#ffaa00" strokeDasharray="3 3" opacity={0.5} />
                    <ReferenceLine y={75} stroke="#ff003c" strokeDasharray="3 3" opacity={0.5} />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke={getThemeColor()} 
                      strokeWidth={2} 
                      dot={false}
                      isAnimationActive={true}
                      animationDuration={300}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Audio Input Visualizer */}
            <div className="h-6 mt-2 border-t border-white/10 pt-2 flex items-center gap-2">
               <Mic size={12} className="opacity-50"/>
               <div className="flex-1 h-2 bg-gray-900 overflow-hidden">
                  <div className="h-full bg-white transition-all duration-75" style={{ width: `${Math.min(100, inputVolume * 2)}%` }}></div>
               </div>
               <span className="text-[10px] font-mono opacity-50 w-8 text-right">MIC</span>
            </div>
          </Panel>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.5); 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: currentColor; 
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
};

export default App;
