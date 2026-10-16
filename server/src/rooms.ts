import { WebSocket } from 'ws';
import crypto from 'crypto';
import { Lang, PeerInfo, ServerMsg, ClientMsg } from '@crossfire/shared';

export interface Participant {
  id: string;
  roomId: string;
  name: string;
  lang: Lang;
  slot: 'A' | 'B';
  online: boolean;
  ws: WebSocket | null;
  abortController?: AbortController;
}

export interface Room {
  id: string;
  createdAt: Date;
  closedAt: Date | null;
  participants: Map<string, Participant>;
  cleanupTimer: NodeJS.Timeout | null;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private wsToParticipant: Map<WebSocket, { roomId: string; participantId: string }> = new Map();

  public getOrCreateRoom(roomId: string): Room {
    const id = roomId.trim().toUpperCase();
    let room = this.rooms.get(id);
    if (!room) {
      room = {
        id,
        createdAt: new Date(),
        closedAt: null,
        participants: new Map(),
        cleanupTimer: null,
      };
      this.rooms.set(id, room);
    }
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.trim().toUpperCase());
  }

  public join(
    roomId: string,
    name: string,
    lang: Lang,
    ws: WebSocket
  ): { participant: Participant; peer: Participant | null } | { error: string } {
    const room = this.getOrCreateRoom(roomId);

    // Cancel cleanup timer if active
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    // Check if participant is reconnecting (by name or match offline participant)
    let participant: Participant | undefined;
    for (const p of room.participants.values()) {
      if (p.name.toLowerCase() === name.trim().toLowerCase() && !p.online) {
        participant = p;
        break;
      }
    }

    if (!participant) {
      // Find available slot
      const existing = Array.from(room.participants.values());
      if (existing.length >= 2) {
        // Check if any slot is offline and could be replaced
        const offline = existing.find((p) => !p.online);
        if (!offline) {
          return { error: 'Room is full (max 2 participants)' };
        }
        // Take over offline slot
        participant = offline;
        participant.name = name.trim();
        participant.lang = lang;
      } else {
        const hasA = existing.some((p) => p.slot === 'A');
        const slot: 'A' | 'B' = hasA ? 'B' : 'A';
        participant = {
          id: crypto.randomUUID(),
          roomId: room.id,
          name: name.trim(),
          lang,
          slot,
          online: true,
          ws,
          abortController: new AbortController(),
        };
        room.participants.set(participant.id, participant);
      }
    }

    // Update participant
    participant.online = true;
    participant.ws = ws;
    participant.lang = lang;
    participant.abortController = new AbortController();

    this.wsToParticipant.set(ws, { roomId: room.id, participantId: participant.id });

    // Find peer
    let peer: Participant | null = null;
    for (const p of room.participants.values()) {
      if (p.id !== participant.id) {
        peer = p;
        break;
      }
    }

    // Send joined message to participant
    this.send(participant, {
      t: 'joined',
      you: participant.id,
      peer: peer ? this.toPeerInfo(peer) : null,
    });

    // Notify peer if online
    if (peer && peer.online && peer.ws) {
      this.send(peer, {
        t: 'peer',
        peer: this.toPeerInfo(participant),
      });
    }

    return { participant, peer };
  }

  public handleDisconnect(ws: WebSocket): { roomId: string; participantId: string } | null {
    const entry = this.wsToParticipant.get(ws);
    if (!entry) return null;

    this.wsToParticipant.delete(ws);
    const { roomId, participantId } = entry;
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(participantId);
    if (!participant) return null;

    participant.online = false;
    participant.ws = null;

    // Abort any ongoing STT/LLM/TTS work
    if (participant.abortController) {
      participant.abortController.abort();
    }

    // Notify peer
    let peer: Participant | null = null;
    for (const p of room.participants.values()) {
      if (p.id !== participant.id) {
        peer = p;
        break;
      }
    }

    if (peer && peer.online && peer.ws) {
      this.send(peer, {
        t: 'peer',
        peer: this.toPeerInfo(participant),
      });
    }

    // If both participants are offline (or everyone offline), schedule cleanup for 10 minutes
    const hasOnline = Array.from(room.participants.values()).some((p) => p.online);
    if (!hasOnline) {
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
      room.cleanupTimer = setTimeout(() => {
        room.closedAt = new Date();
        this.rooms.delete(roomId);
      }, 10 * 60 * 1000); // 10 minutes
      if (room.cleanupTimer.unref) {
        room.cleanupTimer.unref();
      }
    }

    return { roomId, participantId };
  }

  public getParticipantByWs(ws: WebSocket): Participant | null {
    const entry = this.wsToParticipant.get(ws);
    if (!entry) return null;
    const room = this.rooms.get(entry.roomId);
    if (!room) return null;
    return room.participants.get(entry.participantId) || null;
  }

  public getPeer(participant: Participant): Participant | null {
    const room = this.rooms.get(participant.roomId);
    if (!room) return null;
    for (const p of room.participants.values()) {
      if (p.id !== participant.id) return p;
    }
    return null;
  }

  public send(participant: Participant, msg: ServerMsg) {
    if (participant.ws && participant.ws.readyState === WebSocket.OPEN) {
      participant.ws.send(JSON.stringify(msg));
    }
  }

  public broadcast(roomId: string, msg: ServerMsg) {
    const room = this.rooms.get(roomId.trim().toUpperCase());
    if (!room) return;
    for (const p of room.participants.values()) {
      this.send(p, msg);
    }
  }

  public toPeerInfo(p: Participant): PeerInfo {
    return {
      id: p.id,
      name: p.name,
      lang: p.lang,
      online: p.online,
    };
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomManager = new RoomManager();

