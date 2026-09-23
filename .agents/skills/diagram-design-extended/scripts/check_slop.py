#!/usr/bin/env python3
"""Anti-slop gate for diagram HTML, with no third-party deps.

    python3 <skill-dir>/scripts/check_slop.py my-diagram.html [more.html ...]
    python3 <skill-dir>/scripts/check_slop.py --handoff draft.txt
    ... | python3 <skill-dir>/scripts/check_slop.py --handoff -

Scans visible text only: page prose, SVG <text>/<title>/<desc>, and
aria-label attributes. Skips <style> and <script> bodies entirely.
Punctuation tells (em dashes, spaced en dashes, curly quotes, chatbot
phrases) and title-case headings are errors; vocabulary, hedging, and
bold-lead-in restatement tells are warnings. --handoff runs the same
tables over plain text (a draft chat message) without HTML parsing.
Exit 0 clean or warnings-only, exit 1 on errors or unreadable input.

Rationale and the diagram-specific pattern list: references/anti-slop.md.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

EM_DASH = "\u2014"
EN_DASH = "\u2013"
CURLY = {"\u2018", "\u2019", "\u201c", "\u201d"}

CHATBOT_PHRASES = (
    "i hope this helps",
    "let me know if",
    "great question",
    "you're absolutely right",
    "certainly!",
    "of course!",
)

# word -> suggested replacement (warnings)
VOCAB = {
    "delve": "dig into / examine",
    "tapestry": "mix (or name the parts)",
    "testament": "proof / sign",
    "pivotal": "key",
    "crucial": "key / important",
    "vibrant": "(cut, or name the colors)",
    "seamless": "(cut, or name the mechanism)",
    "seamlessly": "(cut, or name the mechanism)",
    "robust": "strong / tested",
    "intricate": "complex / detailed",
    "foster": "help / grow",
    "fostering": "helping / growing",
    "garner": "get / earn",
    "enduring": "lasting",
    "interplay": "interaction",
    "groundbreaking": "new / first",
    "renowned": "well-known",
    "stunning": "(cut, or say what it looks like)",
    "breathtaking": "(cut, or say what it looks like)",
    "nestled": "in / inside",
    "showcase": "show",
    "showcasing": "showing",
    "underscore": "show / stress",
    "underscores": "shows / stresses",
    "elevate": "raise / improve",
    "empower": "let / enable",
    "unleash": "release / enable",
    "leverage": "use",
    "leveraging": "using",
    "utilize": "use",
    "utilizes": "uses",
    "utilizing": "using",
    "facilitate": "help / enable",
    "facilitates": "helps / enables",
    # hedging and filler (single words; multi-word kin live in PHRASES)
    "arguably": "(cut, or commit to the claim)",
    "various": "(name them, or give the count)",
    "numerous": "many (or give the count)",
    "myriad": "many",
    "countless": "many",
    "plethora": "many",
    "essentially": "(cut)",
    "basically": "(cut)",
}

PHRASES = {
    "serves as": "is",
    "stands as": "is",
    "acts as a": "is a",
    "boasts": "has",
    "in order to": "to",
    "due to the fact that": "because",
    "it is important to note that": "(delete)",
    "not just": "(state the point directly)",
    # hedging and filler
    "it's worth noting": "(delete)",
    "it is worth noting": "(delete)",
    "it should be noted": "(delete)",
    "worth mentioning": "(delete)",
    "needless to say": "(delete)",
    "a number of": "several (or the count)",
    "a variety of": "(name them)",
    "a wide range of": "(name them)",
}

WORD_RE = re.compile(r"[a-z']+")
# unspaced digit-hyphen-digit ranges are fine; only spaced en dashes are a tell
SPACED_EN_DASH_RE = re.compile(r"\s\u2013\s")

SKIP_CONTENT = {"style", "script"}
ARIA_ATTRS = {"aria-label"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "title"}
STRONG_TAGS = {"strong", "b"}

# small words that stay lowercase in real title case; a lowercase one is
# not evidence against title case
TITLE_SMALL_WORDS = {
    "a", "an", "the", "and", "or", "nor", "but", "of", "in", "on", "at",
    "to", "for", "with", "by", "from", "as", "is", "are", "vs", "via",
    "per", "into", "over", "under",
}
TITLE_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\u2019-]*")

# for bold-lead-in restatement matching
RESTATE_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "in", "on", "to", "for", "with",
    "is", "are", "was", "were", "has", "have", "had", "this", "that",
    "these", "those", "it", "its", "as", "by", "from", "at", "be", "not",
    "but", "into", "about", "your", "you", "we", "our", "their", "they",
    "will", "can", "each", "all", "when", "then", "than", "more", "most",
}
MD_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.*)$")
MD_BOLD_LEAD_RE = re.compile(r"\*\*([^*\n]{1,60})\*\*[:.]?\s*([^\n]*)")


def is_title_case(segment: str) -> bool:
    """True when a heading segment reads Like This Title Case.

    Deterministic tell: at least three capitalized ordinary words after
    the first, and no lowercase non-small word anywhere after the first.
    Sentence-case headings keep at least one lowercase ordinary word, so
    they pass, and short proper-noun runs stay under the threshold.
    """
    words = TITLE_WORD_RE.findall(segment)
    if len(words) < 4:
        return False
    rest = words[1:]
    caps = 0
    for w in rest:
        if w.isupper():  # acronym / microcopy, not evidence either way
            continue
        if w[0].isupper():
            caps += 1
        elif w.casefold() not in TITLE_SMALL_WORDS:
            return False
    return caps >= 3


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "ly", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def _words_match(a: str, b: str) -> bool:
    sa, sb = _stem(a), _stem(b)
    if sa == sb:
        return True
    shorter = min(len(sa), len(sb))
    return shorter >= 4 and (sa.startswith(sb) or sb.startswith(sa))


def restated_word(lead: str, following: str) -> str | None:
    """First content word of the bold lead-in that the next sentence reuses."""
    lead_words = [
        w for w in WORD_RE.findall(lead.casefold())
        if len(w) >= 4 and w not in RESTATE_STOPWORDS
    ]
    if not lead_words:
        return None
    first_sentence = re.split(r"(?<=[.!?])\s", following.strip(), maxsplit=1)[0]
    sentence_words = [
        w for w in WORD_RE.findall(first_sentence.casefold())
        if len(w) >= 4 and w not in RESTATE_STOPWORDS
    ]
    for lw in lead_words:
        for sw in sentence_words:
            if _words_match(lw, sw):
                return lw
    return None


class VisibleTextParser(HTMLParser):
    """Collects visible text chunks with approximate line numbers.

    Each chunk is (line, text, kind); kind is "heading" inside
    h1-h6/<title> (HTML head or SVG), "strong" inside <strong>/<b>,
    else "text".
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.chunks: list[tuple[int, str, str]] = []
        self._skip_depth = 0
        self._heading_depth = 0
        self._strong_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        if tag in SKIP_CONTENT:
            self._skip_depth += 1
        elif tag in HEADING_TAGS:
            self._heading_depth += 1
        elif tag in STRONG_TAGS:
            self._strong_depth += 1
        line = self.getpos()[0]
        for key, value in attrs:
            if key.casefold() in ARIA_ATTRS and value:
                self.chunks.append((line, value, "text"))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag in SKIP_CONTENT and self._skip_depth:
            self._skip_depth -= 1
        elif tag in HEADING_TAGS and self._heading_depth:
            self._heading_depth -= 1
        elif tag in STRONG_TAGS and self._strong_depth:
            self._strong_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if not data.strip():
            return
        if self._heading_depth:
            kind = "heading"
        elif self._strong_depth:
            kind = "strong"
        else:
            kind = "text"
        self.chunks.append((self.getpos()[0], data, kind))


