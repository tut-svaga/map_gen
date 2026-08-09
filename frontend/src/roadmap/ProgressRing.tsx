import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  percent: number;
  size?: number;
  label?: string;
}

/**
 * Кольцо прогресса. Анимируем stroke-dashoffset, а не ширину: SVG-обводка
 * не вызывает пересчёта layout, поэтому анимация идёт на композиторе и не
 * дёргает остальную страницу.
 */
export function ProgressRing({ percent, size = 92, label }: Props) {
  const reduceMotion = useReducedMotion();
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${percent}%`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--line)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={percent === 100 ? 'var(--ice)' : 'var(--ember)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        // Старт с 12 часов: по умолчанию SVG начинает дугу справа,
        // и заполнение читается как «сдвинутое»
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={false}
        animate={{ strokeDashoffset: offset }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--frost)"
        fontFamily="var(--mono)"
        fontSize={size / 4.2}
      >
        {percent}%
      </text>
    </svg>
  );
}
