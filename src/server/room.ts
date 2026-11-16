// Uma sala de jogo. O servidor é a única fonte da verdade: o navegador só pede, a sala decide.
import { randomUUID } from 'node:crypto';
import type { CardView, Mode, Phase, RoomView, Theme } from '../shared/protocol';
import { HARDCORE_LIVES, HARDCORE_ROUNDS, MAX_PLAYERS, MIN_PLAYERS, checkOrder, dealNumbers, deckMaxFor, moveItem, shuffle, type Rng } from '../shared/rules';
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

export interface RoomOptions {
  hardcoreLives: number;
  hardcoreRounds: number;
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
  deal = 0;
  deckMax = 100;
  // Hardcore
  lives = 0;
  cardsPlayed = 0;
  outcome: 'won' | 'lost' | null = null;
  line: Card[] = [];
  oks = new Set<string>();
  result: { ok: boolean; firstError: number | null } | null = null;
  lastActive = Date.now();

  constructor(
    readonly code: string,
    private rng: Rng = Math.random,
    private opts: RoomOptions = { hardcoreLives: HARDCORE_LIVES, hardcoreRounds: HARDCORE_ROUNDS },
  ) {}

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

  setMode(by: string, mode: Mode) {
    this.onlyHost(by);
    this.inPhase('lobby');
    if (mode !== 'chill' && mode !== 'hardcore') throw new GameError('Esse modo ainda não está disponível.');
    this.mode = mode;
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

  /** Começa uma partida nova a partir do lobby. */
  start(by: string) {
    this.onlyHost(by);
    this.inPhase('lobby');
    this.round = 0;
    this.lives = this.opts.hardcoreLives;
    this.cardsPlayed = 0;
    this.outcome = null;
    this.dealRound();
  }

  /** Distribui uma mão nova. No Hardcore, a rodada N dá N cartas por pessoa e o tema é sempre sorteado. */
  private dealRound() {
    if (this.players.filter((p) => p.connected).length < MIN_PLAYERS) throw new GameError(`Precisa de pelo menos ${MIN_PLAYERS} jogadores.`);
    // Quem caiu fica de fora desta rodada.
    this.players = this.players.filter((p) => p.connected);
    const hardcore = this.mode === 'hardcore';
    const cardsPerPlayer = hardcore ? this.round + 1 : 1;
    this.deckMax = deckMaxFor(this.players.length, cardsPerPlayer);
    const numbers = dealNumbers(this.players.length * cardsPerPlayer, this.deckMax, this.rng);
    this.theme = (!hardcore && this.chosenTheme) || this.randomTheme();
    this.round += 1;
    this.deal += 1;
    const cards: Card[] = [];
    this.players.forEach((p, pi) => {
      for (let k = 0; k < cardsPerPlayer; k++) {
        const n = pi * cardsPerPlayer + k;
        cards.push({ id: `c${this.deal}-${n}`, ownerId: p.id, number: numbers[n], clue: '', heldBy: null });
      }
    });
    this.line = shuffle(cards, this.rng);
    this.oks.clear();
    this.result = null;
    this.phase = 'playing';
  }

  /** Sorteia um tema diferente do anterior. */
  private randomTheme(): Theme {
    for (let tries = 0; tries < 10; tries++) {
      const t = THEMES[Math.floor(this.rng() * THEMES.length)];
      if (t.name !== this.theme?.name) return t;
    }
    return THEMES[0];
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
    if (this.mode === 'hardcore') {
      this.cardsPlayed += this.line.length;
      if (!this.result.ok) this.lives -= 1; // não existe errar por pouco
      if (this.lives <= 0) this.outcome = 'lost';
      else if (this.round >= this.opts.hardcoreRounds) this.outcome = 'won';
    }
    this.phase = 'result';
  }

  /** Próxima rodada. No Hardcore, se a partida acabou, vai para a tela final. */
  again(by: string) {
    this.onlyHost(by);
    this.inPhase('result');
    if (this.mode === 'hardcore' && this.outcome) {
      this.phase = 'over';
      return;
    }
    this.dealRound();
  }

  toLobby(by: string) {
    this.onlyHost(by);
    if (this.phase !== 'result' && this.phase !== 'over') throw new GameError('Isso não pode ser feito agora.');
    this.phase = 'lobby';
    this.outcome = null;
    this.line = [];
    this.result = null;
    this.theme = null;
    this.oks.clear();
  }

  /** O que este jogador pode ver. Números alheios só aparecem depois da virada. */
  viewFor(id: string): RoomView {
    const revealed = this.phase === 'result' || this.phase === 'over';
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
      deal: this.deal,
      deckMax: this.deckMax,
      line,
      result: this.result,
      hardcore: this.mode === 'hardcore'
        ? { lives: Math.max(0, this.lives), maxLives: this.opts.hardcoreLives, totalRounds: this.opts.hardcoreRounds, cardsPlayed: this.cardsPlayed, outcome: this.outcome }
        : null,
    };
  }
}