def check_tables(line: int, text: str) -> tuple[list[str], list[str]]:
    """Punctuation, phrase, and vocabulary tables for one text chunk."""
    errors: list[str] = []
    warnings: list[str] = []
    if EM_DASH in text:
        errors.append(
            f"line {line}: em dash in visible text — use a period, comma, or middot: {text.strip()[:70]!r}"
        )
    if SPACED_EN_DASH_RE.search(text):
        errors.append(
            f"line {line}: spaced en dash used as a dash substitute: {text.strip()[:70]!r}"
        )
    found_curly = sorted(c for c in CURLY if c in text)
    if found_curly:
        errors.append(
            f"line {line}: curly quote(s) {' '.join(found_curly)} — use straight quotes: {text.strip()[:70]!r}"
        )
    lowered = text.casefold()
    for phrase in CHATBOT_PHRASES:
        if phrase in lowered:
            errors.append(f"line {line}: chatbot phrase {phrase!r} in deliverable text")
    for phrase, fix in PHRASES.items():
        if phrase in lowered:
            warnings.append(f"line {line}: {phrase!r} — prefer {fix!r}")
    for word in WORD_RE.findall(lowered):
        if word in VOCAB:
            warnings.append(f"line {line}: AI-vocabulary word {word!r} — prefer {VOCAB[word]!r}")
    return errors, warnings


