// A fila de cartas que todo mundo ordena: "varal" no celular, "linha" no desktop.
// O arrasto funciona em lista, em fileira e em grade (quando o Hardcore enche a mesa de cartas).
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { CardView } from '../shared/protocol';
import { moveItem } from '../shared/rules';

interface Props {
  cards: CardView[];
  className?: string;
  style?: CSSProperties;
  onMove(cardId: string, to: number): void;
  onGrab(cardId: string | null): void;
  render(card: CardView, index: number, dragging: boolean): ReactNode;
}

interface Pt {
  x: number;
  y: number;
}

interface Drag {
  id: string;
  from: number;
  to: number;
  dx: number;
  dy: number;
}

const EDGE = 70; // perto da borda da tela, a página rola sozinha durante o arrasto

export function Line({ cards, className = '', style, onMove, onGrab, render }: Props) {
  const serverOrder = cards.map((c) => c.id).join(',');
  // Ordem otimista: depois de soltar, mostra o resultado sem esperar o servidor responder.
  const [local, setLocal] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const start = useRef({ x: 0, y: 0, scroll: 0, centers: [] as Pt[] });
  const last = useRef<Pt>({ x: 0, y: 0 });
  const dragging = useRef(false);

  // A ordem mudou no servidor (eu ou outra pessoa): vale a do servidor e qualquer arrasto meu é cancelado.
  useEffect(() => {
    setLocal(null);
    if (dragging.current) {
      dragging.current = false;
      setDrag(null);
      onGrab(null);
    }
  }, [serverOrder]);

  useEffect(() => {
    if (!local) return;
    const timer = window.setTimeout(() => setLocal(null), 1500);
    return () => window.clearTimeout(timer);
  }, [local]);

  const ordered = local ? (local.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as CardView[]) : cards;

  /** Recalcula o arrasto a partir da última posição do ponteiro e de quanto a página rolou. */
  function update() {
    setDrag((d) => {
      if (!d) return d;
      const s = start.current;
      const dx = last.current.x - s.x;
      const dy = last.current.y - s.y + (window.scrollY - s.scroll);
      const me = { x: s.centers[d.from].x + dx, y: s.centers[d.from].y + dy };
      let to = d.from;
      let best = Infinity;
      s.centers.forEach((c, j) => {
        const dist = (c.x - me.x) ** 2 + (c.y - me.y) ** 2;
        if (dist < best) {
          best = dist;
          to = j;
        }
      });
      return { ...d, dx, dy, to };
    });
  }

  const active = drag !== null;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const y = last.current.y;
      const step = y < EDGE ? -10 : y > window.innerHeight - EDGE ? 10 : 0;
      if (step) {
        const before = window.scrollY;
        window.scrollBy(0, step);
        if (window.scrollY !== before) update();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  function down(e: PointerEvent<HTMLDivElement>, id: string, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // No toque, só a alça arrasta; o resto da carta deixa a página rolar.
    if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('[data-handle]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const centers = ordered.map((c) => {
      const r = els.current.get(c.id)!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    start.current = { x: e.clientX, y: e.clientY, scroll: window.scrollY, centers };
    last.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    setDrag({ id, from: index, to: index, dx: 0, dy: 0 });
    onGrab(id);
  }

  function move(e: PointerEvent) {
    if (!dragging.current) return;
    last.current = { x: e.clientX, y: e.clientY };
    update();
  }

  function up() {
    if (!drag) return;
    dragging.current = false;
    if (drag.to !== drag.from) {
      setLocal(moveItem(ordered.map((c) => c.id), drag.from, drag.to));
      onMove(drag.id, drag.to);
    } else {
      onGrab(null);
    }
    setDrag(null);
  }

  const c = start.current.centers;
  const shift = (from: number, to: number) => `translate(${c[to].x - c[from].x}px, ${c[to].y - c[from].y}px)`;

  return (
    <div className={`line ${className}`} style={style}>
      {ordered.map((card, i) => {
        const mine = drag?.id === card.id;
        let transform = 'none';
        if (drag && mine) transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(-2deg) scale(1.03)`;
        else if (drag && drag.from < drag.to && i > drag.from && i <= drag.to) transform = shift(i, i - 1);
        else if (drag && drag.to < drag.from && i >= drag.to && i < drag.from) transform = shift(i, i + 1);
        return (
          <div
            key={card.id}
            ref={(el) => {
              if (el) els.current.set(card.id, el);
              else els.current.delete(card.id);
            }}
            className={`slot${mine ? ' drag' : ''}${drag ? ' busy' : ''}`}
            style={{ transform }}
            onPointerDown={(e) => down(e, card.id, i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {render(card, i, mine)}
          </div>
        );
      })}
    </div>
  );
}
