const http = require("http");
const net = require("net");
const { WebSocketServer } = require("ws");

const UUID = "277796c9-65da-43c4-a8a0-6bc79e62ed58";
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/") { res.writeHead(200); res.end("OK"); }
  else if (url.pathname === "/sub/" + UUID) {
    const h = req.headers.host;
    res.writeHead(200, {"Content-Type":"text/plain"});
    res.end("vless://" + UUID + "@" + h + ":443?encryption=none&security=tls&sni=" + h + "&type=ws&host=" + h + "&path=%2F#SecureVPN");
  }
  else { res.writeHead(404); res.end(); }
});

const wss = new WebSocketServer({ server });

wss.on("connection", function(ws) {
  ws.binaryType = "arraybuffer";
  let remote = null;
  let headerDone = false;

  ws.on("message", function(msg) {
    const buf = Buffer.from(msg);

    if (!headerDone) {
      const p = parseHeader(buf, UUID);
      if (p.error) { ws.close(); return; }
      headerDone = true;

      const respHeader = Buffer.from([p.version, 0]);
      remote = net.createConnection(p.port, p.address, function() {
        if (p.data.length > 0) remote.write(p.data);
      });

      let first = true;
      remote.on("data", function(chunk) {
        try {
          if (ws.readyState !== 1) return;
          if (first) {
            const combined = Buffer.concat([respHeader, chunk]);
            ws.send(combined);
            first = false;
          } else {
            ws.send(chunk);
          }
        } catch(e) {}
      });

      remote.on("error", function() { try { ws.close(); } catch(e) {} });
      remote.on("end", function() { try { ws.close(); } catch(e) {} });
      remote.on("close", function() { try { ws.close(); } catch(e) {} });
    } else {
      if (remote && !remote.destroyed) {
        remote.write(buf);
      }
    }
  });

  ws.on("close", function() { if (remote) remote.destroy(); });
  ws.on("error", function() { if (remote) remote.destroy(); });
});

function parseHeader(buf, uuid) {
  if (buf.length < 24) return { error: true };
  const version = buf[0];
  const id = buf.slice(1, 17).toString("hex");
  const expected = uuid.replace(/-/g, "");
  if (id !== expected) return { error: true };

  const optLen = buf[17];
  const cmd = buf[18 + optLen];
  if (cmd !== 1 && cmd !== 2) return { error: true };

  const pi = 19 + optLen;
  const port = buf.readUInt16BE(pi);
  let ai = pi + 2;
  const atype = buf[ai]; ai++;
  let address = "", alen = 0;

  if (atype === 1) {
    alen = 4;
    address = buf[ai] + "." + buf[ai+1] + "." + buf[ai+2] + "." + buf[ai+3];
  } else if (atype === 2) {
    alen = buf[ai]; ai++;
    address = buf.slice(ai, ai + alen).toString();
  } else if (atype === 3) {
    alen = 16;
    const parts = [];
    for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(ai + i).toString(16));
    address = parts.join(":");
  }

  return { error: false, version: version, address: address, port: port, data: buf.slice(ai + alen), isUDP: cmd === 2 };
}

server.listen(PORT, function() { console.log("VLESS proxy running on port " + PORT); });

// Keep alive: ping self every 4 minutes
setInterval(function() {
  require("http").get("http://localhost:" + (process.env.PORT || 3000) + "/", function(r) {
    console.log("Self-ping OK: " + r.statusCode);
  }).on("error", function() {});
}, 240000);
