import { useEffect, useState } from 'react';

const FALLBACK = { appName: 'MonikaShell' };

let cachedConfig = null;
let pending = null;

export function useAppConfig() {
  const [config, setConfig] = useState(cachedConfig || FALLBACK);

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      return;
    }
    if (!pending) {
      pending = fetch('/api/config', { credentials: 'include' })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          cachedConfig = data || FALLBACK;
          return cachedConfig;
        })
        .catch(() => {
          cachedConfig = FALLBACK;
          return cachedConfig;
        })
        .finally(() => { pending = null; });
    }
    pending.then(setConfig);
  }, []);

  return config;
}
