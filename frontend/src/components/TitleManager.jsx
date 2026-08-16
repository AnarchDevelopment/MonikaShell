import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppConfig } from '../hooks/useAppConfig';

const SERVER_ROUTE = /^\/server\/([^/]+)/;

export default function TitleManager() {
  const location = useLocation();
  const { appName } = useAppConfig();
  const [serverName, setServerName] = useState(null);

  const match = location.pathname.match(SERVER_ROUTE);
  const uuid = match ? match[1] : null;

  useEffect(() => {
    if (!uuid) {
      setServerName(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/servers/${uuid}`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(server => { if (!cancelled) setServerName(server ? server.name : null); })
      .catch(() => { if (!cancelled) setServerName(null); });
    return () => { cancelled = true; };
  }, [uuid]);

  useEffect(() => {
    document.title = uuid && serverName ? `${appName} | ${serverName}` : appName;
  }, [appName, serverName, uuid]);

  return null;
}
