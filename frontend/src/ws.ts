// Singleton WebSocket client for RuleForge realtime layer.
// Reconnects on drop, multiplexes events to subscribers.
import { Platform } from 'react-native';
import { getToken } from './api';

type Listener = (msg: any) => void;

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

function wsUrl(token: string): string {
  // Convert https://... → wss://.../api/ws?token=...
  let url = BASE;
  if (!url) {
    if (typeof window !== 'undefined' && window.location) {
      url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    }
  } else {
    url = url.replace(/^http/, 'ws');
  }
  return `${url}/api/ws?token=${encodeURIComponent(token)}`;
}

class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: any = null;
  private connecting = false;
  private currentToken: string | null = null;
  private heartbeat: any = null;
  public connected = false;

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(msg: any): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify(msg));
    } catch {}
  }

  async connect(): Promise<void> {
    if (this.connecting || (this.socket && this.socket.readyState === 1)) return;
    const token = await getToken();
    if (!token) return;
    this.currentToken = token;
    this.connecting = true;
    try {
      const ws = new WebSocket(wsUrl(token));
      this.socket = ws;
      ws.onopen = () => {
        this.connecting = false;
        this.connected = true;
        this.emit({ type: '__connected' });
        // heartbeat
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => this.send({ type: 'ping' }), 25000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          this.emit(msg);
        } catch {}
      };
      ws.onerror = () => {
        // onclose will follow; nothing to do here
      };
      ws.onclose = () => {
        this.connecting = false;
        this.connected = false;
        this.socket = null;
        if (this.heartbeat) {
          clearInterval(this.heartbeat);
          this.heartbeat = null;
        }
        this.emit({ type: '__disconnected' });
        // Schedule reconnect if we still have a token
        if (this.currentToken) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect(), 1500);
        }
      };
    } catch (e) {
      this.connecting = false;
      if (this.currentToken) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 2500);
      }
    }
  }

  disconnect(): void {
    this.currentToken = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.socket) {
      try { this.socket.close(); } catch {}
    }
    this.socket = null;
    this.connected = false;
  }

  private emit(msg: any) {
    this.listeners.forEach((fn) => {
      try { fn(msg); } catch {}
    });
  }
}

export const realtime = new RealtimeClient();
// Track if we've been initialised (not Platform-specific; works on web + native)
void Platform;
