# Music visualisers — 25 October 2026

Scope: Sota Kece (`donovandimau/bulavata`, not the separate React demo), the canonical Fiji 3D Maps shared player, Ops Music Hub, Sere's existing lyrics/video studio, and Dimau Studios.

## Search and method

Screened the first ten GitHub result pages for `music visualiser`, sorted by stars descending, ten results per page: 100 repository records. [Full 100-repository search manifest](https://github.com/donovandimau/dimau-ops/blob/codex/music-visualisers-20261025/docs/music-visualiser-search.json) records every page, source URL, title, description, stars, licence metadata and last push at retrieval. Screening is not a claim that all 100 source trees were audited. Read the documentation of eight shortlist sources and three stronger spelling-variant references, and inspected the target apps' actual player/export source. Used manual architecture and behaviour analysis; no REA execution receipt or automated reverse-engineering result is claimed.

## Selected features

| Primary reference | Useful behaviour | Implementation |
| --- | --- | --- |
| [Akko](https://github.com/TimboKZ/Akko) | Separate audio analysis, rendering and playback | One shared media graph; reusable custom element around existing players |
| [A-Frame Clubber](https://github.com/wizgrav/aframe-clubber) | Audio bands and smoothing | Browser FFT, logarithmic bins and bounded intensity |
| [rav](https://github.com/i-am-logger/rav) | Spectrum peak caps and oscilloscope | Original spectrum and time-domain waveform modes |
| [Visuafy](https://github.com/aryanbhajanka/Visuafy) | Visual themes | Four restrained colour palettes, saved locally |
| [Circuliser](https://github.com/squ1dd13/Circuliser) | Circular frequency display | Original mirrored halo renderer |
| [audio-visualiser](https://github.com/enjikaka/audio-visualiser) | Reusable component and retina sizing | Isolated shadow DOM, ResizeObserver and capped pixel density |
| [Multi-Track Audio Visualizer](https://github.com/geoffmyers/multitrack-audio-visualizer) | Local visual/audio export | Bounded 15/30/60-second WebM capture in Studios and Sere; no multitrack claim |
| [Waste Radio](https://github.com/wastetek/radio.fam.wtf) | Canvas with Web Audio | Dependency-free Canvas2D rendering |
| [audioMotion](https://github.com/hvianna/audioMotion-analyzer) | Configurable frequency spectrum | Log-frequency bands, falloff and palette controls |
| [WaveSurfer](https://github.com/katspaugh/wavesurfer.js) | Accessible waveform/player separation | Preserve native audio seeking rather than replacing player controls |
| [Butterchurn](https://github.com/jberg/butterchurn) | Rich audio-reactive scenes | Inform the preset approach; no WebGL or MilkDrop runtime imported |

Implementation is original browser code. No third-party source, preset packs, artwork, recordings, branding or runtime packages are included from these references. The existing 81-song Sota playlist, supplied lyrics, source catalogue, accounts, privacy/storage and current artwork are preserved.

## Integration

- Sota Kece: public playlist and private uploaded-file dialogs, with existing playback coordination. Public audio declares CORS before setting a source. Cosmetic fake bars removed from the playlist details.
- Shared player: opt-in Music visuals disclosure inside the existing music list. Public Maps keeps its ordinary controls and no extra workspace. Ops Music Hub uses its existing audio element.
- Sere: studio visuals with optional audio-backed short clips. Enabling visuals also adds the selected visual behind the existing lyric-video text. Export and preview reuse a single media source. The separate PR3 discovery redesign is untouched. Existing songs/catalogue and transcription are unchanged. Narrow timing-table overflow repaired.
- Studios: `/music.html`, linked from the existing suite navigation, with local audio upload, four modes, four palettes, intensity, fullscreen and short recording. Downloaded clips can be imported into the existing Video editor. No paid generation or backend service.

Visuals default off, start only on a user gesture, and use actual analyser data. Motion stops on pause/end, document hiding, closed dialogs, offscreen views or removal; reduced-motion changes stop it. Save-Data limits rendering to 15fps, otherwise 30fps. Canvas pixel density is capped at 2. Pausing visuals leaves music playing. Cross-origin sources without explicit CORS are refused before an audio graph is created. There is one speaker route per source. WebM finalisation supplies duration metadata without rewriting encoded packets.

## Checks and limits

Actual local headless Chromium: decoded audio produces nonzero FFT data; all four modes render; repeated graph access returns one graph; Studios captures real VP9/Opus; Sere produces VP8/Opus with correct 5-second duration after enabling visuals. Captured visual clip is about 1.26 seconds, includes sound (mean -14.1dB), has duration metadata and is not a static mock export. 390px layouts fit after the Sere timing-table repair. Sota playlist and private upload playback, close/reopen render-loop lifecycle and reduced-motion changes pass with no page errors. Sota browser test substitutes an explicitly generated local WAV for a network playlist track; separate HTTP range/CORS check of the real storage host returned 206 and Access-Control-Allow-Origin `*`.

5 focused media-graph/spectrum/finalisation tests pass; Sota's prior 32 tests and Sere lyric parser pass. Studios production build passes. Full Studios checks are also run in canonical GitHub CI because the local materialisation initially lacked unrelated API/icon files. Hosted preview/CI receipts and any remaining limits are recorded in the PRs. Real Samsung/iOS devices, Safari, full screen-reader audit and performance on Fiji networks are not claimed. No source changes to unrelated saved redesigns, terrain/routing, privacy, credentials or release settings. No authenticated Ops task/memory/checkpoint receipt was available; this repository handover is the coordination fallback.

Next: verify exact-head CI and previews; retain existing owner review holds for production.
