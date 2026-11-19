"""Read the organization of a paper and keep each excerpt tied to its original pages."""
import re
from collections import Counter

import pymupdf as pdf

from figures import CAPTION

NUMBERED = re.compile(r"^(\d{1,2}(?:\.\d{1,2})*)[.、) ]+\s*(?=[A-Za-z\u3400-\u9fff])")
CHAPTER = re.compile(r"^(?:[IVX]{1,6}[.、]\s+|第[一二三四五六七八九十〇零\d]+[章节篇]\s*|[一二三四五六七八九十]+、\s*)")
NOT_HEADING = re.compile(r"^(?:tables?\s*\d|表\s*\d|https?://|doi\s*:|©|\d+\s*$)|\.{3,}\s*\d+$", re.I)


def compact(value):
    return " ".join(value.split())


def title_key(title):
    return re.sub(r"[^\w]+", "", title.casefold())


def heading_key(title):
    return title_key(CHAPTER.sub("", NUMBERED.sub("", title, count=1), count=1))


def page_lines(pages):
    lines = []
    offsets = []
    for page_number, page in enumerate(pages, 1):
        offsets.append(len(lines))
        lines.extend({**line, "page": page_number, "text": compact(line["text"])} for line in page["lines"]
                     if line["text"].strip())
    return lines, offsets


def bookmark_anchors(path, pages, lines, offsets):
    with pdf.open(path) as document:
        toc = document.get_toc(simple=False)
    anchors = []
    for level, label, page, destination in toc:
        title = compact(label)[:200]
        if not title or not 1 <= page <= len(pages) or destination.get("kind") != pdf.LINK_GOTO:
            continue
        start = offsets[page-1]
        end = offsets[page] if page < len(pages) else len(lines)
        key = heading_key(title)
        match = next((i for i in range(start, end) if heading_key(lines[i]["text"]) == key), None)
        heading_line = match is not None
        point = destination.get("to")
        if match is None and point is not None and start < end:
            match = min(range(start, end), key=lambda i: abs(lines[i]["box"][1] - point.y))
        number = NUMBERED.match(lines[match]["text"] if heading_line else title)
        anchors.append({"title": title, "level": level, "page": page, "start": start if match is None else match,
                        "headingLine": heading_line, "number": number[1] if number else None})
    if any(a["page"] > b["page"] for a, b in zip(anchors, anchors[1:])):
        return []
    return anchors


def body_anchors(lines, pages, document_title):
    sizes = Counter()
    for row in lines:
        if len(row["text"]) >= 35 and row.get("size"):
            sizes[row["size"]] += len(row["text"])
    if not sizes:
        return []
    body_size = sizes.most_common(1)[0][0]
    appearances = Counter(row["text"] for row in lines)
    document_key = title_key(document_title)
    anchors = []
    for index, row in enumerate(lines):
        text, page = row["text"], row["page"]
        size = row.get("size", 0)
        y = row["box"][1]
        height = pages[page-1]["height"]
        if (len(text) > 140 or y < height * .04 or y > height * .94
                or (appearances[text] > 1 and (y < height * .1 or y > height * .88))
                or title_key(text) == document_key or CAPTION.match(text) or NOT_HEADING.search(text)
                or text.endswith(("。", "；", ";", "?", "？", ".", "!", "！")) or not re.search(r"[^\W\d_]", text)):
            continue
        number = NUMBERED.match(text)
        chapter = CHAPTER.match(text)
        if page == 1 and index < 3 and y < height * .16 and size > body_size * 1.7 and not (number or chapter):
            continue
        following = lines[index+1] if index+1 < len(lines) else None
        if not following:
            continue
        previous = lines[index-1] if index else None
        separated = not previous or previous["page"] != page or (
            y - previous["box"][3] >= body_size * .55 and following["page"] == page
            and following["box"][1] > y and len(following["text"]) >= 35
        )
        styled = row.get("bold") or size >= body_size * 1.10
        if not row.get("blockStart") or not (styled or ((number or chapter) and separated)):
            continue
        if not number and not chapter and (len(text.split()) > 14 or len(text) > 96 or "@" in text):
            continue
        level = len(number[1].split(".")) if number else 1
        anchors.append({"title": text, "level": level, "page": page, "start": index, "headingLine": True,
                        "size": size, "numbered": bool(number or chapter), "number": number[1] if number else None})
    if not anchors:
        return []
    major_size = max(item["size"] for item in anchors)
    for anchor in anchors:
        if not anchor["numbered"] and anchor["size"] < major_size * .87 and any(
            earlier["level"] == 1 and earlier["start"] < anchor["start"] for earlier in anchors
        ):
            anchor["level"] = 2
    return anchors


