import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

const MERMAID_MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs",
  "https://unpkg.com/mermaid@11.15.0/dist/mermaid.esm.min.mjs",
];

const sourceEl = document.getElementById("source");
const renderBtn = document.getElementById("render");
const downloadSvgBtn = document.getElementById("download-svg");
const downloadPngBtn = document.getElementById("download-png");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const measureEl = document.getElementById("measure");

let currentSvg = null;
let mermaidPromise = null;
let renderSequence = 0;

function setStatus(message, kind = "error") {
  statusEl.textContent = message;
  statusEl.dataset.kind = message ? kind : "";
}

async function loadMermaid() {
  if (mermaidPromise) return mermaidPromise;

  mermaidPromise = (async () => {
    const errors = [];

    for (const url of MERMAID_MODULE_URLS) {
      try {
        const module = await import(url);
        const mermaid = module.default;
        if (!mermaid?.initialize || !mermaid?.render) {
          throw new Error("Module did not expose the Mermaid API.");
        }

        mermaid.initialize({
          theme: "neutral",
          securityLevel: "antiscript",
          startOnLoad: false,
          suppressErrorRendering: true,
          flowchart: { htmlLabels: true },
        });

        return mermaid;
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Unable to load Mermaid. ${errors.join(" | ")}`);
  })();

  return mermaidPromise;
}

function buildMarkdownNode(markdown, id) {
  const container = document.createElement("div");
  container.className = "mehrmaid-markdown-container";
  container.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

  const unsafeHtml = marked.parse(markdown, { gfm: true, breaks: true });
  container.innerHTML = DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
  });

  measureEl.appendChild(container);
  const rect = container.getBoundingClientRect();
  const width = Math.max(Math.ceil(rect.width), 10);
  const height = Math.max(Math.ceil(rect.height), 10);
  container.remove();

  return { id, node: container, width, height };
}

function nextNonWhitespace(source, index) {
  for (let i = index; i < source.length; i += 1) {
    if (!/\s/.test(source[i])) return source[i];
  }
  return "";
}

function findClosingQuote(source, start) {
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const character = source[i];
    if (character === '"' && !escaped) return i;

    if (character === "\\" && !escaped) {
      escaped = true;
    } else {
      escaped = false;
    }
  }

  return -1;
}

function isQuotedNodeLabel(source, quoteIndex, openingDelimiters) {
  let cursor = quoteIndex - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  if (!openingDelimiters.has(source[cursor])) return false;

  while (cursor >= 0 && openingDelimiters.has(source[cursor])) cursor -= 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;

  return cursor >= 0 && /[A-Za-z0-9_-]/.test(source[cursor]);
}

function parseMehrmaid(source) {
  const replacements = [];
  const labels = [];
  const openingDelimiters = new Set(["(", "[", "{", ">"]).
  const closingDelimiters = new Set([")", "]", "}"]);

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') continue;
    if (!isQuotedNodeLabel(source, index, openingDelimiters)) continue;

    const closingQuote = findClosingQuote(source, index + 1);
    if (closingQuote === -1) break;
    if (!closingDelimiters.has(nextNonWhitespace(source, closingQuote + 1))) {
      index = closingQuote;
      continue;
    }

    const markdown = source.slice(index + 1, closingQuote).replace(/\\"/g, '"');
    const label = buildMarkdownNode(markdown, `mehrmaid-label-${labels.length}`);
    const placeholder = `<span class='${label.id}' style='display:inline-block;width:${label.width}px;height:${label.height}px'></span>`;

    labels.push(label);
    replacements.push({ start: index, end: closingQuote + 1, value: `"${placeholder}"` });
    index = closingQuote;
  }

  if (replacements.length === 0) {
    return { processedSource: source, labels };
  }

  let cursor = 0;
  let processedSource = "";
  for (const replacement of replacements) {
    processedSource += source.slice(cursor, replacement.start);
    processedSource += replacement.value;
    cursor = replacement.end;
  }
  processedSource += source.slice(cursor);

  return { processedSource, labels };
}

function clearOutput() {
  outputEl.replaceChildren();
  currentSvg = null;
  downloadSvgBtn.disabled = true;
  downloadPngBtn.disabled = true;
}

async function renderDiagram() {
  const renderId = ++renderSequence;
  clearOutput();
  setStatus("Loading renderer...", "info");
  renderBtn.disabled = true;

  const source = sourceEl.value.trim();
  if (!source) {
    setStatus("Please enter diagram source.");
    renderBtn.disabled = false;
    return;
  }

  try {
    const mermaid = await loadMermaid();
    const { processedSource, labels } = parseMehrmaid(source);
    const id = `mehrmaid-online-${Date.now()}-${renderId}`;
    const { svg } = await mermaid.render(id, processedSource);

    if (renderId !== renderSequence) return;

    const template = document.createElement("template");
    template.innerHTML = svg.trim();
    const renderedSvg = template.content.querySelector("svg");
    if (!renderedSvg) throw new Error("No SVG was generated.");

    outputEl.replaceChildren(renderedSvg);

    for (const label of labels) {
      const host = outputEl.querySelector(`.${CSS.escape(label.id)}`);
      if (host) {
        host.replaceChildren(label.node);
      }
    }

    currentSvg = outputEl.querySelector("svg");
    if (!currentSvg) throw new Error("Rendered SVG was removed unexpectedly.");

    downloadSvgBtn.disabled = false;
    downloadPngBtn.disabled = false;
    setStatus("Rendered.", "success");
  } catch (error) {
    if (renderId !== renderSequence) return;
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Render failed: ${message}`);
  } finally {
    if (renderId === renderSequence) renderBtn.disabled = false;
  }
}

function serializeSvg(svgElement, explicitSize = false) {
  const clone = svgElement.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  if (explicitSize) {
    const viewBox = svgElement.viewBox?.baseVal;
    const bounds = svgElement.getBoundingClientRect();
    const width = Math.max(Math.ceil(viewBox?.width || bounds.width || 1200), 1);
    const height = Math.max(Math.ceil(viewBox?.height || bounds.height || 800), 1);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.style.maxWidth = "none";
    return { text: new XMLSerializer().serializeToString(clone), width, height };
  }

  return { text: new XMLSerializer().serializeToString(clone) };
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSvg() {
  if (!currentSvg) return;
  const { text } = serializeSvg(currentSvg);
  downloadBlob("diagram.svg", new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
}

async function downloadPng() {
  if (!currentSvg) return;

  const { text, width, height } = serializeSvg(currentSvg, true);
  const svgBlob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The browser could not rasterize the SVG."));
      image.src = url;
    });

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available in this browser.");

    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) throw new Error("PNG export failed.");
    downloadBlob("diagram.png", pngBlob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

renderBtn.addEventListener("click", () => void renderDiagram());
downloadSvgBtn.addEventListener("click", downloadSvg);
downloadPngBtn.addEventListener("click", async () => {
  try {
    setStatus("Preparing PNG...", "info");
    await downloadPng();
    setStatus("PNG downloaded.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`PNG export failed: ${message}`);
  }
});

sourceEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void renderDiagram();
  }
});

void renderDiagram();
