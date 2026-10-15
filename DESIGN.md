---
version: alpha
name: Honoteca
description: A warm, tactile personal-library interface that places books inside a wooden room.
colors:
  background:
    dark: "#14110e"
    sepia: "#f2e6d0"
    light: "#f6f4ef"
  panel:
    dark: "#1d1913"
    sepia: "#eadac0"
    light: "#ffffff"
  ink:
    dark: "#eee6da"
    sepia: "#3a2f23"
    light: "#1f1c18"
  muted:
    dark: "#9a8f80"
    sepia: "#8d7c64"
    light: "#7f766b"
  primary: "#d99a2b"
  accent: "#d99a2b"
  danger: "#e0715f"
  room:
    darkStart: "#a8681a"
    darkEnd: "#8b5513"
    sepiaStart: "#c9a06a"
    sepiaEnd: "#a87f4e"
    lightStart: "#d9c4a2"
    lightEnd: "#c2a781"
typography:
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    lineHeight: "1.5em"
  controlLabel:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "1.2em"
    letterSpacing: "0.01em"
  bookTitle:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "1.3em"
rounded:
  small: "10px"
  control: "13px"
  panel: "24px"
  pill: "999px"
spacing:
  tight: "4px"
  compact: "8px"
  control: "12px"
  content: "16px"
  sheet: "24px"
components:
  iconButton:
    backgroundColor: "{colors.panel.dark}"
    textColor: "{colors.ink.dark}"
    rounded: "{rounded.control}"
    size: "38px"
  iconButtonActive:
    backgroundColor: "{colors.accent}"
    textColor: "#24180a"
    rounded: "{rounded.control}"
    size: "38px"
  primaryAction:
    backgroundColor: "{colors.accent}"
    textColor: "#24180a"
    rounded: "{rounded.pill}"
  mobileSheet:
    backgroundColor: "{colors.panel.dark}"
    textColor: "{colors.ink.dark}"
    rounded: "{rounded.panel}"
    padding: "{spacing.sheet}"
---

## Overview

Honoteca should feel like a personal reading room: warm wood, soft depth, physical books, and calm controls. The bookshelf and book covers carry the visual character; interface chrome stays quiet and legible. Dark is the default theme, with sepia and light preserving the same warm materials.

## Colors

The current theme variables live at the top of `src/index.css`. Use the active theme's background, panel, ink, and muted colors; do not hard-code a dark-theme foreground into a theme-aware control. Mustard `#d99a2b` is the single active accent for selected controls and primary actions. `#e0715f` communicates destructive actions. The room gradients are reserved for the page background and shelf environment.

Book covers, their extracted spine strips, and catalog art may be more colorful than the UI. Keep surrounding controls restrained so content remains the focus.

## Typography

Use the system stack already declared on `body` in `src/index.css`. Normal UI copy is 15px with a 1.5 line-height. Compact supporting text is generally 12–13px. Interactive labels must remain readable: the books-per-shelf label is 14px/700 on larger screens and 15px on phones.

Book data is content, not UI copy: preserve its original language and spelling. Interface strings use `t(spanish, english)` from `src/lib/i18n.js`.

## Layout

The header is sticky and flex-based. Below 899px it wraps into clear full-width rows, and below 520px the shelf/wishlist tabs fill their own row. Main content uses 16px desktop padding and 10–12px mobile padding. Phone book shelves use a 3–6 column grid driven by `--books-per-row`; cover widths reduce as columns increase.

Mobile detail and installation dialogs are bottom sheets. Keep them full width, flush to the bottom, with only their top corners rounded and safe-area-aware bottom padding.

## Elevation & Depth

Depth comes from layered room gradients, modest dark shadows, shelf fronts, and the books themselves. Existing controls use soft shadows such as `0 5px 14px rgba(0,0,0,.28)`. Avoid flat boxed panels behind the shelves: empty shelf rows intentionally have no inset wall rectangle. Book detail sheets have a stronger upward shadow because they float over the room.

## Shapes

Use 10–14px rounded rectangles for small controls, circular or pill shapes for focal actions, and 24px top sheet corners. Shared line icons come from `src/components/Icon.jsx`; they use `currentColor`, rounded strokes, and should retain their text or accessible name where meaning is not obvious.

## Components

`Header.jsx` contains view, theme, section, shelf-count, scan, and logout controls. Shelf count uses a labelled minus/value/plus stepper, never an unlabeled slider. `ShelfView.jsx` represents the physical shelves; `GridView.jsx` is the denser alternative. `BookDetail.jsx`, `DeleteDialog.jsx`, and `HomeScreenGuide.jsx` use the bottom-sheet treatment on mobile.

Controls have short transform/opacity transitions and must respect the reduced-motion overrides near the end of `src/index.css`. Book rearrangement uses View Transitions through `src/lib/vtx.js`; retain that movement when changing shelf/grid layout behavior.

## Do's and Don'ts

Do use theme variables, keep actions readable in every theme, preserve 44px touch targets on mobile, and reuse the shared icon component.

Do keep the warm wood room visible around the library and let books be the colorful elements.

Don't introduce a cool, saturated UI palette, opaque rectangular shelf backgrounds, tiny text-only mobile controls, or generic emoji/glyph icons beside the shared SVG icon language.

Don't add interface copy without Spanish and English variants, and don't change the language of a book title, publisher, or synopsis to match the interface.
