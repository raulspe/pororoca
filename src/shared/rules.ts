// Regras puras do jogo: sem rede, sem tela. Valem no servidor e nos testes.

export type Rng = () => number;

export const DECK_SMALL = 100;
export const DECK_BIG = 1000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Hardcore: valores iniciais, ainda em teste. O servidor aceita outros por variável de ambiente. */
export const HARDCORE_LIVES = 3;
export const HARDCORE_ROUNDS = 12;

/** O baralho vai de 1 a 100; cresce para 1 a 1000 quando jogadores x cartas passa de 100. */
export function deckMaxFor(players: number, cardsPerPlayer: number): number {
  return players * cardsPerPlayer > DECK_SMALL ? DECK_BIG : DECK_SMALL;
}

/** Sorteia `count` números únicos entre 1 e `deckMax`. */
export function dealNumbers(count: number, deckMax: number, rng: Rng = Math.random): number[] {
  if (count > deckMax) throw new Error('Não há números suficientes no baralho.');
  const picked = new Set<number>();
  while (picked.size < count) picked.add(1 + Math.floor(rng() * deckMax));
  return [...picked];
}

/** A ordem está certa se nenhum número é menor que o anterior. Não existe errar por pouco. */
export function checkOrder(numbers: number[]): { ok: boolean; firstError: number | null } {
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] < numbers[i - 1]) return { ok: false, firstError: i };
  }
  return { ok: true, firstError: null };
}

/** Tira o item da posição `from` e o coloca na posição final `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(to, copy.length)), 0, item);
  return copy;
}

export function shuffle<T>(list: T[], rng: Rng = Math.random): T[] {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
