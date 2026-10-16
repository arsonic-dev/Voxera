# 🎨 Design System: Dark Neumorphism

**Status:** Implemented (`ui-neumorphism`)

Voxera employs a strict **Dark Neumorphism** visual language. Every surface shares the base page color and receives its shape and tactile volume entirely from dual directional light: a soft highlight from the top-left and an ambient shadow to the bottom-right.

Depth is strictly semantic, never decorative:
- **Raised (`.nm-raised`):** Settled content that exists in the world (committed statements, playback audio, settled cards, actionable controls).
- **Inset (`.nm-inset`):** Content in progress or active input fields (speaking in progress, pending translation, text fields, activated mic).
- **Flat (`.nm-flat`):** Withdrawn or invalidated content (retracted speech, failed translations, high-visibility warning banners).
- **Pressed (`.nm-pressed`):** Momentary tactile depression under active touch or keyboard activation.

---

## 1. Tokens & Color Palette

All tokens are defined in `web/src/styles/tokens.css` with zero UI framework dependencies.

```css
:root {
  --bg: #1B1E26;
  --shadow-dark: #0F1117;
  --shadow-light: #272B37;
  --text: #E8E6E1;
  --muted: #9AA0AE;
  --you: #FF8A4C;
  --them: #5BC0EB;
  --heat-lo: #F2C14E;
  --heat-hi: #FF453A; /* Adjusted from #FF3B30 to pass WCAG AA 4.5:1 on light gradient */
  --depth: 6px;       /* Scales to 10px from 768px up */
  --blur: calc(var(--depth) * 2);

  --raised:
    var(--depth) var(--depth) var(--blur) var(--shadow-dark),
    calc(var(--depth) * -1) calc(var(--depth) * -1) var(--blur) var(--shadow-light);

  --inset:
    inset calc(var(--depth) * 0.6) calc(var(--depth) * 0.6) var(--blur) var(--shadow-dark),
    inset calc(var(--depth) * -0.6) calc(var(--depth) * -0.6) var(--blur) var(--shadow-light);

  --surface-gradient: linear-gradient(145deg, #1E222B, #181B22);
  --radius-card: 16px;
  --radius-pill: 999px;
}
```

### Contrast & WCAG Compliance
All color pairings achieve full WCAG 2.1 AA compliance across both the flat background (`#1B1E26`) and surface gradient extremes (`#1E222B` / `#181B22`):
- Body & Headings (`--text`): **> 12.7:1**
- Secondary text (`--muted`): **> 6.0:1**
- Speaker You Accent (`--you`): **> 6.8:1**
- Speaker Them Accent (`--them`): **> 7.7:1**
- Warning / Heat Low (`--heat-lo`): **> 9.4:1**
- Interrupt / Heat High (`--heat-hi`): **> 4.67:1** (4.89:1 on base)
- Non-text focus indicators & active rings: **> 6.8:1** (well above 3.0:1 minimum)

---

## 2. Typography

- **Headings & Actions:** `Bricolage Grotesque`, sans-serif (semi-bold 600 / extra-bold 800)
- **Captions & Translations:** `Inter Tight`, sans-serif (fluid weight 400–800, fluid scale 1.0x–1.35x based on `--heat`)
- **HUD & Status Bar:** `JetBrains Mono`, monospace (12px)

---

## 3. Caption Card State Map

Every caption card belongs to one of eight discrete physical states. Because depth and color alone must never be the single carrier of state, every card includes explicit typography, badges, icons, or progress tracks:

| State | Physical Depth | Visual Treatment | Dual Accessible Indicator |
| :--- | :--- | :--- | :--- |
| **Own speech in progress** | Inset | Base background, pulsing inner glow in `--you` color (1.2s period via pseudo-element opacity) | Pulse indicator + "Speaking..." status badge |
| **Translation pending** | Inset | Base background, translation text at 60% opacity, no glow | "Translating..." label + dimmed text |
| **Committed, not yet spoken** | Raised | Faint 145° gradient, full dual neumorphic shadow | "Ready" status badge |
| **Being spoken to listener** | Raised | Dual shadow + thin inset playback track under text that fills linearly with audio | "Playing" status + animated fill track |
| **Heard in full** | Raised (settled) | Dual shadow settled at 70% depth (`calc(var(--card-depth) * 0.7)`) | "Heard" badge + settled tactile level |
| **Cut off (interrupted)** | Raised | Dual shadow, 3px inset vertical groove cut at the exact interruption point with `--heat-hi` inner glow | Unheard text drops to 45% opacity with dotted underline + "Cut off at X%" badge |
| **Taken back (retracted)** | Flat | Zero shadow, flat on background, strike-through text at 55% opacity | Inset pill badge reading "TAKEN BACK" |
| **Translation failed** | Flat | Zero shadow, 1px dashed `--heat-hi` border | Warning icon + "Translation unavailable" text |

