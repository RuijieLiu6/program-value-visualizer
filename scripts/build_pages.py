"""Build a static copy for GitHub Pages (or any static host) in _site/.

index.html and money-book.html are written for claude.ai, which wraps a page in a <!doctype html>
skeleton. This adds the same skeleton (as scripts/serve_local.py does) and points the
Tower Money Book link at the bundled money-book.html. Ask AI stays hidden outside claude.ai.

Usage: python3 scripts/build_pages.py
"""
import pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
HEAD = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>')

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
for page in ("index.html", "money-book.html"):
    (OUT / page).write_text(HEAD + (ROOT / page).read_text(encoding="utf-8") + "</body></html>", encoding="utf-8")
for d in ("app", "core", "catalogue", "basemap", "packs", "briefs"):
    shutil.copytree(ROOT / d, OUT / d, ignore=shutil.ignore_patterns(".DS_Store"))
app = OUT / "app" / "app.js"
src = app.read_text(encoding="utf-8")
old = "const BOOK_URL = 'https://claude.ai/artifact/B3GNW8SaozeMKDPdN5gpHP';"
assert old in src, "BOOK_URL line changed; update build_pages.py"
app.write_text(src.replace(old, "const BOOK_URL = 'money-book.html';"), encoding="utf-8")
(OUT / ".nojekyll").write_text("")
print("built", OUT)
