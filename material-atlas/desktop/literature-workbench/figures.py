"""PDF geometry, caption matching and figure rendering."""
import math
import re

import pymupdf as pdf

CAPTION = re.compile(r"^(?:(?:supplementary\s+)?fig(?:ure)?\.?\s*([sSaA]?\d+(?:[.\-]\d+)?)|图\s*([sS]?\d+))(?=[\s.:：|、(（]|$)", re.I)


def scan_pdf(path):
    pages = []
    with pdf.open(path) as doc:
        if doc.needs_pass or not len(doc):
            raise ValueError("文件已加密或没有可读取的页面。")
        for page in doc:
            if page.rotation:
                page.set_rotation(0)
            lines = []
            for block in page.get_text("dict", flags=pdf.TEXTFLAGS_DICT & ~pdf.TEXT_PRESERVE_IMAGES)["blocks"]:
                for index, line in enumerate(block["lines"]):
                    spans = line["spans"]
                    text = "".join(span["text"] for span in spans)
                    if not text.strip():
                        continue
                    dominant = max(spans, key=lambda span: len(span["text"].strip()))
                    lines.append({"text": text, "box": list(line["bbox"]), "size": round(dominant["size"], 1),
                                  "bold": bool(dominant["flags"] & pdf.TEXT_FONT_BOLD), "blockStart": index == 0})
            graphics = [item["bbox"] for item in page.get_image_info()]
            graphics += [list(rect) for rect in page.cluster_drawings()]
            pages.append({"width": page.rect.width, "height": page.rect.height,
                          "lines": lines, "graphics": graphics})
    return pages


def render(path, page_number, box, *, preview=False):
    with pdf.open(path) as doc:
        page = doc[page_number - 1]
        if page.rotation:
            page.set_rotation(0)
        rect = pdf.Rect(box)
        scale = min(6 if preview else 3, (3200 if preview else 1800) / max(rect.width, rect.height))
        return page.get_pixmap(matrix=pdf.Matrix(scale, scale), clip=rect, alpha=False).tobytes()


def extract(pages):
    figures = []
    for number, page in enumerate(pages, 1):
        width, height = page["width"], page["height"]
        lines = sorted(page["lines"], key=lambda line: (line["box"][1], line["box"][0]))
        graphics = [g for g in page["graphics"]
                    if g[2]-g[0] >= 38 and g[3]-g[1] >= 32
                    and (g[2]-g[0])*(g[3]-g[1]) < .88*width*height]
        claimed = set()
        for index, line in enumerate(lines):
            text = line["text"].strip()
            match = CAPTION.match(text)
            if not match or not text[match.end():].strip():
                continue
            x0, y0, x1, y1 = line["box"]
            # Body sentences starting with “Figure 1 shows” are usually references.
            tail = text[match.end():]
            if re.match(r"\s+(?:shows?|illustrates?|depicts?|presents?|summari[sz]es?|compares?|reveals?|demonstrates?|is|are)\b", tail, re.I):
                continue

            lo, hi = 14, width - 14
            other_column = [l for l in lines if abs(l["box"][1]-y0) < 140 and len(l["text"]) > 26]
            if x1 < width*.54 and any(l["box"][0] > width*.51 for l in other_column):
                hi = width*.51
            elif x0 > width*.49 and any(l["box"][2] < width*.52 for l in other_column):
                lo = width*.49
            overlapping = [l for l in lines[:index]
                           if l["box"][2] > lo+8 and l["box"][0] < hi-8]
            previous = max((l["box"][3] for l in overlapping
                            if len(l["text"].strip()) >= 42 and l["box"][3] <= y0-18),
                           default=18)
            candidates = [(i, g) for i, g in enumerate(graphics)
                          if i not in claimed and (lo <= (g[0]+g[2])/2 <= hi)
                          and g[3] <= y0+4 and g[1] >= max(previous-10, y0-height*.65)
                          and y0-g[3] < height*.50]
            if not candidates or y0 - max(g[3] for _, g in candidates) > min(85, height*.12):
                continue
            nearby = []
            boundary = y0
            for candidate in sorted(candidates, key=lambda item: item[1][3], reverse=True):
                graphic = candidate[1]
                if boundary - graphic[3] > min(55, height*.08):
                    break
                nearby.append(candidate)
                boundary = min(boundary, graphic[1])
            if not nearby:
                continue
            candidates = nearby
            top = max(0, min(g[1] for _, g in candidates) - 10)
            if y0-top < 25:
                continue
            caption = [text]
            bottom = y1
            for following in lines[index+1:]:
                fx, fy, fx1, fy1 = following["box"]
                if fy > bottom+10:
                    break
                if fy < bottom-3 or not lo <= fx < hi or fx1 > hi+12:
                    continue
                more = following["text"].strip()
                if CAPTION.match(more):
                    break
                caption.append(more)
                bottom = fy1
                if len(caption) >= 12:
                    break
            claimed.update(i for i, _ in candidates)
            figures.append({"label": "图 " + (match[1] or match[2]), "page": number,
                            "box": [max(0, min(g[0] for _, g in candidates)-10), top,
                                    min(width, max(g[2] for _, g in candidates)+10), y0-1],
                            "caption": " ".join(caption), "kind": "图注定位"})
    return sorted(figures, key=lambda f: (f["page"], f["box"][1], f["box"][0]))


def context_for(pages, figure):
    label = figure["label"].removeprefix("图 ")
    ref = re.compile(r"(?:(?:fig(?:ure)?s?\.?|图)\s*" + re.escape(label) + r")(?![\d.])", re.I)
    references = []
    for index, page in enumerate(pages, 1):
        content = " ".join(line["text"].strip() for line in page["lines"])
        if index == figure["page"]:
            references.append(f"第 {index} 页（原图所在页）：{content[:7000]}")
        else:
            matches = list(ref.finditer(content))
            if matches:
                excerpts = [content[max(0,m.start()-300):m.end()+420] for m in matches[:3]]
                references.append(f"第 {index} 页：" + "\n".join(excerpts))
    return "图相关正文：\n" + "\n\n".join(references)[:14000] + "\n\n" + article_context(pages)


def article_context(pages, maximum=50000):
    article = [(number, content) for number, page in enumerate(pages, 1)
               if (content := " ".join(line["text"].strip() for line in page["lines"]))]
    full_text = "\n\n".join(f"第 {number} 页：{content}" for number, content in article)
    label = "全文提取文本"
    if len(full_text) > maximum:
        label = "全文分布抽样"
        if len(article) > 50:
            article = [article[round(i * (len(article) - 1) / 49)] for i in range(50)]
        budget = (maximum - 2000) // len(article)
        def excerpt(content):
            if len(content) <= budget:
                return content
            head = budget * 2 // 3
            return content[:head] + " […] " + content[-(budget - head):]
        full_text = "\n\n".join(f"第 {number} 页：{excerpt(content)}" for number, content in article)
    return f"{label}：\n{full_text}"


def checked_box(page, box):
    a, b, c, d = [float(n) for n in box]
    if not all(math.isfinite(n) for n in (a,b,c,d)):
        raise ValueError("裁剪区域无效。")
    if not (0 <= a < c <= page["width"] and 0 <= b < d <= page["height"]):
        raise ValueError("裁剪区域超出页面。")
    return [a,b,c,d]
