// Uma sala de jogo. O servidor é a única fonte da verdade: o navegador só pede, a sala decide.
import { randomUUID } from 'node:crypto';
import type { CardView, Mode, Phase, RoomView, Theme } from '../shared/protocol';
import { MAX_PLAYERS, MIN_PLAYERS, checkOrder, dealNumbers, deckMaxFor, moveItem, shuffle, type Rng } from '../shared/rules';
import { THEMES } from '../shared/themes';

/** Erro de regra, com mensagem pronta para mostrar ao jogador. */
export class GameError extends Error {}

interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
}

interface Card {
  id: string;
  ownerId: string;
  number: number;
  clue: string;
  heldBy: string | null;
}

const clean = (text: unknown, max: number) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export class Room {
  hostId = '';
  players: Player[] = [];
  phase: Phase = 'lobby';
  mode: Mode = 'chill';
  /** Tema escolhido pelo host no lobby. null = sortear ao começar. */
  chosenTheme: Theme | null = null;
  theme: Theme | null = null;
  round = 0;
  deckMax = 100;
  line: Card[] = [];
  oks = new Set<string>();
  result: { ok: boolean; firstError: number | null } | null = null;
  lastActive = Date.now();

  constructor(readonly code: string, private rng: Rng = Math.random) {}

  private player(id: string): Player {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new GameError('Você não está nesta sala.');
    return p;
  }

  private onlyHost(id: string) {
    if (id !== this.hostId) throw new GameError('Só o host pode fazer isso.');
  }

  private inPhase(phase: Phase) {
    if (this.phase !== phase) throw new GameError('Isso não pode ser feito agora.');
  }

  addPlayer(rawName: string): Player {
    const name = clean(rawName, 16);
    if (!name) throw new GameError('Escolha um apelido.');
    if (this.phase === 'playing') throw new GameError('Rodada em andamento. Tente de novo quando ela terminar.');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('A sala está cheia.');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new GameError('Já tem alguém com esse apelido na sala.');
    const p: Player = { id: randomUUID().slice(0, 8), token: randomUUID(), name, connected: true };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  reconnect(token: string): Player {
    const p = this.players.find((x) => x.token === token);
    if (!p) throw new GameError('Sessão não encontrada nesta sala.');
    p.connected = true;
    return p;
  }

  disconnect(id: string) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    p.connected = false;
    this.oks.delete(id);
    for (const c of this.line) if (c.heldBy === id) c.heldBy = null;
    this.passHostIfNeeded();
  }

  leave(id: string) {
    this.players = this.players.filter((p) => p.id !== id);
    this.oks.delete(id);
    if (this.phase === 'playing' && this.line.some((c) => c.ownerId === id)) {
      this.line = this.line.filter((c) => c.ownerId !== id);
      this.oks.clear();
    }
    for (const c of this.line) if (c.heldBy === id) c.heldBy = null;
    this.passHostIfNeeded();
  }

  private passHostIfNeeded() {
    const host = this.players.find((p) => p.id === this.hostId);
    if (host?.connected) return;
    const next = this.players.find((p) => p.connected);
    if (next) this.hostId = next.id;
  }

  get empty(): boolean {
    return !this.players.some((p) => p.connected);
  }

  setTheme(by: string, theme: Theme | null) {
    this.onlyHost(by);
    this.inPhase('lobby');
    if (theme === null) {
      this.chosenTheme = null;
      return;
    }
    const t = { name: clean(theme.name, 40), low: clean(theme.low, 60), high: clean(theme.high, 60) };
    if (!t.name || !t.low || !t.high) throw new GameError('Preencha o nome do tema e os dois extremos.');
    this.chosenTheme = t;
  }

  start(by: string) {
    this.onlyHost(by);
    if (this.phase === 'playing') throw new GameError('A rodada já começou.');
    if (this.players.filter((p) => p.connected).length < MIN_PLAYERS) throw new GameError(`Precisa de pelo menos ${MIN_PLAYERS} jogadores.`);
    // Quem caiu fica de fora desta rodada.
    this.players = this.players.filter((p) => p.connected);
    const cardsPerPlayer = 1; // Chill: uma carta por pessoa. O Hardcore vai mudar isto.
    this.deckMax = deckMaxFor(this.players.length, cardsPerPlayer);
    const numbers = dealNumbers(this.players.length * cardsPerPlayer, this.deckMax, this.rng);
    this.theme = this.chosenTheme ?? THEMES[Math.floor(this.rng() * THEMES.length)];
    this.round += 1;
    const cards: Card[] = this.players.map((p, i) => ({ id: `c${this.round}-${i}`, ownerId: p.id, number: numbers[i], clue: '', heldBy: null }));
    this.line = shuffle(cards, this.rng);
    this.oks.clear();
    this.result = null;
    this.phase = 'playing';
  }

  setClue(by: string, cardId: string, text: string) {
    this.inPhase('playing');
    const card = this.line.find((c) => c.id === cardId);
    if (!card || card.ownerId !== by) throw new GameError('Essa carta não é sua.');
    card.clue = clean(text, 40);
  }

  grab(by: string, cardId: string | null) {
    this.inPhase('playing');
    this.player(by);
    for (const c of this.line) if (c.heldBy === by) c.heldBy = null;
    if (cardId === null) return;
    const card = this.line.find((c) => c.id === cardId);
    if (card && !card.heldBy) card.heldBy = by;
  }

  /** Qualquer jogador pode mover qualquer carta. Mexeu, os oks de todos voltam a zero. */
  move(by: string, cardId: string, to: number) {
    this.inPhase('playing');
    this.player(by);
    const from = this.line.findIndex((c) => c.id === cardId);
    if (from < 0 || !Number.isInteger(to)) throw new GameError('Carta não encontrada.');
    for (const c of this.line) if (c.heldBy === by) c.heldBy = null;
    const target = Math.max(0, Math.min(to, this.line.length - 1));
    if (target === from) return;
    this.line = moveItem(this.line, from, target);
    this.oks.clear();
  }

  setOk(by: string, value: boolean) {
    this.inPhase('playing');
    this.player(by);
    if (value) this.oks.add(by);
    else this.oks.delete(by);
  }

  get allOk(): boolean {
    const connected = this.players.filter((p) => p.connected);
    return connected.length > 0 && connected.every((p) => this.oks.has(p.id));
  }

  reveal(by: string) {
    this.onlyHost(by);
    this.inPhase('playing');
    if (!this.allOk) throw new GameError('Ainda falta gente dar ok.');
    this.result = checkOrder(this.line.map((c) => c.number));
    for (const c of this.line) c.heldBy = null;
    this.phase = 'result';
  }

  again(by: string) {
    this.onlyHost(by);
    this.inPhase('result');
    this.start(by);
  }

  toLobby(by: string) {
    this.onlyHost(by);
    this.inPhase('result');
    this.phase = 'lobby';
    this.line = [];
    this.result = null;
    this.theme = null;
    this.oks.clear();
  }

  /** O que este jogador pode ver. Números alheios só aparecem depois da virada. */
  viewFor(id: string): RoomView {
    const revealed = this.phase === 'result';
    const line: CardView[] = this.line.map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      clue: c.clue,
      heldBy: c.heldBy,
      number: revealed || c.ownerId === id ? c.number : null,
    }));
    return {
      code: this.code,
      phase: this.phase,
      mode: this.mode,
      hostId: this.hostId,
      you: id,
      players: this.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, ok: this.oks.has(p.id) })),
      theme: this.phase === 'lobby' ? this.chosenTheme : this.theme,
      round: this.round,
      deckMax: this.deckMax,
      line,
      result: this.result,
    };
  }
}
