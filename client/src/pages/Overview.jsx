import { Link, useOutletContext } from 'react-router-dom';
import { Avatar } from '../components/ui.jsx';
import { BROWSER_MODE } from '../api.js';
import Icon from '../components/Icon.jsx';
import { timeAgo, fmtDate } from '../util.js';
import { TypeIcon } from './boards/issueMeta.jsx';
import { ProjectTile } from './Projects.jsx';

export default function Overview() {
  const { project } = useOutletContext();
  const s = project.stats;
  const sprint = project.activeSprint;
  return (
    <main className="page overview">
      <div className="overview-hero">
        <ProjectTile project={project} size={56} />
        <div>
          <h1>{project.name}</h1>
          <p className="muted">{project.description || 'No description yet.'}</p>
        </div>
      </div>
      <div className="overview-grid">
        <section className="card">
          <h3>About this project</h3>
          <dl className="kv">
            <dt>Key</dt><dd className="mono">{project.key}</dd>
            <dt>Created</dt><dd>{fmtDate(project.createdAt)} by {project.createdBy}</dd>
            <dt>Storage</dt><dd>{BROWSER_MODE ? 'This browser (IndexedDB)' : 'Server storage'}</dd>
          </dl>
          <h4>Members</h4>
          <div className="avatar-row">
            {project.members.map((m) => <Avatar key={m} name={m} size={30} />)}
          </div>
        </section>
        <section className="card">
          <h3>Project stats</h3>
          <div className="stats">
            <Link to={`/${project.key}/boards/issues`} className="stat"><span className="stat-n">{s.open}</span><span>Open issues</span></Link>
            <Link to={`/${project.key}/boards/issues`} className="stat"><span className="stat-n">{s.done}</span><span>Completed</span></Link>
            <Link to={`/${project.key}/boards/issues`} className="stat"><span className="stat-n">{s.bugs}</span><span>Open bugs</span></Link>
            <Link to={`/${project.key}/repos`} className="stat"><span className="stat-n">{s.repos}</span><span>Repositories</span></Link>
            <Link to={`/${project.key}/wiki`} className="stat"><span className="stat-n">{s.pages}</span><span>Wiki pages</span></Link>
          </div>
          {sprint ? (
            <div className="sprint-callout">
              <Icon name="sprint" /> <strong>{sprint.name}</strong> is active · ends {fmtDate(sprint.endDate)}
              <Link to={`/${project.key}/boards/board`} className="btn btn-sm">Open board</Link>
            </div>
          ) : (
            <div className="sprint-callout muted"><Icon name="sprint" /> No active sprint. <Link to={`/${project.key}/boards/backlog`}>Plan one in the backlog</Link></div>
          )}
        </section>
        <section className="card">
          <h3>Recently updated issues</h3>
          {!project.recentIssues.length && <p className="muted">No issues yet.</p>}
          <ul className="plain-list">
            {project.recentIssues.map((i) => (
              <li key={i.id}>
                <Link to={`/${project.key}/boards/issues?issue=${i.key}`} className="row-link">
                  <TypeIcon type={i.type} /> <span className="issue-key">{i.key}</span> <span className="ellipsis">{i.title}</span>
                  <span className="muted small push">{timeAgo(i.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Recent wiki pages</h3>
          <ul className="plain-list">
            {project.recentPages.map((p) => (
              <li key={p.id}>
                <Link to={`/${project.key}/wiki/${p.id}`} className="row-link">
                  <Icon name="page" /> <span className="ellipsis">{p.title}</span>
                  <span className="muted small push">{timeAgo(p.updatedAt)} · {p.updatedBy}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Repositories</h3>
          <ul className="plain-list">
            {project.repos.map((r) => (
              <li key={r.name}>
                <Link to={`/${project.key}/repos/${encodeURIComponent(r.name)}/files`} className="row-link">
                  <Icon name="repo" /> <span>{r.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
