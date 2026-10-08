import { useState } from 'react';
import { NavLink, Outlet, useParams, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../util.js';
import { Spinner, ErrorBox } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { ProjectTile } from './Projects.jsx';

export default function ProjectLayout() {
  const { key } = useParams();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { data: project, error, reload } = useAsync(() => api.get(`/api/projects/${key}`), [key]);
  const section = loc.pathname.split('/')[2] || '';

  if (error) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  if (!project) return <Spinner />;

  const sub = {
    boards: [
      ['board', 'Board', 'boards'],
      ['backlog', 'Backlog', 'backlog'],
      ['issues', 'Issues', 'list'],
      ['settings', 'Board settings', 'settings'],
    ],
  };

  return (
    <div className={`project-shell ${collapsed ? 'nav-collapsed' : ''}`}>
      <aside className="sidenav">
        <div className="sidenav-project">
          <ProjectTile project={project} size={28} />
          {!collapsed && <span className="sidenav-project-name" title={project.name}>{project.name}</span>}
        </div>
        <nav>
          <NavLink end to={`/${key}`} className="nav-item"><Icon name="overview" size={18} /><span>Overview</span></NavLink>
          <NavLink to={`/${key}/boards`} className="nav-item nav-boards"><Icon name="boards" size={18} /><span>Boards</span></NavLink>
          {section === 'boards' && !collapsed && sub.boards.map(([path, label, icon]) => (
            <NavLink key={path} to={`/${key}/boards/${path}`} className="nav-sub"><Icon name={icon} size={14} /><span>{label}</span></NavLink>
          ))}
          <NavLink to={`/${key}/repos`} className="nav-item nav-repos"><Icon name="repo" size={18} /><span>Repos</span></NavLink>
          {section === 'repos' && !collapsed && <RepoSubnav projectKey={key} />}
          <NavLink to={`/${key}/wiki`} className="nav-item nav-wiki"><Icon name="wiki" size={18} /><span>Wiki</span></NavLink>
        </nav>
        <div className="sidenav-foot">
          <NavLink to={`/${key}/settings`} className="nav-item"><Icon name="settings" size={18} /><span>Project settings</span></NavLink>
          <button className="nav-item collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={18} />
          </button>
        </div>
      </aside>
      <div className="project-main">
        <Outlet context={{ project, reloadProject: reload }} />
      </div>
    </div>
  );
}

function RepoSubnav({ projectKey }) {
  const loc = useLocation();
  const repo = loc.pathname.split('/')[3];
  if (!repo) return null;
  const base = `/${projectKey}/repos/${repo}`;
  return (
    <>
      <NavLink to={`${base}/files`} className="nav-sub"><Icon name="file" size={14} /><span>Files</span></NavLink>
      <NavLink to={`${base}/commits`} className={({ isActive }) => `nav-sub ${isActive || loc.pathname.startsWith(`${base}/commit/`) ? 'active' : ''}`}><Icon name="commit" size={14} /><span>Commits</span></NavLink>
      <NavLink to={`${base}/branches`} className="nav-sub"><Icon name="branch" size={14} /><span>Branches</span></NavLink>
      <NavLink to={`${base}/pulls`} className="nav-sub"><Icon name="pr" size={14} /><span>Pull requests</span></NavLink>
      <NavLink to={`${base}/deployments`} className="nav-sub"><Icon name="upload" size={14} /><span>Deployments</span></NavLink>
    </>
  );
}
