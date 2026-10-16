# 🔄 AppFlow.md

**Status:** In Progress

## User Flow

### Person A (creates the room)
Landing → Join (name, language, headphones tick) → Room (waiting) → Room (live) → End

### Person B (follows the link)
Link → Join (name, language, headphones tick) → Room (live) → End

### Core loop inside a live room
Speak → own live caption → translation text appears on both screens → translation plays for the listener → listener cuts in or lets it finish → `heard` marker appears on both screens

## Screens

### Landing
- One line of copy and one button: Start an argument
- Creating a room gives a 6 character code and a shareable link
- No signup

### Join
- Name field
- Language select (default: browser language, otherwise English)
- Headphones tick, required
- Join button resumes the audio context and requests the mic

### Room (waiting)
- Shows the link with a copy button
- Mic level meter so you can see it works
- Switches to live the moment the second person joins

### Room (live)
- Caption stream: each caption card shows the translation large and the original small
- Own speech: your original text updates live while you talk, and a smaller "they hear" line shows what the other person is getting
- Heard marker: a red bar where the listener cut in, unheard words dimmed, on both screens
- Retracted lines: struck through with a "taken back" label
- Mic toggle (on by default), peer status, language indicator for both sides
- `?hud=1` adds a per-segment latency readout

### Interruption states
| Situation                                  | What the speaker sees                         | What the listener hears                  |
|--------------------------------------------|-----------------------------------------------|------------------------------------------|
| Listener lets the line finish              | Line marked heard                             | Full translation                         |
| Listener cuts in at 40%                    | Red bar at 40%, rest dimmed                   | Playback stops mid-word                  |
| Speaker corrects themselves before playback | Old line struck out                          | Old line never plays, correction plays   |
| Speaker corrects after playback            | Old line struck out                           | Old line already heard, correction plays |
| Both talk at once                          | Both live captions keep updating              | Incoming audio is cut for whoever speaks |

### End
- Either person leaves, the room closes 10 minutes later
- Download transcript (JSON), including interruption points
