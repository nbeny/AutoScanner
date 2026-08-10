import { ScansResolver } from '../scans.resolver';
import type { ScansService } from '../scans.service';
import type { PreviewScanCommandService } from '../preview-scan-command.service';

describe('ScansResolver.previewScanCommand', () => {
  it('delegates to PreviewScanCommandService.preview', () => {
    const preview = { image: 'nmap:latest', argv: ['nmap', 't'], note: null };
    const previewSvc = { preview: jest.fn().mockReturnValue(preview) };
    const resolver = new ScansResolver(
      {} as ScansService,
      {} as never, // logSubscriber unused here
      previewSvc as unknown as PreviewScanCommandService,
    );

    const res = resolver.previewScanCommand('nmap', 'scanme.example.com', '{"ports":"80"}');

    expect(previewSvc.preview).toHaveBeenCalledWith('nmap', 'scanme.example.com', '{"ports":"80"}');
    expect(res).toBe(preview);
  });
});
