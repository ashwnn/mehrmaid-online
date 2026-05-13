# mehrmaid-online

A minimal static GitHub Pages app for rendering [mehrmaid](https://github.com/huterguier/obsidian-mehrmaid)-style diagrams in the browser.

## Features

- Paste mehrmaid/mermaid code into a text area
- Render the diagram directly in browser
- Download the rendered output as:
  - SVG
  - PNG

## Run locally

Because this project is a static site, you can open `index.html` directly or serve it with any static server.
The app ships with vendored browser modules under `/vendor`, so runtime CDN access is not required.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
