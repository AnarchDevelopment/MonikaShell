import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import TerminalSession from '../components/TerminalSession';
import FileManager from '../components/FileManager';
import { TabsIcon, HistoryIcon, FilesIcon, SettingsIcon, LogoutIcon, EditIcon } from '../components/Icons';
import Avatar from '../components/Avatar';
import '../index.css';

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
  }
};

function randomId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export default function TerminalPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();

  const [server, setServer] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('Idle');

  const [tabs, setTabs] = useState(() =>
    storage.get(`monika:terminal:tabs:${uuid}`, [])
  );
  const [activeTabId, setActiveTabId] = useState(() =>
    storage.get(`monika:terminal:active:${uuid}`, null)
  );
  const [view, setView] = useState('welcome');
  const [tabsOpen, setTabsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [prefs, setPrefs] = useState(() =>
    storage.get(`monika:terminal:prefs:${uuid}`, { newTabCommand: '', colors: true, rightClickPaste: true })
  );
  const [history, setHistory] = useState({ status: 'idle', commands: [] });

  const tabsKey = `monika:terminal:tabs:${uuid}`;
  const activeKey = `monika:terminal:active:${uuid}`;
  const prefsKey = `monika:terminal:prefs:${uuid}`;

  useEffect(() => {
    fetch(`/api/servers/${uuid}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(setServer)
      .catch(() => setLoadError(true));

    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (data.user) {
          setUser({ ...data.user, role: data.user.is_admin ? 'Administrator' : 'User' });
        }
      })
      .catch(() => navigate('/login'));
  }, [uuid, navigate]);

  useEffect(() => {
    storage.set(tabsKey, tabs);
  }, [tabs, tabsKey]);

  useEffect(() => {
    storage.set(activeKey, activeTabId);
  }, [activeTabId, activeKey]);

  useEffect(() => {
    storage.set(prefsKey, prefs);
  }, [prefs, prefsKey]);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId(null);
    } else if (!activeTabId || !tabs.some(t => t.id === activeTabId)) {
      setActiveTabId(tabs[tabs.length - 1].id);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId) || null;

  const createTab = useCallback((initialCommand) => {
    const id = randomId();
    const tab = { id, name: `Shell ${tabs.length + 1}`, createdAt: Date.now() };
    if (initialCommand) tab.initialCommand = initialCommand;
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
  }, [tabs]);

  const newTab = useCallback((initialCommand) => {
    createTab(initialCommand);
    setView('terminal');
  }, [createTab]);

  const switchTab = (id) => {
    setActiveTabId(id);
    setTabsOpen(false);
    setView('terminal');
  };

  const startRename = (tab) => {
    setRenamingId(tab.id);
    setRenameValue(tab.name);
  };

  const commitRename = () => {
    const id = renamingId;
    const value = renameValue.trim();
    setRenamingId(null);
    if (!id) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: value || t.name } : t));
  };

  const closeTab = useCallback((e, id) => {
    e.stopPropagation();
    if (!e.shiftKey) {
      const tab = tabs.find(t => t.id === id);
      const name = tab ? tab.name : 'this tab';
      if (!window.confirm(`Close "${name}"?`)) return;
    }
    setTabs(prev => prev.filter(t => t.id !== id));
    fetch(`/api/servers/${uuid}/sessions/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    if (activeTabId === id) {
      const remaining = tabs.filter(t => t.id !== id);
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      } else {
        setActiveTabId(null);
        setView('welcome');
        setStatus('Idle');
      }
    }
  }, [activeTabId, tabs, uuid]);

  const renderTabItem = (tab) => (
    <li key={tab.id}>
      <div
        className={`vtab ${tab.id === activeTabId ? 'active' : ''}`}
        onClick={() => switchTab(tab.id)}
        role="button"
        tabIndex={0}
      >
        {renamingId === tab.id ? (
          <input
            className="vtab-rename-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={commitRename}
          />
        ) : (
          <span className="vtab-name" title={tab.name}>{tab.name}</span>
        )}
        <button
          className="vtab-edit"
          title="Rename tab"
          onClick={(e) => { e.stopPropagation(); startRename(tab); }}
        >
          <EditIcon />
        </button>
        <button
          className="vtab-close"
          onClick={(e) => closeTab(e, tab.id)}
          title="Close tab (Shift-click to skip confirmation)"
        >✕</button>
      </div>
    </li>
  );

  const toggleView = (name) => {
    const next = view === name ? (activeTab ? 'terminal' : 'welcome') : name;
    setView(next);
    if (next === 'history' && history.status === 'idle') {
      loadHistory();
    }
  };

  const navClass = (name) => {
    if (name === 'tabs') return `sidebar-item sidebar-btn tabs-open-btn ${tabsOpen ? 'active' : ''}`;
    return `sidebar-item sidebar-btn ${view === name ? 'active' : ''}`;
  };

  const loadHistory = useCallback(async () => {
    setHistory({ status: 'loading', commands: [] });
    try {
      const res = await fetch(`/api/servers/${uuid}/history`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHistory({ status: 'ready', commands: data.commands || [] });
    } catch {
      setHistory({ status: 'error', commands: [] });
    }
  }, [uuid]);

  const handleHistoryClick = (cmd) => {
    newTab(cmd);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    navigate('/login');
  };

  if (loadError) {
    return (
      <div className="app-container" style={{ height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Server not found or you do not have access.</p>
          <button className="btn btn-primary" onClick={() => navigate('/servers')}>Back to Servers</button>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="app-container" style={{ height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="app-container layout-container" style={{ height: '100vh', overflow: 'hidden' }}>
      <aside className="sidebar terminal-sidebar">
        <div className="sidebar-logo">
          <Link to="/servers" className="sidebar-logo-link" title="Back to Servers">
            <img src="/title.png" alt="MonikaShell" className="sidebar-logo-img" />
          </Link>
        </div>

        <div className="sidebar-section">
          <h4 className="sidebar-heading">Terminal</h4>
          <nav>
            <button className={navClass('tabs')} onClick={() => setTabsOpen(o => !o)}>
              <TabsIcon />
              <span>Tabs</span>
            </button>

            {(tabsOpen || activeTab) && (
              <div className={`sidebar-tabs-inline ${tabsOpen ? '' : 'collapsed'}`}>
                <ul className="vtabs sidebar-vtabs">
                  {tabsOpen ? tabs.map(renderTabItem) : renderTabItem(activeTab)}
                </ul>
                {tabsOpen && (
                  <button className="sidebar-new-tab" onClick={() => newTab()}>
                    + New Tab
                  </button>
                )}
              </div>
            )}

            <button className={navClass('history')} onClick={() => toggleView('history')}>
              <HistoryIcon />
              <span>History</span>
            </button>
            <button className={navClass('files')} onClick={() => toggleView('files')}>
              <FilesIcon />
              <span>Files</span>
            </button>
            <button className={navClass('prefs')} onClick={() => toggleView('prefs')}>
              <SettingsIcon />
              <span>Preferences</span>
            </button>
          </nav>
        </div>

        <div style={{ flex: 1 }}></div>

        <div className="sidebar-footer">
          <Avatar name={user?.username} size={40} />
          <div className="user-info">
            <span className="user-name">{user?.username || 'admin'}</span>
            <span className="user-role">{user?.role || 'Administrator'}</span>
          </div>
          <button className="sidebar-logout" onClick={handleLogout} title="Logout">
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <main className="main-content terminal-main">
        <nav className="navbar terminal-navbar">
          <Link to="/servers" className="btn btn-secondary navbar-back">← Back</Link>
          <span className="terminal-title">{server.name}</span>
          <div className="terminal-actions">
            <button className="btn btn-primary" onClick={() => newTab()}>+ New Tab</button>
            <div className="terminal-status">
              <span className={`status-dot ${status === 'Connected' ? 'connected' : ''}`}></span>
              <span>{status}</span>
            </div>
          </div>
        </nav>

        {view === 'welcome' && (
          <div className="panel-page welcome-page animate-fade-in">
            <h1 className="welcome-title">Welcome to MonikaShell</h1>
            <p className="welcome-text">Press "Tabs" to attach the terminal to an existing session</p>
            <p className="welcome-text">Or create a new tab.</p>
            <button className="btn btn-primary" onClick={() => newTab()}>New tab</button>
          </div>
        )}

        {view === 'terminal' && (
          <div className="terminal-area">
            {activeTab && (
              <TerminalSession
                key={activeTab.id}
                serverUuid={uuid}
                sessionId={activeTab.id}
                initialCommand={activeTab.initialCommand ?? prefs.newTabCommand}
                colorsEnabled={prefs.colors}
                rightClickPaste={prefs.rightClickPaste}
                onStatusChange={setStatus}
              />
            )}
          </div>
        )}

        {view === 'history' && (
          <div className="panel-page animate-fade-in">
            <div className="panel-page-head">
              <h2 className="panel-page-title">Command History</h2>
              <button className="panel-refresh" onClick={loadHistory} title="Refresh">↻</button>
            </div>
            {(history.status === 'idle' || history.status === 'loading') && (
              <div className="panel-message"><div className="spinner"></div><span>Loading history...</span></div>
            )}
            {history.status === 'error' && (
              <div className="panel-message panel-error">Failed to fetch command history</div>
            )}
            {history.status === 'ready' && history.commands.length === 0 && (
              <div className="panel-message">No commands found.</div>
            )}
            {history.status === 'ready' && history.commands.length > 0 && (
              <ul className="history-list">
                {history.commands.map((cmd, i) => (
                  <li key={i}>
                    <button
                      className="history-item"
                      onClick={() => handleHistoryClick(cmd)}
                      title="Open in new tab"
                    >{cmd}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {view === 'files' && (
          <FileManager uuid={uuid} />
        )}

        {view === 'prefs' && (
          <div className="panel-page prefs-page animate-fade-in">
            <h2 className="panel-page-title">Preferences</h2>

            <div className="pref-section">
              <h3 className="pref-section-title">Session</h3>
              <div className="pref-field">
                <label className="pref-label" htmlFor="new-tab-command">
                  <span className="pref-label-title">New tab command</span>
                  <span className="pref-label-desc">Command run once when a new session starts.</span>
                </label>
                <input
                  id="new-tab-command"
                  className="pref-input"
                  type="text"
                  value={prefs.newTabCommand}
                  placeholder="e.g. cd ~/projects"
                  onChange={(e) => setPrefs(p => ({ ...p, newTabCommand: e.target.value }))}
                />
              </div>
            </div>

            <div className="pref-section">
              <h3 className="pref-section-title">Terminal</h3>
              <label className="pref-check">
                <input
                  type="checkbox"
                  className="pref-checkbox-input"
                  checked={prefs.colors}
                  onChange={(e) => setPrefs(p => ({ ...p, colors: e.target.checked }))}
                />
                <span className="pref-checkbox-box" aria-hidden="true"></span>
                <span className="pref-check-text">
                  <span className="pref-label-title">Terminal colors</span>
                  <span className="pref-label-desc">Show ANSI colors in the terminal output.</span>
                </span>
              </label>
              <label className="pref-check">
                <input
                  type="checkbox"
                  className="pref-checkbox-input"
                  checked={prefs.rightClickPaste}
                  onChange={(e) => setPrefs(p => ({ ...p, rightClickPaste: e.target.checked }))}
                />
                <span className="pref-checkbox-box" aria-hidden="true"></span>
                <span className="pref-check-text">
                  <span className="pref-label-title">Right-click to paste</span>
                  <span className="pref-label-desc">Paste clipboard content with a right click in the terminal.</span>
                </span>
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}