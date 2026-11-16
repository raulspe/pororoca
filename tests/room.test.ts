import { describe, expect, it } from 'vitest';
import { GameError, Room } from '../src/server/room';

function sala(n = 3) {
  const room = new Room('TEST');
  const ps = Array.from({ length: n }, (_, i) => room.addPlayer(`J${i + 1}`));
  return { room, ps, host: ps[0] };
}

/** Coloca as cartas em ordem crescente usando só o que o servidor permite (mover). */
function ordenar(room: Room, by: string) {
  const sorted = room.line.slice().sort((a, b) => a.number - b.number);
  sorted.forEach((card, i) => room.move(by, card.id, i));
}

describe('sala', () => {
  it('o primeiro a entrar é o host e apelidos repetidos são recusados', () => {
    const { room, host } = sala(2);
    expect(room.hostId).toBe(host.id);
    expect(() => room.addPlayer('j1')).toThrow(GameError);
    expect(() => room.addPlayer('   ')).toThrow(GameError);
  });

  it('precisa de 2 jogadores e só o host começa', () => {
    const room = new Room('TEST');
    const a = room.addPlayer('Ana');
    expect(() => room.start(a.id)).toThrow(GameError);
    const b = room.addPlayer('Beto');
    expect(() => room.start(b.id)).toThrow(GameError);
    room.start(a.id);
    expect(room.phase).toBe('playing');
    expect(room.line).toHaveLength(2);
    expect(room.theme).not.toBeNull();
  });

  it('cada um só vê o próprio número até a virada', () => {
    const { room, ps, host } = sala(3);
    room.start(host.id);
    for (const p of ps) {
      const view = room.viewFor(p.id);
      const visiveis = view.line.filter((c) => c.number !== null);
      expect(visiveis).toHaveLength(1);
      expect(visiveis[0].ownerId).toBe(p.id);
    }
  });

  it('mexer no varal zera os oks de todos', () => {
    const { room, ps, host } = sala(3);
    room.start(host.id);
    ps.forEach((p) => room.setOk(p.id, true));
    expect(room.allOk).toBe(true);
    room.move(ps[1].id, room.line[0].id, 2);
    expect(room.oks.size).toBe(0);
    expect(() => room.reveal(host.id)).toThrow(GameError);
  });

  it('mover para o mesmo lugar não zera os oks', () => {
    const { room, ps, host } = sala(3);
    room.start(host.id);
    ps.forEach((p) => room.setOk(p.id, true));
    room.move(ps[1].id, room.line[1].id, 1);
    expect(room.allOk).toBe(true);
  });

  it('ordem certa vence; uma carta fora de ordem perde', () => {
    const { room, ps, host } = sala(4);
    room.start(host.id);
    ordenar(room, ps[2].id);
    ps.forEach((p) => room.setOk(p.id, true));
    expect(() => room.reveal(ps[1].id)).toThrow(GameError); // só o host vira
    room.reveal(host.id);
    expect(room.result).toEqual({ ok: true, firstError: null });
    expect(room.viewFor(ps[3].id).line.every((c) => c.number !== null)).toBe(true);

    room.again(host.id);
    expect(room.round).toBe(2);
    ordenar(room, host.id);
    room.move(host.id, room.line[0].id, 3); // menor número vai para o fim
    ps.forEach((p) => room.setOk(p.id, true));
    room.reveal(host.id);
    expect(room.result).toEqual({ ok: false, firstError: 3 });
  });

  it('só o dono escreve a dica da própria carta', () => {
    const { room, ps, host } = sala(2);
    room.start(host.id);
    const minha = room.line.find((c) => c.ownerId === ps[1].id)!;
    expect(() => room.setClue(host.id, minha.id, 'x')).toThrow(GameError);
    room.setClue(ps[1].id, minha.id, '  festa   junina  ');
    expect(minha.clue).toBe('festa junina');
  });

  it('ninguém entra no meio da rodada; se o host cai, outro assume', () => {
    const { room, ps, host } = sala(3);
    room.start(host.id);
    expect(() => room.addPlayer('Atrasado')).toThrow(GameError);
    room.disconnect(host.id);
    expect(room.hostId).toBe(ps[1].id);
    // quem caiu não trava a virada
    room.setOk(ps[1].id, true);
    room.setOk(ps[2].id, true);
    expect(room.allOk).toBe(true);
    // e volta ao seu lugar com o token
    expect(room.reconnect(host.token).id).toBe(host.id);
  });

  it('tema livre exige nome e os dois extremos', () => {
    const { room, host } = sala(2);
    expect(() => room.setTheme(host.id, { name: 'Cheiro', low: '', high: 'x' })).toThrow(GameError);
    room.setTheme(host.id, { name: 'Cheiro', low: 'cheiro de nada', high: 'peixe frito no elevador' });
    room.start(host.id);
    expect(room.theme?.name).toBe('Cheiro');
  });
});

