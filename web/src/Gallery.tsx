// web/src/Gallery.tsx
import React, { useState } from 'react';
import './styles/tokens.css';

interface GalleryCardFixture {
  id: string;
  state:
    | 'in_progress'
    | 'pending'
    | 'committed'
    | 'speaking'
    | 'heard'
    | 'cutoff'
    | 'retracted'
    | 'failed';
  speaker: 'you' | 'them';
  srcText: string;
  trText: string;
  heardText?: string;
  cutoffPct?: number; // 0.1, 0.4, 0.9
  speakingPct?: number; // for playback track fill
}

const FIXTURES: GalleryCardFixture[] = [
  {
    id: 's1',
    state: 'in_progress',
    speaker: 'you',
    srcText: 'Wait, listen to me, that is completely wrong...',
    trText: 'रुको, मेरी बात सुनो, यह बिल्कुल गलत है...',
  },
  {
    id: 's2',
    state: 'pending',
    speaker: 'them',
    srcText: 'You never let anyone else finish a thought!',
    trText: 'तुम कभी किसी और को अपनी बात खत्म नहीं करने देते!',
  },
  {
    id: 's3',
    state: 'committed',
    speaker: 'you',
    srcText: 'Because every point you bring up makes no sense.',
    trText: 'क्योंकि तुम जो भी बात उठाते हो उसका कोई मतलब नहीं होता।',
  },
  {
    id: 's4',
    state: 'speaking',
    speaker: 'them',
    srcText: 'I have evidence right here in front of me.',
    trText: 'मेरे सामने यहाँ बिल्कुल पक्का सबूत मौजूद है।',
    speakingPct: 65,
  },
  {
    id: 's5',
    state: 'heard',
    speaker: 'you',
    srcText: 'That evidence was debunked three weeks ago.',
    trText: 'उस सबूत को तीन हफ्ते पहले ही गलत साबित कर दिया गया था।',
  },
  {
    id: 's6-10',
    state: 'cutoff',
    speaker: 'them',
    srcText: 'If you would just open your eyes and inspect the logs...',
    trText: 'अगर तुम अपनी आँखें खोलकर लॉग्स की जांच कर लो...',
    heardText: 'अगर',
    cutoffPct: 10,
  },
  {
    id: 's6-40',
    state: 'cutoff',
    speaker: 'you',
    srcText: 'I already looked through every single line yesterday!',
    trText: 'मैंने कल ही एक-एक लाइन बहुत ध्यान से देखी थी!',
    heardText: 'मैंने कल ही एक-एक',
    cutoffPct: 40,
  },
  {
    id: 's6-90',
    state: 'cutoff',
    speaker: 'them',
    srcText: 'Then you clearly missed the authorization failure right at startup!',
    trText: 'तो फिर तुमने शुरू में ही ऑथराइजेशन की विफलता को साफ तौर पर छोड़ दिया!',
    heardText: 'तो फिर तुमने शुरू में ही ऑथराइजेशन की विफलता को साफ',
    cutoffPct: 90,
  },
  {
    id: 's7',
    state: 'retracted',
    speaker: 'you',
    srcText: 'You are deliberately hiding the facts — no wait, I meant omitting context.',
    trText: 'तुम जानबूझकर सच छुपा रहे हो — नहीं रुको, मेरा मतलब संदर्भ छोड़ रहे हो।',
  },
  {
    id: 's8',
    state: 'failed',
    speaker: 'them',
    srcText: 'Network socket dropped mid-utterance.',
    trText: 'translation unavailable',
  },
];

