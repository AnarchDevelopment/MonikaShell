import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import jsonWorker from '../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import cssWorker from '../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import htmlWorker from '../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import tsWorker from '../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import { XIcon } from './Icons';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

loader.config({ monaco });

const LANG_BY_EXT = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini', properties: 'ini',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', xml: 'xml', svg: 'xml',
  md: 'markdown', txt: 'plaintext', log: 'plaintext',
  sql: 'sql', php: 'php'
};

function detectLanguage(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return LANG_BY_EXT[ext] || 'plaintext';
}

function joinPath(base, name) {
  if (base === '/') return '/' + name;
  return base.replace(/\/$/, '') + '/' + name;
}

export default function FileEditor({ uuid, path, basePath, newFile, onClose, onSaved }) {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(!!newFile);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(newFile ? '' : (path.split('/').pop() || path));
  const editorRef = useRef(null);

  const displayPath = newFile ? joinPath(basePath, name) : path;
  const language = useMemo(() => detectLanguage(name), [name]);

  useEffect(() => {
    if (newFile) return;
    let cancelled = false;
    fetch(`/api/servers/${uuid}/files/content?path=${encodeURIComponent(path)}`, { credentials: 'include' })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load file');
        if (!cancelled) {
          setContent(data.content ?? '');
          setLoaded(true);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load file');
      });
    return () => { cancelled = true; };
  }, [uuid, path, newFile]);

  const save = async () => {
    if (newFile) {
      const trimmed = name.trim();
      if (!trimmed) { setError('Enter a file name'); return; }
      if (trimmed.includes('/')) { setError('File name cannot contain "/"'); return; }
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/servers/${uuid}/files/content`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: displayPath, content })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      setDirty(false);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-head">
          {newFile ? (
            <div className="editor-newfile">
              <span className="editor-filename">{basePath.replace(/\/$/, '')}/</span>
              <input
                className="editor-filename-input"
                type="text"
                value={name}
                placeholder="filename"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
            </div>
          ) : (
            <span className="editor-filename">{path}</span>
          )}
          {dirty && <span className="editor-dirty">● unsaved</span>}
          <div className="editor-spacer"></div>
          <button className="btn btn-secondary" onClick={save} disabled={saving || !loaded}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="icon-btn" onClick={close} title="Close"><XIcon /></button>
        </div>
        {error && <div className="editor-error">{error}</div>}
        <div className="editor-body">
          {loaded ? (
            <Editor
              language={language}
              value={content}
              theme="vs-dark"
              onChange={(v) => { setContent(v ?? ''); setDirty(true); }}
              onMount={(ed) => { editorRef.current = ed; ed.focus(); }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
                tabSize: 2
              }}
            />
          ) : (
            <div className="file-loading"><div className="spinner"></div></div>
          )}
        </div>
      </div>
    </div>
  );
}
