import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';

const emptyForm = { username: '', password: '', is_admin: false };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(setUsers)
      .catch(err => console.error('Failed to load users:', err));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(emptyForm); setError(''); setModal('add'); };
  const openEdit = (user) => { setForm({ username: user.username, password: '', is_admin: !!user.is_admin }); setEditId(user.id); setError(''); setModal('edit'); };
  const closeModal = () => { setModal(null); setEditId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const url = modal === 'add' ? '/api/admin/users' : `/api/admin/users/${editId}`;
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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  return (
    <div className="content-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>User Management</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Avatar</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>ID</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Username</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Role</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1rem' }}>
                  <Avatar name={user.username} size={36} />
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{user.id}</td>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{user.username}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    background: user.is_admin ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)',
                    color: user.is_admin ? 'var(--accent-color)' : 'var(--text-secondary)',
                    padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                  }}>
                    {user.is_admin ? 'Admin' : 'User'}
                  </span>
                </td>
                <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }} onClick={() => openEdit(user)}>Edit</button>
                  <button className="btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.3)' }} onClick={() => handleDelete(user.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add User' : 'Edit User'} onClose={closeModal}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <p style={{ color: 'var(--danger-color)', margin: 0 }}>{error}</p>}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Username</label>
              <input
                type="text" required
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Password {modal === 'edit' && <span style={{ opacity: 0.6 }}>(leave blank to keep current)</span>}
              </label>
              <input
                type="password"
                required={modal === 'add'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} />
              Administrator
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn btn-primary">{modal === 'add' ? 'Create User' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
