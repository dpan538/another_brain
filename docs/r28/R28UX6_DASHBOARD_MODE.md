# R28UX6 Dashboard Mode

Dashboard Mode preserves the engineering transparency panels without making them the default user experience.

## Contents

Dashboard Mode includes:

- delivery/runtime summary
- q4 model path self-check
- RAG/evidence details
- process trace
- release blockers
- local context bridge controls
- public debug packet view

## Toggle

Desktop and mobile both expose a Chat/Dashboard segmented toggle. `data-ui-mode="dashboard"` hides chat-only status badges and reveals dashboard-only panels. `data-ui-mode="chat"` hides the tables and process panels.

## Self-Check Behavior

The self-check buttons remain in Dashboard Mode. Repeated clicks use the existing controller cancellation path so a new deep check does not create a worker storm.
