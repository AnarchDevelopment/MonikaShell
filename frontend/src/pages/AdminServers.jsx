import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal';

const emptyForm = { name: '', type: 'SSH', host: '', port: 22, username: '', password: '', users: [] };

export default function AdminServers() {
  const [servers, setServers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editUuid, setEditUuid] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([
      fetch('/api/admin/servers', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/admin/users', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([serverData, usersData, meData]) => {
        setServers(serverData);
        setAllUsers(usersData);
        setCurrentUserId(meData.user && meData.user.id);
      })
      .catch(err => console.error('Failed to load data:', err));
  };

  useEffect(() => { load(); }, []);

  const toggleUser = (id) => {
    setForm(f => ({
      ...f,
      users: f.users.includes(id) ? f.users.filter(u => u !== id) : [...f.users, id],
    }));
  };

  const openAdd = () => {
    setForm({ ...emptyForm, users: currentUserId ? [currentUserId] : [] });
    setError('');
    setModal('add');
  };
  const openEdit = (server) => {
    setForm({ name: server.name, type: server.type, host: server.host, port: server.port, username: server.username || '', password: '', users: server.users || [] });
    setEditUuid(server.uuid);
    setError('');
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditUuid(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const url = modal === 'add' ? '/api/admin/servers' : `/api/admin/servers/${editUuid}`;
    const method = modal === 'add' ? 'POST' : 'PUT';
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'An error occurred'); return; }
      closeModal();
      load();
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDelete = async (uuid) => {
    if (!window.confirm('Delete this server?')) return;
    await fetch(`/api/admin/servers/${uuid}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const typeColors = { SSH: 'var(--accent-color)', Telnet: '#f59e0b', TCP: '#10b981' };
  const typeBg = { SSH: 'rgba(99,102,241,0.2)', Telnet: 'rgba(245,158,11,0.2)', TCP: 'rgba(16,185,129,0.2)' };

  return (
    <div className="content-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Server Management</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Server</button>
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Name</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Host</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>OS</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Type</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map(server => (
              <tr key={server.uuid} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{server.name}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{server.host}:{server.port}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{server.os || 'Linux'}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    background: typeBg[server.type] || 'rgba(255,255,255,0.07)',
                    color: typeColors[server.type] || 'var(--text-secondary)',
                    padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                  }}>
                    {server.type}
                  </span>
                </td>
                <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }} onClick={() => openEdit(server)}>Edit</button>
                  <button className="btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.3)' }} onClick={() => handleDelete(server.uuid)}>Delete</button>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No servers configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Server' : 'Edit Server'} onClose={closeModal}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <p style={{ color: 'var(--danger-color)', margin: 0 }}>{error}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Name</label>
                <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: '#1a1d27', color: 'white' }}>
                  <option value="SSH">SSH</option>
                  <option value="Telnet">Telnet</option>
                  <option value="TCP">Raw TCP</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Port</label>
                <input type="number" required value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 22 }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Host</label>
                <input type="text" required value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>SSH Username</label>
                <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Password {modal === 'edit' && <span style={{ opacity: 0.6 }}>(leave blank to keep)</span>}
                </label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Users with Access
                  <span style={{ opacity: 0.6, fontSize: '0.8rem' }}> (the owner always has access)</span>
                </label>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.4rem',
                  maxHeight: '140px', overflowY: 'auto', padding: '0.75rem', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius)', background: 'rgba(0,0,0,0.2)'
                }}>
                  {allUsers.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="checkbox" checked={form.users.includes(u.id)} onChange={() => toggleUser(u.id)} />
                      <span>{u.username}{u.is_admin ? ' (admin)' : ''}</span>
                    </label>
                  ))}
                  {allUsers.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>No users found</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn btn-primary">{modal === 'add' ? 'Create Server' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
