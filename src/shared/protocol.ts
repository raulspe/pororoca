// Mensagens trocadas entre o navegador e o servidor, e o que cada jogador enxerga da sala.

export type Mode = 'chill' | 'hardcore' | 'impostor';
export type Phase = 'lobby' | 'playing' | 'result' | 'over';

export interface Theme {
  name: string;
  low: string;
  high: string;
}

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  ok: boolean;
}

export interface CardView {
  id: string;
  ownerId: string;
  clue: string;
  /** Quem está arrastando a carta agora, se alguém estiver. */
  heldBy: string | null;
  /** Só vem preenchido para o dono da carta ou depois da virada. */
  number: number | null;
}

export interface HardcoreView {
  lives: number;
  maxLives: number;
  totalRounds: number;
  cardsPlayed: number;
  /** Preenchido quando a partida acabou: venceu todas as rodadas ou ficou sem vidas. */
  outcome: 'won' | 'lost' | null;
}

export interface RoomView {
  code: string;
  phase: Phase;
  mode: Mode;
  hostId: string;
  you: string;
  players: PlayerView[];
  /** Tema da rodada. No lobby é o tema escolhido pelo host (null = sortear ao começar). */
  theme: Theme | null;
  /** Rodada dentro da partida atual (no Hardcore, também é o número de cartas por pessoa). */
  round: number;
  /** Cresce a cada distribuição de cartas; a tela usa para saber quando mostrar a mão nova. */
  deal: number;
  deckMax: number;
  line: CardView[];
  result: { ok: boolean; firstError: number | null } | null;
  hardcore: HardcoreView | null;
}

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'mode'; mode: Mode }
  | { t: 'theme'; theme: Theme | null }
  | { t: 'start' }
  | { t: 'clue'; cardId: string; text: string }
  | { t: 'grab'; cardId: string | null }
  | { t: 'move'; cardId: string; to: number }
  | { t: 'ok'; value: boolean }
  | { t: 'reveal' }
  | { t: 'again' }
  | { t: 'lobby' }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'welcome'; code: string; playerId: string; token: string }
  | { t: 'state'; room: RoomView }
  | { t: 'left' }
  | { t: 'error'; message: string; fatal?: boolean };
