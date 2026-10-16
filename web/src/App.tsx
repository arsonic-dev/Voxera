import React, { useState, useEffect, useRef } from 'react';
import { Lang, PeerInfo, ServerMsg, ClientMsg } from '@crossfire/shared';
import { startMicCapture, MicController } from './audio/recorder.ts';
import { SegmentPlayer } from './audio/player.ts';
import { BargeInDetector } from './audio/bargeIn.ts';

export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'ru', name: 'Russian (Русский)' },
];

export interface CaptionItem {
  utteranceId: string;
  segmentId: string;
  speaker: 'you' | 'them';
  srcText: string;
  trText: string;
  final: boolean;
  intensity: number;
  emotion: string;
  retracted: boolean;
  interrupted: boolean;
  heardText?: string;
  pct?: number;
  latency?: {
    endpointMs?: number;
    sttMs?: number;
    llmMs?: number;
    ttsMs?: number;
    totalMs?: number;
  };
}

import Gallery from './Gallery.tsx';
import LoadingScreen from './components/LoadingScreen.tsx';
import VoxeraLogo from './components/VoxeraLogo.tsx';

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info';
}

export default function App() {
  const [isGallery, setIsGallery] = useState<boolean>(false);
  const [screen, setScreen] = useState<'landing' | 'join' | 'room'>('landing');
  const [roomId, setRoomId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [lang, setLang] = useState<Lang>('en');
  const [headphonesChecked, setHeadphonesChecked] = useState<boolean>(false);
  const [_myId, setMyId] = useState<string>('');
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [isFakeMode, setIsFakeMode] = useState<boolean>(false);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('no_intro') !== '1';
  });
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('voxera_theme') as 'light' | 'dark') || (localStorage.getItem('crossfire_theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('voxera_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Latency metrics for ?hud=1
  const [hudActive, setHudActive] = useState<boolean>(false);
  const [hudStats, setHudStats] = useState<{
    lastSegmentId: string;
    endpointMs?: number;
    sttMs?: number;
    llmMs?: number;
    ttsMs?: number;
    totalMs?: number;
  }>({ lastSegmentId: '' });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micControllerRef = useRef<MicController | null>(null);
  const playerRef = useRef<SegmentPlayer | null>(null);
  const bargeInRef = useRef<BargeInDetector | null>(null);

  const addToast = (message: string, type: 'error' | 'warning' | 'info' = 'error') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  // Check URL params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomId(roomParam.toUpperCase());
      setScreen('join');
    }

    if (params.get('gallery') === '1') {
      setIsGallery(true);
    }

    if (params.get('loading') === '1') {
      setPreviewLoading(true);
    }

    if (params.get('room_fixture') === '1') {
      setScreen('room');
      setRoomId('TEST6X');
      setName('Alex');
      setLang('en');
      setPeer({ id: 'peer-elena', name: 'Elena', lang: 'es', online: true });
      setCaptions([
        {
          utteranceId: 'fix1',
          segmentId: 'fix1',
          speaker: 'them',
          srcText: 'No puedes ignorar los datos que te acabo de enviar.',
          trText: 'You cannot ignore the data I just sent you.',
          final: true,
          intensity: 0.7,
          emotion: 'angry',
          retracted: false,
          interrupted: false,
        },
        {
          utteranceId: 'fix2',
          segmentId: 'fix2',
          speaker: 'you',
          srcText: 'Those numbers were completely fabricated by your team.',
          trText: 'Esos números fueron completamente fabricados por tu equipo.',
          final: true,
          intensity: 0.9,
          emotion: 'contempt',
          retracted: false,
          interrupted: true,
          heardText: 'Esos números fueron completamente',
          pct: 0.4,
        },
        {
          utteranceId: 'fix3',
          segmentId: 'fix3',
          speaker: 'them',
          srcText: '¡Eso es una calumnia absoluta y lo sabes muy bien!',
          trText: 'That is an absolute slander and you know it very well!',
          final: true,
          intensity: 0.5,
          emotion: 'angry',
          retracted: false,
          interrupted: false,
        },
      ]);
    }

    if (params.get('hud') === '1') {
      setHudActive(true);
    }

    // Default language based on browser
    const browserLang = navigator.language.split('-')[0] as Lang;
    if (LANGUAGES.some((l) => l.code === browserLang)) {
      setLang(browserLang);
    }

    // Fetch /health to check fake mode
    fetch('/health')
      .then((r) => r.json())
      .then((data) => {
        if (data.fakeMode) setIsFakeMode(true);
      })
      .catch(() => {});

    // Show 3D tactile loading screen on initial load/reload
    const introTimer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 1800);

    return () => {
      clearTimeout(introTimer);
      micControllerRef.current?.stop();
      playerRef.current?.stopAll();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const handleStartArgument = () => {
    // Generate 6 character room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(code);
    const newUrl = `${window.location.pathname}?room=${code}${hudActive ? '&hud=1' : ''}`;
    window.history.pushState({}, '', newUrl);
    setScreen('join');
  };

  const handleCutCall = () => {
    // 1. Stop mic capture
    micControllerRef.current?.stop();
    micControllerRef.current = null;

    // 2. Stop audio player
    playerRef.current?.stopAll();

    // 3. Close WebSocket connection cleanly
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // 4. Reset states
    setPeer(null);
    setCaptions([]);
    setMicError(null);
    setIsReconnecting(false);

    // 5. Clean URL query parameters
    window.history.pushState({}, '', window.location.pathname);

    // 6. Return to home landing page
    setScreen('landing');
    addToast('Call ended. Returned to home.', 'info');
  };

  const handleJoin = async () => {
    if (!name.trim()) return;
    if (!headphonesChecked) return;
    if (isJoining) return;

    setIsJoining(true);
    setMicError(null);

    // 1. Resume / initialize Web Audio Context on user gesture
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // 2. Request mic FIRST — shows browser permission popup
      let controller;
      try {
        controller = await startMicCapture(audioCtx, (pcm, rms) => {
          if (wsRef.current?.readyState === WebSocket.OPEN && pcm.byteLength > 0) {
            wsRef.current.send(pcm);
          }
          setMicLevel(rms);
          bargeInRef.current?.onMicFrame(rms);
        });
        micControllerRef.current = controller;
      } catch (micErr: unknown) {
        const errMsg = micErr instanceof Error ? micErr.message : String(micErr);
        const isDenied = errMsg.toLowerCase().includes('denied') || errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('notallowed');
        const userMsg = isDenied
          ? 'Microphone access was denied. Click the 🔒 icon in the address bar and allow microphone, then try again.'
          : `Microphone error: ${errMsg}`;
        setMicError(userMsg);
        addToast(userMsg, 'error');
        setIsJoining(false);
        return;
      }

      // 3. Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const ws = new WebSocket(`${protocol}//${host}/ws`);
      wsRef.current = ws;

      // Initialize audio playback player
      const player = new SegmentPlayer(audioCtx, {
        onPlaybackStart: (segmentId) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: 'playback_start', segmentId } as ClientMsg));
          }
        },
        onPlaybackEnd: (segmentId, totalMs) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: 'playback_end', segmentId, totalMs } as ClientMsg));
          }
        },
      });
      playerRef.current = player;

      // Initialize Barge-In detector on listener client
      const bargeIn = new BargeInDetector(
        () => playerRef.current,
        (cut) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: 'barge_in', ...cut } as ClientMsg));
          }
        }
      );
      bargeInRef.current = bargeIn;

      ws.onopen = () => {
        const joinMsg: ClientMsg = {
          t: 'join',
          room: roomId,
          name: name.trim(),
          lang,
        };
        ws.send(JSON.stringify(joinMsg));
        setIsJoining(false);
        setScreen('room');
      };

      ws.onerror = () => {
        const msg = 'Could not connect to the Voxera server. Make sure the server is running on port 8080.';
        setMicError(msg);
        addToast(msg, 'error');
        setIsJoining(false);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMsg;
          handleServerMessage(msg);
        } catch (err) {
          console.error('Error parsing incoming message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (screen === 'room') {
          setIsReconnecting(true);
          addToast('Connection lost. Reconnecting to room...', 'warning');
          setTimeout(() => {
            attemptReconnect();
          }, 1500);
        }
      };
    } catch (err: unknown) {
      console.error('Join error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setMicError(`Error joining room: ${errMsg}`);
      addToast(`Error joining room: ${errMsg}`, 'error');
      setIsJoining(false);
    }
  };

  const attemptReconnect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsReconnecting(false);
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsReconnecting(false);
      addToast('Reconnected to room', 'info');
      const joinMsg: ClientMsg = {
        t: 'join',
        room: roomId,
        name: name.trim(),
        lang,
      };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMsg;
        handleServerMessage(msg);
      } catch (err) {
        console.error('Error parsing incoming message:', err);
      }
    };

    ws.onclose = () => {
      if (screen === 'room') {
        setIsReconnecting(true);
        setTimeout(attemptReconnect, 2000);
      }
    };
  };

  const handleServerMessage = (msg: ServerMsg) => {
    switch (msg.t) {
      case 'joined':
        setMyId(msg.you);
        setPeer(msg.peer);
        break;

      case 'peer':
        setPeer(msg.peer);
        break;

      case 'src':
        // Update live transcript of own speech
        setCaptions((prev) => {
          const idx = prev.findIndex((c) => c.utteranceId === msg.utteranceId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              srcText: msg.text,
              final: msg.final,
            };
            return next;
          }
          return [
            ...prev,
            {
              utteranceId: msg.utteranceId,
              segmentId: '',
              speaker: 'you',
              srcText: msg.text,
              trText: '',
              final: msg.final,
              intensity: msg.loudness,
              emotion: 'calm',
              retracted: false,
              interrupted: false,
            },
          ];
        });
        break;

      case 'tr':
        // Update latency metrics if present
        if (msg.latency) {
          setHudStats({
            lastSegmentId: msg.segmentId,
            endpointMs: msg.latency.endpointMs,
            sttMs: msg.latency.sttMs,
            llmMs: msg.latency.llmMs,
            ttsMs: msg.latency.ttsMs,
            totalMs: msg.latency.totalMs,
          });
        }

        // Translation arrived
        setCaptions((prev) => {
          // 1. If segmentId already matched:
          const existingIdx = prev.findIndex((c) => c.segmentId === msg.segmentId);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = {
              ...next[existingIdx],
              trText: msg.text,
              final: msg.final,
              intensity: msg.intensity,
              emotion: msg.emotion,
              latency: msg.latency || next[existingIdx].latency,
            };
            return next;
          }

          // 2. If this matches an existing 'you' src caption waiting for segmentId:
          const ownSrcIdx = prev.findIndex(
            (c) => c.utteranceId === msg.utteranceId && c.speaker === 'you' && !c.segmentId
          );
          if (ownSrcIdx >= 0) {
            const next = [...prev];
            next[ownSrcIdx] = {
              ...next[ownSrcIdx],
              segmentId: msg.segmentId,
              trText: msg.text,
              final: msg.final,
              intensity: msg.intensity,
              emotion: msg.emotion,
              latency: msg.latency || next[ownSrcIdx].latency,
            };
            return next;
          }

          // 3. Otherwise, incoming translation from peer ('them'):
          let updated = [...prev];
          if (msg.retracts) {
            updated = updated.map((c) =>
              c.segmentId === msg.retracts ? { ...c, retracted: true } : c
            );
          }

          return [
            ...updated,
            {
              utteranceId: msg.utteranceId,
              segmentId: msg.segmentId,
              speaker: 'them',
              srcText: '',
              trText: msg.text,
              final: msg.final,
              intensity: msg.intensity,
              emotion: msg.emotion,
              retracted: false,
              interrupted: false,
              latency: msg.latency,
            },
          ];
        });
        break;

      case 'audio':
        playerRef.current?.handleAudioChunk(msg.segmentId, msg.pcm, msg.rate, msg.last);
        break;

      case 'cancel':
        playerRef.current?.dropSegment(msg.segmentId);
        setCaptions((prev) =>
          prev.map((c) =>
            c.segmentId === msg.segmentId ? { ...c, retracted: true } : c
          )
        );
        break;

      case 'heard':
        setCaptions((prev) =>
          prev.map((c) =>
            c.segmentId === msg.segmentId
              ? {
                  ...c,
                  heardText: msg.heardText,
                  pct: msg.pct,
                  interrupted: msg.interrupted,
                }
              : c
          )
        );
        break;
    }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const downloadTranscript = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(captions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `voxera_transcript_${roomId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    micControllerRef.current?.setMuted(next);
  };

  if (isGallery) {
    return <Gallery />;
  }

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          {screen === 'room' ? (
            <button
              className="back-home-btn nm-raised"
              onClick={handleCutCall}
              aria-label="Cut call and return to home"
              title="Cut call and return to home"
            >
              <span className="back-arrow" aria-hidden="true">←</span>
              <span>Leave Room</span>
            </button>
          ) : screen === 'join' ? (
            <button
              className="back-home-btn nm-raised"
              onClick={() => {
                window.history.pushState({}, '', window.location.pathname);
                setScreen('landing');
              }}
              aria-label="Back to home"
              title="Back to home"
            >
              <span className="back-arrow" aria-hidden="true">←</span>
              <span>Home</span>
            </button>
          ) : (
            <div className="brand-pill nm-raised">
              <VoxeraLogo size={22} className="brand-logo" />
              <div className="brand">
                VOX<span>ERA</span>
              </div>
            </div>
          )}
          <nav className="header-nav">
            <button
              className={`nav-link ${screen === 'landing' ? 'active' : ''}`}
              onClick={screen === 'room' ? handleCutCall : () => setScreen('landing')}
            >
              Debate
              <span className="nav-dot" />
            </button>
          </nav>
        </div>


        <div className="header-right">
          {isFakeMode && <span className="fake-badge">Mock Mode</span>}
          {screen === 'room' && (
            <button className="nm-btn nm-btn-secondary" style={{ fontSize: '12px', padding: '6px 14px', minHeight: '38px' }} onClick={downloadTranscript}>
              Save JSON
            </button>
          )}
          <label className="switch" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-label="Toggle theme">
            <span className="sun">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                <g fill="#ffd43b">
                  <circle r="5" cy="12" cx="12"></circle>
                  <path d="m21 13h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm-17 0h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm13.66-5.66a1 1 0 0 1 -.66-.29 1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1 -.75.29zm-12.02 12.02a1 1 0 0 1 -.71-.29 1 1 0 0 1 0-1.41l.71-.66a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1 -.7.24zm6.36-14.36a1 1 0 0 1 -1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1 -1 1zm0 17a1 1 0 0 1 -1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1 -1 1zm-5.66-14.66a1 1 0 0 1 -.7-.29l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1 -.71.29zm12.02 12.02a1 1 0 0 1 -.7-.29l-.66-.71a1 1 0 0 1 1.36-1.36l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1 -.71.24z"></path>
                </g>
              </svg>
            </span>
            <span className="moon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true">
                <path d="m223.5 32c-123.5 0-223.5 100.3-223.5 224s100 224 223.5 224c60.6 0 115.5-24.2 155.8-63.4 5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6-96.9 0-175.5-78.8-175.5-176 0-65.8 36-123.1 89.3-153.3 6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z"></path>
              </svg>
            </span>   
            <input
              type="checkbox"
              className="input"
              checked={theme === 'dark'}
              onChange={toggleTheme}
              aria-label="Toggle theme"
            />
            <span className="slider"></span>
          </label>
        </div>
      </header>

      {(isInitialLoading || isJoining || previewLoading) && (
        <LoadingScreen
          message={isJoining ? 'Connecting…' : 'Loading…'}
          onDismiss={
            isInitialLoading
              ? () => setIsInitialLoading(false)
              : previewLoading
                ? () => setPreviewLoading(false)
                : undefined
          }
        />
      )}

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {isReconnecting && (
        <div className="nm-banner banner-alert" role="status">
          <span className="nm-banner-icon">🔄</span>
          <span><strong>Connection Lost:</strong> Reconnecting to room {roomId}...</span>
        </div>
      )}

      {hudActive && (
        <div className="hud-strip" role="region" aria-label="Latency telemetry HUD">
          <span><strong>⚡︎ LATENCY HUD</strong></span>
          <span>Endpoint: {hudStats.endpointMs ?? 300}ms</span>
          <span>STT: {hudStats.sttMs ?? 150}ms</span>
          <span>LLM: {hudStats.llmMs ?? 380}ms</span>
          <span>TTS: {hudStats.ttsMs ?? 250}ms</span>
          <span><strong>Total: {hudStats.totalMs ?? 1080}ms</strong></span>
        </div>
      )}


      {micError && (
        <div className="nm-banner banner-alert" role="alert">
          <span className="nm-banner-icon">🎙️</span>
          <span><strong>Microphone Error:</strong> {micError}</span>
        </div>
      )}

      {/* Screen 1: Landing (Awwwards-Level Hero matching Sneaker Mockup) */}
      {screen === 'landing' && (
        <main className="landing-hero-layout">
          <div className="hero-grid">
            {/* Left Hero Column */}
            <div className="hero-left-col">
              <h1 className="hero-title">
                Talk Over Each Other. <span className="highlight-accent">Keep the Heat.</span>
              </h1>

              <p className="hero-subtitle">
                Two people. No shared language. Argue in real time with continuous speech, instant sub-150ms barge-in cutoffs, and automatic mind-change retractions.
              </p>

              <div className="hero-actions">
                <button className="nm-btn nm-hero-btn" onClick={handleStartArgument}>
                  <span>Start an argument</span>
                  <span className="btn-circle-arrow">➔</span>
                </button>
              </div>

              {/* 4 Tactile Feature Tiles (matching the 4 cards in reference image) */}
              <div className="feature-tiles-grid">
                <div className="feature-tile nm-raised">
                  <span className="feature-tile-icon">⚡︎</span>
                  <span className="feature-tile-title">&lt; 150ms Cutoff</span>
                  <span className="feature-tile-sub">Instant Barge-in</span>
                </div>
                <div className="feature-tile nm-raised">
                  <span className="feature-tile-icon">🔥</span>
                  <span className="feature-tile-title">Dynamic Heat</span>
                  <span className="feature-tile-sub">Voice Intensity</span>
                </div>
                <div className="feature-tile nm-raised">
                  <span className="feature-tile-icon">⏮</span>
                  <span className="feature-tile-title">Auto Retract</span>
                  <span className="feature-tile-sub">Mind Changes</span>
                </div>
                <div className="feature-tile nm-raised">
                  <span className="feature-tile-icon">🌐</span>
                  <span className="feature-tile-title">Full Duplex</span>
                  <span className="feature-tile-sub">16kHz PCM Audio</span>
                </div>
              </div>
            </div>

            {/* Right Hero Column: Interactive Showcase Card */}
            <div className="hero-right-col">
              <div className="hero-showcase-card nm-raised">
                <div className="showcase-card-header">
                  <div>
                    <div className="showcase-card-title">CloudStride Engine</div>
                    <div className="showcase-card-sub">Instant Two-Way Interpretation</div>
                  </div>
                  <div className="showcase-index-badge nm-inset">01 / 05</div>
                </div>

                {/* Animated Wave Equalizer */}
                <div className="showcase-wave-visualizer" aria-hidden="true">
                  <span className="wave-bar bar-1" />
                  <span className="wave-bar bar-2" />
                  <span className="wave-bar bar-3" />
                  <span className="wave-bar bar-4" />
                  <span className="wave-bar bar-5" />
                  <span className="wave-bar bar-6" />
                  <span className="wave-bar bar-7" />
                </div>

                <div className="showcase-inner-card nm-inset">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700 }}>Direct Room Access</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--you)' }}>Sub-200ms</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px', lineHeight: '1.4' }}>
                    Generate an instant session or join an active debate with low-latency audio stream.
                  </p>
                  <button className="nm-btn nm-btn-primary" onClick={handleStartArgument}>
                    Launch Debate Room ➔
                  </button>
                </div>

                {/* Micro instructions */}
                <div className="showcase-specs-list">
                  <div className="spec-item">
                    <span className="spec-dot" />
                    <span>Headphones required for hardware echo cancellation</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-dot" />
                    <span>8 Languages supported: EN, HI, ES, FR, DE, PT, IT, RU</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Segmented Bottom Bar (matching reference image) */}
          <div className="hero-segmented-bar nm-raised">
            <div className="segment-col">
              <span className="segment-icon">⚡︎</span>
              <div>
                <div className="segment-title">&lt; 150ms Barge-In</div>
                <div className="segment-sub">Client-side energy detector</div>
              </div>
            </div>
            <div className="segment-divider" />
            <div className="segment-col">
              <span className="segment-icon">🎧</span>
              <div>
                <div className="segment-title">Acoustic Shield</div>
                <div className="segment-sub">Hardware feedback isolation</div>
              </div>
            </div>
            <div className="segment-divider" />
            <div className="segment-col">
              <span className="segment-icon">★</span>
              <div>
                <div className="segment-title">4.9 / 5.0 Precision</div>
                <div className="segment-sub">Unsoftened dialogue translation</div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Screen 2: Join */}
      {screen === 'join' && (
        <main className="panel-container">
          <div className="nm-panel nm-raised">
            <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Join Room {roomId}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '24px' }}>
              Enter your name and pick the language you will speak and hear.
            </p>

            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Your Name
              <input
                type="text"
                className="nm-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Elena or Rahul"
                aria-label="Your Name"
                autoFocus
              />
            </label>

            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Your Language
              <div className="select-wrapper">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                  aria-label="Your Language"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <span className="select-chevron" aria-hidden="true">▾</span>
              </div>
            </label>

            <label className="nm-switch-label">
              <div className="nm-switch">
                <input
                  type="checkbox"
                  id="headphones-toggle"
                  checked={headphonesChecked}
                  onChange={(e) => setHeadphonesChecked(e.target.checked)}
                  aria-label="I am wearing headphones"
                />
                <span className="nm-switch-track">
                  <span className="nm-switch-thumb" />
                </span>
              </div>
              <span>I am wearing headphones (required for real-time duplex)</span>
            </label>

            <button
              className="nm-btn nm-btn-primary"
              disabled={!name.trim() || !headphonesChecked || isJoining}
              onClick={handleJoin}
            >
              {isJoining ? '⏳ Connecting...' : 'Join Room'}
            </button>
          </div>
        </main>
      )}

      {/* Screen 3: Room */}
      {screen === 'room' && (
        <main className="room-container">
          {/* Peer Status Bar */}
          <div className="peer-status-bar">
            <div className="peer-chip">
              <span className={`status-dot ${peer?.online ? 'online' : 'offline'}`} aria-hidden="true" />
              {peer ? (
                <span>
                  <strong>{peer.name}</strong> ({peer.lang.toUpperCase()}) {peer.online ? 'Online' : 'Offline'}
                </span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>Waiting for peer to connect...</span>
              )}
            </div>

            <button
              className="nm-btn nm-btn-secondary"
              onClick={copyShareLink}
              aria-label="Copy Room Invite Link"
            >
              {copiedLink ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>

          {/* Captions area */}
          {!peer?.online && captions.length === 0 ? (
            <div className="panel-container">
              <div className="nm-panel nm-raised" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Room Code: {roomId}</div>
                <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '24px' }}>
                  Share this link with your debate partner. Live translation starts as soon as they connect.
                </p>
                <button className="nm-btn nm-btn-primary" onClick={copyShareLink}>
                  {copiedLink ? '✓ Link Copied!' : 'Copy Room Invite Link'}
                </button>
              </div>
            </div>
          ) : (
            <div className="captions-scroll-area">
              <div className="captions-grid-desktop" aria-live="polite">
                {/* Column You (desktop left, mobile bottom) */}
                <div className="col-speaker col-you">
                  <div className="col-header">You ({lang.toUpperCase()})</div>
                  {captions
                    .slice(-60)
                    .filter((c) => c.speaker === 'you')
                    .map((cap, i, arr) => {
                      const hasGlow = i >= arr.length - 20;
                      return (
                        <article
                          key={cap.segmentId || cap.utteranceId || i}
                          className={`caption-card speaker-you ${cap.retracted ? 'state-retracted' : cap.interrupted ? 'state-cutoff' : cap.final ? 'state-heard' : 'state-in_progress'} ${hasGlow ? 'has-glow' : ''}`}
                          data-state={cap.retracted ? 'retracted' : cap.interrupted ? 'cutoff' : cap.final ? 'heard' : 'in_progress'}
                          style={{ '--heat': cap.intensity } as React.CSSProperties}
                        >
                          <div className="card-state-bar">
                            <span className="speaker-tag">● You</span>
                            <span className="state-label">
                              {cap.retracted ? (
                                <span className="pill-retracted">taken back</span>
                              ) : cap.interrupted ? (
                                `✂️ cut off at ${Math.round((cap.pct || 0.4) * 100)}%`
                              ) : cap.final ? (
                                '✓✓ Heard'
                              ) : (
                                '🎙️ In progress'
                              )}
                            </span>
                          </div>

                          <div className="caption-translation">
                            {cap.interrupted && cap.heardText ? (
                              <>
                                <span className="heard-text">{cap.heardText}</span>
                                <span className="groove-marker" aria-hidden="true" />
                                <span className="unheard-dimmed">
                                  {cap.trText.replace(cap.heardText, '').trim()}
                                </span>
                              </>
                            ) : (
                              cap.trText || cap.srcText
                            )}
                          </div>

                          {cap.srcText && (
                            <div className="caption-original">
                              You said: {cap.srcText}
                            </div>
                          )}
                          {cap.trText && (
                            <div className="caption-original" style={{ color: 'var(--them)', marginTop: '2px' }}>
                              They hear: {cap.trText}
                            </div>
                          )}

                          {hudActive && cap.latency && (
                            <div className="hud-badge">
                              ⏱️ STT {cap.latency.sttMs}ms | LLM {cap.latency.llmMs}ms | TTS {cap.latency.ttsMs}ms | Total {cap.latency.totalMs}ms
                            </div>
                          )}
                        </article>
                      );
                    })}
                </div>

                {/* Column Them (desktop right, mobile top) */}
                <div className="col-speaker col-them">
                  <div className="col-header">
                    {peer ? `${peer.name} (${peer.lang.toUpperCase()})` : 'Them'}
                  </div>
                  {captions
                    .slice(-60)
                    .filter((c) => c.speaker === 'them')
                    .map((cap, i, arr) => {
                      const hasGlow = i >= arr.length - 20;
                      return (
                        <article
                          key={cap.segmentId || cap.utteranceId || i}
                          className={`caption-card speaker-them ${cap.retracted ? 'state-retracted' : cap.interrupted ? 'state-cutoff' : cap.final ? 'state-heard' : 'state-speaking'} ${hasGlow ? 'has-glow' : ''}`}
                          data-state={cap.retracted ? 'retracted' : cap.interrupted ? 'cutoff' : cap.final ? 'heard' : 'speaking'}
                          style={{ '--heat': cap.intensity } as React.CSSProperties}
                        >
                          <div className="card-state-bar">
                            <span className="speaker-tag">● {peer?.name || 'Them'}</span>
                            <span className="state-label">
                              {cap.retracted ? (
                                <span className="pill-retracted">taken back</span>
                              ) : cap.interrupted ? (
                                `✂️ cut off at ${Math.round((cap.pct || 0.4) * 100)}%`
                              ) : cap.final ? (
                                '✓✓ Heard'
                              ) : (
                                '🔊 Speaking'
                              )}
                            </span>
                          </div>

                          <div className="caption-translation">
                            {cap.interrupted && cap.heardText ? (
                              <>
                                <span className="heard-text">{cap.heardText}</span>
                                <span className="groove-marker" aria-hidden="true" />
                                <span className="unheard-dimmed">
                                  {cap.trText.replace(cap.heardText, '').trim()}
                                </span>
                              </>
                            ) : (
                              cap.trText || cap.srcText
                            )}
                          </div>

                          {cap.srcText && (
                            <div className="caption-original">
                              Original: {cap.srcText}
                            </div>
                          )}

                          {hudActive && cap.latency && (
                            <div className="hud-badge">
                              ⏱️ STT {cap.latency.sttMs}ms | LLM {cap.latency.llmMs}ms | TTS {cap.latency.ttsMs}ms | Total {cap.latency.totalMs}ms
                            </div>
                          )}
                        </article>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Pinned Call Controls: End Call / Return Home & Mic Button */}
          <div className="mic-pinned-container">
            <button
              className="nm-end-call-btn nm-raised"
              onClick={handleCutCall}
              aria-label="Cut call and return to home"
              title="Cut call and return to home"
            >
              <span className="end-call-icon" aria-hidden="true">📞</span>
              <span className="end-call-label">Leave</span>
            </button>

            <button
              className={`nm-mic-btn ${micMuted ? 'mic-off' : 'mic-on'}`}
              style={{ '--level': micMuted ? 0 : micLevel } as React.CSSProperties}
              onClick={toggleMic}
              aria-pressed={!micMuted}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={micMuted ? 'Microphone is OFF (Click to turn on)' : 'Microphone is ON (Click to turn off)'}
            >
              <span className="mic-icon" aria-hidden="true">{micMuted ? '🔇' : '🎙️'}</span>
              <span className="mic-status-label">{micMuted ? 'Mic Off' : 'Listening'}</span>
            </button>
          </div>
        </main>
      )}
    </>
  );
}
