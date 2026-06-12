export const PDF_RENDERER = Symbol('PDF_RENDERER');

export interface PdfRenderOptions {
  format?: 'A4' | 'Letter';
}

export interface PdfRenderer {
  renderHtml(html: string, opts?: PdfRenderOptions): Promise<Buffer>;
}

// Minimal subset of puppeteer's surface we touch. Declared locally so
// the lib compiles when "puppeteer" isn't installed — Chromium is heavy
// (~200MB) and we only need it inside the report-worker image.
interface PuppeteerLike {
  launch(opts: { headless: true; args: string[] }): Promise<PuppeteerBrowser>;
}
interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}
interface PuppeteerPage {
  setContent(html: string, opts: { waitUntil: 'networkidle0' }): Promise<void>;
  pdf(opts: { format: string; printBackground: boolean }): Promise<Uint8Array>;
}

export class PuppeteerPdfRenderer implements PdfRenderer {
  async renderHtml(html: string, opts: PdfRenderOptions = {}): Promise<Buffer> {
    let puppeteer: PuppeteerLike;
    try {
      // require() resolved at runtime — puppeteer is a peer dep only
      // installed by the report-worker, not by every consumer of this lib.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      puppeteer = require('puppeteer') as PuppeteerLike;
    } catch (err) {
      throw new Error(
        `PuppeteerPdfRenderer requires the "puppeteer" package to be installed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: opts.format ?? 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
