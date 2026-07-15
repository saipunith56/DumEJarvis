import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ConnectionConfig, ChatMessage, AgentState } from '../types';
import Visualizer from './Visualizer';
import {
  Room,
  RoomEvent,
  Track,
  RemoteAudioTrack,
  RemoteVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  TrackPublication,
  RemoteParticipant,
  Participant,
} from 'livekit-client';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  PhoneOff,
  Send,
  Sparkles,
  User,
  LogOut,
  AlertCircle,
  Wifi,
  ChevronRight,
  Maximize2,
} from 'lucide-react';

interface VoiceAssistantScreenProps {
  config: ConnectionConfig;
  onDisconnect: () => void;
}

export default function VoiceAssistantScreen({ config, onDisconnect }: VoiceAssistantScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenShareEnabled, setIsScreenShareEnabled] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tracks for rendering
  const [agentAudioTrack, setAgentAudioTrack] = useState<RemoteAudioTrack | null>(null);
  const [agentVideoTrack, setAgentVideoTrack] = useState<RemoteVideoTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [localScreenTrack, setLocalScreenTrack] = useState<any | null>(null);

  const roomRef = useRef<Room | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const agentVideoRef = useRef<HTMLVideoElement | null>(null);
  const localScreenRef = useRef<HTMLVideoElement | null>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatVisible]);

  useEffect(() => {
    let active = true;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    const connectToRoom = async () => {
      try {
        setConnectionStatus('connecting');
        setErrorMessage(null);

        let connectionUrl = config.url;
        let connectionToken = config.token;

        // If sandbox connection is selected, fetch the credentials from the LiveKit token resolver
        if (config.connectionType === 'sandbox') {
          if (!config.sandboxId) {
            throw new Error('Please provide a valid Sandbox ID.');
          }
          // Fetch token from Sandbox Token Server
          const res = await fetch(`https://api.livekit.sandbox.livekit.io/api/sandbox/token?sandboxId=${config.sandboxId}`);
          if (!res.ok) {
            throw new Error(`Failed to resolve Sandbox ID "${config.sandboxId}". Please double-check your ID.`);
          }
          const data = await res.json();
          connectionUrl = data.url;
          connectionToken = data.token;
        }

        if (!connectionUrl || !connectionToken) {
          throw new Error('Missing server URL or access token.');
        }

        // Setup event listeners
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            const remoteAudio = track as RemoteAudioTrack;
            setAgentAudioTrack(remoteAudio);
            // Play audio track automatically via livekit helper or manual attachment
            const audioEl = remoteAudio.attach();
            document.body.appendChild(audioEl);
            setAgentState('speaking');
          } else if (track.kind === Track.Kind.Video) {
            const remoteVideo = track as RemoteVideoTrack;
            setAgentVideoTrack(remoteVideo);
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            setAgentAudioTrack(null);
            setAgentState('idle');
          } else if (track.kind === Track.Kind.Video) {
            setAgentVideoTrack(null);
          }
        });

        room.on(RoomEvent.ParticipantConnected, (participant) => {
          console.log('Participant connected:', participant.identity);
          addSystemMessage(`${participant.identity} joined the call.`);
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          console.log('Participant disconnected:', participant.identity);
          addSystemMessage(`${participant.identity} left the call.`);
          if (participant.identity.includes('agent')) {
            setAgentState('disconnected');
          }
        });

        // Listen for transcription or message events over Data Channel
        room.on(RoomEvent.DataReceived, (payload, participant) => {
          try {
            const text = new TextDecoder().decode(payload);
            const data = JSON.parse(text);

            // Handle common livekit chat format
            if (data.text) {
              const isAgent = participant ? !participant.isLocal : true;
              addChatMessage(isAgent ? 'agent' : 'user', data.text);
              if (isAgent) {
                setAgentState('speaking');
                // Auto switch back to idle/listening after brief delay
                setTimeout(() => setAgentState('listening'), 3000);
              }
            } else if (data.transcription) {
              const isAgent = participant ? !participant.isLocal : true;
              addChatMessage(isAgent ? 'agent' : 'user', data.transcription);
            }
          } catch (e) {
            // Raw text fallback
            const text = new TextDecoder().decode(payload);
            const isAgent = participant ? !participant.isLocal : true;
            addChatMessage(isAgent ? 'agent' : 'user', text);
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          if (speakers.length > 0) {
            const activeSpeaker = speakers[0];
            if (activeSpeaker.isLocal) {
              setAgentState('listening');
            } else {
              setAgentState('speaking');
            }
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnectionStatus('disconnected');
          setAgentState('disconnected');
        });

        // Connect
        await room.connect(connectionUrl, connectionToken);
        if (!active) return;

        setConnectionStatus('connected');
        setAgentState('listening');
        addSystemMessage("Connection established. Say 'Hello' to begin chatting!");

        // Publish local mic
        await room.localParticipant.setMicrophoneEnabled(true);
        setIsMicEnabled(true);

      } catch (err: any) {
        console.error("Connection error:", err);
        if (active) {
          setConnectionStatus('error');
          setErrorMessage(err.message || 'An unknown error occurred while connecting.');
        }
      }
    };

    connectToRoom();

    return () => {
      active = false;
      // Cleanup all tracks
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      // Remove any leftover audio tags
      const audios = document.querySelectorAll('audio');
      audios.forEach((a) => a.remove());
    };
  }, [config]);

  // Handle local camera toggle
  useEffect(() => {
    if (!roomRef.current || connectionStatus !== 'connected') return;

    const handleCameraToggle = async () => {
      try {
        await roomRef.current!.localParticipant.setCameraEnabled(isCameraEnabled);
        if (isCameraEnabled) {
          const videoTrack = roomRef.current!.localParticipant.videoTrackPublications.values().next().value?.videoTrack as LocalVideoTrack;
          if (videoTrack) {
            setLocalVideoTrack(videoTrack);
            if (localVideoRef.current) {
              videoTrack.attach(localVideoRef.current);
            }
          }
        } else {
          if (localVideoTrack) {
            localVideoTrack.detach();
            setLocalVideoTrack(null);
          }
        }
      } catch (err) {
        console.error("Camera toggle error:", err);
        setIsCameraEnabled(false);
      }
    };

    handleCameraToggle();
  }, [isCameraEnabled, connectionStatus]);

  // Attach local camera stream to DOM
  useEffect(() => {
    if (localVideoTrack && localVideoRef.current) {
      localVideoTrack.attach(localVideoRef.current);
    }
  }, [localVideoTrack]);

  // Attach agent video stream to DOM
  useEffect(() => {
    if (agentVideoTrack && agentVideoRef.current) {
      agentVideoTrack.attach(agentVideoRef.current);
    }
  }, [agentVideoTrack]);

  // Handle screen share toggle
  useEffect(() => {
    if (!roomRef.current || connectionStatus !== 'connected') return;

    const handleScreenShareToggle = async () => {
      try {
        await roomRef.current!.localParticipant.setScreenShareEnabled(isScreenShareEnabled);
        if (isScreenShareEnabled) {
          const screenTrack = (Array.from(roomRef.current!.localParticipant.videoTrackPublications.values()) as any[])
            .find(pub => pub.source === Track.Source.ScreenShare)?.videoTrack;
          if (screenTrack) {
            setLocalScreenTrack(screenTrack);
            if (localScreenRef.current) {
              screenTrack.attach(localScreenRef.current);
            }
          }
        } else {
          if (localScreenTrack) {
            localScreenTrack.detach();
            setLocalScreenTrack(null);
          }
        }
      } catch (err) {
        console.error("Screen share toggle error:", err);
        setIsScreenShareEnabled(false);
      }
    };

    handleScreenShareToggle();
  }, [isScreenShareEnabled, connectionStatus]);

  // Attach local screenshare stream to DOM
  useEffect(() => {
    if (localScreenTrack && localScreenRef.current) {
      localScreenTrack.attach(localScreenRef.current);
    }
  }, [localScreenTrack]);

  // Handle mic toggle
  const toggleMic = async () => {
    if (!roomRef.current || connectionStatus !== 'connected') return;
    try {
      const nextState = !isMicEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(nextState);
      setIsMicEnabled(nextState);
    } catch (err) {
      console.error("Mic toggle error:", err);
    }
  };

  const addChatMessage = (sender: 'user' | 'agent', text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender,
        text,
        timestamp: Date.now(),
      },
    ]);
  };

  const addSystemMessage = (text: string) => {
    console.log("System Status:", text);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !roomRef.current || connectionStatus !== 'connected') return;

    const textToSend = inputText.trim();
    setInputText('');

    // Display locally
    addChatMessage('user', textToSend);
    setAgentState('thinking');

    // Publish to LiveKit room
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(
        JSON.stringify({
          text: textToSend,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        })
      );
      // Publish to data channel (with lk-chat-topic standard or broad)
      await roomRef.current.localParticipant.publishData(payload, {
        reliable: true,
        topic: 'lk-chat-topic',
      });
    } catch (err) {
      console.error("Failed to publish data message:", err);
    }
  };

  // State text mapping
  const getAgentStateLabel = () => {
    switch (agentState) {
      case 'idle':
        return 'Waiting';
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Ready';
    }
  };

  // State badge style mapping
  const getAgentStateBadgeClass = () => {
    switch (agentState) {
      case 'speaking':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'thinking':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30 animate-pulse';
      case 'listening':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'disconnected':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  };

  // Loading Screen
  if (connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6" id="loader-screen">
        <div className="relative flex flex-col items-center max-w-sm text-center">
          <div className="absolute w-64 h-64 bg-cyan-500/10 blur-3xl rounded-full -top-16" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="w-16 h-16 border-4 border-cyan-500/25 border-t-cyan-400 rounded-full mb-6 shadow-lg"
          />
          <h2 className="text-xl font-bold tracking-wide">Connecting Room...</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Acquiring real-time audio and video streams. Please allow microphone permissions when prompted.
          </p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (connectionStatus === 'error' || connectionStatus === 'disconnected' && errorMessage) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6" id="error-screen">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500" />
          <div className="inline-flex items-center justify-center p-4 bg-red-950/40 border border-red-900/40 rounded-2xl mb-4 text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Unable to Connect</h2>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            {errorMessage || 'The server rejected the credentials or is currently offline.'}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={onDisconnect}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl font-semibold text-sm transition cursor-pointer"
            >
              Back to Connection Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950" id="voice-assistant-screen">
      {/* High Density Top Bar */}
      <nav className="h-12 border-b border-zinc-800 flex items-center justify-between px-5 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-20" id="session-header">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-base tracking-tight text-white">
            DumEJarvis
          </span>
          <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-mono font-medium">
            v1.0.4-beta
          </span>
        </div>

        {/* Status chip */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-400 uppercase tracking-wider" id="state-badge">
          <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] transition-colors duration-300 ${
            agentState === 'speaking' ? 'bg-cyan-400 text-cyan-400' :
            agentState === 'listening' ? 'bg-emerald-400 text-emerald-400' :
            agentState === 'thinking' ? 'bg-purple-400 text-purple-400 animate-pulse' :
            'bg-zinc-500 text-zinc-500'
          }`} />
          <span>AGENT CONNECTED: {config.connectionType === 'sandbox' ? `SANDBOX-${config.sandboxId.toUpperCase()}` : 'LIVEKIT-WSS-01'}</span>
        </div>
      </nav>

      {/* Main layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden" id="stage-layout">
        
        {/* Left Side: Agent Visualizer or Video Grid */}
        <section className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 relative bg-zinc-950 border-r border-zinc-800" id="stage-left">
          
          <div className="w-full max-w-lg flex flex-col items-center justify-center gap-6" id="visualization-block">
            {/* Camera Streams & Screen Share Grid */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 empty:hidden mb-4" id="video-streams-grid">
              {/* Agent Remote Video Track */}
              {agentVideoTrack && (
                <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden aspect-video shadow-2xl" id="agent-video-container">
                  <video ref={agentVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 bg-zinc-950/90 border border-zinc-850 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>AGENT_STREAM</span>
                  </div>
                </div>
              )}

              {/* Local Webcam Video Track */}
              {localVideoTrack && (
                <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden aspect-video shadow-2xl" id="local-video-container">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  <div className="absolute bottom-3 left-3 bg-zinc-950/90 border border-zinc-850 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>USER_CAMERA</span>
                  </div>
                </div>
              )}

              {/* Screen Share Video Track */}
              {localScreenTrack && (
                <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden aspect-video shadow-2xl md:col-span-2" id="screenshare-container">
                  <video ref={localScreenRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                  <div className="absolute bottom-3 left-3 bg-zinc-950/90 border border-zinc-850 px-2 py-0.5 rounded text-[10px] font-mono text-purple-400 flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    <span>USER_PRESENTATION</span>
                  </div>
                </div>
              )}
            </div>

            {/* If no video is present, display our gorgeous high density avatar layout */}
            {!agentVideoTrack && !localVideoTrack && !localScreenTrack && (
              <div className="w-full text-center flex flex-col items-center justify-center py-6" id="voice-avatar-stage">
                
                {/* High Density Agent Avatar with dashed rotating spacer */}
                <div className="w-44 h-44 border-2 border-cyan-400 rounded-full flex items-center justify-center mb-8 relative" id="avatar-circle">
                  <div className="absolute -inset-2.5 border border-dashed border-cyan-500/30 rounded-full animate-[spin_20s_linear_infinite]" />
                  
                  {/* State glows */}
                  <AnimatePresence>
                    {agentState === 'speaking' && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1.3, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeOut' }}
                        className="absolute inset-0 bg-cyan-500/10 rounded-full"
                      />
                    )}
                    {agentState === 'thinking' && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1.3, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
                        className="absolute inset-0 bg-purple-500/10 rounded-full"
                      />
                    )}
                  </AnimatePresence>

                  <div className="text-5xl select-none" role="img" aria-label="robot">🤖</div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-light text-white tracking-wide">
                    {agentState === 'speaking' ? 'Speaking...' :
                     agentState === 'thinking' ? 'Processing command...' :
                     'How can I help you, Master?'}
                  </h2>
                  <p className="text-zinc-400 text-xs font-mono tracking-widest uppercase">
                    Voice Activity Detected (VAD) Active
                  </p>
                </div>
              </div>
            )}

            {/* High Density 10-bar Visualizer */}
            <Visualizer agentState={agentState} audioTrack={agentAudioTrack} />
          </div>
        </section>

        {/* Right Side / Sidebar: High Density Chat Transcription & Logs */}
        <AnimatePresence>
          {isChatVisible && (
            <aside
              className="w-full lg:w-[320px] bg-zinc-900 border-t lg:border-t-0 lg:border-l border-zinc-800 flex flex-col overflow-hidden max-h-[45vh] lg:max-h-none shrink-0"
              id="transcription-drawer"
            >
              {/* Sidebar Header */}
              <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Live Events Transcript
                </span>
                <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1.5 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  REC
                </span>
              </div>

              {/* Monospace Log Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 font-mono text-[11px] leading-relaxed select-text" id="chat-messages-container">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                    <MessageSquare className="w-5 h-5 text-zinc-700" />
                    <p className="font-mono text-[10px] text-zinc-600">[SYS] Pipeline initialized successfully.</p>
                    <p className="font-mono text-[10px] text-zinc-600">[SYS] Waiting for speaker stream...</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    const isAi = msg.sender === 'agent';
                    return (
                      <div key={msg.id} className="flex gap-2.5 items-start">
                        <span className="text-zinc-500 shrink-0 select-none">{timeString}</span>
                        <div className="word-break-all">
                          <span className={`font-semibold shrink-0 select-none ${isAi ? 'text-cyan-400' : 'text-emerald-400'}`}>
                            {isAi ? '[AI] ' : '[USR] '}
                          </span>
                          <span className={isAi ? 'text-cyan-100/90' : 'text-zinc-300'}>
                            {msg.text}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 bg-zinc-950/80 border-t border-zinc-800 flex gap-2 shrink-0" id="chat-input-form">
                <input
                  type="text"
                  placeholder="Type event payload command..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-slate-200 placeholder-zinc-600 transition"
                  id="chat-input-field"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 rounded transition active:scale-95 cursor-pointer shrink-0"
                  id="btn-chat-send"
                >
                  <Send className="w-3 h-3" />
                </button>
              </form>

              {/* High Density Stat Grid at the bottom of sidebar */}
              <div className="grid grid-cols-3 gap-[1px] bg-zinc-800 border-t border-zinc-800 shrink-0" id="stat-grid">
                <div className="bg-zinc-900 p-3 flex flex-col gap-0.5">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Latency</span>
                  <span className="font-mono text-xs text-zinc-200 font-bold">142ms</span>
                </div>
                <div className="bg-zinc-900 p-3 flex flex-col gap-0.5">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">VAD Sen.</span>
                  <span className="font-mono text-xs text-zinc-200 font-bold">-45dB</span>
                </div>
                <div className="bg-zinc-900 p-3 flex flex-col gap-0.5">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Sample</span>
                  <span className="font-mono text-xs text-zinc-200 font-bold">48kHz</span>
                </div>
              </div>
            </aside>
          )}
        </AnimatePresence>
      </main>

      {/* Sleek High Density controls footer */}
      <footer className="h-20 border-t border-zinc-800 flex items-center justify-center px-6 bg-zinc-950 relative shrink-0" id="session-footer">
        <div className="flex items-center gap-4 w-full" id="control-bar">
          
          <div className="flex items-center gap-2">
            {/* Microphone toggle */}
            <button
              onClick={toggleMic}
              className={`px-4 py-2 rounded border text-xs font-semibold tracking-wider transition cursor-pointer flex items-center gap-2 ${
                isMicEnabled
                  ? 'bg-cyan-500 text-zinc-950 border-cyan-500 hover:bg-cyan-400'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
              }`}
              title="Toggle Microphone"
              id="btn-toggle-mic"
            >
              {isMicEnabled ? (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>MUTE MIC</span>
                </>
              ) : (
                <>
                  <MicOff className="w-3.5 h-3.5" />
                  <span>UNMUTE MIC</span>
                </>
              )}
            </button>

            {/* Camera toggle */}
            <button
              onClick={() => setIsCameraEnabled(!isCameraEnabled)}
              className={`p-2 rounded border transition cursor-pointer ${
                isCameraEnabled
                  ? 'bg-cyan-500 text-zinc-950 border-cyan-500 hover:bg-cyan-400'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
              }`}
              title="Toggle Camera"
              id="btn-toggle-camera"
            >
              {isCameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>

            {/* Screen Share toggle */}
            <button
              onClick={() => setIsScreenShareEnabled(!isScreenShareEnabled)}
              className={`p-2 rounded border transition cursor-pointer ${
                isScreenShareEnabled
                  ? 'bg-cyan-500 text-zinc-950 border-cyan-500 hover:bg-cyan-400'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
              }`}
              title="Toggle Screenshare"
              id="btn-toggle-screen"
            >
              <Monitor className="w-4 h-4" />
            </button>

            {/* Transcript Drawer toggle */}
            <button
              onClick={() => setIsChatVisible(!isChatVisible)}
              className={`p-2 rounded border transition cursor-pointer ${
                isChatVisible
                  ? 'bg-zinc-800 text-cyan-400 border-zinc-700 hover:bg-zinc-750'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
              }`}
              title="Toggle Transcript Drawer"
              id="btn-toggle-chat"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>

          {/* End Session Button */}
          <button
            onClick={onDisconnect}
            className="px-5 py-2 bg-red-600 hover:bg-red-500 active:scale-95 border border-red-700 text-white rounded text-xs font-semibold tracking-wider transition cursor-pointer flex items-center gap-2"
            title="End Session"
            id="btn-end-session"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>END SESSION</span>
          </button>

          {/* Far Right Model Badge */}
          <div className="ml-auto text-[11px] font-mono text-zinc-500">
            Model: <strong className="text-zinc-400 font-bold">GPT-4o-Realtime</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
