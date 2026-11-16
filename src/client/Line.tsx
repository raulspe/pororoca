// A fila de cartas que todo mundo ordena: "varal" no celular (vertical), "linha" no desktop (horizontal).
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { CardView } from '../shared/protocol';
import { moveItem } from '../shared/rules';

interface Props {
  cards: CardView[];
  horizontal: boolean;
  onMove(cardId: string, to: number): void;
  onGrab(cardId: string | null): void;
  render(card: CardView, index: number, dragging: boolean): ReactNode;
}

interface Drag {
  id: string;
  from: number;
  to: number;
  delta: number;
  step: number;
}

export function Line({ cards, horizontal, onMove, onGrab, render }: Props) {
  const serverOrder = cards.map((c) => c.id).join(',');
  // Ordem otimista: depois de soltar, mostra o resultado sem esperar o servidor responder.
  const [local, setLocal] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const start = useRef({ pos: 0, centers: [] as number[] });
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
  const axis = (e: PointerEvent) => (horizontal ? e.clientX : e.clientY);

  function down(e: PointerEvent<HTMLDivElement>, id: string, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const centers = ordered.map((c) => {
      const r = els.current.get(c.id)!.getBoundingClientRect();
      return horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
    });
    start.current = { pos: axis(e), centers };
    dragging.current = true;
    setDrag({ id, from: index, to: index, delta: 0, step: centers.length > 1 ? Math.abs(centers[1] - centers[0]) : 0 });
    onGrab(id);
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const delta = axis(e) - start.current.pos;
    const myCenter = start.current.centers[drag.from] + delta;
    const to = start.current.centers.filter((c, j) => j !== drag.from && c < myCenter).length;
    setDrag({ ...drag, delta, to });
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

  const t = (px: number) => (horizontal ? `translateX(${px}px)` : `translateY(${px}px)`);

  return (
    <div className={`line ${horizontal ? 'h' : 'v'}`}>
      {ordered.map((card, i) => {
        const mine = drag?.id === card.id;
        let transform = 'none';
        if (drag && mine) transform = `${t(drag.delta)} rotate(-2deg) scale(1.03)`;
        else if (drag && drag.from < drag.to && i > drag.from && i <= drag.to) transform = t(-drag.step);
        else if (drag && drag.to < drag.from && i >= drag.to && i < drag.from) transform = t(drag.step);
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
