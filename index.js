const http = require("http");
const net = require("net");
const { WebSocketServer } = require("ws");

const UUID = "277796c9-65da-43c4-a8a0-6bc79e62ed58";
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  if (url.pathname === "/") { res.writeHead(200); res.end("OK"); }
  else if (url.pathname === "/sub/" + UUID) {
    const h = req.headers.host;
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end("vless://" + UUID + "@" + h + ":443?encryption=none&security=tls&sni=" + h + "&type=ws&host=" + h + "&path=%2F#SecureVPN");
  }
  else { res.writeHead(404); res.end(); }
});

// VLESS WebSocket handler
const wss = new WebSocketServer({ server });
wss.on("connection", function(ws) {
  let remote = null, headerDone = false;
  ws.on("message", function(msg) {
    const buf = Buffer.from(msg);
    if (!headerDone) {
      const p = parseHeader(buf, UUID);
      if (p.error) { ws.close(); return; }
      headerDone = true;
      const resp = Buffer.from([p.version, 0]);
      remote = net.createConnection(p.port, p.address, function() { if (p.data.length > 0) remote.write(p.data); });
      let first = true;
      remote.on("data", function(chunk) {
        try { if (ws.readyState !== 1) return; ws.send(first ? Buffer.concat([resp, chunk]) : chunk); first = false; } catch(e) {}
      });
      remote.on("error", function() { try { ws.close(); } catch(e) {} });
      remote.on("end", function() { try { ws.close(); } catch(e) {} });
      remote.on("close", function() { try { ws.close(); } catch(e) {} });
    } else if (remote && !remote.destroyed) { remote.write(buf); }
  });
  ws.on("close", function() { if (remote) remote.destroy(); });
  ws.on("error", function() { if (remote) remote.destroy(); });
});

// WhatsApp CONNECT proxy - handles HTTP CONNECT method
server.on("connect", function(req, clientSocket, head) {
  var parts = req.url.split(":");
  var host = parts[0];
  var port = parseInt(parts[1]) || 443;
  console.log("CONNECT " + host + ":" + port);
  var serverSocket = net.createConnection(port, host, function() {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on("error", function() { clientSocket.destroy(); });
  clientSocket.on("error", function() { serverSocket.destroy(); });
});

function parseHeader(buf, uuid) {
  if (buf.length < 24) return { error: true };
  var version = buf[0];
  var id = buf.slice(1, 17).toString("hex");
  var expected = uuid.replace(/-/g, "");
  if (id !== expected) return { error: true };
  var optLen = buf[17];
  var cmd = buf[18 + optLen];
  if (cmd !== 1 && cmd !== 2) return { error: true };
  var pi = 19 + optLen;
  var port = buf.readUInt16BE(pi);
  var ai = pi + 2, atype = buf[ai]; ai++;
  var address = "", alen = 0;
  if (atype === 1) { alen = 4; address = buf[ai]+"."+buf[ai+1]+"."+buf[ai+2]+"."+buf[ai+3]; }
  else if (atype === 2) { alen = buf[ai]; ai++; address = buf.slice(ai, ai+alen).toString(); }
  else if (atype === 3) { alen = 16; var p=[]; for(var i=0;i<16;i+=2) p.push(buf.readUInt16BE(ai+i).toString(16)); address=p.join(":"); }
  return { error: false, version: version, address: address, port: port, data: buf.slice(ai+alen), isUDP: cmd===2 };
}

// Self-ping keep alive
setInterval(function() {
  require("http").get("http://localhost:" + PORT + "/", function(r) {}).on("error", function() {});
}, 240000);

server.listen(PORT, function() { console.log("VLESS + WhatsApp proxy on port " + PORT); });
