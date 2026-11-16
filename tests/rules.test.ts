import { describe, expect, it } from 'vitest';
import { checkOrder, dealNumbers, deckMaxFor, moveItem } from '../src/shared/rules';
import { THEMES } from '../src/shared/themes';

describe('regras', () => {
  it('sorteia números únicos dentro do baralho', () => {
    const nums = dealNumbers(100, 100);
    expect(new Set(nums).size).toBe(100);
    expect(Math.min(...nums)).toBe(1);
    expect(Math.max(...nums)).toBe(100);
    expect(() => dealNumbers(101, 100)).toThrow();
  });

  it('o baralho cresce quando jogadores x cartas passa de 100', () => {
    expect(deckMaxFor(8, 12)).toBe(100); // 96 ainda cabe
    expect(deckMaxFor(8, 13)).toBe(1000);
    expect(deckMaxFor(4, 1)).toBe(100);
  });

  it('qualquer carta fora de ordem é erro, e aponta a primeira', () => {
    expect(checkOrder([12, 31, 47, 74])).toEqual({ ok: true, firstError: null });
    expect(checkOrder([12, 31, 74, 47])).toEqual({ ok: false, firstError: 3 });
    expect(checkOrder([50, 49])).toEqual({ ok: false, firstError: 1 });
    expect(checkOrder([7])).toEqual({ ok: true, firstError: null });
  });

  it('move um item para a posição final pedida', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });

  it('tem 100 temas completos e sem nome repetido', () => {
    expect(THEMES).toHaveLength(100);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(100);
    expect(THEMES.every((t) => t.name && t.low && t.high)).toBe(true);
  });
});
