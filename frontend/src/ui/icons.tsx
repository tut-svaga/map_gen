/* Иконки инлайном, без библиотеки: их семь штук, и тянуть ради этого пакет
   на сотни килобайт незачем. currentColor — чтобы цвет задавался в CSS. */

type Props = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export const CheckIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const ArrowUpIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const ArrowDownIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const PencilIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
  </svg>
);

export const TrashIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const PlusIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const LinkIcon = ({ className }: Props) => (
  <svg {...base} className={className} width="16" height="16">
    <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
  </svg>
);
