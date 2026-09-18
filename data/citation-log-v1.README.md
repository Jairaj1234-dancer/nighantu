# citation-log-v1.csv

The first citation panel log, 17 and 18 September 2026, kept for history and not compared
against by any script.

It was scored by a matcher that counted any of our words anywhere in the answer, including
the bare word "nighantu". That is the generic Sanskrit term for an Ayurvedic lexicon, so
prompts like "What is a nighantu in Ayurveda?" and "Who publishes the Nighantu?" recorded as
citations while the model was quoting seven other sites and had never seen ours. Prompts that
name the brand were caught the same way: the answer echoes the words the question supplied.

Verified by re-asking both: neither answer referenced the site. The headline 8 of 54 was
really 6 of 54.

data/citation-log.csv is scored the corrected way: a citation requires the domain in the
answer or in Gemini's own source list, and an unprompted brand mention is recorded separately
as evidence of a lesser kind.
