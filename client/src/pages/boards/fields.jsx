import { useState } from 'react';
import { Avatar, Picker } from '../../components/ui.jsx';
import { TypeIcon, TYPES, PriorityIcon, PRIORITIES, PRIORITY_ORDER, EpicLozenge } from './issueMeta.jsx';

export function UserPicker({ users, value, onChange, noneLabel = 'Unassigned' }) {
  const names = [...new Set([...users.map((u) => u.name), value].filter(Boolean))];
  return (
    <Picker
      value={value}
      noneLabel={noneLabel}
      placeholder={<span className="user-val"><Avatar name={null} size={22} /> {noneLabel}</span>}
      options={names.map((n) => ({ value: n, label: n }))}
      renderOption={(o) => <span className="user-val"><Avatar name={o.value} size={22} /> {o.label}</span>}
      onChange={onChange}
    />
  );
}

export function TypePicker({ value, onChange, types = Object.keys(TYPES) }) {
  return (
    <Picker
      value={value}
      allowNone={false}
      searchable={false}
      options={types.map((t) => ({ value: t, label: TYPES[t].label }))}
      renderOption={(o) => <span className="user-val"><TypeIcon type={o.value} /> {o.label}</span>}
      onChange={onChange}
    />
  );
}

export function PriorityPicker({ value, onChange }) {
  return (
    <Picker
      value={value}
      allowNone={false}
      searchable={false}
      options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITIES[p].label }))}
      renderOption={(o) => <span className="user-val"><PriorityIcon priority={o.value} /> {o.label}</span>}
      onChange={onChange}
    />
  );
}

export function SprintPicker({ board, value, onChange }) {
  const sprints = board.sprints.filter((s) => s.state !== 'closed' || s.id === value);
  return (
    <Picker
      value={value}
      noneLabel="Backlog"
      placeholder="Backlog"
      options={sprints.map((s) => ({ value: s.id, label: `${s.name}${s.state === 'active' ? ' (active)' : ''}` }))}
      onChange={onChange}
    />
  );
}

export function EpicPicker({ board, value, onChange }) {
  const epics = board.issues.filter((i) => i.type === 'epic');
  return (
    <Picker
      value={value}
      noneLabel="None"
      placeholder="None"
      options={epics.map((e) => ({ value: e.id, label: `${e.key} ${e.title}`, epic: e }))}
      renderOption={(o) => <EpicLozenge epic={o.epic} />}
      onChange={onChange}
    />
  );
}

export function StatusPicker({ board, value, onChange }) {
  const col = board.columns.find((c) => c.id === value);
  return (
    <Picker
      value={value}
      allowNone={false}
      searchable={false}
      className={`status-picker sp-${col?.category}`}
      options={board.columns.map((c) => ({ value: c.id, label: c.name, category: c.category }))}
      renderValue={(o) => <span className="status-btn-label">{o.label} ▾</span>}
      renderOption={(o) => <span className={`lozenge lz-${o.category}`}>{o.label}</span>}
      onChange={onChange}
    />
  );
}

export function LabelsInput({ value = [], onChange, suggestions = [] }) {
  const [text, setText] = useState('');
  const add = (l) => {
    const v = l.trim().replace(/\s+/g, '-');
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const sugg = suggestions.filter((s) => !value.includes(s) && text && s.toLowerCase().startsWith(text.toLowerCase())).slice(0, 5);
  return (
    <div className="labels-input">
      {value.map((l) => (
        <span key={l} className="label-chip">{l}<button type="button" onClick={() => onChange(value.filter((x) => x !== l))}>×</button></span>
      ))}
      <input
        value={text}
        placeholder={value.length ? '' : 'Add labels'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && text.trim()) { e.preventDefault(); add(text); }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
      {sugg.length > 0 && (
        <div className="menu menu-left label-sugg">
          {sugg.map((s) => <button type="button" key={s} className="menu-item" onMouseDown={(e) => { e.preventDefault(); add(s); }}>{s}</button>)}
        </div>
      )}
    </div>
  );
}

export const allLabels = (board) => [...new Set(board.issues.flatMap((i) => i.labels || []))].sort();
