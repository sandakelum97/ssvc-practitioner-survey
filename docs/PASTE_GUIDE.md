# Filling the SSVC definitions in `site/index.html`

Open `site/index.html` in VS Code. Press **Ctrl+F** and search for `[PASTE 1]`.
Replace the whole `[PASTE 1]` (brackets included) with the text named below,
copied exactly from the official page. Then search for `[PASTE 2]`, and so on.

Copy **only the definition text** from the Definition column: not the value
name, not the key letter.

## System Exposure: slots 1 to 4

Page: https://certcc.github.io/SSVC/reference/decision_points/system_exposure/
Use the box at the top titled **System Exposure (ssvc:EXP:1.0.1)**.
Do not use the "Prior Versions" box (it says "Unavoidable").

| Slot | Copy from |
| --- | --- |
| `[PASTE 1]` | The line directly under the box title (starts "The Accessible Attack Surface") |
| `[PASTE 2]` | Row **Small**, Definition column |
| `[PASTE 3]` | Row **Controlled**, Definition column (the whole long paragraph) |
| `[PASTE 4]` | Row **Open**, Definition column |

## Safety Impact: slots 5 to 8

Page: https://certcc.github.io/SSVC/reference/decision_points/safety_impact/
Use the box titled **Safety Impact (ssvc:SI:2.0.1)**. If the page shows a
different current version, stop and check which version your
`deployer_decision_table` uses before pasting.

| Slot | Copy from |
| --- | --- |
| `[PASTE 5]` | Row **Negligible**, Definition column (the whole paragraph) |
| `[PASTE 6]` | Row **Marginal**, Definition column |
| `[PASTE 7]` | Row **Critical**, Definition column |
| `[PASTE 8]` | Row **Catastrophic**, Definition column |

## Mission Impact: slots 9 to 12

Page: https://certcc.github.io/SSVC/reference/decision_points/mission_impact/
Use the box titled **Mission Impact (ssvc:MI:2.0.0)**.

| Slot | Copy from |
| --- | --- |
| `[PASTE 9]` | Row **Degraded**, Definition column |
| `[PASTE 10]` | Row **MEF Support Crippled**, Definition column |
| `[PASTE 11]` | Row **MEF Failure**, Definition column |
| `[PASTE 12]` | Row **Mission Failure**, Definition column |

## Action: slots 13 to 16

Page: https://certcc.github.io/SSVC/howto/deployer_tree/
Scroll to **Deployer Decision Outcomes**. Use the table **after** the sentence
"A more specific interpretation for the priority levels for deployers is as
follows" (columns: Deployer Priority, Description). Not the
"(ssvc:DSOI:1.0.0)" table above it, which only repeats the names.

| Slot | Copy from |
| --- | --- |
| `[PASTE 13]` | Row **Defer**, Description column |
| `[PASTE 14]` | Row **Scheduled**, Description column |
| `[PASTE 15]` | Row **Out-of-cycle**, Description column |
| `[PASTE 16]` | Row **Immediate**, Description column |

## Human Impact: nothing to paste

Already filled in: your corrected definitions from pull request #1254, the
official 4×4 table (ssvc:DT_HI:1.0.0), and a note flagging that the published
text differs in five combinations (A40).

## Check

Search for `[PASTE` in the file. There should be **no results inside
`<template id="definitions">`** (the explanatory comment above it may still
mention the word). The page itself also refuses to start if any slot is left.

## Watch for

- Keep any `&` in the pasted text as `&amp;` (none is expected).
- The "Controlled" and Safety Impact paragraphs are long; paste them whole.
- Save the file as UTF-8 (VS Code does this by default).
