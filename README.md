# Dazed / AnOther Watch Tower

Collects the Dazed and AnOther feeds hourly into rolling archives and shows one dashboard per site.

- Dashboards: `docs/dazed.html` and `docs/another.html` (shared code in `docs/app.js`, `docs/style.css`)
- Category: first segment of the article URL (/fashion/ = Fashion). Labels live in `sites.json`.
- Galleries (any URL containing /gallery/) are ignored.
- Each stored article keeps its URL `path`, which is the join key for GA4 page data later.
- Run locally: `python fetch_feeds.py`, then `python -m http.server --directory docs`.
