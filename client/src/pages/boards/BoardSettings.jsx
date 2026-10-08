import { useState } from 'react';
import { useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useBoard } from './BoardsLayout.jsx';
import { JiraHeader } from './Board.jsx';

export default function BoardSettings() {
  const ctx = useBoard();
  const { board, project } = ctx;
  const [cols, setCols] = useState(board.columns.map((c) => ({ ...c })));
  const toast = useToast();
  const set = (i, k, v) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const move = (i, d) => setCols((cs) => {
    const n = [...cs];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    return n;
  });
  const counts = Object.fromEntries(board.columns.map((c) => [c.id, board.issues.filter((i) => i.status === c.id).length]));
  const save = async () => {
    await ctx.saveColumns(cols);
    toast('Board columns saved');
  };
  return (
    <main className="page jira-page narrow">
      <JiraHeader project={project} title="Board settings" />
      <h3>Columns and statuses</h3>
      <p className="muted">Each column is a status. The category controls how issues are counted (e.g. completed issues when a sprint ends).</p>
      <div className="column-editor">
        {cols.map((c, i) => (
          <div key={c.id || i} className="column-edit-row">
            <div className="col-order">
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronUp" /></button>
              <button className="icon-btn" disabled={i === cols.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" /></button>
            </div>
            <input className="input" value={c.name} onChange={(e) => set(i, 'name', e.target.value)} />
            <select className="input" value={c.category} onChange={(e) => set(i, 'category', e.target.value)}>
              <option value="todo">To Do</option>
              <option value="inprogress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <input className="input wip" type="number" min="0" placeholder="WIP limit" value={c.wip || ''} onChange={(e) => set(i, 'wip', e.target.value ? Number(e.target.value) : null)} />
            <span className="muted small">{counts[c.id] ?? 0} issues</span>
            <button className="icon-btn" disabled={cols.length === 1} title={counts[c.id] ? 'Issues will move to the first column' : 'Remove'} onClick={() => setCols((cs) => cs.filter((_, j) => j !== i))}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn btn-subtle" onClick={() => setCols((cs) => [...cs, { name: 'New column', category: 'inprogress' }])}><Icon name="plus" /> Add column</button>
        <div className="push" />
        <button className="btn btn-subtle" onClick={() => setCols(board.columns.map((c) => ({ ...c })))}>Reset</button>
        <button className="btn btn-jira" onClick={save}>Save</button>
      </div>
    </main>
  );
}