export default function Gallery() {
  const [filterHeat, setFilterHeat] = useState<number | 'all'>('all');
  const heats = [0, 0.5, 1.0];

  return (
    <div className="gallery-page">
      <header className="gallery-header nm-raised">
        <div className="gallery-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h1>CROSS<span style={{ color: 'var(--you)' }}>FIRE</span> STATES GALLERY</h1>
            <p className="subtitle">Tactile Neumorphism Visual Spec (/?gallery=1)</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <a href="/" className="nm-btn nm-btn-secondary">
              ← Back to Debate App
            </a>
          </div>
        </div>
        <div className="heat-selector" role="group" aria-label="Filter by heat level">
          <button
            className={`btn-filter ${filterHeat === 'all' ? 'active nm-inset' : 'nm-raised'}`}
            onClick={() => setFilterHeat('all')}
          >
            All Heats (0, 0.5, 1)
          </button>
          {heats.map((h) => (
            <button
              key={h}
              className={`btn-filter ${filterHeat === h ? 'active nm-inset' : 'nm-raised'}`}
              onClick={() => setFilterHeat(h)}
            >
              Heat {h}
            </button>
          ))}
        </div>
      </header>

      <main className="gallery-content">
        {(filterHeat === 'all' ? heats : [filterHeat]).map((heatVal) => (
          <section key={heatVal} className="heat-section" data-heat-section={heatVal}>
            <div className="heat-section-header">
              <span className="heat-badge nm-inset">
                HEAT LEVEL: <strong>{heatVal.toFixed(1)}</strong>{' '}
                {heatVal === 0 ? '(Calm / Neutral)' : heatVal === 0.5 ? '(Heated)' : '(Explosive Shouting)'}
              </span>
            </div>

            <div className="gallery-cards-grid">
              {FIXTURES.map((item) => {
                const unreadPart =
                  item.state === 'cutoff' && item.heardText
                    ? item.trText.slice(item.heardText.length)
                    : '';

                return (
                  <article
                    key={`${heatVal}-${item.id}`}
                    className={`caption-card state-${item.state} speaker-${item.speaker} has-glow`}
                    data-state={item.state}
                    data-speaker={item.speaker}
                    style={
                      {
                        '--heat': heatVal,
                      } as React.CSSProperties
                    }
                  >
                    {/* Header state indicator: NEVER depth/color alone */}
                    <div className="card-state-bar">
                      <span className="speaker-tag">
                        {item.speaker === 'you' ? '● You (en)' : '● Them (hi)'}
                      </span>
                      <span className="state-label">
                        {item.state === 'in_progress' && '🎙️ In progress (speaking)'}
                        {item.state === 'pending' && '⏳ Translation pending'}
                        {item.state === 'committed' && '✓ Committed'}
                        {item.state === 'speaking' && '🔊 Speaking to listener'}
                        {item.state === 'heard' && '✓✓ Heard in full'}
                        {item.state === 'cutoff' && `✂️ cut off at ${item.cutoffPct}%`}
                        {item.state === 'retracted' && (
                          <span className="pill-retracted nm-inset">taken back</span>
                        )}
                        {item.state === 'failed' && '⚠️ Failed'}
                      </span>
                    </div>

                    {/* Main Translation Text */}
                    <div className="caption-translation">
                      {item.state === 'cutoff' && item.heardText ? (
                        <>
                          <span className="heard-text">{item.heardText}</span>
                          <span className="groove-marker" aria-hidden="true" />
                          <span className="unheard-dimmed">{unreadPart}</span>
                        </>
                      ) : (
                        item.trText
                      )}
                    </div>

                    {/* Inset Playback Track for "speaking" state */}
                    {item.state === 'speaking' && (
                      <div
                        className="playback-track nm-inset"
                        role="progressbar"
                        aria-valuenow={item.speakingPct || 50}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="playback-fill"
                          style={{ width: `${item.speakingPct || 50}%` }}
                        />
                      </div>
                    )}

                    {/* Original Source Text */}
                    <div className="caption-original">
                      {item.speaker === 'you' ? `You said: ${item.srcText}` : `They said: ${item.srcText}`}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {/* Section: Component Library Showcase */}
        <section className="heat-section" style={{ marginTop: '40px' }}>
          <div className="heat-section-header">
            <span className="heat-badge nm-inset">
              CONTROLS &amp; BANNERS SPEC
            </span>
          </div>

          <div className="gallery-cards-grid">
            {/* Peer Chips */}
            <div className="caption-card state-committed nm-raised">
              <div className="card-state-bar">
                <span className="speaker-tag">Peer Chips (Inset Pills)</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                <div className="peer-chip">
                  <span className="status-dot online" aria-hidden="true" />
                  <span><strong>Elena</strong> (ES) Online</span>
                </div>
                <div className="peer-chip">
                  <span className="status-dot offline" aria-hidden="true" />
                  <span><strong>Rahul</strong> (HI) Offline</span>
                </div>
              </div>
            </div>

            {/* Mic Button States */}
            <div className="caption-card state-committed nm-raised">
              <div className="card-state-bar">
                <span className="speaker-tag">96px Mic Button States</span>
              </div>
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <button className="nm-mic-btn mic-off" aria-pressed="false" aria-label="Muted mic">
                    <span className="mic-icon">🔇</span>
                    <span className="mic-status-label">Mic Off</span>
                  </button>
                  <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>Raised (Off)</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <button
                    className="nm-mic-btn mic-on"
                    style={{ '--level': 0.7 } as React.CSSProperties}
                    aria-pressed="true"
                    aria-label="Active mic"
                  >
                    <span className="mic-icon">🎙️</span>
                    <span className="mic-status-label">Listening</span>
                  </button>
                  <p style={{ fontSize: '11px', color: 'var(--you)', marginTop: '6px' }}>Inset + Ring (On)</p>
                </div>
              </div>
            </div>

            {/* Warning Banners */}
            <div className="caption-card state-committed nm-raised" style={{ gridColumn: '1 / -1' }}>
              <div className="card-state-bar">
                <span className="speaker-tag">Banners (Flat with 1px border and icon)</span>
              </div>
              <div className="nm-banner" role="status">
                <span className="nm-banner-icon">⚠️</span>
                <span><strong>Fake Mode Active:</strong> External API keys not set. Deterministic speech &amp; translation fakes running.</span>
              </div>
              <div className="nm-banner banner-alert" role="alert">
                <span className="nm-banner-icon">🎙️</span>
                <span><strong>Microphone Error:</strong> Permission denied by browser policy.</span>
              </div>
              <div className="nm-banner" role="status">
                <span className="nm-banner-icon">📝</span>
                <span><strong>Captions Only:</strong> Audio output unavailable. Transcripts streaming normally.</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
