import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { colorFor, initials, useClickOutside, copyText } from '../util.js';

export function Avatar({ name, size = 24, title }) {
  if (!name) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size }} title={title || 'Unassigned'}>
        <Icon name="user" size={size * 0.6} />
      </span>
    );
  }
  return (
    <span className="avatar" title={title || name} style={{ width: size, height: size, background: colorFor(name), fontSize: Math.max(9, size * 0.4) }}>
      {initials(name)}
    </span>
  );
}

export function Spinner({ label }) {
  return <div className="spinner-wrap"><span className="spinner" />{label && <span>{label}</span>}</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box">
      <Icon name="warning" /> <span>{error.message || String(error)}</span>
      {onRetry && <button className="btn btn-link" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Empty({ icon = 'file', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={36} stroke={1.5} /></div>
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width = 560, className = '' }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${className}`} style={{ width }} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Dropdown menu. `trigger` is a render fn receiving (open, toggle). */
export function Menu({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div className={`menu menu-${align}`} onClick={(e) => { if (e.target.closest('[data-close]')) close(); }}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, active, disabled }) {
  return (
    <button type="button" className={`menu-item ${danger ? 'danger' : ''} ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} data-close>
      {icon && <Icon name={icon} />}<span>{children}</span>
      {active && <Icon name="check" className="menu-check" />}
    </button>
  );
}

/** Searchable single-select picker used for assignee, epic, sprint, etc. */
export function Picker({ value, options, onChange, renderOption, renderValue, placeholder = 'None', searchable = true, className = '', allowNone = true, noneLabel = 'Unassigned' }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const filtered = options.filter((o) => !term || o.label.toLowerCase().includes(term.toLowerCase()));
  const current = options.find((o) => o.value === value);
  return (
    <div className={`picker ${className}`} ref={ref}>
      <button type="button" className="picker-btn" onClick={() => { setOpen(!open); setTerm(''); }}>
        {current ? (renderValue || renderOption || ((o) => o.label))(current) : <span className="muted">{placeholder}</span>}
      </button>
      {open && (
        <div className="menu menu-left picker-menu">
          {searchable && (
            <input autoFocus className="input input-sm" placeholder="Search…" value={term} onChange={(e) => setTerm(e.target.value)} />
          )}
          <div className="picker-list">
            {allowNone && (
              <button type="button" className="menu-item" onClick={() => { onChange(null); setOpen(false); }}>
                <span className="muted">{noneLabel}</span>
              </button>
            )}
            {filtered.map((o) => (
              <button type="button" key={o.value} className={`menu-item ${o.value === value ? 'active' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
                {(renderOption || ((x) => x.label))(o)}
              </button>
            ))}
            {!filtered.length && <div className="menu-empty">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- toasts */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg: msg?.message || String(msg), kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <Icon name={t.kind === 'error' ? 'warning' : 'check'} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.value} type="button" className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => {
        copyText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
      }}
    >
      <Icon name={done ? 'check' : 'copy'} /> {done ? 'Copied' : label}
    </button>
  );
}
