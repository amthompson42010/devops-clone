import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Avatar, Menu, MenuItem, Modal, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useUser } from '../../user.js';
import { fmtDate } from '../../util.js';
import { useBoard } from './BoardsLayout.jsx';
import FilterBar, { useFilters, applyFilters } from './Filters.jsx';
import { TypeIcon, PriorityIcon, EpicLozenge, StatusLozenge, isDone, epicColor, CREATE_TYPES, TYPES } from './issueMeta.jsx';
import { JiraHeader, rankBetween } from './Board.jsx';
import CompleteSprintDialog, { StartSprintDialog } from './CompleteSprintDialog.jsx';

const byRank = (a, b) => a.rank - b.rank;

export default function Backlog() {
  const ctx = useBoard();
  const { board, project } = ctx;
  const user = useUser();
  const [filters, setFilters] = useFilters();
  const [showEpics, setShowEpics] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [starting, setStarting] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [editing, setEditing] = useState(null);

  // Backlog shows top-level work (no epics, no subtasks)
  const work = board.issues.filter((i) => i.type !== 'epic' && i.type !== 'subtask');
  const visible = applyFilters(work, filters, user.name);
  const sprints = board.sprints.filter((s) => s.state !== 'closed').sort((a, b) => (a.state === 'active' ? -1 : b.state === 'active' ? 1 : a.createdAt.localeCompare(b.createdAt)));
  const listFor = (sid) => visible.filter((i) => (i.sprintId || null) === sid).sort(byRank);

  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (destination.droppableId.startsWith('epic:')) {
      ctx.updateIssue(draggableId, { epicId: destination.droppableId.slice(5) || null });
      return;
    }
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const sid = destination.droppableId === 'backlog' ? null : destination.droppableId;
    const target = listFor(sid).filter((i) => i.id !== draggableId);
    ctx.updateIssue(draggableId, { sprintId: sid, rank: rankBetween(target, destination.index) }).catch(() => {});
  };

  const epics = board.issues.filter((i) => i.type === 'epic');

  return (
    <main className="page jira-page backlog-page">
      <JiraHeader project={project} title="Backlog" />
      <FilterBar board={board} issues={work} filters={filters} setFilters={setFilters}>
        <button className={`btn btn-subtle ${showEpics ? 'btn-selected' : ''}`} onClick={() => setShowEpics(!showEpics)}>Epics panel</button>
      </FilterBar>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="backlog-layout">
          {showEpics && (
            <aside className="epic-panel">
              <div className="epic-panel-head"><b>Epics</b><button className="icon-btn" onClick={() => setShowEpics(false)}><Icon name="close" size={14} /></button></div>
              <button className={`epic-row ${!filters.epics.length ? 'active' : ''}`} onClick={() => setFilters({ ...filters, epics: [] })}>All issues</button>
              {epics.map((e) => {
                const kids = board.issues.filter((i) => i.epicId === e.id);
                const done = kids.filter((k) => isDone(board, k)).length;
                return (
                  <Droppable key={e.id} droppableId={`epic:${e.id}`}>
                    {(p, s) => (
                      <div ref={p.innerRef} {...p.droppableProps} className={`epic-card ${filters.epics.includes(e.id) ? 'active' : ''} ${s.isDraggingOver ? 'drag-over' : ''}`}
                        style={{ borderLeftColor: epicColor(e) }}
                        onClick={() => setFilters({ ...filters, epics: filters.epics.includes(e.id) ? [] : [e.id] })}>
                        <div className="epic-card-title">{e.title}</div>
                        <div className="progress"><span style={{ width: kids.length ? `${(done / kids.length) * 100}%` : 0 }} /></div>
                        <div className="muted small">{kids.length} issues · {done} done</div>
                        <button className="link-btn small" onClick={(ev) => { ev.stopPropagation(); ctx.openIssue(e.key); }}>View details</button>
                        <div style={{ display: 'none' }}>{p.placeholder}</div>
                      </div>
                    )}
                  </Droppable>
                );
              })}
              <Droppable droppableId="epic:">
                {(p, s) => (
                  <div ref={p.innerRef} {...p.droppableProps} className={`epic-row ${filters.epics.includes('__none') ? 'active' : ''} ${s.isDraggingOver ? 'drag-over' : ''}`}
                    onClick={() => setFilters({ ...filters, epics: filters.epics.includes('__none') ? [] : ['__none'] })}>
                    Issues without epic
                    <div style={{ display: 'none' }}>{p.placeholder}</div>
                  </div>
                )}
              </Droppable>
              <button className="btn btn-subtle" onClick={() => ctx.openCreate({ type: 'epic' })}><Icon name="plus" /> Create epic</button>
            </aside>
          )}
          <div className="backlog-lists">
            {sprints.map((s) => (
              <SprintSection
                key={s.id}
                ctx={ctx}
                id={s.id}
                sprint={s}
                issues={listFor(s.id)}
                collapsed={collapsed[s.id]}
                onToggle={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))}
                actions={(
                  <>
                    {s.state === 'active'
                      ? <button className="btn btn-subtle" onClick={() => setCompleting(s)}>Complete sprint</button>
                      : <button className="btn btn-subtle" disabled={board.sprints.some((x) => x.state === 'active') || !board.issues.some((i) => i.sprintId === s.id)} onClick={() => setStarting(s)}>Start sprint</button>}
                    <Menu align="right" trigger={(o, t) => <button className="btn btn-subtle" onClick={t}><Icon name="more" /></button>}>
                      <MenuItem icon="edit" onClick={() => setEditing(s)}>Edit sprint</MenuItem>
                      {s.state !== 'active' && <MenuItem icon="trash" danger onClick={() => window.confirm(`Delete ${s.name}? Its issues move to the backlog.`) && ctx.deleteSprint(s.id)}>Delete sprint</MenuItem>}
                    </Menu>
                  </>
                )}
              />
            ))}
            <SprintSection
              ctx={ctx}
              id="backlog"
              sprint={null}
              issues={listFor(null)}
              collapsed={collapsed.backlog}
              onToggle={() => setCollapsed((c) => ({ ...c, backlog: !c.backlog }))}
              actions={<button className="btn btn-subtle" onClick={() => ctx.createSprint({})}>Create sprint</button>}
            />
          </div>
        </div>
      </DragDropContext>
      {starting && <StartSprintDialog ctx={ctx} sprint={starting} onClose={() => setStarting(null)} />}
      {completing && <CompleteSprintDialog ctx={ctx} sprint={completing} onClose={() => setCompleting(null)} />}
      {editing && <EditSprint ctx={ctx} sprint={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function SprintSection({ ctx, id, sprint, issues, collapsed, onToggle, actions }) {
  const { board } = ctx;
  const points = (cat) => issues.filter((i) => board.columns.find((c) => c.id === i.status)?.category === cat).reduce((a, i) => a + (i.storyPoints || 0), 0);
  return (
    <section className={`sprint-section ${sprint ? '' : 'is-backlog'}`}>
      <div className="sprint-head">
        <button className="icon-btn" onClick={onToggle}><Icon name={collapsed ? 'chevronRight' : 'chevronDown'} /></button>
        <b>{sprint ? sprint.name : 'Backlog'}</b>
        {sprint?.startDate && <span className="muted small">{fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}</span>}
        <span className="muted small">({issues.length} issue{issues.length === 1 ? '' : 's'})</span>
        {sprint?.state === 'active' && <span className="lozenge lz-inprogress">Active</span>}
        <span className="push" />
        <span className="pts pts-todo" title="To Do">{points('todo')}</span>
        <span className="pts pts-inprogress" title="In progress">{points('inprogress')}</span>
        <span className="pts pts-done" title="Done">{points('done')}</span>
        {actions}
      </div>
      {sprint?.goal && !collapsed && <div className="sprint-goal-line muted small">{sprint.goal}</div>}
      {!collapsed && (
        <Droppable droppableId={id}>
          {(p, s) => (
            <div ref={p.innerRef} {...p.droppableProps} className={`backlog-list ${s.isDraggingOver ? 'drag-over' : ''} ${!issues.length ? 'empty' : ''}`}>
              {!issues.length && !s.isDraggingOver && (
                <div className="backlog-empty">{sprint ? 'Plan a sprint by dragging issues here.' : 'Your backlog is empty.'}</div>
              )}
              {issues.map((issue, idx) => (
                <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                  {(dp, ds) => (
                    <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} className={`backlog-row ${ds.isDragging ? 'dragging' : ''}`} onClick={() => ctx.openIssue(issue.key)}>
                      <BacklogRow issue={issue} board={board} />
                    </div>
                  )}
                </Draggable>
              ))}
              {p.placeholder}
            </div>
          )}
        </Droppable>
      )}
      {!collapsed && <InlineCreate ctx={ctx} sprintId={sprint?.id || null} />}
    </section>
  );
}

function BacklogRow({ issue, board }) {
  const epic = board.issues.find((i) => i.id === issue.epicId);
  const col = board.columns.find((c) => c.id === issue.status);
  return (
    <>
      <TypeIcon type={issue.type} />
      <span className={`issue-key ${col?.category === 'done' ? 'done' : ''}`}>{issue.key}</span>
      <span className="row-title ellipsis">{issue.title}</span>
      {issue.labels?.slice(0, 2).map((l) => <span key={l} className="label-chip sm">{l}</span>)}
      {epic && <EpicLozenge epic={epic} />}
      <StatusLozenge column={col} />
      <span className="points">{issue.storyPoints ?? '-'}</span>
      <PriorityIcon priority={issue.priority} />
      <Avatar name={issue.assignee} size={24} />
    </>
  );
}

function InlineCreate({ ctx, sprintId }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('story');
  const [title, setTitle] = useState('');
  const toast = useToast();
  if (!open) return <button className="inline-create-btn" onClick={() => setOpen(true)}><Icon name="plus" /> Create issue</button>;
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const issue = await ctx.createIssue({ type, title, sprintId });
    toast(`${issue.key} created`);
    setTitle('');
  };
  return (
    <form className="inline-create" onSubmit={submit}>
      <Menu trigger={(o, t) => <button type="button" className="btn btn-subtle btn-sm" onClick={t}><TypeIcon type={type} /> <Icon name="chevronDown" size={12} /></button>}>
        {CREATE_TYPES.filter((t) => t !== 'epic').map((t) => <MenuItem key={t} active={t === type} onClick={() => setType(t)}><TypeIcon type={t} /> {TYPES[t].label}</MenuItem>)}
      </Menu>
      <input className="input" autoFocus placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} onBlur={() => !title && setOpen(false)} />
    </form>
  );
}

function EditSprint({ ctx, sprint, onClose }) {
  const [f, setF] = useState({ name: sprint.name, goal: sprint.goal || '', startDate: sprint.startDate || '', endDate: sprint.endDate || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={`Edit sprint: ${sprint.name}`} onClose={onClose} width={480} className="jira-modal"
      footer={<><button className="btn btn-subtle" onClick={onClose}>Cancel</button><button className="btn btn-jira" onClick={async () => { await ctx.updateSprint(sprint.id, f); onClose(); }}>Update</button></>}>
      <div className="form">
        <label className="field"><span>Sprint name</span><input className="input" value={f.name} onChange={set('name')} /></label>
        <div className="grid-2">
          <label className="field"><span>Start date</span><input className="input" type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field"><span>End date</span><input className="input" type="date" value={f.endDate} onChange={set('endDate')} /></label>
        </div>
        <label className="field"><span>Sprint goal</span><textarea className="input" rows={3} value={f.goal} onChange={set('goal')} /></label>
      </div>
    </Modal>
  );
}
