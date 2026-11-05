---
name: Architectural Drafting Standard
colors:
  surface: '#f7f9ff'
  surface-dim: '#d6dae2'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4fc'
  surface-container: '#eaeef6'
  surface-container-high: '#e4e8f0'
  surface-container-highest: '#dee3eb'
  on-surface: '#171c22'
  on-surface-variant: '#424753'
  inverse-surface: '#2c3137'
  inverse-on-surface: '#edf1f9'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005bc0'
  primary: '#0051ae'
  on-primary: '#ffffff'
  primary-container: '#0969da'
  on-primary-container: '#ecefff'
  inverse-primary: '#adc6ff'
  secondary: '#0056c3'
  on-secondary: '#ffffff'
  secondary-container: '#1f6feb'
  on-secondary-container: '#fefcff'
  tertiary: '#913900'
  on-tertiary: '#ffffff'
  tertiary-container: '#b84b00'
  on-tertiary-container: '#ffece5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#d9e2ff'
  secondary-fixed-dim: '#afc6ff'
  on-secondary-fixed: '#001944'
  on-secondary-fixed-variant: '#004299'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb693'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7a2f00'
  background: '#f7f9ff'
  on-background: '#171c22'
  surface-variant: '#dee3eb'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 3rem
    fontWeight: '600'
    lineHeight: 3.5rem
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Space Grotesk
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 1.25rem
    fontWeight: '500'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  title-sm:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: '0'
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: '0'
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.005em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.125rem
    letterSpacing: -0.01em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  caption-code:
    fontFamily: JetBrains Mono
    fontSize: 0.625rem
    fontWeight: '400'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
This design system embodies the precision, clarity, and structural discipline of modern architectural drafting and technical schematics. Drawing inspiration from Swiss International Typographic Style and engineering CAD tools, it projects unyielding reliability, intellectual rigor, and functional elegance.

The target audience consists of engineers, architects, systems designers, and analytical professionals who demand zero visual noise, immediate scannability, and high information density. 

The aesthetic is characterized by:
- Razor-sharp hairline boundaries simulating fine-milled plotter lines.
- Pure mechanical restraint, avoiding decorative gradients, heavy blurs, and organic forms.
- High-contrast ink distribution: stark slate typography resting on tactile off-white drafting vellum.
- Strategic punctuation using cobalt ink to denote interactive vector states, coordinate points, and dynamic system values.

## Colors
The color palette translates physical drafting instruments onto the digital screen. Every tone serves a pragmatic structural or informational role.

### Palette Architecture
- **Drafting Surfaces (Paper Ground):** `#FFFFFF` serves as primary canvas and interactive input surfaces, paired with `#F6F8FA` for secondary panels, inspection sidebars, and nested drafting planes.
- **Structural Lines (Steel Hairlines):** `#D0D7DE` defines primary layout frames and data grid boundaries. `#E1E4E8` is reserved for faint internal subdivisions, guide lines, and unselected component perimeters.
- **Ink Tiers (Drafting Lead):** 
  - Primary Slate (`#0F172A`): Core metrics, headings, and high-impact semantic data.
  - Secondary Charcoal (`#24292F`): Primary body copy, table text, and standard interface controls.
  - Muted Lead (`#57606A`): Field labels, dimension indicators, metadata, and inactive placeholders.
- **Precision Ink (Cobalt Accents):** `#0969DA` acts as the primary action and focus indicator, representing freshly plotted drafting ink. `#1F6FEB` operates as its hover and active variant.

Pure chromatic colors outside of cobalt are strictly reserved for critical status indicators (e.g., `#CF222E` for terminal errors, `#1A7F37` for structural confirmations), applied at 1px border weight or minimal icon scale.

## Typography
Typographic treatment mimics the technical clarity of engineering blueprints:
- **Display & Section Titles:** `Space Grotesk` introduces geometric discipline, sharp vertices, and architectural structuralism.
- **Reading Hierarchy:** `Geist` provides an ultra-clean, neutral canvas for extensive prose, tables, and inspection panes without glyph exhaustion.
- **Data & Dimension Labels:** `JetBrains Mono` handles coordinates, technical IDs, dimensional parameters, tabular numbers, and tags. Tabular figures (`tnum`) should be enabled across all numerical outputs.

Always preserve structural hierarchy through weight contrasts and tracking adjustments rather than shifting chromatic colors.

## Layout & Spacing
The layout follows a modular grid grounded in continuous visual coordinate alignment.

### Grid Framework
- **Desktop (≥ 1280px):** 12-column layout with 24px (`1.5rem`) gutters, dynamic section margin (`3rem`). Outer bounds snap cleanly to fixed maximum structural widths or fluid viewport planes with visible framing lines.
- **Tablet (768px - 1279px):** 8-column layout, 16px (`1rem`) gutters, 32px (`2rem`) margins. Tooling panels dock into bottom sheets or collapsible inspector trays.
- **Mobile (< 768px):** 4-column layout, 16px (`1rem`) gutters, 16px (`1rem`) outer canvas margins. Multi-column metric sets reflow strictly into single vertical runs or horizonal scroll rails.

