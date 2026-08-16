import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LinuxIcon, WindowsIcon, AppleIcon, UbuntuIcon, DebianIcon, FedoraIcon, CentosIcon, AlpineIcon, ArchIcon, OpensuseIcon } from '../components/Icons';
import '../index.css';

export default function Dashboard() {
  const navigate = useNavigate();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/servers', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => {
        setServers(data);
        setLoading(false);
      })
      .catch(err => navigate('/login'));
  }, [navigate]);

  const getOsIcon = (os) => {
    if (!os) return <LinuxIcon />;
    const lowerOs = os.toLowerCase();
    if (lowerOs.includes('windows')) return <WindowsIcon />;
    if (lowerOs.includes('macos')) return <AppleIcon />;
    if (lowerOs.includes('ubuntu')) return <UbuntuIcon />;
    if (lowerOs.includes('debian')) return <DebianIcon />;
    if (lowerOs.includes('fedora')) return <FedoraIcon />;
    if (lowerOs.includes('centos')) return <CentosIcon />;
    if (lowerOs.includes('alpine')) return <AlpineIcon />;
    if (lowerOs.includes('arch')) return <ArchIcon />;
    if (lowerOs.includes('suse') || lowerOs.includes('opensuse')) return <OpensuseIcon />;
    return <LinuxIcon />;
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  };

  const getTabCount = (uuid) => {
    try {
      const raw = localStorage.getItem(`monika:terminal:tabs:${uuid}`);
      const tabs = raw ? JSON.parse(raw) : [];
      return Array.isArray(tabs) ? tabs.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <>
      <main className="content-container animate-fade-in">
        <h1 style={{ marginBottom: '2rem' }}>Servers</h1>
        
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner"></div>
          </div>
        ) : servers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            No servers found.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {servers.map(server => {
              const tabCount = getTabCount(server.uuid);
              return (
              <div key={server.uuid} className="glass-panel" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column' }} 
                   onClick={() => navigate(`/server/${server.uuid}`)}
                   onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                   onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ color: 'var(--text-secondary)', display: 'flex' }}>{getOsIcon(server.os)}</div>
                    <h3 style={{ margin: 0 }}>{server.name}</h3>
                  </div>
                  <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: 'var(--accent-color)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {server.type}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', margin: 0, flex: 1 }}>{server.host}</p>
                <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success-color)', fontSize: '0.9rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success-color)' }}></span>
                  Ready
                  {tabCount > 0 && (
                    <span style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-color)', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {tabCount} open tab{tabCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            )})}
          </div>
        )}
      </main>
    </>
  );
}
