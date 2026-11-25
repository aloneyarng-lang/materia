"""Local HTTP entry point. Only the loopback interface is exposed."""
import base64
import hashlib
import json
import os
import re
import secrets
import sys
import tempfile
from concurrent.futures import Future
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
from urllib.parse import urlsplit

import figures
import paper_sections
import reports

WEB = Path(__file__).resolve().parent / "web"
TOKEN = secrets.token_urlsafe(32)
MAX_PDF = 140 * 1024 * 1024
PREFERENCES = Path(os.environ["MATERIA_WORKBENCH_SETTINGS"])

PRESETS = PREFERENCES.with_name("literature-workbench-presets.json")
DISPLAY = PREFERENCES.with_name("literature-workbench-display.json")
DISPLAY_FONTS = {"theme", "deng", "yahei", "simsun", "segoe", "mono"}
DISPLAY_MODULES = {"toolbar", "library", "overview", "map", "caption", "analysis", "body", "conversation"}
PRESET_LOCK = Lock()
OLD_OUTLINE_PROMPT = ("用简体中文梳理论文。按研究问题、方法、主要发现、证据与局限组织研究逻辑。"
                      "说明各图如何支撑或限制具体结论，区分作者结论与推断。")
OUTLINE_PROMPT = ("用简体中文概括每个原文章节的要点、论证和与相邻章节的关系。"
                  "有对应图表时解释它提供的证据，区分作者结论和推断。")
FIGURE_PROMPT = "用简体中文说明各子图测量了什么、最重要的趋势或对照，以及它支持的结论。"
TEXT_PROMPT = "用简体中文梳理所选正文，注明关键结论对应的 PDF 页码。"
DEFAULT_PRESET = {"id": "outline", "number": "003", "name": "论文导图与逐图证据", "mode": "outline",
                  "includeFigures": True, "prompt": OUTLINE_PROMPT, "figurePrompt": FIGURE_PROMPT}


def presets(data):
    with PRESET_LOCK:
        stored = json.loads(PRESETS.read_text(encoding="utf-8")) if PRESETS.is_file() else []
        previous = stored if isinstance(stored, list) else stored["presets"]
        highest = max([3, stored.get("lastNumber", 0) if isinstance(stored, dict) else 0,
                       *(int(item.get("number", 0)) for item in previous)])
        saved = [item.copy() for item in previous if item["id"] not in ("figures", "summary")]
        if not any(item["id"] == "outline" for item in saved):
            save_default = DEFAULT_PRESET.copy()
            if any(item.get("number") == "003" for item in saved):
                highest += 1
                save_default["number"] = f"{highest:03d}"
            saved.insert(0, save_default)
        for item in saved:
            if not item.get("number"):
                if item["id"] == "outline" and not any(other.get("number") == "003" for other in saved):
                    item["number"] = "003"
                else:
                    highest += 1
                    item["number"] = f"{highest:03d}"
            if item["id"] == "outline" and item.get("prompt") == OLD_OUTLINE_PROMPT:
                item["prompt"] = OUTLINE_PROMPT
            if item.get("mode") == "outline" and item.get("includeFigures") is not False and not item.get("figurePrompt"):
                item["figurePrompt"] = FIGURE_PROMPT if item["id"] == "outline" else item.get("prompt", FIGURE_PROMPT)
        if not data:
            if isinstance(stored, list) or saved != previous:
                write_json(PRESETS, {"lastNumber": highest, "presets": saved})
            return saved
        name, prompt = (str(data.get(field) or "").strip() for field in ("name", "prompt"))
        mode = data.get("mode")
        if not 1 <= len(name) <= 80 or len(prompt) > 12000 or mode not in ("text", "figures", "outline"):
            raise ValueError("请输入预设名称并选择一种处理流程。")
        include_figures = mode == "outline" and data.get("includeFigures") is not False
        figure_prompt = str(data.get("figurePrompt") or "").strip()
        if len(figure_prompt) > 12000:
            raise ValueError("逐图指令不能超过 12000 字。")
        prompt = prompt or {"text": TEXT_PROMPT, "figures": FIGURE_PROMPT, "outline": OUTLINE_PROMPT}[mode]
        key = data.get("id")
        if key is None:
            if len(saved) >= 100:
                raise ValueError("已达到 100 个预设的上限。")
            key = secrets.token_hex(16)
            highest += 1
            number = f"{highest:03d}"
        else:
            existing_preset = next((item for item in saved if item["id"] == key), None)
            if not existing_preset:
                raise ValueError("找不到要编辑的预设。")
            number = existing_preset["number"]
        updated = {"id": key, "number": number, "name": name, "mode": mode, "prompt": prompt}
        if mode == "outline":
            updated["includeFigures"] = include_figures
            if include_figures:
                updated["figurePrompt"] = figure_prompt or FIGURE_PROMPT
        saved = [updated if item["id"] == key else item for item in saved]
        if updated not in saved:
            saved.append(updated)
        write_json(PRESETS, {"lastNumber": highest, "presets": saved})
        return {"presets": saved, "selectedId": key}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent) as stage:
        temporary = Path(stage) / path.name
        temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)


