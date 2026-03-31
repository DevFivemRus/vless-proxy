const http = require('http');
const { WebSocketServer } = require('ws');
const net = require('net');
const { Buffer } = require('buffer');

const UUID = '277796c9-65da-43c4-a8a0-6bc79e62ed58';
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200);
    res.end('OK');
  } else if (req.url === `/sub/${UUID}`) {
    const host = req.headers.host;
    const config = `vless://${UUID}@${host}:443?encryption=none&security=tls&sni=${host}&type=ws&host=${host}&path=%2F#SecureVPN-Replit`;
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(config);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let remote = null;
  let headerParsed = false;

  ws.on('message', (data) => {
    if (!headerParsed) {
      const parsed = parseVlessHeader(Buffer.from(data), UUID);
      if (parsed.error) { ws.close(); return; }
      headerParsed = true;

      const response = Buffer.from([parsed.version, 0]);

      remote = net.createConnection({ host: parsed.address, port: parsed.port }, () => {
        remote.write(parsed.data);
      });

      let headerSent = false;
      remote.on('data', (chunk) => {
        if (ws.readyState !== 1) return;
        if (!headerSent) {
          ws.send(Buffer.concat([response, chunk]));
          headerSent = true;
        } else {
          ws.send(chunk);
        }
      });

      remote.on('error', () => ws.close());
      remote.on('close', () => ws.close());
    } else if (remote) {
      remote.write(Buffer.from(data));
    }
  });

  ws.on('close', () => { if (remote) remote.destroy(); });
  ws.on('error', () => { if (remote) remote.destroy(); });
});

function parseVlessHeader(buf, uuid) {
  if (buf.length < 24) return { error: true };
  const version = buf[0];
  const id = buf.slice(1, 17).toString('hex');
  const expectedId = uuid.replace(/-/g, '');
  if (id !== expectedId) return { error: true };
  
  const optLen = buf[17];
  const cmd = buf[18 + optLen];
  if (cmd !== 1 && cmd !== 2) return { error: true };
  
  const portIdx = 19 + optLen;
  const port = buf.readUInt16BE(portIdx);
  
  let addrIdx = portIdx + 2;
  const addrType = buf[addrIdx]; addrIdx++;
  let address = '';
  let addrLen = 0;
  
  if (addrType === 1) {
    addrLen = 4;
    address = `${buf[addrIdx]}.${buf[addrIdx+1]}.${buf[addrIdx+2]}.${buf[addrIdx+3]}`;
  } else if (addrType === 2) {
    addrLen = buf[addrIdx]; addrIdx++;
    address = buf.slice(addrIdx, addrIdx + addrLen).toString();
  } else if (addrType === 3) {
    addrLen = 16;
    const parts = [];
    for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(addrIdx + i).toString(16));
    address = parts.join(':');
  }
  
  return {
    error: false, version, address, port,
    data: buf.slice(addrIdx + addrLen),
    isUDP: cmd === 2
  };
}

server.listen(PORT, () => console.log(`VLESS proxy on port ${PORT}`));
