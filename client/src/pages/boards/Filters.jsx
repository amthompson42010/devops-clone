import { useState } from 'react';
import { Avatar, Menu, MenuItem } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useUser } from '../../user.js';
import { TypeIcon, TYPES, EpicLozenge } from './issueMeta.jsx';

export function useFilters() {
  const [f, setF] = useState({ text: '', assignees: [], types: [], epics: [], labels: [], mine: false });
  return [f, setF];
}

export function applyFilters(issues, f, me) {
  const text = f.text.trim().toLowerCase();
  return issues.filter((i) => {
    if (text && !`${i.key} ${i.title}`.toLowerCase().includes(text)) return false;
    if (f.mine && i.assignee !== me) return false;
    if (f.assignees.length && !f.assignees.includes(i.assignee || '__none')) return false;
    if (f.types.length && !f.types.includes(i.type)) return false;
    if (f.epics.length && !f.epics.includes(i.epicId || '__none')) return false;
    if (f.labels.length && !(i.labels || []).some((l) => f.labels.includes(l))) return false;
    return true;
  });
}

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function FilterBar({ board, issues, filters, setFilters, children, showEpics = true }) {
  const user = useUser();
  const assignees = [...new Set(issues.map((i) => i.assignee).filter(Boolean))].sort();
  const epics = board.issues.filter((i) => i.type === 'epic');
  const labels = [...new Set(board.issues.flatMap((i) => i.labels || []))].sort();
  const active = filters.text || filters.mine || filters.assignees.length || filters.types.length || filters.epics.length || filters.labels.length;
  return (
    <div className="filter-bar">
      <div className="search-box">
        <Icon name="search" />
        <input placeholder="Search this board" value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })} />
      </div>
      <div className="avatar-filter">
        {assignees.map((a) => (
          <button key={a} className={`avatar-toggle ${filters.assignees.includes(a) ? 'on' : ''}`} onClick={() => setFilters({ ...filters, assignees: toggle(filters.assignees, a) })}>
            <Avatar name={a} size={32} />
          </button>
        ))}
        <button className={`avatar-toggle ${filters.assignees.includes('__none') ? 'on' : ''}`} onClick={() => setFilters({ ...filters, assignees: toggle(filters.assignees, '__none') })}>
          <Avatar name={null} size={32} />
        </button>
      </div>
      {showEpics && epics.length > 0 && (
        <Menu trigger={(o, t) => <button className={`btn btn-subtle ${filters.epics.length ? 'btn-selected' : ''}`} onClick={t}>Epic {filters.epics.length ? `(${filters.epics.length})` : ''} <Icon name="chevronDown" /></button>}>
          {epics.map((e) => (
            <button key={e.id} className={`menu-item ${filters.epics.includes(e.id) ? 'active' : ''}`} onClick={() => setFilters({ ...filters, epics: toggle(filters.epics, e.id) })}>
              <input type="checkbox" readOnly checked={filters.epics.includes(e.id)} /> <EpicLozenge epic={e} />
            </button>
          ))}
          <button className={`menu-item ${filters.epics.includes('__none') ? 'active' : ''}`} onClick={() => setFilters({ ...filters, epics: toggle(filters.epics, '__none') })}>
            <input type="checkbox" readOnly checked={filters.epics.includes('__none')} /> Issues without epic
          </button>
        </Menu>
      )}
      <Menu trigger={(o, t) => <button className={`btn btn-subtle ${filters.types.length ? 'btn-selected' : ''}`} onClick={t}>Type {filters.types.length ? `(${filters.types.length})` : ''} <Icon name="chevronDown" /></button>}>
        {['story', 'task', 'bug', 'subtask', 'epic'].map((t) => (
          <button key={t} className={`menu-item ${filters.types.includes(t) ? 'active' : ''}`} onClick={() => setFilters({ ...filters, types: toggle(filters.types, t) })}>
            <input type="checkbox" readOnly checked={filters.types.includes(t)} /> <TypeIcon type={t} /> {TYPES[t].label}
          </button>
        ))}
      </Menu>
      {labels.length > 0 && (
        <Menu trigger={(o, t) => <button className={`btn btn-subtle ${filters.labels.length ? 'btn-selected' : ''}`} onClick={t}>Label {filters.labels.length ? `(${filters.labels.length})` : ''} <Icon name="chevronDown" /></button>}>
          {labels.map((l) => (
            <button key={l} className={`menu-item ${filters.labels.includes(l) ? 'active' : ''}`} onClick={() => setFilters({ ...filters, labels: toggle(filters.labels, l) })}>
              <input type="checkbox" readOnly checked={filters.labels.includes(l)} /> {l}
            </button>
          ))}
        </Menu>
      )}
      <button className={`btn btn-subtle ${filters.mine ? 'btn-selected' : ''}`} onClick={() => setFilters({ ...filters, mine: !filters.mine })} disabled={!user.name}>Only my issues</button>
      {active ? <button className="btn btn-subtle" onClick={() => setFilters({ text: '', assignees: [], types: [], epics: [], labels: [], mine: false })}>Clear filters</button> : null}
      <div className="push" />
      {children}
    </div>
  );
}

export { MenuItem };
