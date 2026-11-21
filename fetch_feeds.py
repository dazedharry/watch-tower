#!/usr/bin/env python3
"""Fetch the Dazed and AnOther feeds into one rolling archive per site.

Handles RSS 2.0 and Atom. The category is the first segment of the article URL
(/fashion/... = Fashion). Galleries (any URL containing /gallery/) are ignored.
Standard library only.
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).parent
SITES = json.loads((ROOT / "sites.json").read_text())
DATA_DIR = ROOT / "docs" / "data"
KEEP_DAYS = 365
USER_AGENT = "Mozilla/5.0 (compatible; WatchTower/1.0; internal editorial monitoring)"

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "dc": "http://purl.org/dc/elements/1.1/",
    "media": "http://search.yahoo.com/mrss/",
}


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def clean(text, limit=240):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text[: limit - 1] + "…" if len(text) > limit else text


def parse_date(raw):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        if re.match(r"\d{4}-\d{2}-\d{2}", raw):  # Atom / ISO
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        else:  # RSS, including the odd trailing " Z"
            dt = parsedate_to_datetime(re.sub(r"\s+Z$", " +0000", raw))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def label_for(slug, labels):
    if slug in labels:
        return labels[slug]
    return slug.replace("-", " ").replace("_", " ").title()


def build_story(title, link, published, author, keywords, summary, image, labels):
    parts = urlsplit((link or "").strip())
    if not parts.netloc or not title or not published:
        return None
    path = parts.path
    if "/gallery/" in path.lower():
        return None  # galleries are ignored
    segments = [p for p in path.split("/") if p]
    slug = segments[0].lower() if segments else "other"
    return {
        "link": f"{parts.scheme}://{parts.netloc}{path}",  # strips utm and other parameters
        "path": path,
        "title": clean(title, 300),
        "published": iso(published),
        "author": author or None,
        "category": slug,
        "category_label": label_for(slug, labels),
        "keywords": keywords,
        "summary": clean(summary),
        "image": image,
    }


def parse_atom(root, labels):
    out = []
    for e in root.findall("atom:entry", NS):
        link = None
        for l in e.findall("atom:link", NS):
            if l.get("rel", "alternate") == "alternate" and l.get("href"):
                link = l.get("href")
                break
        author_el = e.find("atom:author/atom:name", NS)
        author = (author_el.text or "").strip() if author_el is not None else ""
        if author.lower() in ("dazed digital", "dazed", "anOther".lower()):
            author = ""  # house byline, not a person
        content = e.findtext("atom:content", namespaces=NS) or ""
        img = re.search(r'<img[^>]+src="([^"]+)"', content)
        s = build_story(
            e.findtext("atom:title", namespaces=NS),
            link,
            parse_date(e.findtext("atom:published", namespaces=NS) or e.findtext("atom:updated", namespaces=NS)),
            author, [], e.findtext("atom:summary", namespaces=NS),
            img.group(1) if img else None, labels)
        if s:
            out.append(s)
    return out


def parse_rss(root, labels):
    out = []
    for item in root.iter("item"):
        creator = (item.findtext("dc:creator", namespaces=NS) or "").strip()
        kw_raw = item.findtext("media:keywords", namespaces=NS) or ""
        keywords = [k.strip() for k in kw_raw.split(",") if k.strip()]
        thumb = item.find("media:thumbnail", NS)
        s = build_story(
            item.findtext("title"),
            item.findtext("link"),
            parse_date(item.findtext("pubDate")),
            creator, keywords, item.findtext("description"),
            thumb.get("url") if thumb is not None else None, labels)
        if s:
            out.append(s)
    return out


def parse(xml_bytes, labels):
    root = ET.fromstring(xml_bytes)
    if root.tag.endswith("feed"):
        return parse_atom(root, labels)
    return parse_rss(root, labels)


def write_archive(path, now, site, stories):
    lines = ",\n".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in stories)
    head = json.dumps({"generated_at": iso(now), "site": site["id"], "count": len(stories)}, separators=(",", ":"))
    path.write_text(head[:-1] + ',"stories":[\n' + lines + "\n]}", encoding="utf-8")


def run_site(site, now):
    out = DATA_DIR / f"{site['id']}.json"
    archive = {}
    if out.exists():
        try:
            for s in json.loads(out.read_text(encoding="utf-8")).get("stories", []):
                archive[s["link"]] = s
        except (json.JSONDecodeError, KeyError):
            print(f"[{site['id']}] archive unreadable, starting fresh", file=sys.stderr)

    errors, fetched, new = [], 0, 0
    for url in site["feeds"]:
        try:
            items = parse(fetch(url), site.get("labels", {}))
        except Exception as exc:
            errors.append(f"{url}: {exc}")
            continue
        fetched += len(items)
        for s in items:
            old = archive.get(s["link"])
            s["first_seen"] = old["first_seen"] if old else iso(now)
            if not old:
                new += 1
            archive[s["link"]] = s

    if errors and len(errors) == len(site["feeds"]):
        print(f"[{site['id']}] all feeds failed:\n" + "\n".join(errors), file=sys.stderr)
        return False

    cutoff = iso(now - timedelta(days=KEEP_DAYS))
    stories = sorted((s for s in archive.values() if s["published"] >= cutoff),
                     key=lambda s: s["published"], reverse=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_archive(out, now, site, stories)
    print(f"[{site['id']}] fetched {fetched}, {new} new, {len(stories)} stored.")
    for e in errors:
        print(f"[{site['id']}] warning: {e}", file=sys.stderr)
    return True


def main():
    now = datetime.now(timezone.utc)
    ok = [run_site(site, now) for site in SITES]
    if not any(ok):
        sys.exit(1)  # fail the run only if every site failed


if __name__ == "__main__":
    main()
