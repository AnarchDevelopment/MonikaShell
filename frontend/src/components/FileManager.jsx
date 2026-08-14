import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderIcon, FileTextIcon, ArrowLeftIcon, RefreshIcon, SearchIcon,
  UploadIcon, DownloadIcon, EditIcon, TrashIcon, PlusIcon, XIcon
} from './Icons';import FileEditor from './FileEditor';

function joinPath(base, name) {
  if (base === '/') return '/' + name;
  return base.replace(/\/$/, '') + '/' + name;
}

function parentPath(p) {
  const trimmed = p.replace(/\/$/, '');
  if (!trimmed.includes('/')) return '/';
  return trimmed.slice(0, trimmed.lastIndexOf('/')) || '/';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(1) + ' ' + units[i];
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const textExts = new Set(['md','txt','log','cfg','conf','ini','yaml','yml','json','xml','html','css','js','jsx','ts','tsx','py','sh','bash','zsh','java','c','cpp','h','go','rs','rb','php','sql','toml','env','gitignore','dockerfile','vim','properties']);

export default function FileManager({ uuid }) {
  const [path, setPath] = useState('~');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1);
  const [modal, setModal] = useState(null);
  const [modalValue, setModalValue] = useState('');
  const [editorPath, setEditorPath] = useState(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const uploadRef = useRef(null);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/servers/${uuid}/files?path=${encodeURIComponent(p)}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load files');
      setPath(data.path || p);
      setEntries(data.entries || []);
    } catch (e) {
      setError(e.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => { load('~'); }, [load]);

  const openDir = (name) => load(joinPath(path, name));
  const goUp = () => load(parentPath(path));

  const sortEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = entries.filter(e => !q || e.name.toLowerCase().includes(q));
    const dirs = list.filter(e => e.type === 'dir');
    const files = list.filter(e => e.type !== 'dir');
    const cmp = (a, b) => {
      if (sortKey === 'size') return (a.size - b.size) * sortDir;
      if (sortKey === 'mtime') return (a.mtime - b.mtime) * sortDir;
      return a.name.localeCompare(b.name) * sortDir;
    };
    dirs.sort(cmp);
    files.sort(cmp);
    return dirs.concat(files);
  }, [entries, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 1 ? ' ▲' : ' ▼';
  };

  const openFile = (entry) => {
    if (entry.type !== 'dir' && !textExts.has((entry.name.split('.').pop() || '').toLowerCase())) {
      if (!window.confirm(`${entry.name} may be a binary file. Open anyway?`)) return;
    }
    setEditorPath(joinPath(path, entry.name));
  };

  const download = async (entry) => {
    try {
      const res = await fetch(
        `/api/servers/${uuid}/files/download?path=${encodeURIComponent(joinPath(path, entry.name))}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      window.alert('Download failed');
    }
  };

  const removeEntry = async (entry) => {
    if (!window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/servers/${uuid}/files?path=${encodeURIComponent(joinPath(path, entry.name))}&isDir=${entry.type === 'dir' ? 1 : 0}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || 'Delete failed');
        return;
      }
      load(path);
    } catch {
      window.alert('Delete failed');
    }
  };

  const submitModal = async () => {
    const value = modalValue.trim();
    if (!value) return;
    try {
      if (modal.type === 'mkdir') {
        const res = await fetch(`/api/servers/${uuid}/files/mkdir`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: joinPath(path, value) })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          window.alert(data.error || 'Failed to create folder');
          return;
        }
      } else if (modal.type === 'rename') {
        const res = await fetch(`/api/servers/${uuid}/files/rename`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: joinPath(path, modal.entry.name), to: joinPath(path, value) })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          window.alert(data.error || 'Rename failed');
          return;
        }
      }
      setModal(null);
      setModalValue('');
      load(path);
    } catch {
      window.alert('Operation failed');
    }
  };

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';
    setLoading(true);
    for (const file of files) {
      try {
        const res = await fetch(
          `/api/servers/${uuid}/files/upload?path=${encodeURIComponent(path)}&name=${encodeURIComponent(file.name)}`,
          { method: 'POST', credentials: 'include', body: file }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          window.alert(`Upload of "${file.name}" failed: ${data.error || 'error'}`);
        }
      } catch {
        window.alert(`Upload of "${file.name}" failed`);
      }
    }
    load(path);
  };

  const segments = path.split('/').filter(Boolean);

  return (
    <div className="panel-page file-page animate-fade-in">
      {editorPath && (
        <FileEditor
          uuid={uuid}
          path={editorPath}
          onClose={() => setEditorPath(null)}
          onSaved={() => load(path)}
        />
      )}
      {newFileOpen && (
        <FileEditor
          uuid={uuid}
          newFile
          basePath={path}
          onClose={() => setNewFileOpen(false)}
          onSaved={() => load(path)}
        />
      )}

      <div className="file-toolbar">
        <button className="icon-btn" onClick={goUp} disabled={path === '/'} title="Up"> <ArrowLeftIcon /> </button>
        <div className="file-path">
          {path === '/' ? (
            <span className="file-path-seg">/</span>
          ) : (
            <>
              <span className="file-path-seg clickable" onClick={() => load('/')}>/</span>
              {segments.map((seg, i) => (
                <span key={i}>
                  <span className="file-path-sep">/</span>
                  <span
                    className={`file-path-seg ${i === segments.length - 1 ? '' : 'clickable'}`}
                    onClick={() => i < segments.length - 1 && load('/' + segments.slice(0, i + 1).join('/'))}
                  >{seg}</span>
                </span>
              ))}
            </>
          )}
        </div>
        <div className="file-spacer"></div>
        <div className="file-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => uploadRef.current && uploadRef.current.click()}>
          <UploadIcon /> Upload
        </button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={onUpload}
        />
        <button className="btn btn-secondary" onClick={() => setNewFileOpen(true)}>
          <FileTextIcon /> New File
        </button>
        <button className="btn btn-secondary" onClick={() => { setModal({ type: 'mkdir' }); setModalValue(''); }}>
          <PlusIcon /> New Folder
        </button>
        <button className="icon-btn" onClick={() => load(path)} title="Refresh"><RefreshIcon /></button>
      </div>

      {error && <div className="panel-message panel-error">{error}</div>}

      <div className="file-table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('name')}>Name{sortArrow('name')}</th>
              <th className="sortable file-col-size" onClick={() => toggleSort('size')}>Size{sortArrow('size')}</th>
              <th className="sortable file-col-modified" onClick={() => toggleSort('mtime')}>Modified{sortArrow('mtime')}</th>
              <th className="file-col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="4"><div className="file-loading"><div className="spinner"></div></div></td></tr>
            )}
            {!loading && path !== '/' && (
              <tr className="file-row file-row-dir file-row-up" onClick={goUp}>
                <td className="file-name-cell">
                  <span className="file-type-icon dir"><FolderIcon /></span>
                  <span className="file-name">..</span>
                </td>
                <td className="file-cell file-col-size">—</td>
                <td className="file-cell file-col-modified">—</td>
                <td className="file-cell file-col-actions"></td>
              </tr>
            )}
            {!loading && sortEntries.length === 0 && (
              <tr><td colSpan="4"><div className="file-empty">No files found.</div></td></tr>
            )}
            {!loading && sortEntries.map(entry => (
              <tr
                key={entry.name}
                className={entry.type === 'dir' ? 'file-row file-row-dir' : 'file-row'}
                onClick={() => entry.type === 'dir' ? openDir(entry.name) : openFile(entry)}
              >
                <td className="file-name-cell">
                  <span className={`file-type-icon ${entry.type === 'dir' ? 'dir' : ''}`}>
                    {entry.type === 'dir' ? <FolderIcon /> : <FileTextIcon />}
                  </span>
                  <span className="file-name">{entry.name}</span>
                  {entry.type === 'link' && <span className="file-link-tag">link</span>}
                </td>
                <td className="file-cell file-col-size">{entry.type === 'dir' ? '—' : formatSize(entry.size)}</td>
                <td className="file-cell file-col-modified">{formatDate(entry.mtime)}</td>
                <td className="file-cell file-col-actions">
                  <div className="file-actions" onClick={(e) => e.stopPropagation()}>
                    {entry.type !== 'dir' && (
                      <button className="icon-btn icon-btn-sm" title="Download" onClick={() => download(entry)}>
                        <DownloadIcon />
                      </button>
                    )}
                    <button
                      className="icon-btn icon-btn-sm" title="Rename"
                      onClick={() => { setModal({ type: 'rename', entry }); setModalValue(entry.name); }}
                    >
                      <EditIcon />
                    </button>
                    <button className="icon-btn icon-btn-sm icon-btn-danger" title="Delete" onClick={() => removeEntry(entry)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{modal.type === 'mkdir' ? 'New Folder' : 'Rename'}</h3>
              <button className="icon-btn" onClick={() => setModal(null)}><XIcon /></button>
            </div>
            <input
              className="modal-input"
              autoFocus
              type="text"
              value={modalValue}
              placeholder={modal.type === 'mkdir' ? 'Folder name' : 'New name'}
              onChange={(e) => setModalValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitModal(); if (e.key === 'Escape') setModal(null); }}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitModal}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
