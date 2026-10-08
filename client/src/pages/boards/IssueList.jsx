import { useState } from 'react';
import { Avatar } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useUser } from '../../user.js';
import { fmtDate, timeAgo } from '../../util.js';
import { useBoard } from './BoardsLayout.jsx';
import { JiraHeader } from './Board.jsx';
import FilterBar, { useFilters, applyFilters } from './Filters.jsx';
import { TypeIcon, PriorityIcon, StatusLozenge, EpicLozenge, PRIORITY_ORDER } from './issueMeta.jsx';

const COLS = [
  ['type', 'T'], ['key', 'Key'], ['title', 'Summary'], ['epic', 'Epic'], ['assignee', 'Assignee'], ['reporter', 'Reporter'],
  ['priority', 'P'], ['status', 'Status'], ['sprint', 'Sprint'], ['storyPoints', 'Pts'], ['createdAt', 'Created'], ['updatedAt', 'Updated'],
];

export default function IssueList() {
  const ctx = useBoard();
  const { board, project } = ctx;
  const user = useUser();
  const [filters, setFilters] = useFilters();
  const [statusFilter, setStatusFilter] = useState('open');
  const [sort, setSort] = useState({ by: 'updatedAt', dir: -1 });

  const colIdx = Object.fromEntries(board.columns.map((c, i) => [c.id, i]));
  const sprintName = (id) => board.sprints.find((s) => s.id === id)?.name || '';
  const epicOf = (i) => board.issues.find((e) => e.id === i.epicId);
  const keyNum = (k) => Number(k.split('-')[1]);

  let list = applyFilters(board.issues, filters, user.name);
  if (statusFilter !== 'all') {
    list = list.filter((i) => {
      const cat = board.columns.find((c) => c.id === i.status)?.category;
      return statusFilter === 'open' ? cat !== 'done' : statusFilter === 'done' ? cat === 'done' : i.status === statusFilter;
    });
  }
  const val = (i) => {
    switch (sort.by) {
      case 'key': return keyNum(i.key);
      case 'priority': return PRIORITY_ORDER.indexOf(i.priority);
      case 'status': return colIdx[i.status];
      case 'sprint': return sprintName(i.sprintId);
      case 'epic': return epicOf(i)?.title || '';
      case 'storyPoints': return i.storyPoints ?? -1;
      default: return i[sort.by] ?? '';
    }
  };
  list = [...list].sort((a, b) => {
    const x = val(a); const y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });

  return (
    <main className="page jira-page">
      <JiraHeader project={project} title="Issues">
        <button className="btn btn-jira" onClick={() => ctx.openCreate({})}><Icon name="plus" /> Create</button>
      </JiraHeader>
      <FilterBar board={board} issues={board.issues} filters={filters} setFilters={setFilters}>
        <select className="input input-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">Open issues</option>
          <option value="done">Done issues</option>
          <option value="all">All issues</option>
          {board.columns.map((c) => <option key={c.id} value={c.id}>Status: {c.name}</option>)}
        </select>
      </FilterBar>
      <div className="issue-table-wrap">
        <table className="table issue-table">
          <thead>
            <tr>
              {COLS.map(([k, label]) => (
                <th key={k} onClick={() => setSort((s) => ({ by: k, dir: s.by === k ? -s.dir : 1 }))} className="sortable">
                  {label}{sort.by === k && <Icon name={sort.dir > 0 ? 'chevronUp' : 'chevronDown'} size={12} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} onClick={() => ctx.openIssue(i.key)}>
                <td><TypeIcon type={i.type} /></td>
                <td className="nowrap"><span className="issue-link">{i.key}</span></td>
                <td className="summary-cell">{i.title}</td>
                <td>{epicOf(i) && <EpicLozenge epic={epicOf(i)} />}</td>
                <td className="nowrap">{i.assignee ? <><Avatar name={i.assignee} size={20} /> {i.assignee}</> : <span className="muted">Unassigned</span>}</td>
                <td className="nowrap">{i.reporter}</td>
                <td><PriorityIcon priority={i.priority} /></td>
                <td><StatusLozenge column={board.columns.find((c) => c.id === i.status)} /></td>
                <td className="nowrap small">{sprintName(i.sprintId)}</td>
                <td>{i.storyPoints ?? ''}</td>
                <td className="nowrap small muted">{fmtDate(i.createdAt)}</td>
                <td className="nowrap small muted">{timeAgo(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="muted pad">No issues match these filters.</p>}
        <p className="muted small pad">{list.length} issue{list.length === 1 ? '' : 's'}</p>
      </div>
    </main>
  );
}
