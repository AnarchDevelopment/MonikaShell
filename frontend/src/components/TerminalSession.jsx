import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const SGR_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function stripSgr(text) {
  return text.replace(SGR_RE, '');
}

function buildTheme(colorsEnabled) {
  if (colorsEnabled) {
    return {
      background: '#0f111a',
      foreground: '#e2e8f0',
      cursor: '#6366f1',
      cursorAccent: '#0f111a',
      selectionBackground: 'rgba(99, 102, 241, 0.3)',
      black: '#000000',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#fde047',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff'
    };
  }
  return {
    background: '#111111',
    foreground: '#ededed',
    cursor: '#ffffff',
    cursorAccent: '#111111',
    selectionBackground: 'rgba(255, 255, 255, 0.15)'
  };
}

export default function TerminalSession({ serverUuid, sessionId, initialCommand, colorsEnabled, rightClickPaste, onStatusChange }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const colorsRef = useRef(colorsEnabled);
  const pasteRef = useRef(rightClickPaste);
  const initialRef = useRef(initialCommand);
  const onStatusRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusRef.current = onStatusChange;
  });

  useEffect(() => {
    pasteRef.current = rightClickPaste;
  }, [rightClickPaste]);

  const handleContextMenu = useCallback((e) => {
    if (!pasteRef.current) return;
    e.preventDefault();
    const term = termRef.current;
    if (!term) return;
    navigator.clipboard.readText()
      .then(text => {
        if (text) {
          term.paste(text);
          term.focus();
        }
      })
      .catch(() => { /* clipboard permission denied */ });
  }, []);

  const setStatus = useCallback((status) => {
    if (onStatusRef.current) onStatusRef.current(status);
  }, []);

  const paint = useCallback((code, text) => {
    return colorsRef.current ? `\x1b[${code}m${text}\x1b[0m` : text;
  }, []);

  useEffect(() => {
    colorsRef.current = colorsEnabled;
    if (termRef.current) {
      termRef.current.options.theme = buildTheme(colorsEnabled);
    }
  }, [colorsEnabled]);

  useEffect(() => {
    initialRef.current = initialCommand;
  }, [initialCommand]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'Inter', 'Consolas', monospace",
      fontSize: 14,
      theme: buildTheme(colorsRef.current)
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fitAddon;

    const doFit = () => {
      if (fitRef.current) {
        try { fitRef.current.fit(); } catch { /* ignore */ }
      }
    };
    doFit();
    const fitTimer = setTimeout(doFit, 60);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/server/${serverUuid}/terminal?session=${encodeURIComponent(sessionId)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('Connected');
      term.writeln(paint('32', 'Connected to server.'));
      ws.send(JSON.stringify({
        type: 'init',
        rows: term.rows,
        cols: term.cols,
        newTabCommand: initialRef.current || ''
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'replay' || msg.type === 'output') {
          const data = colorsRef.current ? msg.data : stripSgr(msg.data);
          term.write(data);
        } else if (msg.type === 'status') {
          setStatus(msg.status);
          if (msg.status === 'disconnected' || msg.status === 'error') {
            term.writeln(paint('31', `Connection ${msg.status}.`));
          }
        }
      } catch {
        const data = colorsRef.current ? event.data : stripSgr(event.data);
        term.write(data);
      }
    };

    ws.onclose = () => {
      setStatus('Disconnected');
      term.writeln(paint('31', 'Disconnected from server.'));
    };

    const dataDisposable = term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      doFit();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && term.rows && term.cols) {
        wsRef.current.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      termRef.current = null;
      fitRef.current = null;
      term.dispose();
    };
  }, [serverUuid, sessionId, setStatus, paint]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      onContextMenu={handleContextMenu}
    />
  );
}