def display_preferences(data):
    def normalized(value):
        value = value if isinstance(value, dict) else {}
        font = value.get("font")
        sizes = value.get("sizes")
        sizes = sizes if isinstance(sizes, dict) else {}
        return {"font": font if isinstance(font, str) and font in DISPLAY_FONTS else "theme",
                "sizes": {key: size for key, size in sizes.items()
                          if key in DISPLAY_MODULES and type(size) is int and 11 <= size <= 30}}
    if "settings" in data:
        settings = normalized(data["settings"])
        write_json(DISPLAY, settings)
        return settings
    try:
        return normalized(json.loads(DISPLAY.read_text(encoding="utf-8")))
    except (FileNotFoundError, ValueError):
        return normalized({})


class DesktopBridge:
    def __init__(self, server):
        self.server = server
        self.lock = Lock()
        self.calls = {}
        self.cancelled = deque(maxlen=256)
        self.sequence = 0
        Thread(target=self.receive, daemon=True).start()

    def receive(self):
        for line in sys.stdin.buffer:
            response = json.loads(line)
            with self.lock:
                future = self.calls.pop(response["id"], None)
                if future is not None:
                    future.set_result(response)
        self.server.shutdown()

    def explain(self, prompt, images=(), operation=None):
        if isinstance(images, bytes):
            images = (images,)
        encoded = [base64.b64encode(image).decode("ascii") for image in images]
        return self.request({"prompt": prompt, "images": encoded, "operation": operation})

    def cancel(self, operation):
        with self.lock:
            self.cancelled.append(operation)
            print(json.dumps({"cancel": operation}), flush=True)

    def check(self, operation):
        if operation in self.cancelled:
            raise ValueError("已停止生成。")

    def render_report(self, title, markdown, figures):
        return self.request({"method": "renderReport", "title": title, "markdown": markdown, "figures": figures})["html"]

    def request(self, payload):
        future = Future()
        with self.lock:
            self.check(payload.get("operation"))
            self.sequence += 1
            key = self.sequence
            self.calls[key] = future
            print(json.dumps({"id": key, **payload}), flush=True)
        try:
            result = future.result(timeout=340)
        finally:
            with self.lock:
                self.calls.pop(key, None)
        if "error" in result:
            raise ValueError(result["error"])
        return result



