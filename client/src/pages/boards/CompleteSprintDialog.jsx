import { useState } from 'react';
import { Modal, useToast } from '../../components/ui.jsx';
import { isDone } from './issueMeta.jsx';

export default function CompleteSprintDialog({ ctx, sprint, onClose }) {
  const { board } = ctx;
  const issues = board.issues.filter((i) => i.sprintId === sprint.id && i.type !== 'epic');
  const done = issues.filter((i) => isDone(board, i));
  const open = issues.length - done.length;
  const future = board.sprints.filter((s) => s.state === 'future');
  const [moveTo, setMoveTo] = useState('backlog');
  const toast = useToast();
  const submit = async () => {
    let target = moveTo;
    if (moveTo === 'new') {
      const r = await ctx.createSprint({});
      target = r.sprint.id;
    }
    await ctx.completeSprint(sprint.id, target);
    toast(`${sprint.name} completed`);
    onClose();
  };
  return (
    <Modal title={`Complete ${sprint.name}`} onClose={onClose} width={480} className="jira-modal"
      footer={<><button className="btn btn-subtle" onClick={onClose}>Cancel</button><button className="btn btn-jira" onClick={submit}>Complete sprint</button></>}>
      <div className="complete-sprint">
        <div className="sprint-trophy">🏁</div>
        <p>This sprint contains <b>{done.length} completed issue{done.length === 1 ? '' : 's'}</b> and <b>{open} open issue{open === 1 ? '' : 's'}</b>.</p>
        <ul className="muted small">
          <li>Completed issues include everything in the last column{board.columns.filter((c) => c.category === 'done').length > 1 ? 's' : ''} marked Done.</li>
          <li>Story points completed: {done.reduce((a, i) => a + (i.storyPoints || 0), 0)}</li>
        </ul>
        {open > 0 && (
          <label className="field"><span>Move open issues to</span>
            <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="backlog">Backlog</option>
              {future.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="new">New sprint</option>
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}

export function StartSprintDialog({ ctx, sprint, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(sprint.name);
  const [duration, setDuration] = useState('2');
  const [start, setStart] = useState(sprint.startDate || today);
  const addWeeks = (d, w) => new Date(new Date(`${d}T00:00:00`).getTime() + w * 7 * 864e5).toISOString().slice(0, 10);
  const [end, setEnd] = useState(sprint.endDate || addWeeks(today, 2));
  const [goal, setGoal] = useState(sprint.goal || '');
  const count = ctx.board.issues.filter((i) => i.sprintId === sprint.id).length;
  const toast = useToast();
  const submit = async () => {
    await ctx.startSprint(sprint.id, { name, startDate: start, endDate: end, goal });
    toast(`${name} started`);
    onClose();
  };
  return (
    <Modal title="Start sprint" onClose={onClose} width={520} className="jira-modal"
      footer={<><button className="btn btn-subtle" onClick={onClose}>Cancel</button><button className="btn btn-jira" onClick={submit} disabled={!name.trim()}>Start</button></>}>
      <div className="form">
        <p className="muted"><b>{count}</b> issue{count === 1 ? '' : 's'} will be included in this sprint.</p>
        <label className="field"><span>Sprint name *</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Duration</span>
          <select className="input" value={duration} onChange={(e) => { setDuration(e.target.value); if (e.target.value !== 'custom') setEnd(addWeeks(start, Number(e.target.value))); }}>
            <option value="1">1 week</option><option value="2">2 weeks</option><option value="3">3 weeks</option><option value="4">4 weeks</option><option value="custom">Custom</option>
          </select>
        </label>
        <div className="grid-2">
          <label className="field"><span>Start date</span><input className="input" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (duration !== 'custom') setEnd(addWeeks(e.target.value, Number(duration))); }} /></label>
          <label className="field"><span>End date</span><input className="input" type="date" value={end} onChange={(e) => { setEnd(e.target.value); setDuration('custom'); }} /></label>
        </div>
        <label className="field"><span>Sprint goal</span><textarea className="input" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
