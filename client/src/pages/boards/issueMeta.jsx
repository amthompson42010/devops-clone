import { Link } from 'react-router-dom';

export const TYPES = {
  epic: { label: 'Epic', color: '#904ee2', glyph: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  story: { label: 'Story', color: '#63ba3c', glyph: 'M7 4h10v16l-5-4-5 4z' },
  task: { label: 'Task', color: '#4bade8', glyph: 'M6 12l4 4 8-8' },
  bug: { label: 'Bug', color: '#e5493a', glyph: 'M12 7a5 5 0 110 10 5 5 0 010-10z' },
  subtask: { label: 'Subtask', color: '#4bade8', glyph: 'M7 7h6v6H7zM11 11h6v6h-6z' },
};
export const CREATE_TYPES = ['story', 'task', 'bug', 'epic'];

export function TypeIcon({ type, size = 16 }) {
  const t = TYPES[type] || TYPES.task;
  return (
    <span className="type-icon" title={t.label} style={{ background: t.color, width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size - 4} height={size - 4} fill={type === 'bug' || type === 'epic' || type === 'story' ? '#fff' : 'none'} stroke="#fff" strokeWidth={type === 'task' ? 3 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d={t.glyph} />
      </svg>
    </span>
  );
}

export const PRIORITIES = {
  highest: { label: 'Highest', color: '#ff5630', d: 'M6 12l6-6 6 6M6 18l6-6 6 6' },
  high: { label: 'High', color: '#ff7452', d: 'M6 15l6-6 6 6' },
  medium: { label: 'Medium', color: '#ffab00', d: 'M5 9h14M5 15h14' },
  low: { label: 'Low', color: '#0065ff', d: 'M6 9l6 6 6-6' },
  lowest: { label: 'Lowest', color: '#2684ff', d: 'M6 6l6 6 6-6M6 12l6 6 6-6' },
};
export const PRIORITY_ORDER = ['highest', 'high', 'medium', 'low', 'lowest'];

export function PriorityIcon({ priority, size = 16 }) {
  const p = PRIORITIES[priority] || PRIORITIES.medium;
  return (
    <svg className="priority-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <title>{p.label}</title>
      <path d={p.d} />
    </svg>
  );
}

export function StatusLozenge({ column }) {
  if (!column) return null;
  return <span className={`lozenge lz-${column.category}`}>{column.name}</span>;
}

const EPIC_COLORS = ['#6554c0', '#00875a', '#ff8b00', '#0052cc', '#de350b', '#00a3bf', '#5243aa', '#36b37e'];
export function epicColor(epic) {
  if (!epic) return '#6554c0';
  if (epic.color) return epic.color;
  let h = 0;
  for (const c of epic.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EPIC_COLORS[h % EPIC_COLORS.length];
}

export function EpicLozenge({ epic }) {
  if (!epic) return null;
  const c = epicColor(epic);
  return <span className="epic-lozenge" style={{ color: c, background: `${c}22` }} title={epic.title}>{epic.title}</span>;
}

/** Turn "PROJ-12" mentions in text into links that open the issue. */
export function linkifyKeys(text, projectKey) {
  if (!text) return text;
  const re = new RegExp(`\\b(${projectKey}-\\d+)\\b`, 'gi');
  const parts = String(text).split(re);
  return parts.map((p, i) => (i % 2 === 1
    ? <Link key={i} to={`/${projectKey}/boards/issues?issue=${p.toUpperCase()}`} className="issue-link">{p.toUpperCase()}</Link>
    : p));
}

export const isDone = (board, issue) => board.columns.find((c) => c.id === issue.status)?.category === 'done';
