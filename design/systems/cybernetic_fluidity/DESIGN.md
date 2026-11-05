---
name: Cybernetic Fluidity
colors:
  surface: '#0c1324'
  surface-dim: '#0c1324'
  surface-bright: '#33394c'
  surface-container-lowest: '#070d1f'
  surface-container-low: '#151b2d'
  surface-container: '#191f31'
  surface-container-high: '#23293c'
  surface-container-highest: '#2e3447'
  on-surface: '#dce1fb'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dce1fb'
  inverse-on-surface: '#2a3043'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#d8ffe7'
  on-tertiary: '#003824'
  tertiary-container: '#65f2b5'
  on-tertiary-container: '#006d4a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0c1324'
  on-background: '#dce1fb'
  surface-variant: '#2e3447'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 22px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system expresses high-velocity automated financial streaming and decentralized infrastructure. The aesthetic merges precision developer tooling with modern Web3 glassmorphism. It targets Web3 protocol engineers, open-source maintainers, and DevOps teams managing automated micro-splits and continuous payment pipelines.

The interface evokes focused command, surgical precision, and real-time liquidity flow. Structural backdrops rely on deep slate-zinc tones paired with luminescent neon conduits, signaling cryptographic security alongside real-time data orchestration. Tactile feedback, crisp technical typography, and subtle ambient glows anchor high-density telemetry without cognitive exhaustion.

## Colors

The palette operates on high-contrast luminescence across deep obsidian substrates:

- **Primary (`#00F0FF` - Neon Cyan)**: Applied to core active stream indicators, micro-split triggers, focus rings, and high-priority action states.
- **Secondary (`#6366F1` - Electric Violet/Indigo)**: Drives topological dependency graphs, contractual routing state, pipeline triggers, and structural visual accents.
- **Tertiary (`#10B981` - Live Emerald)**: Exclusively reserves execution state, continuous micropayment velocity indicators, verified settlement pulses, and health checks.
- **Neutral Canvas (`#020617` to `#0F172A`)**: Base surfaces leverage deep slate-black. Containers layer over `#090D1A` with subtle linear luminance gradients rather than flat fills.
- **Surface Borders**: Semi-opaque cyan and violet borders (`rgba(0, 240, 255, 0.15)` to `rgba(99, 102, 241, 0.2)`) articulate architectural boundaries without visual clutter.

## Typography

The typographic hierarchy balances architectural display forms, ergonomic reading clarity, and exact code legibility:

- **Display & Headlines (`Space Grotesk`)**: Geometric, technical angles emphasize forward-momentum and protocol stability. Strict negative tracking maintains crisp headlines on dark backgrounds.
- **Body & Contextual Copy (`Geist`)**: Neutral, ultra-legible neutral sans built for developer interfaces and dense visual data displays.
- **Telemetry, Hashes & Badges (`JetBrains Mono`)**: Applied to Stellar public keys, Soroban contract addresses, Git commit hashes, real-time rates (e.g., `XLM/sec`), and status tags. Numeric tabular lining (`font-variant-numeric: tabular-nums`) is mandatory across all dynamic counters to eliminate layout jitter during active streaming.

## Layout & Spacing

The layout is built upon a 12-column fluid grid system pinned to a maximum canvas width of 1440px on desktop environments, with adaptive fluid reflow down to 1-column layouts on mobile viewports:

- **Desktop (>= 1024px)**: 12-column matrix with `1.5rem` gutters and `2rem` outer edge safety margins. Side navigation remains persistent, with two-column panels for dependency split graphs and live transaction streams.
- **Tablet (768px - 1023px)**: 8-column layout with `1rem` gutters. Graph canvas collapses to stacked master-detail views.
- **Mobile (< 768px)**: 4-column layout with `0.75rem` gutters and `1rem` margins. Navigation collapses to a bottom tactile docking rail. Key metrics switch to swipeable streaming status trays.
- **Vertical Spacing Rhythm**: All spatial groupings strictly adopt multiples of `0.25rem` (4px basis) to retain rigid vertical alignment across tabular telemetry and CI/CD console blocks.

## Elevation & Depth

Depth is conveyed through luminous glassmorphism and multi-layered atmospheric surfaces rather than traditional cast drop-shadows:

