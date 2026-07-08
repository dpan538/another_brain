# R28SURF4 Style Profile

The style profile is stored in:

```text
data/training_registry/r28surf4_style_profile.json
```

## Rules

- short by default
- bounded
- not customer-service toned
- not oily or over-apologetic
- evidence-aware
- allowed to make a judgment
- product architecture appears only for runtime/status questions

## Implementation

- `src/browser_runtime/router/natural_surfaces.ts`
- `src/browser_runtime/router/surface_variation.ts`
- `src/browser_runtime/router/r28surf2_surface_composer.ts`
- `src/browser_runtime/router/answer_surface_composer.ts`
- `web/another_brain_chat/browser_runtime.js`

The source router and browser runtime both set `answer_bank=false` and `broad_answer_bank=false` for these surfaces.