def check_heading(line: int, text: str) -> list[str]:
    """Title-case check per middot-separated heading segment."""
    errors: list[str] = []
    for segment in text.split("\u00b7"):
        if is_title_case(segment):
            errors.append(
                f"line {line}: title-case heading, house style is sentence case: {segment.strip()[:70]!r}"
            )
    return errors


def scan(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    parser = VisibleTextParser()
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()

    chunks = parser.chunks
    for index, (line, text, kind) in enumerate(chunks):
        chunk_errors, chunk_warnings = check_tables(line, text)
        errors.extend(chunk_errors)
        warnings.extend(chunk_warnings)
        if kind == "heading":
            errors.extend(check_heading(line, text))
        elif kind == "strong":
            lead = text.strip().rstrip(":.")
            if 0 < len(lead.split()) <= 8:
                following = ""
                for _, next_text, next_kind in chunks[index + 1:]:
                    if next_kind != "text":
                        break
                    following += next_text
                    if len(following) >= 240:
                        break
                word = restated_word(lead, following.lstrip(" :.,"))
                if word:
                    warnings.append(
                        f"line {line}: bold lead-in {lead[:40]!r} restated by the sentence after it "
                        f"(shared word {word!r}); state new detail or drop the bold label"
                    )

    return errors, warnings


def scan_handoff(text: str) -> tuple[list[str], list[str]]:
    """Plain-text mode: same tables over a draft chat message, no HTML parsing.

    Skips fenced code blocks. Markdown headings get the title-case check;
    **bold**: lead-ins get the restatement check.
    """
    errors: list[str] = []
    warnings: list[str] = []
    in_fence = False
    for line_no, line in enumerate(text.splitlines(), start=1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        chunk_errors, chunk_warnings = check_tables(line_no, line)
        errors.extend(chunk_errors)
        warnings.extend(chunk_warnings)
        heading = MD_HEADING_RE.match(line)
        if heading:
            errors.extend(check_heading(line_no, heading.group(1)))
        for match in MD_BOLD_LEAD_RE.finditer(line):
            lead = match.group(1).strip().rstrip(":.")
            if not 0 < len(lead.split()) <= 8:
                continue
            word = restated_word(lead, match.group(2))
            if word:
                warnings.append(
                    f"line {line_no}: bold lead-in {lead[:40]!r} restated by the sentence after it "
                    f"(shared word {word!r}); state new detail or drop the bold label"
                )
    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument(
        "--handoff",
        metavar="FILE|-",
        help="plain-text mode: check a draft chat message ('-' reads stdin)",
    )
    args = ap.parse_args()
    if not args.files and not args.handoff:
        ap.error("give at least one HTML file or --handoff")

    exit_code = 0
    total_files = 0
    total_errors = 0
    total_warnings = 0

    def report(label: str, errors: list[str], warnings: list[str]) -> None:
        nonlocal exit_code, total_errors, total_warnings
        total_errors += len(errors)
        total_warnings += len(warnings)
        for message in errors:
            print(f"ERROR {label}: {message}")
        for message in warnings:
            print(f"WARN  {label}: {message}")
        if not errors and not warnings:
            print(f"OK {label}")
        if errors:
            exit_code = 1

    for path in args.files:
        total_files += 1
        if not path.is_file():
            print(f"ERROR {path}: not a file")
            exit_code = 1
            continue
        errors, warnings = scan(path)
        report(str(path), errors, warnings)

    if args.handoff:
        total_files += 1
        if args.handoff == "-":
            label = "<handoff>"
            text = sys.stdin.read()
        else:
            handoff_path = Path(args.handoff)
            label = args.handoff
            if not handoff_path.is_file():
                print(f"ERROR {label}: not a file")
                print(
                    f"Summary: {total_files} file(s), {total_errors} error(s), {total_warnings} warning(s)."
                )
                return 1
            text = handoff_path.read_text(encoding="utf-8")
        errors, warnings = scan_handoff(text)
        report(label, errors, warnings)

    print(f"Summary: {total_files} file(s), {total_errors} error(s), {total_warnings} warning(s).")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
