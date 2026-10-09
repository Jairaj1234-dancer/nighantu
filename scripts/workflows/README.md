# Workflow scripts, version-controlled

The Workflow tool persists each run's script under the session directory, which is local and
ephemeral. These are the copies that matter: the prompt text IS the method for anything a judgement
pass produced, so a published figure whose prompt lives only in a temp directory is a figure nobody
can reproduce.

`label-dose-vs-formulary.js` produced the 129 rows on
`/choosing/label-dose-against-the-formulary/`. Its rules name the four parse traps that each
produced a wrong number about a named company before they were pinned, the kashayam confound, and
the eight-value relation vocabulary. The relation it reports is a cross-check: the published value
is recomputed arithmetically by `scripts/dose-comparison.mjs` after converting units, because
comparing two ranges is not a judgement and one of those recomputations caught a `2 to 5 g` versus
`250 to 500 mg` row the arithmetic had called "entirely below".
