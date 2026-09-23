# Anti-slop — the writing gate for diagram text

Every diagram ships surrounded by words: the title, the desc, the subtitle,
node labels, arrow labels, tradeoff lines, the handoff message. AI-tell
patterns in those words undo the visual craft. This reference adapts the
unslop skill's pattern list to diagram surfaces and backs it with a
deterministic checker:

```
python3 scripts/check_slop.py <file>.html
python3 scripts/check_slop.py --handoff draft.txt   # or --handoff - for stdin
```

Run it with the other gates. It scans visible text only (page prose, SVG
`<text>`, `<title>`, `<desc>`, aria-labels), never CSS or the motion
controller. Punctuation tells and title-case headings are errors;
vocabulary, hedging, and bold-lead-in tells are warnings that you fix or
consciously keep. `--handoff` runs the same tables over plain text (your
draft chat message) with no HTML parsing: markdown `#` headings get the
title-case check and `**bold**:` lead-ins get the restatement check.

## Hard rules (checker errors)

1. **No em dashes in visible text.** The clearest AI tell. Use a period, a
   comma, or the middot separator that diagram microcopy already uses
   (`FLOWCHART · META`). Not parentheses, not a spaced en dash, not a
   hyphen pair. If a thought needs separation, end the sentence.
2. **No spaced en dashes.** `x – y` as a dash substitute is the same tell in
   a different suit. Unspaced numeric ranges (`6-10px`, `2019-2024`) are
   fine with a plain hyphen.
3. **No curly quotes.** Straight quotes only. Curly apostrophes count.
4. **No chatbot phrases.** "I hope this helps", "Let me know if", "Great
   question" have no business inside a deliverable file.
5. **No title-case headings.** House style is sentence case, in heading
   elements (`h1`-`h6`, `<title>`) and SVG `<title>` text alike. "Payment
   pipeline overview", not "Payment Pipeline Overview". Proper nouns keep
   their capitals; the checker flags a heading only when every ordinary
   word after the first is capitalized. Middot-separated eyebrow segments
   are checked per segment, so `Flowchart · Meta` stays legal.

## Vocabulary rules (checker warnings)

6. **AI vocabulary.** delve, tapestry, testament, pivotal, crucial, vibrant,
   seamless, robust, intricate, foster, garner, enduring, interplay,
   groundbreaking, renowned, stunning, breathtaking, nestled, showcase,
   underscore (verb), elevate, empower, harness (verb), unleash, leverage,
   utilize, facilitate. Use the plain word: use, help, show, key, strong.
7. **Fancy "is".** "serves as", "stands as", "acts as", "boasts",
   "features" (verb). Say "is" or "has".
8. **Filler.** "in order to" is "to"; "due to the fact that" is "because";
   "it is important to note that" is deleted; "not just X, but Y" states
   the point directly.
9. **Hedging and filler words.** "it's worth noting" / "it should be
   noted" / "worth mentioning" / "needless to say" are deleted; "arguably"
   is cut (commit to the claim or drop it); "various", "numerous",
   "myriad", "countless", "plethora", "a number of", "a variety of",
   "a wide range of" become a count or the actual names; "essentially"
   and "basically" are cut.
10. **Bold-lead-in restatement.** `<strong>X</strong>` or `**X**:` followed
    by a sentence that restates X is the inline-header-list tell. Warning,
    not error, because a bold lead-in followed by genuinely new detail is
    legitimate (see "What is NOT slop here"). Fix by making the sentence
    say something the label does not, or by dropping the label.

## Diagram-specific applications

- **Node labels name the thing, not its virtue.** "Auth service", never
  "Robust auth layer". A label that praises is a label that lies about
  scope.
- **The `<desc>` states what the diagram shows, mechanically.** "Flowchart
  showing a request passing a token gate, then routing to one of three
  handlers." No "illustrating the seamless interplay between".
- **Tradeoff lines name real costs.** "Costs: hides retry logic" beats
  "Costs: some nuance". If the cost can't be named concretely, the variant
  doesn't disagree enough (variants.md rule 1).
- **Eyebrows and legends are label surfaces, not prose.** Middots, nouns,
  no verbs needed.
- **Rule of three in bullets and captions.** Two reasons or four are as
  likely as three; use the natural number.
- **The handoff message follows the same rules.** The chat text where you
  present the diagram is part of the deliverable's first impression.

## What is NOT slop here

- Middots (`·`) in eyebrows and legends: house style, keep them.
- Monospace uppercase microcopy (`USER OK`, `SCRIPTS PASS`): labels, not
  prose.
- Repetition of a term across labels: synonym cycling is the tell,
  repetition is the fix. One name per concept, everywhere (§1 philosophy).
- A bold lead-in that ends in a period and is followed by genuinely new
  detail. The tell is the bold label whose sentence restates it.

## Order of operations

Write the diagram text plainly from the start, run `check_slop.py` with the
other gates, run the draft handoff message through `--handoff`, and
self-audit once before handing over: "what makes this text obviously AI
generated?" Rule of three and synonym cycling stay self-audit-only: three
items are sometimes the natural count, and synonym cycling needs semantics
no script has, so the checker stays silent on both. Fix what you find. Removing tells is half the job;
the other half is having something specific to say, and diagram text earns
that by naming mechanisms, counts, and costs.
