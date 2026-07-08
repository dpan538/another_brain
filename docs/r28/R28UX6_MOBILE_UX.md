# R28UX6 Mobile UX

R28UX6 prioritizes the mobile chat flow.

## Mobile Rules

At `max-width: 720px`:

- the app shell uses full width with no horizontal scroll
- Chat Mode keeps the conversation first
- the composer is sticky at the bottom with safe-area padding
- buttons are large enough for touch
- Dashboard Mode stacks panels and controls
- the loading panel fits within `100svh`
- loading steps and buttons stack without overflow

## Waiting Experience

The loading screen uses a small local SVG animation, a progress bar, and plain local-only copy so first load can take tens of seconds without feeling like a blank page.
