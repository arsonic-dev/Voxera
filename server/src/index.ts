import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { roomManager } from './rooms.js';
import { pipelineManager } from './pipeline.js';
import { ClientMsg } from '@crossfire/shared';

// Load environment variables from root or server dir
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const hasLlmKey = !!(
  process.env.ANTHROPIC_API_KEY ||
  process.env.OPENROUTER_API_KEY
);
const isFakeMode =
  process.env.USE_FAKES === 'true' ||
  !process.env.DEEPGRAM_API_KEY ||
  !hasLlmKey ||
  !process.env.ELEVENLABS_API_KEY;

console.log(`[Voxera Server] Starting on port ${PORT}`);
if (isFakeMode) {
  console.log(`[Voxera Server] Running in FAKE mode (deterministic fakes active).`);
  if (!process.env.DEEPGRAM_API_KEY) console.log(`  - DEEPGRAM_API_KEY is not set`);
  if (!hasLlmKey) console.log(`  - ANTHROPIC_API_KEY or OPENROUTER_API_KEY is not set`);
  if (!process.env.ELEVENLABS_API_KEY) console.log(`  - ELEVENLABS_API_KEY is not set`);
} else {
  const llmProvider =
    process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY?.startsWith('sk-or-')
      ? `OpenRouter (${process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku'})`
      : 'Anthropic Claude';
  console.log(`[Voxera Server] Running in LIVE mode with real external APIs (LLM: ${llmProvider}).`);
}

// Export roomManager instance
export { roomManager };

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// Find web/dist directory
const webDistCandidates = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(__dirname, '../web/dist'),
  path.resolve(process.cwd(), 'web/dist'),
];
const webDistDir = webDistCandidates.find((d) => fs.existsSync(d)) || webDistCandidates[0];

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Health route per TechSpec
  if (pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        status: 'ok',
        fakeMode: isFakeMode,
        activeRooms: roomManager.getRoomCount(),
        uptime: process.uptime(),
      })
    );
    return;
  }

  // Static files from web/dist
  if (fs.existsSync(webDistDir)) {
    let filePath = path.join(webDistDir, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(webDistDir, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // Fallback if web/dist is not built yet
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Voxera Server Running</h1><p>Web frontend is compiling or running on Vite dev server.</p>');
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      pipelineManager.handleAudio(ws, data as Buffer);
      return;
    }

    try {
      const msg = JSON.parse(data.toString()) as ClientMsg;
      if (msg.t === 'join') {
        const result = roomManager.join(msg.room, msg.name, msg.lang, ws);
        if ('error' in result) {
          console.warn(`[Join Error] Room ${msg.room}: ${result.error}`);
          ws.close(1008, result.error);
        } else {
          pipelineManager.register(result.participant);
          console.log(`[Join] ${msg.name} (${msg.lang}) joined room ${msg.room} as slot ${result.participant.slot}`);
          return;
        }
      }

      pipelineManager.handleClientMsg(ws, msg);
    } catch (err) {
      console.error('[WebSocket] Failed to parse JSON message:', err);
    }
  });

  ws.on('close', () => {
    const info = roomManager.handleDisconnect(ws);
    if (info) {
      pipelineManager.unregister(info.participantId);
      console.log(`[Disconnect] Participant ${info.participantId} left room ${info.roomId}`);
    }
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Socket error:', err);
  });
});

export function startServer(port = PORT): Promise<http.Server> {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[Voxera Server] Listening on http://localhost:${port}`);
      resolve(server);
    });
  });
}

// Automatically start only if executed directly
const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  startServer();
}

export { server, wss };
