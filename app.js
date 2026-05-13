import mermaid from "./vendor/mermaid.esm.min.mjs";
import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

const sourceEl = document.getElementById("source");
const renderBtn = document.getElementById("render");
const downloadSvgBtn = document.getElementById("download-svg");
const downloadPngBtn = document.getElementById("download-png");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const measureEl = document.getElementById("measure");

let currentSvg = null;

const themeConfig = {
  theme: "neutral",
  securityLevel: "loose",
  startOnLoad: false,
  flowchart: { htmlLabels: true },
};

mermaid.initialize(themeConfig);

function setStatus(message) {
  statusEl.textContent = message;
}

function buildMarkdownNode(markdown, id) {
  const container = document.createElement("div");
  container.className = "mehrmaid-markdown-container";
  const unsafeHtml = marked.parse(markdown);
  container.innerHTML = DOMPurify.sanitize(unsafeHtml);
  measureEl.appendChild(container);

  const width = Math.max(Math.ceil(container.offsetWidth), 10);
  const height = Math.max(Math.ceil(container.offsetHeight), 10);
  measureEl.removeChild(container);

  return {
    id,
    node: container,
    width,
    height,
  };
}

function parseMehrmaid(source) {
  const regex = /"([\s\S]*?)"/g;
  const matches = [...source.matchAll(regex)];
  if (matches.length === 0) {
    return { processedSource: source, labels: [] };
  }

  const labels = matches.map((match, index) => {
    const labelId = `mehrmaidLabel${index}`;
    return buildMarkdownNode(match[1], labelId);
  });

  let processedSource = source;
  for (const [index, match] of matches.entries()) {
    const label = labels[index];
    const placeholder = `<div class="${label.id}" style="display:inline-block;width:${label.width}px;height:${label.height}px;"></div>`;
    processedSource = processedSource.replace(match[0], placeholder);
  }

  return { processedSource, labels };
}

async function renderDiagram() {
  setStatus("");
  outputEl.innerHTML = "";
  currentSvg = null;
  downloadSvgBtn.disabled = true;
  downloadPngBtn.disabled = true;

  const source = sourceEl.value.trim();
  if (!source) {
    setStatus("Please enter diagram source.");
    return;
  }

  try {
    const { processedSource, labels } = parseMehrmaid(source);
    const id = `mehrmaid-online-${Date.now()}`;
    const { svg } = await mermaid.render(id, processedSource);
    outputEl.innerHTML = svg;
    currentSvg = outputEl.querySelector("svg");

    if (!currentSvg) {
      throw new Error("No SVG was generated.");
    }

    for (const label of labels) {
      const host = outputEl.querySelector(`.${label.id}`);
      if (host) {
        host.appendChild(label.node);
      }
    }

    downloadSvgBtn.disabled = false;
    downloadPngBtn.disabled = false;
  } catch (error) {
    setStatus(`Render failed: ${error.message}`);
  }
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadSvg() {
  if (!currentSvg) return;
  const svgText = currentSvg.outerHTML.includes("xmlns=")
    ? currentSvg.outerHTML
    : currentSvg.outerHTML.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob("diagram.svg", blob);
}

async function downloadPng() {
  if (!currentSvg) return;
  const svgText = currentSvg.outerHTML.includes("xmlns=")
    ? currentSvg.outerHTML
    : currentSvg.outerHTML.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });

  const width = image.width || 1200;
  const height = image.height || 800;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(url);

  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) {
    throw new Error("PNG export failed.");
  }
  downloadBlob("diagram.png", pngBlob);
}

renderBtn.addEventListener("click", () => {
  renderDiagram();
});

downloadSvgBtn.addEventListener("click", () => {
  downloadSvg();
});

downloadPngBtn.addEventListener("click", async () => {
  try {
    await downloadPng();
  } catch (error) {
    setStatus(`PNG export failed: ${error.message}`);
  }
});

renderDiagram();
