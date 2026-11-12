import JSZip from "jszip";
import { t } from "@/i18n";

export type ImportedChapter = { name: string; content: string };

/**
 * Parse an EPUB file in the browser using JSZip + DOMParser. Returns chapters
 * in spine (reading) order. Each chapter exposes a best-effort title and the
 * extracted text content with paragraph boundaries preserved as newlines.
 */
export async function parseEpubFile(file: File): Promise<ImportedChapter[]> {
  const zip = await JSZip.loadAsync(file);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error(t("EPUB is missing META-INF/container.xml"));
  const containerXml = await containerFile.async("string");
  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfile = containerDoc.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error(t("EPUB container.xml has no OPF reference"));

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(t("EPUB OPF file not found: {0}", opfPath));
  const opfText = await opfFile.async("string");
  const opfDoc = new DOMParser().parseFromString(opfText, "application/xml");

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  const manifestById = new Map<string, string>();
  for (const item of Array.from(opfDoc.querySelectorAll("manifest > item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifestById.set(id, href);
  }

  const spineRefs = Array.from(opfDoc.querySelectorAll("spine > itemref")).flatMap((ref) => {
    const idref = ref.getAttribute("idref");
    return idref ? [idref] : [];
  });

  const chapters: ImportedChapter[] = [];
  for (let i = 0; i < spineRefs.length; i++) {
    const idref = spineRefs[i];
    const href = manifestById.get(idref);
    if (!href) continue;
    const decoded = decodeURIComponent(href.split("#")[0]);
    const fullPath = opfDir ? `${opfDir}/${decoded}` : decoded;
    const file = zip.file(fullPath);
    if (!file) continue;
    const html = await file.async("string");
    const doc = new DOMParser().parseFromString(html, "application/xhtml+xml");
    // application/xhtml+xml fails hard on malformed markup — fall back to HTML.
    const parsed = doc.querySelector("parsererror")
      ? new DOMParser().parseFromString(html, "text/html")
      : doc;

    const name = pickChapterTitle(parsed) || t("Chapter {0}", (chapters.length + 1).toString());
    const content = extractTextContent(parsed.querySelector("body"));
    if (content.trim() === "") continue;
    chapters.push({ name, content });
  }
  return chapters;
}

function pickChapterTitle(doc: Document): string | null {
  const heading = doc.querySelector("h1, h2, h3");
  const headingText = heading?.textContent?.trim();
  if (headingText) return headingText;
  const titleText = doc.querySelector("title")?.textContent?.trim();
  return titleText || null;
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "section",
  "article",
  "tr",
  "pre",
]);

/**
 * Walk the body and emit text with newline boundaries at block-level elements.
 * Whitespace inside text nodes is collapsed; paragraph breaks become single
 * newlines so downstream split strategies can treat each line as a candidate
 * segment.
 */
function extractTextContent(body: Element | null): string {
  if (!body) return "";
  const out: string[] = [];
  let current = "";

  function flush() {
    const trimmed = current.replace(/\s+/g, " ").trim();
    if (trimmed) out.push(trimmed);
    current = "";
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    for (const child of Array.from(el.childNodes)) walk(child);
    if (isBlock) flush();
  }

  walk(body);
  flush();
  return out.join("\n");
}
