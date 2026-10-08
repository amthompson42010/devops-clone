import { useRef, useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { useUser } from '../user.js';
import { BROWSER_MODE, saveBlob } from '../api.js';
import { Avatar, Menu, MenuItem, Modal, useToast } from './ui.jsx';
import Icon from './Icon.jsx';

const AREAS = { boards: 'Boards', repos: 'Repos', wiki: 'Wiki', settings: 'Settings' };

export default function TopBar({ onEditUser }) {
  const user = useUser();
  const m = useMatch('/:key/*');
  const key = m?.params.key;
  const area = m?.params['*']?.split('/')[0];
  const [resetting, setResetting] = useState(false);
  const fileInput = useRef(null);
  const toast = useToast();

  const backup = async () => {
    try {
      const { exportAll } = await import('virtual:local-backend');
      const data = await exportAll();
      saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `devops-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('Backup downloaded');
    } catch (e) { toast(e, 'error'); }
  };
  const restore = async (file) => {
    if (!window.confirm('Restoring replaces ALL data in this browser with the backup. Continue?')) return;
    try {
      const { importAll } = await import('virtual:local-backend');
      await importAll(JSON.parse(await file.text()));
      window.location.hash = '#/';
      window.location.reload();
    } catch (e) { toast(e, 'error'); }
  };
  const reset = async () => {
    const { resetAll } = await import('virtual:local-backend');
    await resetAll();
    window.location.hash = '#/';
    window.location.reload();
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <svg width="22" height="22" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0078d4" /><path d="M9 22V10l7 4 7-4v12l-7 4z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" /></svg>
        <span>DevOps</span>
      </Link>
      <nav className="crumbs">
        <span className="crumb-sep">/</span>
        <Link to="/">Dystopia</Link>
        {key && (<><span className="crumb-sep">/</span><Link to={`/${key}`}>{key}</Link></>)}
        {key && AREAS[area] && (<><span className="crumb-sep">/</span><Link to={`/${key}/${area}`}>{AREAS[area]}</Link></>)}
      </nav>
      <div className="topbar-right">
        {BROWSER_MODE && (
          <Menu
            align="right"
            trigger={(open, toggle) => (
              <button className="storage-pill" onClick={toggle} title="Data is stored in this browser">
                <Icon name="download" size={14} /> Browser storage <Icon name="chevronDown" size={12} />
              </button>
            )}
          >
            <div className="menu-header">
              <strong>Stored in this browser</strong>
              <span className="muted small">Projects, repos, boards and wiki live in IndexedDB on this device. Back up regularly.</span>
            </div>
            <MenuItem icon="download" onClick={backup}>Download backup</MenuItem>
            <MenuItem icon="upload" onClick={() => fileInput.current?.click()}>Restore from backup…</MenuItem>
            <div className="menu-divider" />
            <MenuItem icon="trash" danger onClick={() => setResetting(true)}>Delete all data…</MenuItem>
          </Menu>
        )}
        <input type="file" accept=".json,application/json" hidden ref={fileInput} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); }} />
        <Menu
          align="right"
          trigger={(open, toggle) => (
            <button className="user-btn" onClick={toggle}><Avatar name={user.name} size={28} /></button>
          )}
        >
          <div className="menu-header">
            <strong>{user.name || 'Anonymous'}</strong>
            <span className="muted">{user.email}</span>
          </div>
          <MenuItem icon="user" onClick={onEditUser}>Change user</MenuItem>
        </Menu>
      </div>
      {resetting && (
        <Modal title="Delete all data?" onClose={() => setResetting(false)} width={440}
          footer={<><button className="btn" onClick={() => setResetting(false)}>Cancel</button><button className="btn btn-danger" onClick={reset}>Delete everything</button></>}>
          <p>This permanently removes every project, repository, work item and wiki page stored in this browser. Download a backup first if you might need it.</p>
        </Modal>
      )}
    </header>
  );
}
