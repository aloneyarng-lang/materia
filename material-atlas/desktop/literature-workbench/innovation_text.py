"""Sample page text without sending the PDF to the Electron renderer."""
import json
import sys

import pymupdf


def read_pages(filename, max_pages, max_chars):
    pages = []
    with pymupdf.open(filename) as document:
        count = min(document.page_count, max_pages)
        for index in range(count):
            page = int(index * (document.page_count - 1) / max(1, count - 1) + 0.5)
            text = document.load_page(page).get_text(sort=True)[:max_chars]
            pages.append({"page": page + 1, "text": text})
    return pages


if __name__ == "__main__":
    print(json.dumps(read_pages(sys.argv[1], int(sys.argv[2]), int(sys.argv[3])), ensure_ascii=False))
