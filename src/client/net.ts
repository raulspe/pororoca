// Conexão com o servidor de salas. Reconecta sozinha e devolve o jogador ao seu lugar.
import { useSyncExternalStore } from 'react';
import type { ClientMsg, RoomView, ServerMsg } from '../shared/protocol';

export interface NetState {
  room: RoomView | null;
  error: string | null;
  online: boolean;
}

const KEY = 'pororoca.sessao'; // por aba: duas abas são dois jogadores (bom para testar)
let state: NetState = { room: null, error: null, online: false };
const listeners = new Set<() => void>();
const pending: ClientMsg[] = [];
let ws: WebSocket | null = null;
let tries = 0;
let errorTimer: number | undefined;

function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function showError(message: string) {
  window.clearTimeout(errorTimer);
  set({ error: message });
  errorTimer = window.setTimeout(() => set({ error: null }), 4500);
}

function saved(): { code: string; token: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

function raw(msg: ClientMsg) {
  ws?.send(JSON.stringify(msg));
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    tries = 0;
    set({ online: true });
    const s = saved();
    if (s) raw({ t: 'rejoin', code: s.code, token: s.token });
    while (pending.length) raw(pending.shift()!);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as ServerMsg;
    if (msg.t === 'welcome') sessionStorage.setItem(KEY, JSON.stringify({ code: msg.code, token: msg.token }));
    else if (msg.t === 'state') set({ room: msg.room });
    else if (msg.t === 'left') {
      sessionStorage.removeItem(KEY);
      set({ room: null });
    } else if (msg.t === 'error') {
      if (msg.fatal) {
        sessionStorage.removeItem(KEY);
        set({ room: null });
      }
      showError(msg.message);
    }
  };
  ws.onclose = () => {
    set({ online: false });
    tries += 1;
    window.setTimeout(connect, Math.min(4000, 500 * tries));
  };
}

export function send(msg: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) raw(msg);
  else pending.push(msg);
}

export function useNet(): NetState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

connect();