---

## 4. Emotional Heat System

Every card receives a continuous `--heat` variable between `0.0` (calm/whisper) and `1.0` (screaming/furious):
1. **Depth Multiplier:** Card depth scales from `1.0x` (6px/10px) to `1.5x` (9px/15px).
2. **Typography Scaling:** Caption `font-weight` scales from 400 to 800; `font-size` scales from 18px to 24.3px (1.0x to 1.35x).
3. **Color Transition:** The speaker's accent color shifts via `color-mix`:
   - `0.0` to `0.6`: shifts from speaker color (`--you` or `--them`) toward `--heat-lo`.
   - `0.6` to `1.0`: shifts aggressively from `--heat-lo` toward `--heat-hi`.
4. **Outer Glow Pseudo-element:** An ambient heat halo appears on the card via `::before` with blur up to `calc(var(--heat) * 28px)` and opacity linked to heat intensity.

---

## 5. Components

### Join Screen
- Centered raised panel (`.nm-panel.nm-raised`) with faint 145° surface gradient.
- Inset input field (`.nm-input`) with smooth inner bevel.
- Native `<select>` inside an inset `.select-wrapper` container.
- Accessible neumorphic toggle switch (`.nm-switch`) with visible "Headphones connected (required)" text label.
- Raised Join button with `--you` accent text, depressing inset (`.nm-pressed`) on click/touch. **Zero filled-color buttons.**

### 96px Pinned Mic Button
- 96px circular button pinned to the bottom-center with `env(safe-area-inset-bottom)` margin.
- **Off / Muted:** Raised circle (`.nm-raised`), ready to push.
- **On / Speaking:** Inset circle (`.nm-inset`) with a reactive outer glow ring whose expansion follows mic energy through `--level`.
- `aria-pressed` reflects live toggle state.

### Peer Chip & HUD
- **Peer Chip:** Inset pill (`.nm-inset`) displaying peer name, language code, and an online status dot (accent when connected, muted when disconnected).
- **Latency HUD (`?hud=1`):** Inset top bar in `JetBrains Mono` 12px showing real-time endpoint, STT, LLM, TTS, and round-trip breakdown.

### Warning & Status Banners
- Flat banner with 1px solid `--heat-lo` border and icon. Kept loud and un-shaded because neumorphism is deliberately too quiet for urgent warnings (e.g. browser compatibility, mock mode, rate limits).

---

## 6. Layout & Responsiveness

- **Mobile (< 768px):** Single-column vertical debate feed. Their captions stay pinned above yours, newest at bottom, mic pinned bottom-center with 120px padding clearance.
- **Desktop (≥ 768px):** Two-column split layout. You on the left, Them on the right. Both columns share synchronous timeline flow. Base depth increases from 6px to 10px.

---

## 7. Performance & Motion Safety

- **No Animated Box-Shadows:** Box-shadow animations cause expensive layout reflows and paint thrashing. Inner pulses and outer heat glows animate `opacity` and `transform` on pseudo-elements (`::before` / `::after`).
- **GPU Layer Management:** `will-change: opacity` is applied only to active animating pseudo-elements.
- **Card Glow Pruning:** Only the 20 newest cards render the glow layer; older cards render purely static.
- **DOM Pruning:** Maximum 60 cards retained in the DOM.
- **`prefers-reduced-motion`:** Automatically disables inner pulse keyframes, playback fill transitions, and heat scaling transitions while preserving static neumorphic depth.

---

## 8. Verification Harness (`/?gallery=1`)

Voxera provides a zero-socket, zero-microphone visual states gallery at `/?gallery=1`. It renders all 8 states side-by-side across `heat = 0.0`, `heat = 0.5`, and `heat = 1.0` for automated Playwright regression testing and visual auditing.
