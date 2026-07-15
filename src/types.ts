export interface ConnectionConfig {
  sandboxId: string;
  url: string;
  token: string;
  connectionType: 'sandbox' | 'custom';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: number;
}

export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'disconnected';