- **Level 0 (Void)**: Base viewport floor at `#020617` with subtle ambient radial gradients in deep indigo (`rgba(99, 102, 241, 0.08)`) and cyan (`rgba(0, 240, 255, 0.04)`).
- **Level 1 (Substrate Panel)**: `rgba(15, 23, 42, 0.65)` with `16px` backdrop-blur and a 1px perimeter border of `rgba(255, 255, 255, 0.07)`.
- **Level 2 (Interactive Modules & Cards)**: `rgba(30, 41, 59, 0.5)` with `20px` backdrop-blur, 1px border of `rgba(0, 240, 255, 0.18)`, and a diffuse cyan halo glow on active states (`0 0 24px -4px rgba(0, 240, 255, 0.2)`).
- **Level 3 (Overlays, Flyouts & Modals)**: `rgba(10, 15, 30, 0.85)` with `24px` backdrop-blur, crisp structural borders (`rgba(99, 102, 241, 0.4)`), and deep ambient drop shadow (`0 20px 40px -10px rgba(0, 0, 0, 0.8)`).
- **Data Conduit Glows**: Stream connection lines utilize SVG paths with dynamic CSS drop-shadow filters (`drop-shadow(0 0 6px #00F0FF)` and `drop-shadow(0 0 6px #10B981)`) to communicate real-time balance flows.

## Shapes

The interface balances precision-engineered angles with comfortable touch ergonomics using roundedness level `2`:

- Standard cards, panels, inputs, and code terminals employ an 8px (`0.5rem`) radius, providing a precise architectural boundary that avoids harsh brutalist edges.
- Floating dialogs and parent dashboard containers leverage `rounded-lg` (16px / `1rem`).
- Modals, action sheets, and mobile pull-up trays implement `rounded-xl` (24px / `1.5rem`).
- Pill tags, live telemetry chips, and stream-control toggles utilize full capsule geometry (`9999px`) to immediately distinguish ephemeral metadata and statuses from foundational layout framing.

## Components

### Buttons
- **Primary Action (Execute Stream / Deploy Split)**: Electric cyan surface (`#00F0FF`) with dark obsidian text (`#020617`, weight 600), dynamic cyan outer glow (`0 0 16px rgba(0, 240, 255, 0.4)`). On hover, brightness scales to 1.1 with an active scale transform of `0.98`.
- **Secondary (Link Dependency / Stellar Connect)**: Ghost container with dark fill (`rgba(99, 102, 241, 0.1)`), 1px border (`#6366F1`), and electric violet text. Glow expands to `0 0 12px rgba(99, 102, 241, 0.3)` on hover.
- **Tertiary / Utility**: Transparent background, slate-400 text, 1px border (`rgba(255, 255, 255, 0.08)`).

### Pill Tags & Status Badges
- Fully rounded capsule boundaries (`9999px`), `JetBrains Mono` at `11px` uppercase with `0.05em` letter spacing.
- **Streaming Active**: Background `rgba(16, 185, 129, 0.12)`, text `#10B981`, with a pulsating dot (`4px`) radiating emerald neon waves.
- **Pending CI / CD Split**: Background `rgba(99, 102, 241, 0.15)`, text `#818CF8`.

### Input Fields & Address Selectors
- Background `rgba(15, 23, 42, 0.8)`, border `1px solid rgba(255, 255, 255, 0.1)`.
- Input text uses `Geist` for descriptions and `JetBrains Mono` for split percentage and cryptographic address inputs.
- Active focus transitions the border to `#00F0FF` with a subtle inset glow (`inset 0 0 8px rgba(0, 240, 255, 0.2)`).

### Cards & Telemetry Pods
- Translucent backdrop blur (`Level 2`), separated by 1px subtle borders.
- Top card header integrates an inline mono-metric pill and action overflow trigger.
- Embedded telemetry panels display live streaming tickers updating numbers smoothly via monospace figures with animated emerald indicators.

### Checkboxes & Segmented Radio Toggles
- Custom square-rounded boxes (4px radius) for commit dependency trees.
- Selected state fills with `#00F0FF` featuring an obsidian check icon and radial glow.
- Segmented switches (e.g., toggling between Soroban contracts and Drips multi-splits) sit inside an obsidian pill track with a sliding glass container thumb.

### Tactile Mobile Stream Controls
- Bottom sticky command dock with haptic-ready press states, high contrast icon-to-label ratios, and expandable radial drawer menus for emergency stream pausing and CI/CD manual triggers.