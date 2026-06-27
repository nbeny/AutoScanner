import { execSync } from 'node:child_process';

const ENABLED = process.env.RUN_DOCKER_IMAGE_TESTS === '1';
const d = ENABLED ? describe : describe.skip;

d('kiterunner image size guard', () => {
  it('autoscanner/kiterunner:1.0 stays under 500 MB', () => {
    const raw = execSync("docker image inspect autoscanner/kiterunner:1.0 --format '{{.Size}}'", {
      encoding: 'utf8',
    }).trim();
    const bytes = Number(raw);
    expect(Number.isFinite(bytes)).toBe(true);
    const mb = bytes / (1024 * 1024);
    expect(mb).toBeLessThanOrEqual(500);
  });
});
