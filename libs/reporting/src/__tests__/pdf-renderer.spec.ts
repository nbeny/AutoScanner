import { PuppeteerPdfRenderer } from '../pdf-renderer';

// Spec §7.1: live Puppeteer render is gated PDF_E2E=1 because Chromium
// is ~200MB and isn't installed in the default lint/test image.
const pdfE2e = process.env.PDF_E2E === '1' ? describe : describe.skip;
pdfE2e('PuppeteerPdfRenderer — live render (PDF_E2E=1)', () => {
  jest.setTimeout(60_000);

  it('produces a PDF buffer with the %PDF- magic header', async () => {
    const renderer = new PuppeteerPdfRenderer();
    const pdf = await renderer.renderHtml('<html><body><h1>Hello</h1></body></html>');
    expect(pdf.length).toBeGreaterThan(100);
    expect(pdf.slice(0, 5).toString('utf8')).toBe('%PDF-');
  });
});

describe('PuppeteerPdfRenderer — module shape', () => {
  it('exports a renderer class with renderHtml', () => {
    expect(typeof new PuppeteerPdfRenderer().renderHtml).toBe('function');
  });
});
