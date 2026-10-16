# 🗄️ Schema.md

**Status:** In Progress

v1 has no database. There are no accounts and nothing outlives the room. All state lives in server memory, keyed by room id, and is dropped 10 minutes after the last participant leaves. The tables below describe the in-memory model. A transcript can be downloaded as JSON when the room ends.

## Tables

### Room
| Column      | Type      | Notes                                   |
|-------------|-----------|-----------------------------------------|
| id          | string    | 6 char code, used in the join link      |
| created_at  | timestamp |                                         |
| closed_at   | timestamp | null while open                         |

### Participant (replaces Users, no auth)
| Column      | Type      | Notes                                   |
|-------------|-----------|-----------------------------------------|
| id          | uuid (PK) | generated on join                       |
| room_id     | string (FK) | → Room.id                             |
| name        | string    | display only                            |
| lang        | enum      | en, hi, es, fr, de, pt, it, ru          |
| slot        | enum      | A or B, max two per room                |
| online      | boolean   |                                         |

### Utterance
One continuous stretch of speech from one person, as the STT sees it.
| Column      | Type      | Notes                                   |
|-------------|-----------|-----------------------------------------|
| id          | uuid (PK) |                                         |
| participant_id | uuid (FK) | → Participant.id                     |
| text        | string    | latest source transcript                |
| final       | boolean   |                                         |
| loudness    | float     | 0 to 1, from RMS of the PCM stream      |
| wpm         | float     | from STT word timings                   |
| started_at  | timestamp |                                         |

### Segment
The unit that gets translated and spoken. One utterance has one or more segments.
| Column      | Type      | Notes                                   |
|-------------|-----------|-----------------------------------------|
| id          | uuid (PK) |                                         |
| utterance_id | uuid (FK) | → Utterance.id                         |
| seq         | int       | order inside the utterance              |
| src_text    | string    |                                         |
| tr_text     | string    | translation                             |
| intensity   | float     | 0 to 1, from the LLM header             |
| emotion     | string    | angry, sarcastic, pleading, calm, hurt, contempt, other |
| retracts    | uuid (FK) | → Segment.id, null if not a correction  |
| status      | enum      | pending, playing, heard, interrupted, cancelled, retracted |
| tts_ms      | int       | total audio length                      |

### Interruption
| Column      | Type      | Notes                                   |
|-------------|-----------|-----------------------------------------|
| id          | uuid (PK) |                                         |
| segment_id  | uuid (FK) | → Segment.id                            |
| by_participant_id | uuid (FK) | the listener who cut in           |
| played_ms   | int       | audio played before the cut             |
| pct         | float     | played_ms / tts_ms                      |
| heard_text  | string    | estimated words the listener got        |

## Relationships
- Room → Participant: one-to-many (max 2)
- Participant → Utterance: one-to-many
- Utterance → Segment: one-to-many
- Segment → Interruption: one-to-zero-or-one
- Segment → Segment: optional self reference through `retracts`
