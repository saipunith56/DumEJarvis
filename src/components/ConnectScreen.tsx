import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ConnectionConfig } from '../types';
import { Radio, Key, Link as LinkIcon, AlertCircle, HelpCircle } from 'lucide-react';

interface ConnectScreenProps {
  onConnect: (config: ConnectionConfig) => void;
  isConnecting: boolean;
  connectionError: string | null;
}

export default function ConnectScreen({ onConnect, isConnecting, connectionError }: ConnectScreenProps) {
  const [connectionType, setConnectionType] = useState<'sandbox' | 'custom'>('sandbox');
  const [sandboxId, setSandboxId] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Load saved credentials from localStorage
  useEffect(() => {
    const savedType = localStorage.getItem('lk_conn_type') as 'sandbox' | 'custom' | null;
    const savedSandboxId = localStorage.getItem('lk_sandbox_id');
    const savedUrl = localStorage.getItem('lk_url');
    const savedToken = localStorage.getItem('lk_token');

    if (savedType) setConnectionType(savedType);
    if (savedSandboxId) setSandboxId(savedSandboxId);
    if (savedUrl) setUrl(savedUrl);
    if (savedToken) setToken(savedToken);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Save configurations
    localStorage.setItem('lk_conn_type', connectionType);
    if (connectionType === 'sandbox') {
      localStorage.setItem('lk_sandbox_id', sandboxId.trim());
    } else {
      localStorage.setItem('lk_url', url.trim());
      localStorage.setItem('lk_token', token.trim());
    }

    onConnect({
      connectionType,
      sandboxId: sandboxId.trim(),
      url: url.trim(),
      token: token.trim(),
    });
  };

  const fillDemoCredentials = () => {
    setConnectionType('custom');
    setUrl('wss://demo-voice-assistant.livekit.io');
    setToken('demo_token_please_replace');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100 flex items-center justify-center p-4 selection:bg-cyan-500 selection:text-slate-950" id="connect-screen">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden"
        id="connect-card"
      >
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-cyan-500/30 blur-md rounded-full" />
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full" />

        {/* Header */}
        <div className="text-center mb-8 relative z-10" id="connect-header">
          <div className="inline-flex items-center justify-center p-4 bg-zinc-950 rounded border border-zinc-800 mb-4">
            <motion.div
              animate={isConnecting ? { rotate: 360 } : {}}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            >
              <Radio className="w-8 h-8 text-cyan-400" />
            </motion.div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            DumEJarvis
          </h1>
          <p className="text-zinc-400 text-xs font-mono uppercase tracking-widest mt-2">
            REAL-TIME VOICE INTERFACE v1.0.4
          </p>
        </div>

        {/* Info or error alert */}
        {connectionError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 bg-red-950/20 border border-red-900/40 rounded flex gap-3 text-red-200 text-xs relative z-10"
            id="error-alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <div>
              <p className="font-semibold font-mono">CONNECTION_FAILED</p>
              <p className="text-red-300/80 mt-0.5">{connectionError}</p>
            </div>
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10" id="connect-form">
          {/* Connection Type Tabs */}
          <div className="grid grid-cols-2 bg-zinc-950 p-1 rounded border border-zinc-800" id="type-tabs">
            <button
              type="button"
              id="tab-sandbox"
              onClick={() => setConnectionType('sandbox')}
              className={`py-2 px-3 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-all ${
                connectionType === 'sandbox'
                  ? 'bg-zinc-800 text-cyan-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Sandbox ID
            </button>
            <button
              type="button"
              id="tab-custom"
              onClick={() => setConnectionType('custom')}
              className={`py-2 px-3 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-all ${
                connectionType === 'custom'
                  ? 'bg-zinc-800 text-cyan-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Manual Key
            </button>
          </div>

          {/* Conditional Inputs */}
          {connectionType === 'sandbox' ? (
            <div className="space-y-2" id="sandbox-inputs">
              <label htmlFor="sandboxId" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Sandbox ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-650">
                  <Radio className="w-4 h-4 text-zinc-500" />
                </div>
                <input
                  type="text"
                  id="sandboxId"
                  required
                  placeholder="e.g. sandbox-abc-123"
                  value={sandboxId}
                  onChange={(e) => setSandboxId(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-slate-200 placeholder-zinc-700 transition"
                />
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">
                You can obtain your Sandbox ID by creating a Quickstart Voice Agent in your{' '}
                <a
                  href="https://cloud.livekit.io"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-0.5"
                >
                  LiveKit Cloud Console
                </a>.
              </p>
            </div>
          ) : (
            <div className="space-y-4" id="custom-inputs">
              <div className="space-y-2">
                <label htmlFor="url" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  LiveKit Server URL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-650">
                    <LinkIcon className="w-4 h-4 text-zinc-500" />
                  </div>
                  <input
                    type="url"
                    id="url"
                    required
                    placeholder="wss://your-project.livekit.cloud"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-slate-200 placeholder-zinc-700 transition"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="token" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Access Token
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-650">
                    <Key className="w-4 h-4 text-zinc-500" />
                  </div>
                  <input
                    type="password"
                    id="token"
                    required
                    placeholder="eyJhbGciOi..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-slate-200 placeholder-zinc-700 transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            id="btn-submit-connect"
            disabled={isConnecting}
            className="w-full relative py-3 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 rounded font-mono font-bold tracking-wider text-xs transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 overflow-hidden"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-zinc-950" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>CONNECTING...</span>
              </>
            ) : (
              <span>START CALL</span>
            )}
          </button>
        </form>

        {/* Footer controls */}
        <div className="mt-8 pt-4 border-t border-zinc-850 flex justify-between items-center text-[10px] text-zinc-500 relative z-10 font-mono uppercase tracking-wider" id="connect-footer">
          <button
            type="button"
            id="btn-help"
            onClick={() => setShowHelp(!showHelp)}
            className="hover:text-zinc-300 flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Need setup help?</span>
          </button>
          <button
            type="button"
            id="btn-fill-demo"
            onClick={fillDemoCredentials}
            className="hover:text-cyan-400 text-zinc-450 cursor-pointer"
          >
            Load placeholders
          </button>
        </div>

        {/* Help block */}
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500 leading-relaxed space-y-2 relative z-10"
            id="help-block"
          >
            <p className="font-semibold text-zinc-300">How to get a LiveKit Token:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Sign up / log in to <a href="https://cloud.livekit.io" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">LiveKit Cloud</a>.</li>
              <li>Create a new project or select an existing one.</li>
              <li>Click on the <strong>Sandbox</strong> tab to run a pre-configured Agent and grab its <strong>Sandbox ID</strong>, OR:</li>
              <li>Go to <strong>Settings &gt; Keys</strong> to generate a custom token with a room name and user identity.</li>
            </ol>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
