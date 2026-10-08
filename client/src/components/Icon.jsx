const P = {
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  boards: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  repo: 'M6 3h11a1 1 0 011 1v14H7a2 2 0 00-2 2V5a2 2 0 011-2zM5 20a2 2 0 002 2h11v-4M9 7h5',
  wiki: 'M4 5a2 2 0 012-2h5v18H6a2 2 0 01-2-2zM13 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5zM7 8h2M7 12h2M16 8h2M16 12h2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronUp: 'M6 15l6-6 6 6',
  file: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5',
  folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  branch: 'M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9',
  commit: 'M12 16a4 4 0 100-8 4 4 0 000 8zM2 12h6M16 12h6',
  pr: 'M6 3a3 3 0 100 6 3 3 0 000-6zM6 9v12M18 21a3 3 0 100-6 3 3 0 000 6zM18 15V8a2 2 0 00-2-2h-5M13 3l-2 3 2 3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v4h4M12 7v5l3 3',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  like: 'M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h6a2 2 0 012 2.3l-1.2 7A2 2 0 0117.8 20H7',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  download: 'M12 4v12M6 11l6 6 6-6M4 20h16',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  backlog: 'M4 6h16M4 10h16M4 14h10M4 18h7',
  link: 'M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  tag: 'M3 12V4a1 1 0 011-1h8l9 9-9 9zM8 8h.01',
  sprint: 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  page: 'M6 3h9l4 4v14H6zM9 9h6M9 13h6M9 17h4',
  upload: 'M12 20V8M6 13l6-6 6 6M4 4h16',
  menu: 'M4 6h16M4 12h16M4 18h16',
  move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  comment: 'M4 5h16v11H9l-5 4z',
  warning: 'M12 3l10 18H2zM12 10v4M12 18h.01',
  merge: 'M6 3a3 3 0 100 6 3 3 0 000-6zM6 9v12M18 15a3 3 0 100 6 3 3 0 000-6zM6 9a9 9 0 009 9h0',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
};

export default function Icon({ name, size = 16, stroke = 2, className = '', style, title }) {
  const d = P[name];
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {d && <path d={d} />}
    </svg>
  );
}
