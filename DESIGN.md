---
name: LitFolio
description: A local-first research workspace for reading, annotating, and synthesizing academic papers.
colors:
  deep-ink: "#0a0a0f"
  warm-paper: "#121218"
  elevated-panel: "#1a1a23"
  quiet-line: "#26262f"
  muted-ink: "#6b6b78"
  primary-text: "#e8e8ee"
  violet-mist: "#a78bfa"
  arctic-blue: "#7dd3fc"
  signal-amber: "#fbbf24"
  signal-emerald: "#34d399"
  signal-red: "#f87171"
  plum-glow: "#1b1623"
  pdf-dark-bg: "#15131d"
typography:
  display:
    fontFamily: "Lora, ui-serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Lora, ui-serif, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "\"cv02\", \"cv03\", \"cv04\", \"cv11\""
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.05em"
    textTransform: "uppercase"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "10px"
spacing:
  compact: "8px"
  standard: "16px"
  generous: "24px"
  row: "14px"
components:
  button-primary:
    backgroundColor: "{colors.violet-mist}"
    textColor: "#0a0a0f"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "#b497fd"
  button-secondary:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.elevated-panel}"
  input-field:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  input-field-focus:
    backgroundColor: "{colors.warm-paper}"
  card-panel:
    backgroundColor: "{colors.elevated-panel}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  nav-item-active:
    backgroundColor: "rgba(167, 139, 250, 0.09)"
    textColor: "{colors.violet-mist}"
---

# Design System: LitFolio

## 1. Overview

**Creative North Star: "The Research Desk"**

A well-lit surface in a dim room. Papers spread flat, annotations visible, tools within reach. LitFolio's interface is a reading desk, not a dashboard: the content (papers, highlights, evidence) occupies the foreground, and the chrome recedes into near-darkness. Density is deliberate; every pixel serves the researcher's flow of import, read, ask, and retain.

This system rejects the patterns PRODUCT.md names explicitly: generic chatbot shells where output disappears into scrolling transcripts, dashboard-heavy SaaS styling that prioritizes decoration over reading, and magic-looking AI flows that hide source provenance. It also rejects the visual cliches of its category: no neon-on-black "AI tool" aesthetic, no white-space-heavy "productivity app" template. The reference benchmark is Linear: dense, keyboard-driven, minimal chrome, information-first with precise spacing.

Glassmorphism is used deliberately on elevated surfaces (drawers, overlays, floating panels) to maintain the layered desk metaphor. Main content surfaces use tonal depth (paper, panel, ink) rather than blur.

**Key Characteristics:**
- Content-forward: the reading surface dominates; navigation and controls are narrow and quiet
- Tonal depth through three background layers (ink, paper, panel), not through shadows
- Violet accent used sparingly for state and emphasis, never for decoration
- Functional transitions only; no entrance choreography or decorative motion
- Dense typography with strong serif/sans contrast for hierarchy

## 2. Colors: The Night Paper Palette

A restrained dark palette: tinted near-blacks with a single violet accent and a sky-blue secondary. The plum-tinged body gradient (`#1b1623` to `#0a0a0f`) gives the dark ground warmth without competing with content.

### Primary
- **Violet Mist** (`#a78bfa`): Active navigation, interactive links, text selection highlights, focus indicators, term overlays. The only color that signals "this is interactive." Used on roughly 5-8% of any given screen.

### Secondary
- **Arctic Blue** (`#7dd3fc`): Reading-status indicators, secondary labels, saving-state feedback. A cooler complement that distinguishes "in progress" states from "active" states.

### Tertiary
- **Signal Amber** (`#fbbf24`): Warnings, unsaved/dirty state, must-read markers, PDF search highlights.
- **Signal Emerald** (`#34d399`): Success confirmations, saved state, completed reading status.
- **Signal Red** (`#f87171`): Error messages, destructive action labels. Used at 90% opacity in practice.

### Neutral
- **Deep Ink** (`#0a0a0f`): Body background base, deepest layer.
- **Warm Paper** (`#121218`): Card surfaces, input backgrounds, the "desk surface" layer.
- **Elevated Panel** (`#1a1a23`): Hover states, active panels, sidebar background, drawer surfaces.
- **Quiet Line** (`#26262f`): All borders and dividers. Fine, low-contrast, structural.
- **Muted Ink** (`#6b6b78`): Secondary text, metadata, timestamps, placeholder labels.
- **Primary Text** (`#e8e8ee`): Body text, headings, active labels. Near-white, never pure white.

