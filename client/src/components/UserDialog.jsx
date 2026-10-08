import { useState } from 'react';
import { Modal } from './ui.jsx';
import { getUser, setUser } from '../user.js';

export default function UserDialog({ onClose }) {
  const cur = getUser();
  const [name, setName] = useState(cur.name);
  const [email, setEmail] = useState(cur.email);
  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setUser({ name, email });
    onClose?.();
  };
  return (
    <Modal title={onClose ? 'Change user' : 'Welcome to DevOps'} onClose={onClose || (() => {})} width={420}>
      <form onSubmit={save} className="form">
        {!onClose && <p className="muted">Tell us who you are. Your name is used for work item assignments, page authorship and web commits.</p>}
        <label className="field">
          <span>Display name</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </label>
        <label className="field">
          <span>Email (used for commits)</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!name.trim()}>Continue</button>
        </div>
      </form>
    </Modal>
  );
}
