import { useEffect, useState, type ReactNode } from 'react';
import type { CardView, PlayerView, RoomView, Theme } from '../shared/protocol';
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
  const [value, setValue] = useState(0);
  useEffect(() => {
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

const Wave = ({ className = '' }: { className?: string }) => (
  <svg className={`wave ${className}`} viewBox="0 0 560 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 14 Q35 0 70 14 T140 14 T210 14 T280 14 T350 14 T420 14 T490 14 T560 14 V30 H0Z" />
  </svg>
);

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
  const remember = () => localStorage.setItem('pororoca.apelido', name.trim());

  return (
    <main className="home">
      <div className="logo">pororoca</div>
      <p className="tag">Dê a dica. Ordene o grupo.</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          remember();
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
function Lobby({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const [tab, setTab] = useState<'sortear' | 'lista' | 'livre'>('sortear');
  const [free, setFree] = useState<Theme>({ name: '', low: '', high: '' });
  const [copied, setCopied] = useState(false);
  const connected = room.players.filter((p) => p.connected).length;

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
          <div className="mode sel"><b>Chill</b><span>Um número cada. Sem vidas. Papo livre.</span></div>
          <div className="mode soon"><b>Hardcore</b><span>Mão cresce a cada rodada. Vidas. Tema sorteado.</span><i>EM BREVE</i></div>
          <div className="mode soon"><b>Impostor</b><span>Alguém quer fazer vocês errarem.</span><i>EM BREVE</i></div>
        </div>

        <div className="lbl dim">TEMA</div>
        {isHost ? (
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
        ) : null}
        <div className="panel">
          {room.theme ? <ThemeHead theme={room.theme} /> : <p className="muted">O tema vai ser sorteado quando a rodada começar.</p>}
        </div>

        {isHost ? (
          <button className="btn" disabled={connected < MIN_PLAYERS} onClick={() => send({ t: 'start' })}>
            {connected < MIN_PLAYERS ? `Esperando mais gente (mínimo ${MIN_PLAYERS})` : 'Começar a rodada'}
          </button>
        ) : (
          <p className="hint">Esperando o host começar a rodada.</p>
        )}
      </section>
    </main>
  );
}

/* ---------- Sua carta ---------- */
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
      <div className="num">{animate ? shown : number}</div>
      <div className="water" style={{ height: `${(level / deckMax) * 100}%` }}><Wave /></div>
    </div>
  );
}

function Reveal({ room, my, onSeen }: { room: RoomView; my: CardView; onSeen(): void }) {
  return (
    <main className="reveal">
      <ThemeHead theme={room.theme!} big />
      <NumberCard number={my.number!} deckMax={room.deckMax} animate />
      <p className="hint">Só você vê esta carta. Dê uma dica em palavras, sem falar número.</p>
      <button className="btn" onClick={onSeen}>Já vi meu número</button>
    </main>
  );
}

/* ---------- Varal (celular) / linha (desktop) ---------- */
function Table({ room, desk, isHost }: { room: RoomView; desk: boolean; isHost: boolean }) {
  const my = room.line.find((c) => c.ownerId === room.you);
  const me = room.players.find((p) => p.id === room.you)!;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const [clue, setClue] = useState(my?.clue ?? '');
  const active = room.players.filter((p) => p.connected);
  const okCount = active.filter((p) => p.ok).length;
  const allOk = okCount === active.length;
  const word = desk ? 'linha' : 'varal';

  const card = (c: CardView, i: number, dragging: boolean): ReactNode => {
    const held = c.heldBy && c.heldBy !== room.you ? name(c.heldBy) : null;
    return (
      <div className={`lcard${held || dragging ? ' held' : ''}${c.ownerId === room.you ? ' mine' : ''}`}>
        {desk && <div className="peg" />}
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
          <p className="hint left">Arraste as cartas {desk ? 'na linha' : 'no varal'}, da menor para a maior. Qualquer pessoa pode mover.</p>
          <Line cards={room.line} horizontal={desk} render={card}
            onMove={(cardId, to) => send({ t: 'move', cardId, to })}
            onGrab={(cardId) => send({ t: 'grab', cardId })} />
        </section>

        <section className="side">
          {my && desk && <NumberCard number={my.number!} deckMax={room.deckMax} animate={false} />}
          {my && (
            <>
              <label htmlFor="dica">Sua dica {desk ? '' : `(seu número é ${my.number})`}</label>
              <input id="dica" value={clue} maxLength={40} placeholder="Escreva a dica que você falou"
                onChange={(e) => { setClue(e.target.value); send({ t: 'clue', cardId: my.id, text: e.target.value }); }} />
            </>
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
          <p className="hint">Se alguém mexer {desk ? 'na' : 'no'} {word}, todos os oks voltam a zero.</p>
        </section>
      </div>
    </main>
  );
}

/* ---------- Virada ---------- */
function Result({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const r = room.result!;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const n = room.line.length;
  const bad = r.firstError;
  const detail = r.ok
    ? `As ${n} cartas estavam em ordem.`
    : `A ordem falhou na ${bad! + 1}ª carta: o ${room.line[bad!].number} veio depois do ${room.line[bad! - 1].number}.`;
  return (
    <main className={`result ${r.ok ? 'good' : 'bad'}`}>
      <div className="verdict" style={{ animationDelay: `${n * 0.45}s` }}>
        <h1>{r.ok ? 'Maré cheia' : 'Maré baixa'}</h1>
        <p>{detail}</p>
      </div>
      <div className="lbl dim">{room.theme!.name} · menor → maior</div>
      <div className="rcards">
        {room.line.map((c, i) => {
          const status = r.ok || i < bad! ? 'em ordem' : i === bad ? 'fora de ordem' : '';
          return (
            <div key={c.id} className={`rcard${i === bad ? ' wrong' : ''}`} style={{ animationDelay: `${i * 0.45}s`, ['--pct' as string]: `${(c.number! / room.deckMax) * 100}%` }}>
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
          <button className="btn" onClick={() => send({ t: 'again' })}>Nova rodada</button>
          <button className="btn ghost" onClick={() => send({ t: 'lobby' })}>Trocar de tema</button>
        </div>
      ) : (
        <p className="hint">Esperando o host começar a próxima rodada.</p>
      )}
    </main>
  );
}

export function App() {
  const { room, error, online } = useNet();
  const desk = useMedia('(min-width: 900px)');
  const [seenRound, setSeenRound] = useState(0);

  let screen: ReactNode;
  if (!room) {
    screen = <Home online={online} />;
  } else {
    const isHost = room.hostId === room.you;
    const my = room.line.find((c) => c.ownerId === room.you);
    if (room.phase === 'lobby') screen = <Lobby room={room} isHost={isHost} />;
    else if (room.phase === 'playing' && my && seenRound !== room.round) screen = <Reveal room={room} my={my} onSeen={() => setSeenRound(room.round)} />;
    else if (room.phase === 'playing') screen = <Table key={room.round} room={room} desk={desk} isHost={isHost} />;
    else screen = <Result key={room.round} room={room} isHost={isHost} />;
  }

  return (
    <div className="app">
      {room && (
        <header className="top">
          <span className="brand">pororoca</span>
          <span className="meta">
            {room.round > 0 && room.phase !== 'lobby' ? `Rodada ${room.round} · ` : ''}Sala {room.code}
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
