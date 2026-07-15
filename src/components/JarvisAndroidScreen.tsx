import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Mic, MicOff, Volume2, VolumeX, AlertCircle, Sparkles, 
  HelpCircle, Wifi, Battery, RotateCcw, ArrowLeft, Home, Square, 
  Settings, Globe, Languages, CheckCircle2, MessageCircle, Info
} from 'lucide-react';
import { ChatMessage, AgentState } from '../types';

interface JarvisAndroidScreenProps {
  onBackToLiveKit?: () => void;
}

export default function JarvisAndroidScreen({ onBackToLiveKit }: JarvisAndroidScreenProps) {
  // Chat History state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: "Good afternoon, Boss. I am JARVIS, your dedicated companion and friend. I am fully synchronized with Google's real-time knowledge base. Please feel free to type or speak to me so we may chat, refine your English skills, or address any inquiries you have.",
      timestamp: Date.now(),
    }
  ]);

  // Input, state, and UI controls
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [isMicActive, setIsMicActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [handsFreeMode, setHandsFreeMode] = useState(false); // Hands-Free conversation toggle
  const [deepPitch, setDeepPitch] = useState(0.65); // Deeper pitch modifier
  const [grammarTips, setGrammarTips] = useState<string[]>([]);
  const [latency, setLatency] = useState<number>(34); // Simulated latency
  const [searchGrounding, setSearchGrounding] = useState<any[]>([]);
  const [speechWarning, setSpeechWarning] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Refs for tracking state inside SpeechRecognition callbacks to avoid stale closures
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const visualizerTimerRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);

  const handsFreeRef = useRef(handsFreeMode);
  const isLoadingRef = useRef(isLoading);
  const agentStateRef = useRef(agentState);
  const ignoreSpeechResultsRef = useRef(false);

  // Sync refs with react states
  useEffect(() => {
    handsFreeRef.current = handsFreeMode;
  }, [handsFreeMode]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  // Synchronous state wrappers to prevent any state update race conditions
  const updateAgentState = (state: AgentState) => {
    setAgentState(state);
    agentStateRef.current = state;
  };

  const updateIsLoading = (val: boolean) => {
    setIsLoading(val);
    isLoadingRef.current = val;
  };

  // Status Bar Clock
  const [currentTime, setCurrentTime] = useState('');

  // 10-bar visualizer state
  const [amplitudes, setAmplitudes] = useState<number[]>([15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);

  useEffect(() => {
    // Update Android system clock
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll transcripts to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, agentState]);

  // Audio Visualizer simulator based on active state
  useEffect(() => {
    if (visualizerTimerRef.current) {
      clearInterval(visualizerTimerRef.current);
    }

    visualizerTimerRef.current = setInterval(() => {
      setAmplitudes((prev) => {
        return prev.map((val) => {
          if (agentState === 'speaking') {
            return Math.floor(Math.random() * 65) + 35; // Loud bouncing bars
          } else if (agentState === 'listening') {
            return Math.floor(Math.random() * 30) + 15; // Moderate breathing bars
          } else if (agentState === 'thinking') {
            // Flowing sinusoidal pattern
            const time = Date.now() * 0.007;
            return Math.floor(Math.sin(time + Math.random()) * 15) + 20;
          } else {
            return 8; // Near flat idle
          }
        });
      });
    }, 100);

    return () => {
      if (visualizerTimerRef.current) clearInterval(visualizerTimerRef.current);
    };
  }, [agentState]);

  // Set up Speech Recognition (browser native fallback)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsMicActive(true);
        updateAgentState('listening');
        setSpeechWarning(null);
      };

      recognition.onresult = (event: any) => {
        // If we should ignore speech results, or are currently loading/sending a message, ignore any new results to prevent late transcripts from overwriting our cleared text area!
        if (ignoreSpeechResultsRef.current || isLoadingRef.current) {
          return;
        }

        // Build the complete current transcript from scratch for maximum reliability
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
        }

        const totalText = fullTranscript.trim();
        if (totalText) {
          if (ignoreSpeechResultsRef.current || isLoadingRef.current) {
            return;
          }
          setSpeechWarning(null);
          // Instantly update UI with what is understood so far for real-time visual feedback
          setInputText(totalText);

          // Reset the silence detection timer
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          // Trigger automatic submission after 750ms of quiet
          silenceTimeoutRef.current = setTimeout(() => {
            if (totalText.trim() && !isLoadingRef.current && !ignoreSpeechResultsRef.current) {
              try {
                recognition.stop();
              } catch (e) {}
              setIsMicActive(false); // Instantly clear mic active state to ensure text area is interactive
              handleSendMessage(null, totalText);
            }
          }, 750);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsMicActive(false);
        updateAgentState('idle');

        if (event.error === 'no-speech') {
          setSpeechWarning("No speech detected, Boss. Perhaps try speaking a bit closer or louder to ensure I register your voice.");
        } else if (event.error === 'audio-capture' || event.error === 'not-allowed') {
          setSpeechWarning("Microphone access is unavailable, Boss. Please check browser permissions in your URL bar.");
        } else if (event.error === 'network') {
          setSpeechWarning("Network communication for speech recognition has failed, Boss. Google's Speech servers are temporarily unreachable. You can continue typing to chat!");
          // Stop hands-free auto-restarts to avoid infinite connection loops
          setHandsFreeMode(false);
        }
      };

      recognition.onend = () => {
        setIsMicActive(false);
        updateAgentState('idle');

        // Clear any active silence timer when microphone goes off
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        // Continuous Loop: If hands-free mode is on and we are idle and not loading, restart listening
        if (handsFreeRef.current && !isLoadingRef.current && agentStateRef.current === 'idle') {
          setTimeout(() => {
            try {
              // Ensure we are still hands-free and idle before restarting
              if (handsFreeRef.current && !isLoadingRef.current && agentStateRef.current === 'idle') {
                ignoreSpeechResultsRef.current = false;
                recognition.start();
              }
            } catch (e) {
              // Ignore if already active
            }
          }, 500);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  // Text-To-Speech Deep Voice Player
  const speakWithDeepVoice = (text: string) => {
    if (!voiceEnabled) return;

    // Stop existing speech
    window.speechSynthesis.cancel();

    // Create utterance
    const cleanText = text.replace(/\[.*?\]/g, '').trim(); // Remove brackets annotations
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;
    // Store globally on window to protect against Chrome garbage collection bug
    (window as any)._activeUtterance = utterance;

    // Seek deepest voice available in the browser
    const voices = window.speechSynthesis.getVoices();
    // Try to find a classic British Male voice for Jarvis
    let selectedVoice = voices.find(v => v.lang.includes('en-GB') && v.name.toLowerCase().includes('male'));
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.includes('en') && v.name.toLowerCase().includes('google'));
    }
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.includes('en'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Apply pitch and rate adjustments to achieve the ultimate deep Jarvis voice
    utterance.pitch = deepPitch; // Very deep pitch range (0.5 - 0.7)
    utterance.rate = 1.02;       // Snappy, fluent, sophisticated tempo

    utterance.onstart = () => {
      updateAgentState('speaking');
    };

    utterance.onend = () => {
      updateAgentState('idle');

      // Continuous Loop: Auto-restart listening after Jarvis completes his spoken response
      if (handsFreeRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            if (handsFreeRef.current && !isLoadingRef.current && agentStateRef.current === 'idle') {
              ignoreSpeechResultsRef.current = false;
              recognitionRef.current.start();
            }
          } catch (e) {
            // Already started
          }
        }, 400);
      }
    };

    utterance.onerror = (err) => {
      console.warn("Speech Synthesis Error:", err);
      
      // If error is due to intentional interruption (e.g. user sent a new message or cancelled), do not trigger loop recovery
      if (err.error === 'interrupted' || err.error === 'canceled') {
        return;
      }
      
      updateAgentState('idle');

      // Attempt to recover hands-free cycle on speech synthesis error
      if (handsFreeRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            if (handsFreeRef.current && !isLoadingRef.current && agentStateRef.current === 'idle') {
              ignoreSpeechResultsRef.current = false;
              recognitionRef.current.start();
            }
          } catch (e) {}
        }, 400);
      }
    };

    // Ensure we resume first in case the browser TTS engine got locked
    window.speechSynthesis.resume();

    // Introduce a short timeout because on some browsers immediate .speak after .cancel fails or gets eaten
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
      // Extra resume safeguard for Chrome/Safari which occasionally pauses mid-utterance
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 50);
  };

  // Trigger Speech synthesis voices loaded event (needed in some browsers)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Handle send message (both text and speech)
  const handleSendMessage = async (e: React.FormEvent | null, forcedText?: string) => {
    if (e) e.preventDefault();
    
    // Clear silence auto-submit timer immediately to prevent dual-submission
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    const messageText = forcedText || inputText;
    if (!messageText.trim()) return;

    // Ensure mic is set to inactive and recognition is stopped immediately
    setIsMicActive(false);
    ignoreSpeechResultsRef.current = true; // Set flag to ignore late recognition callbacks
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
    }

    // Stop current speech output when user starts a new query
    window.speechSynthesis.cancel();

    const userMsgId = 'msg-' + Date.now();
    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: messageText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText(''); // Empty text area immediately so user can type next command without waiting
    updateIsLoading(true);
    updateAgentState('thinking');

    const startLatencyTime = Date.now();

    try {
      // Send to server-side Gemini API with history
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: messages
        })
      });

      const data = await response.json();
      setLatency(Date.now() - startLatencyTime);

      if (response.ok) {
        const botMessage: ChatMessage = {
          id: 'msg-bot-' + Date.now(),
          sender: 'agent',
          text: data.text,
          timestamp: Date.now()
        };

        setMessages(prev => [...prev, botMessage]);
        
        // Search grounding details if any
        if (data.groundingChunks && data.groundingChunks.length > 0) {
          setSearchGrounding(data.groundingChunks);
        } else {
          setSearchGrounding([]);
        }

        // Analyze reply for any English improvement suggestions/tips
        // Usually, Jarvis will politely offer tips like "You might rephrase..."
        const foundTips = [];
        if (data.text.toLowerCase().includes('should be') || 
            data.text.toLowerCase().includes('rephrase') ||
            data.text.toLowerCase().includes('correct') ||
            data.text.toLowerCase().includes('suggest')) {
          foundTips.push("Jarvis detected a potential English improvement tip. Review his response!");
        }
        setGrammarTips(foundTips);

        // Speak the response in deepest voice
        speakWithDeepVoice(data.text);
      } else {
        throw new Error(data.error || 'Failed to contact Jarvis.');
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = "I do apologize, Sir, but my link to the neural core has been disrupted. Please ensure your Gemini API Key is configured in the Secrets panel, or try again.";
      setMessages(prev => [
        ...prev,
        {
          id: 'error-' + Date.now(),
          sender: 'agent',
          text: errMsg,
          timestamp: Date.now()
        }
      ]);
      updateAgentState('idle');
      speakWithDeepVoice(errMsg);
    } finally {
      updateIsLoading(false);
    }
  };

  // Toggle voice recognition mic
  const toggleVoiceInput = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (isMicActive) {
      if (recognitionRef.current) recognitionRef.current.stop();
    } else {
      // Cancel active speech playback when starting voice input to avoid self-feedback
      window.speechSynthesis.cancel();
      updateAgentState('idle');

      if (recognitionRef.current) {
        try {
          ignoreSpeechResultsRef.current = false; // Reset to allow incoming transcription results
          setInputText('');
          recognitionRef.current.start();
        } catch (e) {
          console.error(e);
        }
      } else {
        alert("Sir, voice recognition is not supported in this browser. Please use the high-density keyboard to type your commands instead.");
      }
    }
  };

  // Toggle Hands-Free voice conversation mode
  const toggleHandsFree = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    const nextVal = !handsFreeMode;
    setHandsFreeMode(nextVal);
    
    // Stop ongoing speech
    window.speechSynthesis.cancel();

    if (nextVal) {
      setVoiceEnabled(true);
      // Start microphone immediately
      if (recognitionRef.current) {
        try {
          ignoreSpeechResultsRef.current = false; // Reset to allow incoming transcription results
          recognitionRef.current.start();
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    }
  };

  // Reset chat
  const resetChat = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    window.speechSynthesis.cancel();
    setMessages([
      {
        id: 'welcome',
        sender: 'agent',
        text: "Neural matrix reset successfully, Boss. JARVIS is ready once again. What would you like to chat about or explore today?",
        timestamp: Date.now(),
      }
    ]);
    setGrammarTips([]);
    setSearchGrounding([]);
    updateAgentState('idle');
  };

  return (
    <div className="h-screen max-h-screen w-full bg-zinc-950 text-slate-100 flex flex-col md:flex-row items-center justify-center p-0 md:p-8 font-sans selection:bg-cyan-500 selection:text-slate-950 overflow-hidden" id="android-jarvis-stage">
      
      {/* Interactive Options Sidebar / Backdrop Control */}
      <div className="hidden md:block md:w-80 md:mr-10 mb-6 md:mb-0 space-y-4 md:self-start md:mt-10" id="jarvis-configs">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <Languages className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-sm tracking-wide text-white uppercase font-mono">Human Companion Mode</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Boss, I am configured as your friendly, knowledgeable voice assistant. Ask me anything in the world or give me instructions, and I will assist you with witty, articulate, and natural responses.
          </p>
          <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-500 font-mono space-y-1">
            <p>● Voice Mode: <span className="text-cyan-400">Deep British Jarvis Voice</span></p>
            <p>● Engine: <span className="text-emerald-400">Gemini 3.5 + Live Google Data</span></p>
          </div>
        </div>

        {/* Deep Voice Tuning */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 font-mono uppercase">Voice Pitch ({deepPitch}x)</span>
            <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded uppercase font-mono font-bold">Deepest Voice</span>
          </div>
          <input 
            type="range" 
            min="0.3" 
            max="1.1" 
            step="0.05"
            value={deepPitch}
            onChange={(e) => {
              setDeepPitch(parseFloat(e.target.value));
              speakWithDeepVoice("Adjusting voice pitch frequency, Boss.");
            }}
            className="w-full accent-cyan-400 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>Extra Deep (0.3)</span>
            <span>Default (1.0)</span>
          </div>
        </div>

        {/* Hands-Free Voice Conversation Mode */}
        <div className={`p-5 rounded-xl border transition-all duration-300 space-y-3 ${
          handsFreeMode 
            ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.1)]' 
            : 'bg-zinc-900 border-zinc-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className={`w-4 h-4 ${handsFreeMode ? 'text-emerald-400 animate-pulse' : 'text-zinc-400'}`} />
              <span className="text-xs font-bold font-mono uppercase text-white">Hands-Free Mode</span>
            </div>
            <button
              onClick={toggleHandsFree}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                handsFreeMode ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                  handsFreeMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            When enabled, talk to Jarvis naturally like a real human. No clicking required. Jarvis listens, answers, and automatically opens the microphone back up!
          </p>
          {handsFreeMode && (
            <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Continuous Voice Link Active</span>
            </div>
          )}
        </div>

        {/* LiveKit toggle if they want classic server */}
        {onBackToLiveKit && (
          <button
            onClick={onBackToLiveKit}
            className="w-full py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-mono font-bold tracking-wider hover:text-cyan-400 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>SWITCH TO LIVEKIT AGENT</span>
          </button>
        )}
      </div>

      {/* Flagship Android Device Mockup */}
      <div 
        className="w-full h-full max-h-screen md:max-h-none md:relative md:max-w-[380px] md:h-[780px] bg-zinc-950 md:rounded-[44px] md:border-[12px] md:border-zinc-800 md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden md:ring-4 md:ring-zinc-900"
        id="android-phone-frame"
      >
        {/* Phone Notch/Punch Hole Camera */}
        <div className="hidden md:flex absolute top-2 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 items-center justify-center" id="phone-notch">
          <div className="w-2.5 h-2.5 bg-zinc-900 rounded-full border border-zinc-850 mr-auto ml-3" />
          <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full ml-auto mr-4" />
        </div>

        {/* Phone Left/Right Bezel Volume & Power Button shadows */}
        <div className="hidden md:block absolute -left-[14px] top-32 w-[3px] h-14 bg-zinc-800 rounded-r-sm" />
        <div className="hidden md:block absolute -left-[14px] top-52 w-[3px] h-14 bg-zinc-800 rounded-r-sm" />
        <div className="hidden md:block absolute -right-[14px] top-40 w-[3px] h-20 bg-zinc-800 rounded-l-sm" />

        {/* Android Screen Container */}
        <div className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden" id="android-screen">
          
          {/* Android Status Bar */}
          <div className="hidden md:flex h-10 pt-4 px-6 justify-between items-center text-[11px] font-mono font-semibold text-zinc-300 select-none z-40 bg-zinc-950/80 backdrop-blur-md" id="android-status-bar">
            <span>{currentTime}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1 py-0.2 rounded font-bold tracking-tight">5G</span>
              <Wifi className="w-3.5 h-3.5 text-zinc-300" />
              <Battery className="w-4 h-4 text-zinc-300" />
            </div>
          </div>

          {/* Android App Top Header */}
          <div className="px-5 pt-8 pb-3 md:py-3 border-b border-zinc-900/80 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md z-30 shrink-0" id="android-app-header">
            <div className="flex items-center gap-2.5">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="relative cursor-pointer hover:scale-105 active:scale-95 transition"
                title="Jarvis Settings"
              >
                <span className="text-xl">🤖</span>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
              </button>
              <div>
                <h1 className="font-bold text-sm tracking-wide text-white flex items-center gap-1">
                  <span>DumEJarvis</span>
                </h1>
                <p className="text-[9px] font-mono text-cyan-400/80 uppercase tracking-widest font-bold">REAL-TIME LINK</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Jarvis Controls trigger button */}
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-zinc-900 rounded-xl transition cursor-pointer md:hidden"
                title="Jarvis Controls"
              >
                <Settings className="w-4 h-4 animate-[spin_8s_linear_infinite]" />
              </button>

              <button 
                onClick={resetChat}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition cursor-pointer"
                title="Reset Session"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <span className="hidden sm:inline-block text-[9px] font-mono bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded text-cyan-400 uppercase font-semibold">
                ACTIVE
              </span>
            </div>
          </div>

          {/* Android Main App Scroll View (Responses/Transcripts) */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 select-text scroll-smooth"
            id="android-scroll-view"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* System Status Log Indicator */}
            <div className="text-center py-1 flex flex-col gap-1.5 items-center justify-center">
              <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 bg-zinc-900/50 border border-zinc-850 px-2.5 py-0.8 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                SYSTEM_MODE: JARVIS_DIRECT_LINK_OK
              </span>
              {handsFreeMode ? (
                <span className="inline-flex items-center gap-1.5 text-[8px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-900/35 px-2 py-0.5 rounded-md uppercase animate-pulse">
                  🎙️ Hands-free continuous voice active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[8px] font-mono text-zinc-500 bg-zinc-900/50 border border-zinc-850 px-2 py-0.5 rounded-md uppercase">
                  💬 Keyboard & Tap mode
                </span>
              )}
            </div>

            {speechWarning && (
              <div className="mx-2 bg-amber-950/20 border border-amber-500/30 p-2.5 rounded-xl flex items-start gap-2.5 shadow-[0_0_15px_rgba(245,158,11,0.05)] animate-fade-in" id="speech-warning-banner">
                <span className="text-amber-400 text-sm animate-pulse">💡</span>
                <div className="flex-1">
                  <p className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-0.5">Acoustic Guide</p>
                  <p className="text-[10px] leading-relaxed text-zinc-300">{speechWarning}</p>
                </div>
              </div>
            )}

            {/* Render Chat Messages inside the phone */}
            {messages.map((msg) => {
              const isAi = msg.sender === 'agent';
              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col max-w-[85%] ${
                    isAi ? 'mr-auto items-start' : 'ml-auto items-end'
                  }`}
                >
                  {/* Sender title label */}
                  <span className="text-[9px] font-mono text-zinc-500 mb-0.5 px-1 uppercase tracking-wider">
                    {isAi ? 'Jarvis' : 'Boss'}
                  </span>

                  {/* Message bubble */}
                  <div className="flex items-start gap-1.5 w-full">
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed border flex-1 ${
                      isAi 
                        ? 'bg-zinc-900 text-slate-100 rounded-tl-sm border-zinc-800' 
                        : 'bg-cyan-500 text-zinc-950 rounded-tr-sm border-cyan-600 font-medium'
                    }`}>
                      {msg.text}
                    </div>
                    {isAi && (
                      <button 
                        onClick={() => speakWithDeepVoice(msg.text)}
                        className="p-2 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 rounded-xl transition cursor-pointer shrink-0 mt-0.5"
                        title="Replay speech output"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Message Timestamp */}
                  <span className="text-[8px] font-mono text-zinc-600 mt-0.5 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </span>
                </div>
              );
            })}

            {/* Grounding Metadata Cards (Google Search citations) */}
            {searchGrounding.length > 0 && (
              <div className="p-3 bg-zinc-900/40 border border-zinc-850 rounded-xl space-y-1.5" id="grounding-info">
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-cyan-400 uppercase tracking-widest font-semibold">
                  <Globe className="w-3 h-3" />
                  <span>Google Search Grounding Data</span>
                </div>
                <div className="space-y-1">
                  {searchGrounding.map((chunk, i) => {
                    if (chunk.web) {
                      return (
                        <a 
                          key={i} 
                          href={chunk.web.uri} 
                          target="_blank" 
                          rel="noreferrer"
                          className="block text-[10px] text-zinc-400 hover:text-cyan-400 hover:underline truncate"
                        >
                          🌐 {chunk.web.title || chunk.web.uri}
                        </a>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}

            {/* Grammar and Speech Feedback Widget */}
            {grammarTips.length > 0 && (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-1" id="grammar-feedback">
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Grammar Analysis</span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Jarvis registered a refined expression. Continue conversing to strengthen your fluency and cadence!
                </p>
              </div>
            )}

            {/* Animated Thinking bubble */}
            {isLoading && (
              <div className="flex flex-col items-start max-w-[85%] mr-auto">
                <span className="text-[9px] font-mono text-zinc-500 mb-0.5 px-1 uppercase tracking-wider">Jarvis</span>
                <div className="p-3 bg-zinc-900 border border-zinc-850 rounded-2xl rounded-tl-sm text-xs text-zinc-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-[10px] text-zinc-500 font-mono ml-1 uppercase tracking-wider">Synthesizing...</span>
                </div>
              </div>
            )}
          </div>

          {/* Android Audio Frequency Visualizer */}
          <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-900/60 flex flex-col items-center gap-1 shrink-0" id="phone-visualizer-bar">
            {agentState !== 'idle' && (
              <span className="text-[8px] font-mono text-cyan-400/80 uppercase tracking-widest text-center animate-pulse">
                {agentState === 'speaking' ? 'JARVIS SPEAKING' : agentState === 'listening' ? 'LISTENING FOR AUDIO' : 'PROCESSING COMMAND'}
              </span>
            )}
            
            {/* 10-bar spectrum */}
            <div className="flex items-center justify-center gap-1 h-10 w-full" id="wave-bars-phone">
              {amplitudes.map((amp, idx) => (
                <div 
                  key={idx} 
                  className="w-1 rounded-full transition-all duration-100"
                  style={{
                    height: `${Math.max(4, amp * 0.45)}px`,
                    backgroundColor: agentState === 'speaking' ? '#22d3ee' : agentState === 'thinking' ? '#a855f7' : agentState === 'listening' ? '#34d399' : '#3f3f46'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Bottom Interactive Control Panel (Keyboard & Input & FAB) */}
          <div className="p-3 bg-zinc-950 border-t border-zinc-900 flex flex-col gap-2 shrink-0 z-30" id="android-inputs-tray">
            
            {/* Quick toggles */}
            <div className="flex items-center justify-between px-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider select-none">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-zinc-600" />
                <span>Latency: {latency}ms</span>
              </span>
              
              {/* Voice playback toggle */}
              <button 
                onClick={() => {
                  setVoiceEnabled(!voiceEnabled);
                  if (voiceEnabled) window.speechSynthesis.cancel();
                }}
                className="flex items-center gap-1 hover:text-white transition cursor-pointer text-zinc-400 font-bold"
              >
                {voiceEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-cyan-400">Voice ON</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Voice OFF</span>
                  </>
                )}
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2" id="phone-chat-form">
              {/* Voice recognition microphone trigger */}
              <button
                type="button"
                onClick={handsFreeMode ? toggleHandsFree : toggleVoiceInput}
                className={`p-2.5 rounded-full border transition active:scale-95 cursor-pointer shrink-0 ${
                  handsFreeMode
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-500 shadow-[0_0_12px_#34d399]'
                    : isMicActive
                      ? 'bg-cyan-500 text-zinc-950 border-cyan-500 shadow-[0_0_12px_#22d3ee]'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
                }`}
                title={handsFreeMode ? "Disable Hands-Free Mode" : isMicActive ? "Stop Listening" : "Speak to Jarvis"}
              >
                {handsFreeMode ? (
                  <Mic className="w-4 h-4 animate-pulse" />
                ) : isMicActive ? (
                  <Mic className="w-4 h-4 animate-bounce" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
 
               {/* Text Input Field */}
               <input
                 type="text"
                 placeholder={isMicActive ? "Speak clearly, Boss..." : "Instruct Jarvis..."}
                 value={inputText}
                 onChange={(e) => setInputText(e.target.value)}
                 disabled={isMicActive}
                 className="flex-1 bg-zinc-900 text-xs text-slate-100 placeholder-zinc-650 px-3 py-2.5 border border-zinc-800 rounded-xl focus:outline-none focus:border-cyan-500 transition font-mono"
                 id="phone-input-field"
               />
 
               {/* Submit send button */}
               <button
                 type="submit"
                 disabled={!inputText.trim()}
                 className="p-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-950 rounded-full transition active:scale-95 cursor-pointer shrink-0 shadow-lg"
                 id="phone-btn-send"
               >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Standard Android Navigation Bar at the bottom */}
          <div className="h-12 bg-zinc-950 border-t border-zinc-900/40 flex items-center justify-around text-zinc-500 select-none shrink-0" id="android-nav-bar">
            <button 
              type="button" 
              onClick={() => {
                if (messages.length > 1) {
                  // Back gesture: remove last message
                  setMessages(prev => prev.slice(0, -1));
                }
              }}
              className="p-3 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button 
              type="button" 
              onClick={resetChat} 
              className="p-3 hover:text-white transition cursor-pointer"
            >
              <Home className="w-4 h-4" />
            </button>
            <button 
              type="button" 
              className="p-3 hover:text-white transition cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>

      {/* Mobile Settings Drawer Overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            {/* Backdrop blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 md:hidden"
              id="mobile-drawer-backdrop"
            />
            
            {/* Bottom Drawer container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-zinc-900 border-t border-zinc-800 rounded-t-[24px] p-6 space-y-6 overflow-y-auto z-50 md:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col"
              id="mobile-drawer-content"
            >
              {/* Top Handle bar for swiping design */}
              <div className="flex justify-center mb-1 shrink-0">
                <div className="w-12 h-1.5 bg-zinc-850 rounded-full" />
              </div>

              {/* Title Header */}
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-sm tracking-wide text-white uppercase font-mono">Jarvis Diagnostics</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-xs font-mono font-bold text-cyan-400 hover:text-white uppercase transition py-1.5 px-3.5 bg-cyan-950/40 border border-cyan-900/50 hover:bg-cyan-900 rounded-xl cursor-pointer"
                >
                  Done, Boss
                </button>
              </div>

              <div className="space-y-5 flex-1 overflow-y-auto pb-4">
                {/* Practice Mode info */}
                <div className="bg-zinc-950/40 border border-zinc-800/60 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Languages className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase font-mono">Companion Mode Active</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    I am equipped with complete global knowledge and am ready to chat, discuss ideas, or help you complete tasks!
                  </p>
                  <div className="text-[10px] text-zinc-500 font-mono space-y-0.5 pt-2 border-t border-zinc-800">
                    <p>● Pitch Level: <span className="text-cyan-400">{deepPitch}x Deep</span></p>
                    <p>● Brain: <span className="text-emerald-400">Gemini 3.5</span></p>
                  </div>
                </div>

                {/* Pitch Adjuster */}
                <div className="bg-zinc-950/20 border border-zinc-850 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300 font-mono uppercase">Voice Pitch ({deepPitch}x)</span>
                    <span className="text-[9px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded uppercase font-mono font-bold">Modulate</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.3" 
                    max="1.1" 
                    step="0.05"
                    value={deepPitch}
                    onChange={(e) => {
                      setDeepPitch(parseFloat(e.target.value));
                      speakWithDeepVoice("Adjusting voice pitch frequency, Boss.");
                    }}
                    className="w-full accent-cyan-400 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                    <span>Extra Deep (0.3)</span>
                    <span>Default (1.0)</span>
                  </div>
                </div>

                {/* Hands-free Toggle */}
                <div className={`p-4 rounded-xl border transition-all duration-300 space-y-2.5 ${
                  handsFreeMode 
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.1)]' 
                    : 'bg-zinc-950/40 border-zinc-800/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mic className={`w-4 h-4 ${handsFreeMode ? 'text-emerald-400 animate-pulse' : 'text-zinc-400'}`} />
                      <span className="text-xs font-bold font-mono uppercase text-white">Hands-Free Mode</span>
                    </div>
                    <button
                      onClick={toggleHandsFree}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        handsFreeMode ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                          handsFreeMode ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Enables continuous speaking. Speak naturally and Jarvis will answer and immediately re-listen!
                  </p>
                  {handsFreeMode && (
                    <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>Continuous Voice Link Active</span>
                    </div>
                  )}
                </div>

                {/* Reset Session Option */}
                <button
                  onClick={() => {
                    resetChat();
                    setIsSettingsOpen(false);
                  }}
                  className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-xl text-xs font-mono font-bold tracking-wider hover:text-white transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESET AUDIO CONVERSATION</span>
                </button>

                {/* Switch to LiveKit */}
                {onBackToLiveKit && (
                  <button
                    onClick={() => {
                      onBackToLiveKit();
                      setIsSettingsOpen(false);
                    }}
                    className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 text-cyan-400 border border-cyan-950 rounded-xl text-xs font-mono font-bold tracking-wider transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>SWITCH TO LIVEKIT AGENT</span>
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
