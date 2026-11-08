#!/usr/bin/env python3
"""Build ../design.html and ../design.pdf from design.src.html + wireframes/*.svg.

Usage:  python design/build.py            (from the repo root)
Needs:  Python 3.8+ and Google Chrome or Microsoft Edge installed (for the PDF).
"""
import datetime
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = HERE / "design.src.html"
OUT_HTML = ROOT / "design.html"
OUT_PDF = ROOT / "design.pdf"

BROWSER_CANDIDATES = [
    "google-chrome", "chromium", "chromium-browser", "chrome", "msedge",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def inline_svgs(html: str) -> str:
    def repl(m):
        svg = (HERE / "wireframes" / f"{m.group(1)}.svg").read_text(encoding="utf-8")
        return re.sub(r"<\?xml[^>]*\?>", "", svg).strip()
    return re.sub(r"\{\{svg:([a-z0-9-]+)\}\}", repl, html)


def find_browser():
    for c in BROWSER_CANDIDATES:
        p = shutil.which(c) or (c if pathlib.Path(c).exists() else None)
        if p:
            return p
    return None


def main():
    html = SRC.read_text(encoding="utf-8")
    html = inline_svgs(html).replace("{{date}}", datetime.date.today().strftime("%d %B %Y"))
    OUT_HTML.write_text(html, encoding="utf-8")
    print(f"wrote {OUT_HTML.relative_to(ROOT)}")

    browser = find_browser()
    if not browser:
        sys.exit("No Chrome/Edge found - design.html written, design.pdf skipped.")
    subprocess.run([
        browser, "--headless=new", "--disable-gpu", "--no-sandbox",
        "--no-pdf-header-footer", f"--print-to-pdf={OUT_PDF}", OUT_HTML.as_uri(),
    ], check=True, capture_output=True)
    print(f"wrote {OUT_PDF.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
