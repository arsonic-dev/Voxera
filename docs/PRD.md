# Voxera — Product Requirements Document (PRD)

**Project:** Voxera  
**Author:** Ankit Kumar ([@arsonic-dev](https://github.com/arsonic-dev))  
**Repository:** [https://github.com/arsonic-dev/Voxera](https://github.com/arsonic-dev/Voxera)  
**Status:** Complete  

---

## 1. Problem Statement
Two people with no common language cannot naturally engage in dynamic debates or high-emotion arguments through traditional turn-based translators. Existing tools enforce awkward turn-taking, suppress natural emotion, and hide whether an interruption cut off a sentence before it was understood.

**Voxera** enables two participants with zero shared language to converse simultaneously with low-latency full-duplex speech translation, instant local barge-in (< 150ms), exact visual interruption tracking ("heard up to here"), and real-time retraction when a speaker corrects their thought.

---

## 2. Core Features
- **Instant Room Generation & Direct Join:** Create a session with a unique code/URL; each participant selects their language and verifies their audio setup.
- **Full-Duplex Audio Streaming:** Both participants can speak at any time without waiting or collisions.
- **Client-Side Barge-In Detection:** Interrupting an ongoing audio playback cuts speech immediately (< 150ms) to ensure conversational fluidity.
- **Bi-Directional Heard Tracking:** Pinpoints the exact word where an interrupted sentence was cut off, rendering an interruption marker on both participants' screens.
- **Mind-Change Retractions:** Self-corrections ("no wait...", "I mean...") trigger cancellation of in-flight segments and mark retracted statements visually.
- **Dynamic Heat & Intensity Scaling:** Acoustic and emotional intensity carries through both voice inflection and tactile neumorphic UI styling.
- **Multilingual Support:** High-accuracy translation across 8 major languages (EN, HI, ES, FR, DE, PT, IT, RU).

---

## 3. Success Metrics & Non-Functional Requirements
- **Latency:** Sub-1.5s end-of-speech to translated playback on standard broadband connections.
- **Cutoff Speed:** Sub-150ms local barge-in response on sustained listener speech.
- **Accuracy & Faithfulness:** Uncensored and unsoftened translation maintaining natural emotional tone and idioms.
- **Stability:** Zero memory leaks, zero client crashes under continuous bidirectional speech streams.
- **Zero Horizontal Overflow:** Seamless responsiveness across desktop and mobile devices down to 360px viewport width.
