import { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { AgentState } from '../types';

interface VisualizerProps {
  agentState: AgentState;
  audioTrack: any | null; // LiveKit RemoteAudioTrack
}

export default function Visualizer({ agentState, audioTrack }: VisualizerProps) {
  const [amplitudes, setAmplitudes] = useState<number[]>([15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    // Attempt to set up Web Audio API on the incoming LiveKit audio track
    if (!audioTrack || !audioTrack.mediaStream) {
      // Clear audio context if track is removed
      cleanupAudio();
      return;
    }

    try {
      const mediaStream = audioTrack.mediaStream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // Small fft for 10 simple bands
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      sourceRef.current = source;
    } catch (err) {
      console.warn("Failed to initialize Web Audio Analyser:", err);
    }

    return () => {
      cleanupAudio();
    };
  }, [audioTrack]);

  const cleanupAudio = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  useEffect(() => {
    const updateLevels = () => {
      if (analyserRef.current && agentState === 'speaking') {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Map frequency bins into 10 bars
        const nextAmplitudes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const binsPerBar = Math.max(1, Math.floor(bufferLength / 10));

        for (let i = 0; i < 10; i++) {
          let sum = 0;
          for (let j = 0; j < binsPerBar; j++) {
            const index = i * binsPerBar + j;
            if (index < bufferLength) {
              sum += dataArray[index];
            }
          }
          const average = sum / binsPerBar;
          // Scale from 0-255 to min 10% to max 100% height
          nextAmplitudes[i] = Math.max(12, Math.min(100, (average / 255) * 120));
        }
        setAmplitudes(nextAmplitudes);
      } else {
        // Fallback animations depending on agent state
        if (agentState === 'speaking') {
          // Speak simulation if browser blocks AudioContext or track is not analyzed yet
          const time = Date.now() * 0.008;
          const sim = [
            Math.sin(time) * 35 + 50,
            Math.sin(time + 0.6) * 45 + 50,
            Math.sin(time + 1.2) * 30 + 60,
            Math.sin(time + 1.8) * 40 + 50,
            Math.sin(time + 2.4) * 25 + 40,
            Math.sin(time + 3.0) * 35 + 50,
            Math.sin(time + 3.6) * 45 + 50,
            Math.sin(time + 4.2) * 30 + 60,
            Math.sin(time + 4.8) * 40 + 50,
            Math.sin(time + 5.4) * 25 + 40,
          ];
          setAmplitudes(sim);
        } else if (agentState === 'thinking') {
          // Thinking wave: smooth periodic wave moving across the 10 bars
          const time = Date.now() * 0.005;
          const wave = [
            Math.sin(time) * 15 + 25,
            Math.sin(time + 0.5) * 15 + 25,
            Math.sin(time + 1.0) * 15 + 25,
            Math.sin(time + 1.5) * 15 + 25,
            Math.sin(time + 2.0) * 15 + 25,
            Math.sin(time + 2.5) * 15 + 25,
            Math.sin(time + 3.0) * 15 + 25,
            Math.sin(time + 3.5) * 15 + 25,
            Math.sin(time + 4.0) * 15 + 25,
            Math.sin(time + 4.5) * 15 + 25,
          ];
          setAmplitudes(wave);
        } else if (agentState === 'listening') {
          // Listening pulse: ambient tiny breathing motion
          const breathing = Math.sin(Date.now() * 0.003) * 4 + 16;
          setAmplitudes([
            breathing - 1, breathing + 2, breathing, breathing + 1, breathing - 2,
            breathing - 1, breathing + 2, breathing, breathing + 1, breathing - 2
          ]);
        } else {
          // Idle state
          setAmplitudes([12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
        }
      }

      animationRef.current = requestAnimationFrame(updateLevels);
    };

    animationRef.current = requestAnimationFrame(updateLevels);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [agentState]);

  // Color mapping based on agent state to make it incredibly expressive
  const getBarColor = () => {
    switch (agentState) {
      case 'speaking':
        return 'bg-cyan-400 shadow-cyan-500/50';
      case 'thinking':
        return 'bg-purple-400 shadow-purple-500/50';
      case 'listening':
        return 'bg-emerald-400 shadow-emerald-500/50';
      case 'disconnected':
        return 'bg-red-500 shadow-red-500/30';
      default:
        return 'bg-gray-500 shadow-gray-500/20';
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 w-full h-32 md:h-40" id="visualizer-container">
      {amplitudes.map((height, index) => (
        <motion.div
          key={index}
          id={`visualizer-bar-${index}`}
          className={`w-3 md:w-4 rounded-full transition-colors duration-300 shadow-lg ${getBarColor()}`}
          animate={{ height: `${height}%` }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          style={{ minHeight: '8px' }}
        />
      ))}
    </div>
  );
}