describe('hardcore', () => {
  function hc(n = 3, opts = { hardcoreLives: 3, hardcoreRounds: 12 }) {
    const room = new Room('HARD', Math.random, opts);
    const ps = Array.from({ length: n }, (_, i) => room.addPlayer(`J${i + 1}`));
    room.setMode(ps[0].id, 'hardcore');
    return { room, ps, host: ps[0] };
  }
  const jogar = (room: Room, ps: { id: string }[], certo: boolean) => {
    ordenar(room, ps[0].id);
    if (!certo) room.move(ps[0].id, room.line[0].id, room.line.length - 1);
    ps.forEach((p) => room.setOk(p.id, true));
    room.reveal(ps[0].id);
  };

  it('só o host troca o modo, e o Impostor ainda não existe', () => {
    const { room, ps, host } = hc(2);
    expect(() => room.setMode(ps[1].id, 'chill')).toThrow(GameError);
    expect(() => room.setMode(host.id, 'impostor')).toThrow(GameError);
    expect(room.mode).toBe('hardcore');
  });

  it('a rodada N dá N cartas por pessoa, com mão nova e tema sempre sorteado', () => {
    const { room, ps, host } = hc(3);
    room.setTheme(host.id, { name: 'Escolhido', low: 'a', high: 'b' });
    room.start(host.id);
    expect(room.theme?.name).not.toBe('Escolhido');
    expect(room.line).toHaveLength(3);
    const primeira = room.line.map((c) => c.id);
    const tema1 = room.theme?.name;
    jogar(room, ps, true);
    room.again(host.id);
    expect(room.round).toBe(2);
    expect(room.line).toHaveLength(6);
    expect(room.theme?.name).not.toBe(tema1);
    expect(room.line.some((c) => primeira.includes(c.id))).toBe(false);
    for (const p of ps) {
      const minhas = room.viewFor(p.id).line.filter((c) => c.number !== null);
      expect(minhas).toHaveLength(2);
      expect(minhas.every((c) => c.ownerId === p.id)).toBe(true);
    }
    expect(new Set(room.line.map((c) => c.number)).size).toBe(6);
  });

  it('errar custa uma vida e a partida segue; sem vidas, acabou', () => {
    const { room, ps, host } = hc(2, { hardcoreLives: 2, hardcoreRounds: 12 });
    room.start(host.id);
    jogar(room, ps, false);
    expect(room.viewFor(host.id).hardcore).toMatchObject({ lives: 1, outcome: null });
    room.again(host.id);
    expect(room.round).toBe(2); // a rodada avança mesmo com erro
    jogar(room, ps, false);
    expect(room.viewFor(host.id).hardcore).toMatchObject({ lives: 0, outcome: 'lost', cardsPlayed: 6 });
    room.again(host.id);
    expect(room.phase).toBe('over');
    room.toLobby(host.id);
    expect(room.phase).toBe('lobby');
  });

  it('quem passa por todas as rodadas com vida sobrando vence', () => {
    const { room, ps, host } = hc(2, { hardcoreLives: 3, hardcoreRounds: 4 });
    room.start(host.id);
    for (let r = 1; r <= 4; r++) {
      expect(room.line).toHaveLength(2 * r);
      jogar(room, ps, r !== 2); // erra só a rodada 2
      if (r < 4) room.again(host.id);
    }
    const v = room.viewFor(host.id).hardcore!;
    expect(v).toMatchObject({ lives: 2, outcome: 'won', cardsPlayed: 20, totalRounds: 4 });
    room.again(host.id);
    expect(room.phase).toBe('over');
    // uma partida nova começa do zero
    room.toLobby(host.id);
    room.start(host.id);
    expect(room.round).toBe(1);
    expect(room.viewFor(host.id).hardcore).toMatchObject({ lives: 3, outcome: null, cardsPlayed: 0 });
  });

  it('o Chill não usa vidas', () => {
    const room = new Room('CHIL');
    const a = room.addPlayer('Ana');
    room.addPlayer('Beto');
    room.start(a.id);
    expect(room.viewFor(a.id).hardcore).toBeNull();
  });
});