### Spacing Principles
All element padding and margins snap to an 8pt architectural rhythm, with a 4pt baseline step used for micro-alignment of tags, technical badges, and compact data cells. Containers maintain snug, purposeful internal spacing to preserve an analytical, information-rich feel.

## Elevation & Depth
In alignment with 2D drafting conventions and flat engineering schematics, this system eliminates traditional blur-based drop shadows. Depth and hierarchical separation are achieved through:

1. **Hairline Structural Framing:** Surfaces are delimited using exact 1px solid borders (`#D0D7DE` for primary boundaries, `#E1E4E8` for subtle divisions).
2. **Tonal Planar Stacking:** Background planes use `#F6F8FA`, while focused panels, data cards, and interactive canvases step forward via crisp `#FFFFFF`.
3. **Drafting Offset Shadows (High Elevation Modals & Tooltips Only):** When an element must unequivocally float above the workspace (e.g., command bars, context palettes), employ a hard 1px or 2px offset border rather than soft blur:
   - Floating Elevation: `border: 1px solid #0F172A; box-shadow: 2px 2px 0px 0px rgba(15, 23, 42, 0.08);`
   - Active Dropdowns: `border: 1px solid #D0D7DE; box-shadow: 0px 4px 12px rgba(15, 23, 42, 0.04);`

## Shapes
Geometry is strictly regulated to reflect precise machine-tooled corners.

- **Base Radius (0.25rem / 4px):** Standard across interactive controls, input inputs, buttons, and badges. This subtle softening prevents visual harshness while sustaining an engineered, rectilinear profile.
- **Enclosures & Canvases (0.375rem to 0.5rem / 6px to 8px):** Used exclusively for large master panels, dialog windows, and outermost interface viewports.
- **Pill/Circular Radius (Fully Rounded):** Restricted purely to status indicator pips and dynamic quantitative counters nested inside tabular rows.

## Components

### Buttons
- **Primary:** Background `#0969DA`, text `#FFFFFF`, border `1px solid #0969DA`, radius `4px`. Hover state: `#1F6FEB`. Active state: `#0854AF`.
- **Secondary (Technical Outline):** Background `#FFFFFF`, text `#24292F`, border `1px solid #D0D7DE`, radius `4px`. Hover: background `#F6F8FA`, border color `#0F172A`.
- **Subtle / Ghost:** Background transparent, text `#57606A`, radius `4px`. Hover: background `#F6F8FA`, text `#24292F`.

### Inputs & Form Controls
- **Text Inputs:** Height 36px (dense) or 40px (standard). Background `#FFFFFF`, border `1px solid #D0D7DE`, font `Geist` 14px, placeholder `#57606A`. Focus state: border `1px solid #0969DA` with zero glow; optional `outline: 1px solid #0969DA` for crisp schematic focus ring.
- **Checkboxes & Radios:** 16x16px boxes. Border `1px solid #D0D7DE`, background `#FFFFFF`. Selected: background `#0969DA`, border `#0969DA` displaying a sharp white technical mark.

### Chips, Tags & Badges
- **Specification Chips:** Background `#F6F8FA`, border `1px solid #D0D7DE`, radius `4px`, padding `2px 8px`. Typography: `JetBrains Mono` label-sm, color `#24292F`.
- **Accent Indicators:** Background `rgba(9, 105, 218, 0.08)`, border `1px solid rgba(9, 105, 218, 0.3)`, text `#0969DA`.

### Cards & Panels
- **Structure:** Background `#FFFFFF`, border `1px solid #D0D7DE`, radius `6px`.
- **Panel Header:** Separated from body content by a continuous horizontal `1px solid #E1E4E8` rule. Padding is strictly modular: 12px or 16px internal padding.

### Lists & Data Tables
- **Data Rows:** Delimited by bottom border `1px solid #E1E4E8`. Hover effect triggers a full-row background shift to `#F6F8FA`.
- **Table Headers:** Background `#F6F8FA`, border-bottom `1px solid #D0D7DE`. Typography: `JetBrains Mono` 11px uppercase, tracking `0.05em`, color `#57606A`.

### Blueprint Specialized Components
- **Coordinate Crosshairs & Hairline Dividers:** Hairline rules (`1px solid #E1E4E8`) crossing key data groupings, occasionally augmented with corner crosshair glyphs (`+`) in `#57606A` at the intersection of master grid containers.
- **Dimension Labels:** Monospaced numerical values pinned alongside primary axes with connecting tick marks in `#D0D7DE`.