### Named Rules
**The Rarity Rule.** The violet accent is the only color that signals interactivity. Its rarity is the point. If every other element is violet, the system has failed.

**The Tinted Neutral Rule.** No pure black (`#000`) or pure white (`#fff`) anywhere. Every neutral leans toward the plum undertone of the body gradient. This is what keeps the dark theme from feeling clinical.

## 3. Typography

**Display Font:** Lora (with Georgia, ui-serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)
**Mono Font:** JetBrains Mono (with ui-monospace fallback)

**Character:** The serif/sans pairing signals scholarship. Lora headings carry the weight of "this is a title worth reading"; Inter body text is engineered for long-session legibility at small sizes. JetBrains Mono gives code, DOIs, and model names a distinct texture without competing.

### Hierarchy
- **Display** (400, 1.5rem / 24px, line-height 1.25, tracking -0.02em): Page headings. Appears once per view in the page header. The serif texture is the brand signal.
- **Headline** (400, 1.125rem / 18px, line-height 1.3): Card titles, section headings within pages. Also serif. Carries authority without the scale of display.
- **Body** (400, 0.875rem / 14px, line-height 1.5): All readable text. Inter's OpenType alternates (`cv02`, `cv03`, `cv04`, `cv11`) are active. Max line length: 65-75ch in flowing content.
- **Label** (400, 0.6875rem / 11px, line-height 1.45, tracking 0.05em, uppercase): Section labels, field labels, metadata categories. The wide tracking and uppercase transform distinguish labels from body text at the same size.
- **Mono** (400, 0.875rem / 14px, line-height 1.5): Model names, DOIs, search term chips, note editing. JetBrains Mono's ligatures are off by default.

### Named Rules
**The Serif Anchor Rule.** Every page has exactly one serif heading at `text-2xl` in the header. If a view has no serif heading, it has no visual anchor; add one.

**The Label Case Rule.** Section labels and field labels are always uppercase with `0.05em` tracking. Never sentence case, never bold. The transform itself is the hierarchy signal.

## 4. Elevation

LitFolio uses glassmorphism for elevated surfaces and tonal layering for content depth. The system has three depth layers, each with a distinct background value:

1. **Ink** (`#0a0a0f`): The body, the void behind everything.
2. **Paper** (`#121218`): The working surface. Cards, inputs, the sidebar.
3. **Panel** (`#1a1a23`): Hover states, active panels, drawers.

Elevated overlays (QuickRead drawer, floating tooltips, modals) use `backdrop-blur` on a `bg-black/40` scrim with `bg-litera-paper` or `bg-litera-panel/80` content surfaces. This creates the "stacked papers on a desk" metaphor.

Shadows are minimal. The only shadow in the system is `shadow-2xl` on the drawer, which is functional (it separates the drawer from the blurred scrim) rather than ambient.

### Named Rules
**The Three-Layer Rule.** Every surface maps to ink, paper, or panel. If you need a fourth depth, you're over-nesting. Flatten.

**The Blur Boundary Rule.** Backdrop blur belongs to overlays and floating surfaces only. Main content (the page body, the sidebar, the reader panes) never uses blur. If the main content area has `backdrop-blur`, something is wrong.

## 5. Components

### Buttons
- **Shape:** Softly rounded (6px radius). Not pill, not sharp.
- **Primary:** Violet Mist (`#a78bfa`) background with near-black text (`#0a0a0f`). Padding 6px 12px. The most prominent interactive element on any screen; used for the single primary action.
- **Primary Hover:** Slightly lighter violet (`#b497fd`). Transition over 150ms.
- **Secondary:** Warm Paper background, Primary Text color, Quiet Line border. Same padding. The workhorse for secondary actions.
- **Secondary Hover:** Elevated Panel background. Border stays.
- **Ghost (if used):** No background, no border. Text-only. For tertiary actions in dense toolbars.

