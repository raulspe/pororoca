import { useEffect, useState, type ReactNode } from 'react';
import type { CardView, HardcoreView, Mode, PlayerView, RoomView, Theme } from '../shared/protocol';
import { MIN_PLAYERS } from '../shared/rules';
import { THEMES } from '../shared/themes';
import { Line } from './Line';
import { send, useNet } from './net';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}

/** Conta de 0 até `target` enquanto a água sobe. */
function useCountUp(target: number, ms: number): number {
  const [value, setValue] = useState(ms ? 0 : target);
  useEffect(() => {
    if (!ms) return setValue(target);
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const Wave = ({ className = '' }: { className?: string }) => (
  <svg className={`wave ${className}`} viewBox="0 0 560 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 14 Q35 0 70 14 T140 14 T210 14 T280 14 T350 14 T420 14 T490 14 T560 14 V30 H0Z" />
  </svg>
);

const Grip = () => (
  <span className="grip" data-handle aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 18 18"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  </span>
);

function Lives({ hc }: { hc: HardcoreView }) {
  return (
    <span className="lives" role="img" aria-label={`${hc.lives} de ${plural(hc.maxLives, 'vida', 'vidas')}`}>
      {Array.from({ length: hc.maxLives }, (_, i) => (
        <svg key={i} className={i < hc.lives ? 'full' : ''} width="18" height="22" viewBox="0 0 20 24" aria-hidden="true">
          <path d="M10 1C10 1 2 10 2 15a8 8 0 0016 0C18 10 10 1 10 1z" />
        </svg>
      ))}
    </span>
  );
}

function ThemeHead({ theme, big }: { theme: Theme; big?: boolean }) {
  return (
    <div className="theme">
      <div className="lbl">TEMA</div>
      <h1 className={big ? 'big' : ''}>{theme.name}</h1>
      <div className="ends">
        <span>menor · {theme.low}</span>
        <span>maior · {theme.high}</span>
      </div>
      <div className="scale" />
    </div>
  );
}

function Avatar({ p, you }: { p: PlayerView; you: boolean }) {
  return (
    <div className={`av${p.ok ? ' ok' : ''}${you ? ' you' : ''}${p.connected ? '' : ' off'}`} title={p.name}>
      <span>{p.name.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

/* ---------- Início ---------- */
function Home({ online }: { online: boolean }) {
  const fromLink = new URLSearchParams(location.search).get('sala') ?? '';
  const [name, setName] = useState(() => localStorage.getItem('pororoca.apelido') ?? '');
  const [code, setCode] = useState(fromLink.toUpperCase());
  const [joining, setJoining] = useState(Boolean(fromLink));
  const ready = name.trim().length > 0;

  return (
    <main className="home">
      <div className="logo">pororoca</div>
      <p className="tag">Dê a dica. Ordene o grupo.</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          localStorage.setItem('pororoca.apelido', name.trim());
          if (joining) send({ t: 'join', code, name });
          else send({ t: 'create', name });
        }}
      >
        <label htmlFor="apelido">Seu apelido</label>
        <input id="apelido" value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        {joining && (
          <>
            <label htmlFor="codigo">Código da sala</label>
            <input id="codigo" className="code" value={code} maxLength={4} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </>
        )}
        <button className="btn" type="submit" disabled={!ready || (joining && code.length < 4)}>
          {joining ? 'Entrar na sala' : 'Criar sala'}
        </button>
        <button className="btn ghost" type="button" onClick={() => setJoining(!joining)}>
          {joining ? 'Quero criar uma sala' : 'Entrar com código'}
        </button>
        <p className="hint">{online ? 'Sem cadastro. É só um apelido.' : 'Conectando ao servidor…'}</p>
      </form>
      <div className="homewaves" aria-hidden="true">
        <Wave className="w1" />
        <Wave className="w2" />
        <Wave className="w3" />
      </div>
    </main>
  );
}

/* ---------- Sala ---------- */
const MODES: { mode: Mode; name: string; text: string; soon?: boolean }[] = [
  { mode: 'chill', name: 'Chill', text: 'Um número cada. Sem vidas. Papo livre.' },
  { mode: 'hardcore', name: 'Hardcore', text: 'Mão cresce a cada rodada. Vidas. Tema sorteado.' },
  { mode: 'impostor', name: 'Impostor', text: 'Alguém quer fazer vocês errarem.', soon: true },
];

function Lobby({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const [tab, setTab] = useState<'sortear' | 'lista' | 'livre'>('sortear');
  const [free, setFree] = useState<Theme>({ name: '', low: '', high: '' });
  const [copied, setCopied] = useState(false);
  const connected = room.players.filter((p) => p.connected).length;
  const hardcore = room.mode === 'hardcore';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?sala=${room.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sem permissão de área de transferência: o código continua visível na tela */
    }
  };

  return (
    <main className="lobby">
      <section className="col">
        <div className="panel codebox">
          <div>
            <div className="lbl dim">CÓDIGO DA SALA</div>
            <div className="roomcode">{room.code}</div>
          </div>
          <button className="btn ghost small" onClick={copy}>{copied ? 'Link copiado' : 'Copiar link'}</button>
        </div>
        <div className="lbl dim">JOGADORES · {room.players.length} DE 8</div>
        <ul className="players">
          {room.players.map((p) => (
            <li key={p.id} className={p.connected ? '' : 'off'}>
              <Avatar p={{ ...p, ok: true }} you={p.id === room.you} />
              <span className="pname">{p.name}{p.id === room.you ? ' · você' : ''}{p.connected ? '' : ' · caiu'}</span>
              {p.id === room.hostId && <span className="host">HOST</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="col wide">
        <div className="lbl dim">MODO</div>
        <div className="modes">
          {MODES.map((m) => (
            <button key={m.mode} className={`mode${room.mode === m.mode ? ' sel' : ''}${m.soon ? ' soon' : ''}`} disabled={!isHost || m.soon}
              aria-pressed={room.mode === m.mode} onClick={() => send({ t: 'mode', mode: m.mode })}>
              <b>{m.name}</b>
              <span>{m.text}</span>
              {m.soon && <i>EM BREVE</i>}
            </button>
          ))}
        </div>

        <div className="lbl dim">TEMA</div>
        {hardcore ? (
          <div className="panel">
            <p className="muted">No Hardcore o tema é sempre sorteado, e muda a cada rodada.</p>
            {room.hardcore && <p className="muted small">{plural(room.hardcore.totalRounds, 'rodada', 'rodadas')} · {plural(room.hardcore.maxLives, 'vida', 'vidas')} · a rodada N dá N cartas por pessoa</p>}
          </div>
        ) : (
          <>
            {isHost && (
              <>
                <div className="tabs" role="tablist">
                  {(['sortear', 'lista', 'livre'] as const).map((k) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''}
                      onClick={() => { setTab(k); if (k === 'sortear') send({ t: 'theme', theme: null }); }}>
                      {k === 'sortear' ? 'Sortear' : k === 'lista' ? 'Da lista' : 'Livre'}
                    </button>
                  ))}
                </div>
                {tab === 'lista' && (
                  <select aria-label="Escolher tema da lista" value={room.theme ? THEMES.findIndex((t) => t.name === room.theme!.name) : -1}
                    onChange={(e) => send({ t: 'theme', theme: THEMES[Number(e.target.value)] ?? null })}>
                    <option value={-1} disabled>Escolha um dos 100 temas</option>
                    {THEMES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
                  </select>
                )}
                {tab === 'livre' && (
                  <form className="stack" onSubmit={(e) => { e.preventDefault(); send({ t: 'theme', theme: free }); }}>
                    <input aria-label="Nome do tema" placeholder="Nome do tema (ex.: Cheiro)" maxLength={40} value={free.name} onChange={(e) => setFree({ ...free, name: e.target.value })} />
                    <input aria-label="Extremo baixo" placeholder="Extremo baixo (ex.: cheiro de nada)" maxLength={60} value={free.low} onChange={(e) => setFree({ ...free, low: e.target.value })} />
                    <input aria-label="Extremo alto" placeholder="Extremo alto (ex.: peixe frito no elevador)" maxLength={60} value={free.high} onChange={(e) => setFree({ ...free, high: e.target.value })} />
                    <button className="btn ghost" type="submit">Usar este tema</button>
                  </form>
                )}
              </>
            )}
            <div className="panel">
              {room.theme ? <ThemeHead theme={room.theme} /> : <p className="muted">O tema vai ser sorteado quando a rodada começar.</p>}
            </div>
          </>
        )}

        {isHost ? (
          <button className="btn" disabled={connected < MIN_PLAYERS} onClick={() => send({ t: 'start' })}>
            {connected < MIN_PLAYERS ? `Esperando mais gente (mínimo ${MIN_PLAYERS})` : hardcore ? 'Sortear tema e começar' : 'Começar a rodada'}
          </button>
        ) : (
          <p className="hint">Esperando o host começar a rodada.</p>
        )}
      </section>
    </main>
  );
}

/* ---------- Suas cartas ---------- */
function NumberCard({ number, deckMax, animate }: { number: number; deckMax: number; animate: boolean }) {
  const shown = useCountUp(number, animate ? 1700 : 0);
  const [level, setLevel] = useState(animate ? 0 : number);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLevel(number));
    return () => cancelAnimationFrame(id);
  }, [number]);
  return (
    <div className="numcard">
      <div className="numtop"><span>pororoca</span><span>1–{deckMax}</span></div>
      <div className="num">{shown}</div>
      <div className="water" style={{ height: `${(level / deckMax) * 100}%` }}><Wave /></div>
    </div>
  );
}

/** Carta pequena da mão do Hardcore: número e uma régua com o nível. */
function MiniCard({ number, deckMax, delay }: { number: number; deckMax: number; delay: number }) {
  return (
    <div className="mini" style={{ animationDelay: `${delay}s` }}>
      <span>{number}</span>
      <i><b style={{ height: `${(number / deckMax) * 100}%` }} /></i>
    </div>
  );
}

function Reveal({ room, mine, onSeen }: { room: RoomView; mine: CardView[]; onSeen(): void }) {
  const many = mine.length > 1;
  return (
    <main className="reveal">
      <ThemeHead theme={room.theme!} big />
      {many ? (
        <div className="handgrid">
          {mine.map((c, i) => <MiniCard key={c.id} number={c.number!} deckMax={room.deckMax} delay={i * 0.08} />)}
        </div>
      ) : (
        <NumberCard number={mine[0].number!} deckMax={room.deckMax} animate />
      )}
      <p className="hint">
        {many ? `Só você vê estas ${mine.length} cartas. Cada uma precisa da sua própria dica, sem falar número.` : 'Só você vê esta carta. Dê uma dica em palavras, sem falar número.'}
      </p>
      <button className="btn" onClick={onSeen}>{many ? 'Já vi meus números' : 'Já vi meu número'}</button>
    </main>
  );
}

/* ---------- Varal (celular) / linha (desktop) ---------- */
function ClueInput({ card, label }: { card: CardView; label: string }) {
  const [text, setText] = useState(card.clue);
  return (
    <div className="myclue">
      <span className="chip">{card.number}</span>
      <input aria-label={label} value={text} maxLength={40} placeholder="Escreva a dica que você falou"
        onChange={(e) => { setText(e.target.value); send({ t: 'clue', cardId: card.id, text: e.target.value }); }} />
    </div>
  );
}

function Table({ room, mine, desk, isHost }: { room: RoomView; mine: CardView[]; desk: boolean; isHost: boolean }) {
  const me = room.players.find((p) => p.id === room.you)!;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const active = room.players.filter((p) => p.connected);
  const okCount = active.filter((p) => p.ok).length;
  const allOk = okCount === active.length;
  const n = room.line.length;
  const dense = n > 6;

  const card = (c: CardView, i: number, dragging: boolean): ReactNode => {
    const held = c.heldBy && c.heldBy !== room.you ? name(c.heldBy) : null;
    return (
      <div className={`lcard${held || dragging ? ' held' : ''}${c.ownerId === room.you ? ' mine' : ''}`}>
        {desk && <div className="peg" />}
        <Grip />
        <div className="pos">{held ? `${held} está movendo` : `${i + 1}º`}</div>
        <div className="clue">{c.clue || <em>sem dica ainda</em>}</div>
        <div className="owner">{name(c.ownerId)}{c.ownerId === room.you ? ' · você' : ''}</div>
        <div className="q">{c.number ?? '?'}</div>
      </div>
    );
  };

  return (
    <main className={`table${desk ? ' desk' : ''}`}>
      <ThemeHead theme={room.theme!} />
      <div className="board">
        <section className="linebox">
          <p className="hint left">
            {desk ? 'Arraste as cartas na linha' : 'Arraste as cartas pela alça no varal'}, da menor para a maior. Qualquer pessoa pode mover.
            {room.mode === 'hardcore' ? ` ${plural(n, 'carta', 'cartas')} ${desk ? 'na linha' : 'no varal'}, baralho de 1 a ${room.deckMax}.` : ''}
          </p>
          <Line cards={room.line} className={`${desk ? 'h' : 'v'}${dense ? ' dense' : ''}`}
            style={desk ? { gridTemplateColumns: n <= 8 ? `repeat(${n}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(150px, 1fr))' } : undefined}
            render={card}
            onMove={(cardId, to) => send({ t: 'move', cardId, to })}
            onGrab={(cardId) => send({ t: 'grab', cardId })} />
        </section>

        <section className="side">
          {desk && mine.length === 1 && <NumberCard number={mine[0].number!} deckMax={room.deckMax} animate={false} />}
          {mine.length > 0 && (
            <div className="stack tight">
              <div className="lbl">{mine.length > 1 ? 'SUAS CARTAS E DICAS · SÓ VOCÊ VÊ OS NÚMEROS' : 'SUA DICA'}</div>
              {mine.map((c) => <ClueInput key={c.id} card={c} label={`Dica da carta ${c.number}`} />)}
            </div>
          )}
          <div className="oks">
            {room.players.map((p) => <Avatar key={p.id} p={p} you={p.id === room.you} />)}
            <span>{okCount} de {active.length} deram ok</span>
          </div>
          {allOk && isHost ? (
            <button className="btn" onClick={() => send({ t: 'reveal' })}>Virar as cartas</button>
          ) : (
            <button className={`btn${me.ok ? ' ghost' : ''}`} onClick={() => send({ t: 'ok', value: !me.ok })}>
              {me.ok ? (allOk ? 'Esperando o host virar…' : 'Mudei de ideia') : 'Tá bom pra mim'}
            </button>
          )}
          <p className="hint">Se alguém mexer {desk ? 'na linha' : 'no varal'}, todos os oks voltam a zero.</p>
        </section>
      </div>
    </main>
  );
}

/* ---------- Virada ---------- */
function Result({ room, desk, isHost }: { room: RoomView; desk: boolean; isHost: boolean }) {
  const r = room.result!;
  const hc = room.hardcore;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const n = room.line.length;
  const bad = r.firstError;
  const step = Math.min(0.45, 5 / n); // com muitas cartas, a virada acelera
  let detail = r.ok
    ? `As ${n} cartas estavam em ordem.`
    : `A ordem falhou na ${bad! + 1}ª carta: o ${room.line[bad!].number} veio depois do ${room.line[bad! - 1].number}.`;
  if (hc && !r.ok) detail += hc.lives > 0 ? ` Uma vida a menos: ${plural(hc.lives, 'resta', 'restam')} ${hc.lives}.` : ' Era a última vida.';
  const next = hc?.outcome ? (hc.outcome === 'won' ? 'Ver a conquista' : 'Ver o fim de jogo') : hc ? 'Próxima rodada' : 'Nova rodada';
  return (
    <main className={`result ${r.ok ? 'good' : 'bad'}`}>
      <div className="verdict" style={{ animationDelay: `${n * step}s` }}>
        <h1>{r.ok ? 'Maré cheia' : 'Maré baixa'}</h1>
        <p>{detail}</p>
      </div>
      <div className="lbl dim">{room.theme!.name} · menor → maior</div>
      <div className={`rcards${n > 6 ? ' dense' : ''}`}
        style={desk ? { gridTemplateColumns: n <= 8 ? `repeat(${n}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(150px, 1fr))' } : undefined}>
        {room.line.map((c, i) => {
          const status = r.ok || i < bad! ? 'em ordem' : i === bad ? 'fora de ordem' : '';
          return (
            <div key={c.id} className={`rcard${i === bad ? ' wrong' : ''}`} style={{ animationDelay: `${i * step}s`, ['--pct' as string]: `${(c.number! / room.deckMax) * 100}%` }}>
              <div className="level" />
              <div className="rnum">{c.number}</div>
              <div className="rtext">
                <div className="clue">{c.clue || <em>sem dica</em>}</div>
                <div className="owner">{name(c.ownerId)}{c.ownerId === room.you ? ' · você' : ''}</div>
              </div>
              <div className={`status${status === 'fora de ordem' ? ' no' : ''}`}>{status}</div>
            </div>
          );
        })}
      </div>
      {isHost ? (
        <div className="actions">
          <button className="btn" onClick={() => send({ t: 'again' })}>{next}</button>
          {!hc && <button className="btn ghost" onClick={() => send({ t: 'lobby' })}>Trocar de tema</button>}
        </div>
      ) : (
        <p className="hint">Esperando o host seguir para a próxima etapa.</p>
      )}
    </main>
  );
}

/* ---------- Fim do Hardcore: conquista ou fim de jogo ---------- */
function Over({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const hc = room.hardcore!;
  const won = hc.outcome === 'won';
  const [shared, setShared] = useState(false);
  const rounds = useCountUp(room.round, 1200);
  const cards = useCountUp(hc.cardsPlayed, 1200);
  const names = room.players.map((p) => (p.id === room.you ? 'você' : p.name));
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0];
  const text = `Terminamos o Hardcore da Pororoca: ${plural(room.round, 'rodada', 'rodadas')}, ${plural(hc.cardsPlayed, 'carta', 'cartas')} e ${plural(hc.lives, 'vida sobrando', 'vidas sobrando')}.`;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Pororoca', text });
      else await navigator.clipboard.writeText(text);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      /* a pessoa fechou o compartilhamento */
    }
  };

  return (
    <main className={`over ${won ? 'won' : 'lost'}`}>
      {won && <div className="burst" aria-hidden="true" />}
      <span className="pill">HARDCORE · {room.round} DE {plural(hc.totalRounds, 'RODADA', 'RODADAS')}</span>
      {won ? (
        <>
          <div className="emblem">
            <svg viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r="80" className="e-bg" />
              <path className="e-w1" d="M0 122 C30 97 60 97 85 117 C110 137 135 132 160 107 C185 82 215 97 240 117 V220 H0Z" />
              <path className="e-w2" d="M0 142 C30 122 60 124 85 140 C110 156 140 152 160 134 C180 116 215 124 240 140 V220 H0Z" />
              <path className="e-w3" d="M0 166 C30 151 60 153 85 163 C110 173 140 169 160 157 C180 145 215 153 240 163 V220 H0Z" />
              <circle cx="120" cy="120" r="120" className="e-mask" />
              <circle cx="120" cy="120" r="84" className="e-ring" />
              <circle cx="120" cy="120" r="93" className="e-ring2" />
              <circle cx="120" cy="120" r="108" className="e-rays" />
            </svg>
            <div className="e-num">{rounds}</div>
          </div>
          <div className="ribbon">CONQUISTA DESBLOQUEADA</div>
          <h1>Contra a correnteza</h1>
          <p className="muted">Vocês terminaram as {room.round} rodadas do Hardcore.</p>
        </>
      ) : (
        <>
          <h1>Fim de jogo</h1>
          <p className="muted">As vidas acabaram na rodada {room.round} de {hc.totalRounds}.</p>
        </>
      )}
      <div className="stats">
        <div><b>{rounds}</b><span>{room.round === 1 ? 'rodada' : 'rodadas'}</span></div>
        <div><b>{cards}</b><span>cartas jogadas</span></div>
        <div><b className="hot">{hc.lives}</b><span>{hc.lives === 1 ? 'vida sobrando' : 'vidas sobrando'}</span></div>
      </div>
      <div className="crew">
        {room.players.map((p) => <Avatar key={p.id} p={{ ...p, ok: true }} you={p.id === room.you} />)}
        <span>{who}</span>
      </div>
      <div className="actions">
        {won && <button className="btn" onClick={share}>{shared ? 'Pronto' : 'Compartilhar conquista'}</button>}
        {isHost ? (
          <button className={`btn${won ? ' ghost' : ''}`} onClick={() => send({ t: 'lobby' })}>{won ? 'Jogar de novo' : 'Tentar de novo'}</button>
        ) : (
          <p className="hint">Esperando o host voltar para a sala.</p>
        )}
      </div>
    </main>
  );
}

export function App() {
  const { room, error, online } = useNet();
  const desk = useMedia('(min-width: 900px)');
  const [seenDeal, setSeenDeal] = useState(0);
  const hardcore = room?.mode === 'hardcore';

  // No Hardcore a maré muda de cor: a paleta inteira troca.
  useEffect(() => {
    document.body.classList.toggle('brava', hardcore);
  }, [hardcore]);

  let screen: ReactNode;
  if (!room) {
    screen = <Home online={online} />;
  } else {
    const isHost = room.hostId === room.you;
    const mine = room.line.filter((c) => c.ownerId === room.you).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    if (room.phase === 'lobby') screen = <Lobby room={room} isHost={isHost} />;
    else if (room.phase === 'playing' && mine.length > 0 && seenDeal !== room.deal) screen = <Reveal key={room.deal} room={room} mine={mine} onSeen={() => setSeenDeal(room.deal)} />;
    else if (room.phase === 'playing') screen = <Table key={room.deal} room={room} mine={mine} desk={desk} isHost={isHost} />;
    else if (room.phase === 'result') screen = <Result key={room.deal} room={room} desk={desk} isHost={isHost} />;
    else screen = <Over room={room} isHost={isHost} />;
  }

  return (
    <div className="app">
      {room && (
        <header className="top">
          <span className="brand">pororoca</span>
          <span className="meta">
            {hardcore && room.hardcore && room.phase !== 'lobby' && (
              <>
                <b className="tagh">HARDCORE</b>
                <Lives hc={room.hardcore} />
              </>
            )}
            <span>
              {room.round > 0 && room.phase !== 'lobby' ? `Rodada ${room.round}${hardcore && room.hardcore ? ` de ${room.hardcore.totalRounds}` : ''} · ` : ''}Sala {room.code}
            </span>
            <button className="link" onClick={() => send({ t: 'leave' })}>Sair</button>
          </span>
        </header>
      )}
      {screen}
      {error && <div className="toast" role="alert">{error}</div>}
      {room && !online && <div className="toast" role="status">Reconectando…</div>}
    </div>
  );
}
