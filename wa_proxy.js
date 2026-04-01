const net = require("net");
const tls = require("tls");
const http = require("http");

const PORT = process.env.PORT || 3000;

// WhatsApp backend servers
const WA_SERVERS = [
  "g.whatsapp.net",
  "media-arn2-1.cdn.whatsapp.net",
  "mmg.whatsapp.net"
];

const server = http.createServer((req, res) => {
  if (req.url === "/") { res.writeHead(200); res.end("OK"); }
  else { res.writeHead(404); res.end(); }
});

// Handle CONNECT method for WhatsApp proxy
server.on("connect", (req, clientSocket, head) => {
  const [host, port] = req.url.split(":");
  const targetPort = parseInt(port) || 443;
  
  console.log("CONNECT to " + host + ":" + targetPort);
  
  const serverSocket = net.createConnection(targetPort, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  
  serverSocket.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => serverSocket.destroy());
});

server.listen(PORT, () => console.log("WhatsApp + VLESS proxy on port " + PORT));
