/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import ConnectScreen from './components/ConnectScreen';
import VoiceAssistantScreen from './components/VoiceAssistantScreen';
import JarvisAndroidScreen from './components/JarvisAndroidScreen';
import { ConnectionConfig } from './types';
import { AnimatePresence, motion } from 'motion/react';

export default function App() {
  const [appMode, setAppMode] = useState<'jarvis' | 'livekit'>('jarvis');
  const [activeConfig, setActiveConfig] = useState<ConnectionConfig | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnect = async (config: ConnectionConfig) => {
    setIsConnecting(true);
    setConnectionError(null);

    // Simple delay to show the connection flow, then set the active config
    setTimeout(() => {
      setIsConnecting(false);
      setActiveConfig(config);
    }, 1200);
  };

  const handleDisconnect = () => {
    setActiveConfig(null);
    setConnectionError(null);
  };

  return (
    <div className="bg-zinc-950 min-h-screen text-slate-100 font-sans antialiased" id="app-root">
      <AnimatePresence mode="wait">
        {appMode === 'jarvis' ? (
          <motion.div
            key="jarvis-android"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full"
          >
            <JarvisAndroidScreen onBackToLiveKit={() => setAppMode('livekit')} />
          </motion.div>
        ) : !activeConfig ? (
          <motion.div
            key="connect"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            {/* Added a Header back button to return to Jarvis app */}
            <div className="max-w-md mx-auto pt-6 px-4">
              <button 
                onClick={() => setAppMode('jarvis')}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1.5 uppercase cursor-pointer"
              >
                ← Return to Jarvis Android Companion
              </button>
            </div>
            <ConnectScreen
              onConnect={handleConnect}
              isConnecting={isConnecting}
              connectionError={connectionError}
            />
          </motion.div>
        ) : (
          <motion.div
            key="assistant"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <VoiceAssistantScreen
              config={activeConfig}
              onDisconnect={handleDisconnect}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
