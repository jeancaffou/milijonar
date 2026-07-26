# Design System

## Theme

Dark, high-contrast archival interface inspired by the programme's deep indigo, blue, gold, green, and red visual language. Information hierarchy takes priority over decoration.

## Typography

- Display headings: Barlow Condensed from Google Fonts, weights 500 to 700.
- Interface and body: Figtree from Google Fonts, weights 400 to 700.
- Body prose is capped near 72 characters; tabular figures use tabular numerals.

## Colour

- Indigo-black page background and violet-blue raised surfaces.
- Warm gold for navigation, focus, key labels, and selected states.
- Green for correct outcomes, red for incorrect outcomes, blue and violet for supporting data.
- Neutrals are tinted toward indigo; pure black and white are avoided.

The source of truth is the OKLCH token set at the top of `src/assets/css/catalog.css`.

## Layout

- Maximum content width: 90rem, with responsive side gutters.
- Page heroes establish title and essential context, followed by dense ledgers, ranked lists, charts, or complete records.
- Spacing varies by hierarchy; related data stays visually grouped without nested card stacks.
- Mobile layouts collapse structurally and must not create document-level horizontal overflow.

## Components

- Shared site header, navigation, breadcrumbs, search, and footer from `lib/render.mjs`.
- Section headings use restrained uppercase eyebrow labels and direct titles.
- Statistical comparisons use accessible bars, ranked lists, and tables with text values, never colour alone.
- Native `details` elements provide progressive disclosure for long supporting material.
- Archive images remain centred, uncropped, and linked to their full JPG.

## Interaction

Transitions are brief and use the shared exponential ease-out token. Focus indicators are explicit. Controls retain familiar browser behaviour and meaningful accessible names.
