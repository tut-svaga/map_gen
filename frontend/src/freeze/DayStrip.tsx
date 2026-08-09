import { useEffect, useRef } from 'react';
import type { FreezeDay } from '../types';
import { humanDayFull, isWeekend } from '../lib/date';
import styles from './FreezePage.module.css';

interface Props {
  days: string[];
  marks: Map<string, FreezeDay>;
  today: string;
  selected: string;
  onSelect: (day: string) => void;
}

function stateOf(mark: FreezeDay | undefined): 'blank' | 'worked' | 'idle' | 'open' {
  if (!mark) return 'blank';
  if (mark.worked === true) return 'worked';
  if (mark.worked === false) return 'idle';
  return 'open';
}

/**
 * Лента дней окна заморозки. Каждая засечка — кнопка, чтобы день можно было
 * выбрать с клавиатуры; анимация на CSS-переходах, а не на framer-motion:
 * засечек под сотню, и на каждой держать анимационный движок расточительно.
 */
export function DayStrip({ days, marks, today, selected, onSelect }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Выбранный день подтягиваем в видимую часть: окно на три месяца в
  // мобильную ширину не влезает, и сегодняшний день оказывается за краем.
  useEffect(() => {
    const strip = stripRef.current;
    const tick = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    tick?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected]);

  return (
    <div ref={stripRef} className={`${styles.strip} no-scrollbar`} role="group" aria-label="Дни заморозки">
      {days.map((day) => (
        <button
          key={day}
          type="button"
          className={styles.tick}
          data-state={stateOf(marks.get(day))}
          data-today={day === today}
          data-future={day > today}
          data-weekend={isWeekend(day)}
          aria-pressed={day === selected}
          title={humanDayFull(day)}
          aria-label={humanDayFull(day)}
          onClick={() => onSelect(day)}
        />
      ))}
    </div>
  );
}