def add_numbered_subsections(bookmarks, headings):
    if any(a["start"] > b["start"] for a, b in zip(bookmarks, bookmarks[1:])):
        return bookmarks
    existing = {(item["page"], heading_key(item["title"])) for item in bookmarks}
    result = []
    for index, parent in enumerate(bookmarks):
        result.append(parent)
        if not parent["number"]:
            continue
        end = bookmarks[index+1]["start"] if index+1 < len(bookmarks) else float("inf")
        prefix = parent["number"] + "."
        for heading in headings:
            if (parent["start"] < heading["start"] < end and (heading["number"] or "").startswith(prefix)
                    and (heading["page"], heading_key(heading["title"])) not in existing):
                depth = heading["number"].count(".") - parent["number"].count(".")
                result.append({**heading, "level": parent["level"] + depth})
    return result


def excerpt(rows, maximum=2300):
    chunks = []
    for row in rows:
        if not chunks or chunks[-1][0] != row["page"]:
            chunks.append((row["page"], []))
        chunks[-1][1].append(row["text"])
    text = "\n".join(f"PDF 第 {page} 页：" + " ".join(values) for page, values in chunks)
    if len(text) <= maximum:
        return text
    piece = (maximum - 60) // 3
    middle = (len(text) - piece) // 2
    return "\n[…]\n".join((text[:piece], text[middle:middle+piece], text[-piece:]))


def collect(path, pages, document_title):
    lines, offsets = page_lines(pages)
    anchors = bookmark_anchors(path, pages, lines, offsets)
    headings = body_anchors(lines, pages, document_title)
    source = "bookmarks" if anchors else "headings"
    anchors = add_numbered_subsections(anchors, headings) if anchors else headings
    if not anchors:
        source = "pages"
        step = max(1, (len(pages) + 15) // 16)
        anchors = [
            {"title": f"PDF 第 {page} 页" if page == last else f"PDF 第 {page}–{last} 页",
             "level": 1, "page": page, "last": last, "start": offsets[page-1], "headingLine": False}
            for page in range(1, len(pages)+1, step) for last in [min(page+step-1, len(pages))]
        ]
    elif anchors[0]["page"] > 1 or sum(len(row["text"]) for row in lines[:anchors[0]["start"]]) > 400:
        anchors.insert(0, {"title": "目录前的正文", "level": 1, "page": 1, "start": 0, "headingLine": False})
    sections = []
    for index, anchor in enumerate(anchors):
        after = anchors[index+1] if index+1 < len(anchors) else None
        start = anchor["start"] + int(anchor["headingLine"])
        end = after["start"] if after else len(lines)
        rows = lines[start:end]
        if not rows and not anchor["headingLine"] and anchor["page"] <= len(pages):
            page = anchor["page"]
            rows = lines[offsets[page-1]:offsets[page] if page < len(pages) else len(lines)]
        last = anchor.get("last", max(anchor["page"], rows[-1]["page"] if rows else anchor["page"]))
        sections.append({"id": index+1, "title": anchor["title"], "level": max(1, int(anchor["level"])),
                         "first": anchor["page"], "last": last, "excerpt": excerpt(rows)})
    return source, sections
