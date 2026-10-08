import { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';

const extensions = (placeholder) => [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline,
  Highlight,
  Link.configure({ openOnClick: false, autolink: true }),
  Placeholder.configure({ placeholder }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

function Btn({ on, active, title, children, disabled }) {
  return (
    <button
      type="button"
      className={`rt-btn ${active ? 'active' : ''}`}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); on(); }}
    >
      {children}
    </button>
  );
}

export function Toolbar({ editor, full }) {
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL', prev);
    if (url === null) return;
    if (!url) c().unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: url }).run();
  };
  const heading = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3' : editor.isActive('heading', { level: 4 }) ? 'h4' : 'p';
  return (
    <div className={`rt-toolbar ${full ? 'rt-toolbar-full' : ''}`}>
      <select
        className="rt-select"
        value={heading}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') c().setParagraph().run();
          else c().toggleHeading({ level: Number(v[1]) }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
      </select>
      <span className="rt-sep" />
      <Btn title="Bold (Ctrl+B)" on={() => c().toggleBold().run()} active={editor.isActive('bold')}><b>B</b></Btn>
      <Btn title="Italic (Ctrl+I)" on={() => c().toggleItalic().run()} active={editor.isActive('italic')}><i>I</i></Btn>
      <Btn title="Underline (Ctrl+U)" on={() => c().toggleUnderline().run()} active={editor.isActive('underline')}><u>U</u></Btn>
      <Btn title="Strikethrough" on={() => c().toggleStrike().run()} active={editor.isActive('strike')}><s>S</s></Btn>
      <Btn title="Highlight" on={() => c().toggleHighlight().run()} active={editor.isActive('highlight')}><span className="rt-hl">A</span></Btn>
      <Btn title="Inline code" on={() => c().toggleCode().run()} active={editor.isActive('code')}>{'</>'}</Btn>
      <span className="rt-sep" />
      <Btn title="Bulleted list" on={() => c().toggleBulletList().run()} active={editor.isActive('bulletList')}>•≡</Btn>
      <Btn title="Numbered list" on={() => c().toggleOrderedList().run()} active={editor.isActive('orderedList')}>1≡</Btn>
      <Btn title="Action items" on={() => c().toggleTaskList().run()} active={editor.isActive('taskList')}>☑</Btn>
      <span className="rt-sep" />
      <Btn title="Link" on={setLink} active={editor.isActive('link')}>🔗</Btn>
      <Btn title="Quote" on={() => c().toggleBlockquote().run()} active={editor.isActive('blockquote')}>❝</Btn>
      <Btn title="Code block" on={() => c().toggleCodeBlock().run()} active={editor.isActive('codeBlock')}>{'{ }'}</Btn>
      <Btn title="Divider" on={() => c().setHorizontalRule().run()}>―</Btn>
      {full && (
        <>
          <span className="rt-sep" />
          <Btn title="Insert table" on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</Btn>
          {editor.isActive('table') && (
            <>
              <Btn title="Add column" on={() => c().addColumnAfter().run()}>+Col</Btn>
              <Btn title="Add row" on={() => c().addRowAfter().run()}>+Row</Btn>
              <Btn title="Delete column" on={() => c().deleteColumn().run()}>−Col</Btn>
              <Btn title="Delete row" on={() => c().deleteRow().run()}>−Row</Btn>
              <Btn title="Delete table" on={() => c().deleteTable().run()}>✕▦</Btn>
            </>
          )}
        </>
      )}
      <span className="rt-sep" />
      <Btn title="Undo" on={() => c().undo().run()} disabled={!editor.can().undo()}>↶</Btn>
      <Btn title="Redo" on={() => c().redo().run()} disabled={!editor.can().redo()}>↷</Btn>
    </div>
  );
}

/**
 * Rich text editor. Controlled-ish: `value` is the initial HTML, onChange receives HTML.
 * Pass `editorRef` to receive the editor instance (e.g. for an external toolbar).
 */
export function RichEditor({ value, onChange, placeholder = 'Type something…', full = false, autoFocus = false, className = '', toolbar = true, onEditor, minHeight }) {
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: value || '',
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: e }) => onChange?.(e.isEmpty ? '' : e.getHTML()),
  });
  useEffect(() => { if (editor) onEditor?.(editor); }, [editor, onEditor]);
  return (
    <div className={`rt ${className}`}>
      {toolbar && <Toolbar editor={editor} full={full} />}
      <EditorContent editor={editor} className="rt-content prose" style={{ minHeight }} />
    </div>
  );
}

function highlightCode(root) {
  root.querySelectorAll('pre code').forEach((el) => {
    try { hljs.highlightElement(el); } catch { /* ignore */ }
  });
}

/** Render stored HTML safely. */
export function RichView({ html, className = '', onToggleTask }) {
  const clean = useMemo(() => DOMPurify.sanitize(html || '', { ADD_ATTR: ['data-type', 'data-checked', 'target'] }), [html]);
  return (
    <div
      className={`prose ${className}`}
      ref={(el) => { if (el) highlightCode(el); }}
      onClick={(e) => {
        const li = e.target.closest('li[data-type="taskItem"]');
        if (li && onToggleTask && e.target.tagName === 'INPUT') onToggleTask(li);
      }}
      dangerouslySetInnerHTML={{ __html: clean || '<p class="muted">No content</p>' }}
    />
  );
}

marked.setOptions({ gfm: true, breaks: false });
export function Markdown({ source, className = '' }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source || '')), [source]);
  return <div className={`prose markdown ${className}`} ref={(el) => { if (el) highlightCode(el); }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const isEmptyHtml = (html) => !html || !html.replace(/<[^>]*>/g, '').trim();
