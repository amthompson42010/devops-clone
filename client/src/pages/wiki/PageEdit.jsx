import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner, ErrorBox, useToast } from '../../components/ui.jsx';
import { RichEditor, Toolbar } from '../../components/RichText.jsx';
import { useWiki } from './WikiLayout.jsx';

export default function PageEdit() {
  const ctx = useWiki();
  const { pageId } = useParams();
  const [sp] = useSearchParams();
  const isNew = !!sp.get('new');
  const nav = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const pageApi = `${ctx.base}/pages/${pageId}`;

  useEffect(() => {
    api.get(pageApi).then((p) => { setPage(p); setTitle(isNew && p.title === 'Untitled' ? '' : p.title); setContent(p.content); }).catch(setErr);
  }, [pageApi, isNew]);

  useEffect(() => {
    const h = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const publish = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    setErr(null);
    try {
      await api.put(pageApi, { title: title.trim() || 'Untitled', content, version: page.version, message });
      dirty.current = false;
      await ctx.reloadIndex();
      toast(isNew ? 'Page published' : 'Page updated');
      nav(`/${ctx.project.key}/wiki/${pageId}`);
    } catch (e) { setErr(e); setSaving(false); }
  }, [page, pageApi, title, content, message, ctx, toast, nav, pageId, isNew]);

  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); publish(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [publish]);

  const close = async () => {
    if (dirty.current && !window.confirm('Discard your unpublished changes?')) return;
    dirty.current = false;
    if (isNew && page?.version === 1) {
      // Abandoned brand-new page: remove it unless it already has content from a template the user kept
      const idx = await api.del(pageApi).catch(() => null);
      if (idx) ctx.setIndex(idx);
      nav(`/${ctx.project.key}/wiki`);
      return;
    }
    nav(`/${ctx.project.key}/wiki/${pageId}`);
  };

  const onEditor = useCallback((e) => setEditor(e), []);

  if (!page) return err ? <main className="cf-page"><ErrorBox error={err} /></main> : <Spinner />;

  return (
    <div className="cf-editor">
      <div className="cf-editor-bar">
        <Toolbar editor={editor} full />
        <div className="push" />
        <input className="input input-sm version-msg" placeholder="What did you change?" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button className="btn btn-cf" onClick={publish} disabled={saving}>{saving ? 'Publishing…' : isNew ? 'Publish' : 'Update'}</button>
        <button className="btn btn-subtle" onClick={close}>Close</button>
      </div>
      {err && <div className="cf-editor-err"><ErrorBox error={err} /></div>}
      <div className="cf-editor-body">
        <input
          className="cf-title-input"
          placeholder="Give this page a title"
          value={title}
          autoFocus={isNew}
          onChange={(e) => { setTitle(e.target.value); dirty.current = true; }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }}
        />
        <RichEditor
          value={page.content}
          onChange={(html) => { setContent(html); dirty.current = true; }}
          placeholder="Type / to start writing, or use the toolbar above…"
          toolbar={false}
          full
          onEditor={onEditor}
          className="cf-rt"
          minHeight={400}
        />
      </div>
    </div>
  );
}
