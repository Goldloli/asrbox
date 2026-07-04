# ASRbox Frontend Audit

Date: 2026-07-04

## Screens Captured

1. `01-transcribe.png` - core transcription workspace
2. `02-tasks.png` - task queue and inspector
3. `03-models.png` - model management
4. `04-providers.png` - provider management
5. `05-exports.png` - export queue
6. `06-settings.png` - settings
7. `07-mobile-transcribe.png` - mobile transcription workspace
8. `08-mobile-settings.png` - mobile settings

## Overall Score

7.1 / 10

The frontend is already coherent and usable. It feels like a serious local workstation rather than a throwaway demo. The main gap is not taste basics, but hierarchy: too many panels, borders, empty centers, and secondary controls share the same visual weight.

## What Works

- The dark workstation direction fits an ASR tool.
- Amber is used consistently as the active and primary accent.
- The app shell is stable and predictable.
- Radix-based controls give the product a solid interaction foundation.
- Settings is the strongest screen because its controls are grouped clearly and the primary save action has presence.

## Main Issues

1. Visual hierarchy is flat. Primary work, secondary settings, status, and empty states use similar panel surfaces.
2. Empty states are too passive. They explain what is missing, but rarely offer the next best action.
3. Icon-only navigation is compact but hard to learn, especially on narrow screens.
4. The top and bottom status areas are present but visually underpowered. Error status is visible, but not very actionable.
5. Mobile layout technically renders, but the fixed left sidebar consumes too much width and the bottom bar crowds the content.
6. Repeated panel headers and small uppercase labels make pages feel templated after a few screens.
7. Muted gray text may be too low contrast in several helper and empty-state areas.

## Highest-Leverage Improvements

1. Rebuild hierarchy around one primary canvas per page.
2. Make empty states action-oriented, with one clear next action.
3. Replace mobile sidebar with a compact bottom nav or top drawer.
4. Create stronger surface levels: primary canvas, secondary inspector, status strip.
5. Give backend-offline states a recovery path, not just a badge.
6. Reduce repeated panel styling. Use spacing and section rhythm where a full card is not needed.
7. Make task and model pages more data-rich when populated, using compact rows and clear status columns.

