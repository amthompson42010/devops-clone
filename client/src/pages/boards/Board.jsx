import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Avatar, Empty, Menu, MenuItem } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useUser } from '../../user.js';
import { fmtDate } from '../../util.js';
import { useBoard } from './BoardsLayout.jsx';
import FilterBar, { useFilters, applyFilters } from './Filters.jsx';
import { TypeIcon, PriorityIcon, EpicLozenge } from './issueMeta.jsx';
import CompleteSprintDialog from './CompleteSprintDialog.jsx';

export function rankBetween(list, index) {
  const prev = list[index - 1];
  const next = list[index];
  if (prev && next) return (prev.rank + next.rank) / 2;
  if (prev) return prev.rank + 1000;
  if (next) return next.rank - 1000;
  return 1000;
}

const byRank = (a, b) => a.rank - b.rank;

export default function Board() {
  const ctx = useBoard();
  const { board, project } = ctx;
  const user = useUser();
  const [filters, setFilters] = useFilters();
  const [groupBy, setGroupBy] = useState('none');
  const [completing, setCompleting] = useState(false);
  const nav = useNavigate();
  const sprint = board.sprints.find((s) => s.state === 'active');

  const sprintIssues = useMemo(
    () => (sprint ? board.issues.filter((i) => i.sprintId === sprint.id && i.type !== 'epic') : []),
    [board.issues, sprint],
  );
  const visible = applyFilters(sprintIssues, filters, user.name).sort(byRank);

  if (!sprint) {
    return (
      <main className="page jira-page">
        <JiraHeader project={project} title="Board" />
        <Empty icon="sprint" title="Get started in the backlog" action={<Link to="../backlog" className="btn btn-jira">Go to backlog</Link>}>
          Plan and start a sprint to see issues here.
        </Empty>
      </main>
    );
  }

  const epics = board.issues.filter((i) => i.type === 'epic');
  let lanes = [{ id: 'all', title: null, match: () => true }];
  if (groupBy === 'assignee') {
    const names = [...new Set(visible.map((i) => i.assignee).filter(Boolean))].sort();
    lanes = [...names.map((n) => ({ id: `a:${n}`, title: n, avatar: n, match: (i) => i.assignee === n, patch: { assignee: n } })),
      { id: 'a:', title: 'Unassigned', avatar: null, match: (i) => !i.assignee, patch: { assignee: null } }];
  } else if (groupBy === 'epic') {
    lanes = [...epics.filter((e) => visible.some((i) => i.epicId === e.id)).map((e) => ({ id: `e:${e.id}`, title: e.title, epic: e, match: (i) => i.epicId === e.id, patch: { epicId: e.id } })),
      { id: 'e:', title: 'Issues without epic', match: (i) => !i.epicId, patch: { epicId: null } }];
  }

  const cell = (lane, col) => visible.filter((i) => i.status === col.id && lane.match(i));

  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const [laneId, colId] = destination.droppableId.split('::');
    const lane = lanes.find((l) => l.id === laneId);
    const col = board.columns.find((c) => c.id === colId);
    const target = cell(lane, col).filter((i) => i.id !== draggableId);
    const patch = { rank: rankBetween(target, destination.index) };
    const issue = board.issues.find((i) => i.id === draggableId);
    if (issue.status !== colId) patch.status = colId;
    if (lane.patch) Object.assign(patch, lane.patch);
    ctx.updateIssue(draggableId, patch).catch(() => {});
  };

  const daysLeft = sprint.endDate ? Math.ceil((new Date(`${sprint.endDate}T23:59:59`) - Date.now()) / 864e5) : null;

  return (
    <main className="page jira-page board-page">
      <JiraHeader project={project} title={sprint.name}>
        {daysLeft !== null && <span className="muted small"><Icon name="clock" size={14} /> {daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : `${-daysLeft} days overdue`}</span>}
        <button className="btn btn-subtle" onClick={() => setCompleting(true)}>Complete sprint</button>
        <Menu align="right" trigger={(o, t) => <button className="btn btn-subtle" onClick={t}><Icon name="more" /></button>}>
          <MenuItem icon="settings" onClick={() => nav('../settings')}>Configure board</MenuItem>
        </Menu>
      </JiraHeader>
      {sprint.goal && <p className="sprint-goal"><b>Sprint goal:</b> {sprint.goal} <span className="muted small">· {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}</span></p>}
      <FilterBar board={board} issues={sprintIssues} filters={filters} setFilters={setFilters}>
        <label className="muted small group-by">
          Group by
          <select className="input input-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="none">None</option>
            <option value="assignee">Assignee</option>
            <option value="epic">Epic</option>
          </select>
        </label>
      </FilterBar>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban">
          <div className="kanban-cols kanban-head" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(240px, 1fr))` }}>
            {board.columns.map((col) => {
              const n = visible.filter((i) => i.status === col.id).length;
              const over = col.wip && n > col.wip;
              return (
                <div key={col.id} className={`kanban-col-head ${over ? 'over' : ''}`}>
                  {col.name} <span className="count">{n}{col.wip ? ` / ${col.wip}` : ''}</span>
                  {col.category === 'done' && <Icon name="check" className="done-check" />}
                </div>
              );
            })}
          </div>
          {lanes.map((lane) => (
            <div key={lane.id} className="swimlane">
              {lane.title !== null && (
                <div className="swimlane-head">
                  {lane.epic ? <EpicLozenge epic={lane.epic} /> : lane.avatar !== undefined ? <><Avatar name={lane.avatar} size={22} /> {lane.title}</> : lane.title}
                  <span className="muted small">{visible.filter(lane.match).length} issues</span>
                </div>
              )}
              <div className="kanban-cols" style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(240px, 1fr))` }}>
                {board.columns.map((col, ci) => (
                  <Droppable key={col.id} droppableId={`${lane.id}::${col.id}`}>
                    {(p, s) => (
                      <div ref={p.innerRef} {...p.droppableProps} className={`kanban-col ${s.isDraggingOver ? 'drag-over' : ''}`}>
                        {cell(lane, col).map((issue, idx) => (
                          <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                            {(dp, ds) => (
                              <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} className={`card-issue ${ds.isDragging ? 'dragging' : ''}`} onClick={() => ctx.openIssue(issue.key)}>
                                <IssueCard issue={issue} board={board} done={col.category === 'done'} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {p.placeholder}
                        {ci === 0 && lane.id === lanes[0].id && (
                          <button className="kanban-create" onClick={() => ctx.openCreate({ sprintId: sprint.id, status: col.id })}><Icon name="plus" /> Create issue</button>
                        )}
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DragDropContext>
      {completing && <CompleteSprintDialog ctx={ctx} sprint={sprint} onClose={() => setCompleting(false)} />}
    </main>
  );
}

export function IssueCard({ issue, board, done }) {
  const epic = board.issues.find((i) => i.id === issue.epicId);
  const parent = board.issues.find((i) => i.id === issue.parentId);
  const subtasks = board.issues.filter((i) => i.parentId === issue.id);
  return (
    <>
      <div className="card-title">{issue.title}</div>
      {(epic || parent || issue.labels?.length > 0) && (
        <div className="card-tags">
          {epic && <EpicLozenge epic={epic} />}
          {parent && <span className="parent-tag">{parent.key}</span>}
          {issue.labels?.slice(0, 2).map((l) => <span key={l} className="label-chip sm">{l}</span>)}
        </div>
      )}
      <div className="card-foot">
        <TypeIcon type={issue.type} />
        <span className={`issue-key ${done ? 'done' : ''}`}>{issue.key}</span>
        {subtasks.length > 0 && <span className="muted small" title="Subtasks"><Icon name="list" size={12} /> {subtasks.length}</span>}
        {issue.dueDate && <span className={`due ${!done && new Date(issue.dueDate) < new Date() ? 'overdue' : ''}`}>{fmtDate(issue.dueDate)}</span>}
        <span className="push" />
        {issue.storyPoints != null && <span className="points">{issue.storyPoints}</span>}
        <PriorityIcon priority={issue.priority} />
        <Avatar name={issue.assignee} size={24} />
      </div>
    </>
  );
}

export function JiraHeader({ project, title, children }) {
  return (
    <div className="jira-header">
      <div className="jira-crumbs"><Link to="/">Projects</Link> / <Link to={`/${project.key}`}>{project.name}</Link></div>
      <div className="jira-title-row">
        <h1>{title}</h1>
        <div className="push" />
        {children}
      </div>
    </div>
  );
}
