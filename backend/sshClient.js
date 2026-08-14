const { Client } = require('ssh2');

function connectSSH(server, ws) {
  const conn = new Client();
  
  conn.on('ready', () => {
    ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
    
    conn.shell((err, stream) => {
      if (err) {
        ws.send(JSON.stringify({ type: 'output', data: '\r\n*** SSH Error: ' + err.message + ' ***\r\n' }));
        return;
      }
      
      // Handle resizing if we receive resize events later
      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'input') {
            stream.write(parsed.data);
          } else if (parsed.type === 'resize') {
            stream.setWindow(parsed.rows, parsed.cols, 0, 0);
          }
        } catch (e) {
            // non-json or just raw buffer
            stream.write(msg);
        }
      });
      
      stream.on('close', () => {
        ws.send(JSON.stringify({ type: 'status', status: 'disconnected' }));
        ws.close();
        conn.end();
      }).on('data', (data) => {
        // Send data directly back to websocket
        ws.send(JSON.stringify({ type: 'output', data: data.toString('utf-8') }));
      });
    });
  }).on('error', (err) => {
    ws.send(JSON.stringify({ type: 'output', data: '\r\n*** SSH Connection Error: ' + err.message + ' ***\r\n' }));
    ws.send(JSON.stringify({ type: 'status', status: 'error' }));
  }).connect({
    host: server.host,
    port: server.port,
    username: server.username,
    password: server.password // Note: In a real app this should be decrypted first
  });
  
  ws.on('close', () => {
    conn.end();
  });
}

function detectOS(server) {
  return new Promise((resolve) => {
    if (server.type !== 'SSH') {
      return resolve(null);
    }
    
    const conn = new Client();
    let detectedOS = null;
    
    conn.on('ready', () => {
      conn.exec('cat /etc/os-release', (err, stream) => {
        if (err) {
          conn.end();
          return resolve(null);
        }
        
        let output = '';
        stream.on('data', (data) => {
          output += data.toString('utf-8');
        }).on('close', () => {
          conn.end();
          // Parse the output looking for ID=...
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.startsWith('ID=')) {
              detectedOS = line.split('=')[1].replace(/"/g, '').trim();
              break;
            }
          }
          
          if (detectedOS) {
            // Capitalize first letter for nice UI fallback
            detectedOS = detectedOS.charAt(0).toUpperCase() + detectedOS.slice(1);
          } else if (output.toLowerCase().includes('windows')) {
            detectedOS = 'Windows';
          } else {
             detectedOS = 'Linux';
          }
          resolve(detectedOS);
        });
      });
    }).on('error', () => {
      resolve(null);
    }).connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      readyTimeout: 5000 // Don't hang forever
    });
  });
}

function readHistory(server) {
  return new Promise((resolve, reject) => {
    if (server.type !== 'SSH') return reject(new Error('Unsupported server type'));

    const conn = new Client();
    let output = '';

    conn.on('ready', () => {
      // Try the common history files across bash / zsh / sh
      const cmd = 'cat ~/.bash_history 2>/dev/null; cat ~/.zsh_history 2>/dev/null | sed -E "s/^:[[:space:]]*[0-9]+:[0-9]+;//"; cat ~/.history 2>/dev/null';
      conn.exec(cmd, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        stream.on('data', (data) => {
          output += data.toString('utf-8');
        }).stderr.on('data', () => {}).on('close', () => {
          conn.end();
          resolve(output);
        });
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      readyTimeout: 10000
    });
  });
}

module.exports = { connectSSH, detectOS, readHistory };
