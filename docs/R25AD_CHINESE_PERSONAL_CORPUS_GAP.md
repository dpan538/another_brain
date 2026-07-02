# R25AD Chinese Personal Corpus Gap

R25AD reads only the reviewed R25L corpus splits and existing ignored R25AC
reports. It does not rewrite corpus files, generate new corpus rows, train, or
approve training.

## Current R25L Mix

The current R25L corpus has `2400` rows:

- `zh`: `800`, share `0.3333333333333333`.
- `mixed`: `800`, share `0.3333333333333333`.
- `en`: `800`, share `0.3333333333333333`.

That balanced history is useful, but it is insufficient for the new
Chinese-first personal direction. The target remains:

- `zh`: minimum `70%`.
- `mixed`: target `20%`.
- `en`: maximum `10%`, except when a technical boundary requires English.

## Expansion Estimate

If the future selected pool is `3000` rows, the target is `2100 zh`, `600
mixed`, and `300 en`; from current R25L this needs at least `1300` additional
reviewed zh rows and an English cap or downselection.

If the future selected pool is `5000` rows, the target is `3500 zh`, `1000
mixed`, and `500 en`; from current R25L this needs at least `2700` additional
reviewed zh rows and `200` additional reviewed mixed rows, plus an English cap
or downselection.

If the future selected pool is `10000` rows, the target is `7000 zh`, `2000
mixed`, and `1000 en`; from current R25L this needs at least `6200` additional
reviewed zh rows and `1200` additional reviewed mixed rows.

Retaining every current English row while meeting `en <= 10%` requires at least
`8000` total rows. At that floor, the pool would need `5600 zh`, `1600 mixed`,
and `800 en`, so the gap is `4800` additional reviewed zh rows and `800`
additional reviewed mixed rows.

## R25AE Direction

R25AE should be a corpus-expansion review pass, not training. It should add or
select reviewed Chinese-first project/style rows that cover project
continuity, repair after weak answers, local-first static-browser reasoning,
style preference, tool-status honesty, and bounded judgment.

Upsampling alone is risky because R25AC already achieved the sampled
Chinese-first mix while regressing against R25S. The next step is better
reviewed zh and mixed data, not automatic scale.