class Handler(BaseHTTPRequestHandler):
    def reply(self, content, media="application/json; charset=utf-8", status=200):
        self.send_response(status)
        self.send_header("Content-Type", media)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(content)

    def out(self, data, status=200):
        self.reply(json.dumps(data, ensure_ascii=False).encode(), status=status)

    def local(self):
        return (self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"
                and secrets.compare_digest(self.headers.get("X-Materia-Workbench", ""), self.server.access_key))

    def do_GET(self):
        if not self.local():
            self.out({"error": "请通过启动终端显示的本机地址打开。"}, 403)
            return
        route = urlsplit(self.path).path
        if route in ("/", "/takeaway-card", "/paper-canvas"):
            page = (WEB / ("index.html" if route == "/" else "study-tool.html")).read_text(encoding="utf-8")
            page = page.replace("__TOOL__", route[1:]).replace("__LABEL__", "速记卡" if route == "/takeaway-card" else "研究画布")
            self.reply(page.replace("__LOCAL_TOKEN__", TOKEN).encode(), "text/html; charset=utf-8")
        elif route in ("/app.js", "/study-tool.js", "/style.css", "/takeaway-card.js", "/takeaway-card.css"):
            media = "text/javascript" if route.endswith(".js") else "text/css"
            self.reply((WEB / route[1:]).read_bytes(), media + "; charset=utf-8")
        else:
            self.out({"error": "找不到页面。"}, 404)

    def do_POST(self):
        if not self.local() or not secrets.compare_digest(self.headers.get("X-Workbench", ""), TOKEN):
            self.out({"error": "请刷新本机页面后重试。"}, 403)
            return
        try:
            route = urlsplit(self.path).path
            size = int(self.headers.get("Content-Length", "0"))
            maximum = MAX_PDF if route in ("/extract", "/paper-text") else 4 * 1024 * 1024 if route in ("/report", "/outline") else 256 * 1024
            if not 0 < size <= maximum:
                raise ValueError("请求为空或超过大小限制。")
            if route == "/paper-text":
                import fitz
                with fitz.open(stream=self.rfile.read(size), filetype="pdf") as doc:
                    parts = []
                    remaining = 32000
                    for page in doc:
                        part = page.get_text()[:remaining]
                        parts.append(part)
                        remaining -= len(part)
                        if remaining <= 0:
                            break
                return self.out({"text": "\n".join(parts)})
            if route == "/extract":
                return self.upload(self.rfile.read(size))
            data = json.loads(self.rfile.read(size))
            operation = data.get("operation")
            if operation is not None and (not isinstance(operation, str) or not re.fullmatch(r"[a-f0-9-]{36}", operation)):
                raise ValueError("生成请求无效。")
            if route == "/cancel":
                if not operation:
                    raise ValueError("生成请求无效。")
                self.server.ai.cancel(operation)
                return self.out({"cancelled": True})
            self.server.ai.check(operation)
            if route == "/presets":
                return self.out(presets(data))
            if route == "/display-preferences":
                return self.out(display_preferences(data))
            if route == "/follow-up":
                return self.out(reports.follow_up(data.get("report"), data.get("question"), data.get("figure"),
                    lambda prompt, images: self.server.ai.explain(prompt, images)["answer"], self.server.ai.render_report))
            if route == "/export-report":
                return self.reply(reports.export_archive(data.get("report")), "application/zip")
            if route == "/edit-report":
                return self.out(reports.edit(data, self.server.ai.render_report))
            if route not in ("/render", "/interpret", "/process", "/report", "/outline", "/saved-report"):
                return self.out({"error": "找不到处理方法。"}, 404)
            key = data.get("id")
            if not isinstance(key, str) or len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
                raise ValueError("PDF 会话已失效，请重新选择文献。")
            path = self.server.cache / (key + ".pdf")
            pages_file = self.server.cache / (key + ".json")
            if not pages_file.exists():
                raise ValueError("PDF 会话已失效，请重新选择文献。")
            pages = json.loads(pages_file.read_text(encoding="utf-8"))
            if route == "/saved-report":
                return self.out(reports.latest({**data, "pageCount": len(pages)}, self.server.ai.render_report))
            if route == "/report":
                return self.out(self.figure_report(path, pages, data, operation=operation))
            if route != "/render":
                instruction = str(data.get("prompt") or "").strip()
                if not 1 <= len(instruction) <= 12000:
                    raise ValueError("预设处理指令为空或过长。")
            if route == "/outline":
                return self.out(self.outline_report(path, pages, data, instruction, operation))
            if route == "/process":
                first = int(data.get("first") or 1)
                last = int(data.get("last") or len(pages))
                if not 1 <= first <= last <= len(pages):
                    raise ValueError("请输入有效的起止页码。")
                content = []
                for number in range(first, last + 1):
                    lines = pages[number - 1]["lines"]
                    if lines:
                        content.append(f"PDF 第 {number} 页\n" + "\n".join(line["text"] for line in lines))
                if not content:
                    raise ValueError("所选页面没有可提取的文字。")
                text = "\n\n".join(content)
                if len(text) > 100000:
                    raise ValueError("所选正文超过 10 万字，请缩小页码范围。")
                prompt = f"处理预设：\n{instruction}\n\n论文资料：\n{text}"
                result = self.server.ai.explain(prompt)
                report = reports.save({**data, "model": result["model"]},
                    [f"PDF 第 {first}–{last} 页", "## 处理结果", result["answer"]],
                    self.server.ai.render_report, text={"answer": result["answer"], "first": first, "last": last})
                return self.out({**result, "report": report})
            figure = data["figure"]
            page = int(figure["page"])
            image = self.render_figure(path, pages, figure, preview=route == "/render" and data.get("detail") is True)
            if route == "/render":
                return self.reply(image, "image/png")
            prompt = ("简洁解读附图。每幅可见小图严格一小段，按原图顺序。单图只写一段。"
                      "每段约 50–100 字，最多两句话，只说明图在测什么、最关键的读数或趋势及结论。"
                      "默认像研究者指着图讲给同事听，直接从曲线、峰位、颜色或对照组说起。"
                      "用具体的变化写出画面感，保留必要的数值和单位，不编造读数或因果。"
                      "少用「图中可以看出」「值得注意的是」「综上所述」之类的套话。"
                      "text 只写连续的自然段，不加列表符号、换行分条、加粗、标题或表格，必要的行内公式仍可用单个美元符号括起。"
                      "不写总述或结尾，不补造子图。处理预设只影响重点，不能改变篇幅和格式。"
                      '只返回 JSON：{"panels":[{"label":"a","text":"一小段解读"}]}。单图没有子图标号时 label 留空。\n'
                      f"处理预设：\n{instruction}\n\n图号：{figure['label']}，PDF 第 {page} 页。\n"
                      f"原文图注：{figure.get('caption') or '未识别到图注'}\n\n"
                      f"相关摘录：\n{figures.context_for(pages, figure)}")
            result = self.server.ai.explain(prompt, image, operation)
            try:
                answer = reports.panel_answer(result["answer"])
            except ValueError:
                result = self.server.ai.explain(
                    prompt + "\n请检查 JSON 格式。每个 text 是一段连贯的口吻，压缩到 100 字以内，去掉分条和 Markdown 强调。",
                    image, operation)
                answer = reports.panel_answer(result["answer"])
            return self.out({**result, "answer": answer})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            self.out({"error": str(error) or type(error).__name__}, HTTPStatus.BAD_REQUEST)

    def render_figure(self, path, pages, figure, *, preview=False):
        archive = figure.get("archivedImage")
        if archive:
            return reports.archived_image(archive.get("report"), archive.get("index"), path.stem)
        page = int(figure["page"])
        if not 1 <= page <= len(pages):
            raise ValueError("页码无效。")
        return figures.render(path, page, figures.checked_box(pages[page-1], figure["box"]), preview=preview)

    def outline_report(self, path, pages, data, instruction, operation):
        items = data["figures"]
        if not isinstance(items, list):
            raise ValueError("逐图证据格式无效。")
        per_figure = min(2400, 24000 // max(1, len(items)))
        evidence = [
            {"index": index, "label": reports.line(item["label"]), "page": int(item["page"]),
             "caption": str(item.get("caption") or "")[:500], "analysis": str(item.get("answer") or "")[:per_figure]}
            for index, item in enumerate(items, 1)
        ]
        source, sections = paper_sections.collect(path, pages, reports.line(data.get("title")))
        outline, models = reports.describe_sections(source, sections, evidence, instruction,
            lambda prompt: self.server.ai.explain(prompt, operation=operation))
        self.server.ai.check(operation)
        draft = {**data, "model": " / ".join(dict.fromkeys(filter(None, [*models, data.get("model")])))}
        archived = self.figure_report(path, pages, draft, outline, operation=operation) if items else reports.save(
            draft, reports.outline_sections(outline, items), self.server.ai.render_report, outline=outline,
            before_commit=lambda: self.server.ai.check(operation))
        return {"outline": outline, "report": archived}

    def figure_report(self, path, pages, data, outline=None, *, operation=None):
        items = data["figures"]
        if not isinstance(items, list) or not items:
            raise ValueError("没有可保存的图。")
        sections = reports.report_sections(items, outline, None)
        images = ((f"figure-{index:03}.png", self.render_figure(path, pages, item))
                  for index, item in enumerate(items, 1))
        return reports.save(data, sections, self.server.ai.render_report, images, outline=outline,
                            before_commit=lambda: self.server.ai.check(operation))

    def upload(self, content):
        if b"%PDF-" not in content[:1024]:
            raise ValueError("所选文件不是有效 PDF。")
        key = hashlib.sha256(content).hexdigest()
        path = self.server.cache / (key + ".pdf")
        pages_file = self.server.cache / (key + ".json")
        if not pages_file.exists():
            with tempfile.TemporaryDirectory(dir=self.server.cache) as staging:
                temporary = Path(staging)
                (temporary / "paper.pdf").write_bytes(content)
                pages = figures.scan_pdf(temporary / "paper.pdf")
                (temporary / "pages.json").write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
                (temporary / "paper.pdf").replace(path)
                (temporary / "pages.json").replace(pages_file)
        else:
            pages = json.loads(pages_file.read_text(encoding="utf-8"))
        self.out({"id": key, "figures": figures.extract(pages), "pages": [
            {"width": p["width"], "height": p["height"]} for p in pages],
            "hasText": any(p["lines"] for p in pages),
            "hasGraphics": any(p["graphics"] for p in pages)})


def main():
    with tempfile.TemporaryDirectory(prefix="literature-workbench-") as temporary:
        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            server.cache = Path(temporary) / "papers"
            server.cache.mkdir()
            server.access_key = secrets.token_urlsafe(32)

            server.ai = DesktopBridge(server)
            print(json.dumps({"port": server.server_port, "key": server.access_key}), flush=True)
            server.serve_forever()


if __name__ == "__main__":
    main()

