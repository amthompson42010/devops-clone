import { useState } from 'react';
import { Modal, ErrorBox, useToast } from '../../components/ui.jsx';
import { RichEditor } from '../../components/RichText.jsx';
import { useUser } from '../../user.js';
import { CREATE_TYPES } from './issueMeta.jsx';
import { UserPicker, TypePicker, PriorityPicker, SprintPicker, EpicPicker, LabelsInput, allLabels } from './fields.jsx';

export default function CreateIssueDialog({ ctx, defaults, onClose }) {
  const { board, users, project } = ctx;
  const user = useUser();
  const blank = () => ({
    type: defaults.type || 'story', title: '', description: '', assignee: null, reporter: user.name, priority: 'medium',
    labels: [], storyPoints: '', sprintId: defaults.sprintId ?? null, epicId: defaults.epicId ?? null, status: defaults.status, dueDate: '',
  });
  const [f, setF] = useState(blank);
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [editorKey, setEditorKey] = useState(0);
  const toast = useToast();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...f, storyPoints: f.storyPoints === '' ? null : Number(f.storyPoints), dueDate: f.dueDate || null };
      if (payload.type === 'epic') payload.epicId = null;
      if (!payload.status) delete payload.status;
      const issue = await ctx.createIssue(payload);
      toast(`${issue.key} created`);
      if (another) {
        setF({ ...blank(), type: f.type, sprintId: f.sprintId, epicId: f.epicId });
        setEditorKey((k) => k + 1);
        setBusy(false);
      } else onClose();
    } catch (ex) { setErr(ex); setBusy(false); }
  };

  return (
    <Modal title="Create issue" onClose={onClose} width={720} className="jira-modal"
      footer={(
        <>
          <label className="check push-left"><input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} /> Create another</label>
          <button type="button" className="btn btn-subtle" onClick={onClose}>Cancel</button>
          <button className="btn btn-jira" disabled={!f.title.trim() || busy} onClick={submit}>{busy ? 'Creating…' : 'Create'}</button>
        </>
      )}>
      <form className="form jira-form" onSubmit={submit}>
        <div className="field"><span>Project</span><div className="static-val">{project.name} ({project.key})</div></div>
        <div className="field half"><span>Issue type *</span><TypePicker value={f.type} onChange={set('type')} types={CREATE_TYPES} /></div>
        <label className="field"><span>Summary *</span><input className="input" autoFocus value={f.title} onChange={set('title')} /></label>
        <div className="field"><span>Description</span>
          <RichEditor key={editorKey} value={f.description} onChange={set('description')} placeholder="Add a description…" minHeight={120} />
        </div>
        <div className="grid-2">
          <div className="field"><span>Assignee</span><UserPicker users={users} value={f.assignee} onChange={set('assignee')} /></div>
          <div className="field"><span>Reporter</span><UserPicker users={users} value={f.reporter} onChange={set('reporter')} noneLabel="None" /></div>
          <div className="field"><span>Priority</span><PriorityPicker value={f.priority} onChange={set('priority')} /></div>
          <label className="field"><span>Story points</span><input className="input" type="number" min="0" step="0.5" value={f.storyPoints} onChange={set('storyPoints')} /></label>
          <div className="field"><span>Sprint</span><SprintPicker board={board} value={f.sprintId} onChange={set('sprintId')} /></div>
          {f.type !== 'epic' && <div className="field"><span>Epic</span><EpicPicker board={board} value={f.epicId} onChange={set('epicId')} /></div>}
          <label className="field"><span>Due date</span><input className="input" type="date" value={f.dueDate} onChange={set('dueDate')} /></label>
        </div>
        <div className="field"><span>Labels</span><LabelsInput value={f.labels} onChange={set('labels')} suggestions={allLabels(board)} /></div>
        <ErrorBox error={err} />
      </form>
    </Modal>
  );
}
