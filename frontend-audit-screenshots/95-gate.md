# ASRbox Frontend 95+ Quality Gate

This gate defines the pre-desktop-app frontend standard. It is intentionally score-based rather than task-count-based.

## Required Pages

- `/`
- `/tasks`
- `/models`
- `/settings`

## Required States

- Theme: light and dark.
- Density: comfortable and compact.
- Sidebar: icons and expanded.
- Viewport: 1280x820, 1440x900, and 390x844.

## Pass Criteria

- Primary action is visible on first load at 1280x820.
- No page has horizontal overflow at the required viewports.
- No page has clipped or unreadable button labels.
- No low-contrast body text, tabs, badges, form controls, or disabled states.
- Bottom audio player, bottom task bar, and mobile navigation do not cover primary actions.
- Empty, offline, error, and loading states show a clear next action.
- Keyboard focus is visible on navigation, icon buttons, menus, dialogs, tabs, and form controls.
- Pages read as a desktop workbench: compact toolbars, clear split panes, light borders, restrained shadows, and no nested card piles.
- Large route components are split into focused components before desktop-native capabilities are wired in.

## Scoring Rubric

- Information architecture: 95+
- Visual maturity: 95+
- Desktop workflow efficiency: 96+
- Light/dark contrast: 96+
- Window resizing and narrow viewport behavior: 94+
- Accessibility and keyboard affordance: 95+
- Maintainability: 92+
- Desktop readiness: 95+

## Commands

Run these before accepting a frontend quality stage:

```bash
npm run typecheck
npm run build:web
npm run audit:frontend
git diff --check
```

The visual audit writes screenshots and a JSON report to `frontend-audit-screenshots/95-gate/`.