### Cards / Containers
- **Shape:** Gently curved (10px radius, the `--litera-radius` token).
- **Background:** Elevated Panel at 80% opacity with backdrop blur. The glassmorphism treatment.
- **Border:** 1px Quiet Line. Fine, structural, never decorative.
- **Internal Padding:** 16px 20px (`px-5 py-4`). Tighter than page padding; cards are dense.
- **Hover:** Background shifts to full Elevated Panel opacity (the blur remains).

### Inputs / Fields
- **Style:** Warm Paper background, Quiet Line border, 6px radius. Padding 6px 10px.
- **Focus:** 2px ring in Violet Mist at 40% opacity. No border color change; the ring is the focus signal.
- **Placeholder:** Muted Ink color.
- **Error:** Signal Red text below the field. Border does not change color; the text label is the error signal.

### Navigation
- **Shape:** Vertical column, 210px fixed width. Quiet Line right border.
- **Item:** 6px radius, 6px 10px padding. Body text size.
- **Default:** Primary Text at 80% opacity.
- **Hover:** Elevated Panel background, full Primary Text.
- **Active:** Violet Mist text on Violet Mist at 9% opacity background. The active state is the only nav item with a colored background.

### Chips / Tags
- **Style:** 6px radius (rounded-full equivalent at small sizes), Quiet Line border, `bg-litera-line/20` background. Body text size or smaller.
- **Search Term Chips:** Monospace font. Distinct from metadata chips by typeface alone.
- **Tag Chips:** Dynamic border and text color from tag data. The chip inherits its color; the system doesn't prescribe it.

### Page Header
- **Structure:** Quiet Line bottom border, `px-6 py-4` padding, flex row with heading left and subtitle right.
- **Heading:** Serif display, `text-2xl`, tight tracking. One per page.
- **Subtitle:** Body text size, Muted Ink color.

### Named Rules
**The One Accent Button Rule.** Each view has at most one Primary button visible at a time. If two primary actions compete, one must be downgraded to Secondary.

**The Dense Row Rule.** List rows (library items, search results) use `px-6 py-3.5` padding. They are tighter than cards because they are content, not containers. Don't inflate rows to card padding.

## 6. Do's and Don'ts

### Do:
- **Do** use the three-layer tonal system (ink, paper, panel) for all depth decisions. Map every surface to one of these three.
- **Do** keep the violet accent to interactive elements and active states only. Its rarity signals affordance.
- **Do** use serif (Lora) for exactly one heading per page view, at `text-2xl` with tight tracking.
- **Do** use `text-[11px] uppercase tracking-wider` for all section labels and field labels.
- **Do** use backdrop blur on overlays and floating surfaces only (drawers, tooltips, modals).
- **Do** use `transition-colors duration-150` on all interactive state changes.
- **Do** use Muted Ink (`#6b6b78`) for all secondary text, metadata, and timestamps.
- **Do** use Signal Amber for dirty/unsaved state and Signal Emerald for saved state. These are the only save-state colors.

### Don't:
- **Don't** use generic chatbot shells where output disappears into a scrolling transcript. PRODUCT.md names this as a primary anti-reference.
- **Don't** use dashboard-heavy SaaS styling that prioritizes decoration over reading and evidence. The content is the interface.
- **Don't** use magic-looking AI flows that hide source provenance or silently degrade on failure. Every AI output must show its sources.
- **Don't** use pure black (`#000`) or pure white (`#fff`). Every neutral is tinted toward the plum undertone.
- **Don't** use gradient text (`background-clip: text`). Emphasis comes from weight and size.
- **Don't** use side-stripe borders (colored `border-left` > 1px) on cards, list items, or callouts. Use full borders, background tints, or leading icons instead.
- **Don't** use identical card grids with icon + heading + text repeated endlessly. Vary the layout.
- **Don't** use modals as the first solution. Exhaust inline and progressive alternatives.
- **Don't** animate layout properties. Transitions are for color and opacity only.
- **Don't** use bounce or elastic easing curves. Ease out with exponential curves.
- **Don't** apply backdrop blur to main content areas (page body, sidebar, reader panes). Blur belongs to overlays only.
- **Don't** use more than one Primary button per visible view. Competing primaries are a design failure.
- **Don't** use the violet accent for decoration, backgrounds, or large surfaces. It is an interactive-state color, not a brand paint.
