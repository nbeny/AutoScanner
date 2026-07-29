import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

// A JWT is three base64url segments separated by dots. Reject anything else so a
// token can never carry shell metacharacters into build().
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

// wordlist is interpolated unescaped into the shell command (so the CLI flag reads
// naturally as `-C -d <path>`); restrict it to a plain path with no shell metacharacters.
const SAFE_PATH_RE = /^[A-Za-z0-9_\-./]+$/;

const JwtToolInput = z.object({
  token: z
    .string()
    .regex(JWT_RE)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  wordlist: z.string().regex(SAFE_PATH_RE).default('/opt/wordlists/jwt-secrets.txt'),
});
export type JwtToolInputType = z.infer<typeof JwtToolInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const JwtToolScanner: ScannerDefinition<JwtToolInputType> = {
  name: 'jwt-tool',
  displayName: 'jwt_tool',
  category: [ScannerCategory.API_SECURITY, ScannerCategory.VULN_SCAN],
  description:
    'JWT analysis (ticarpi/jwt_tool). Decodes and inspects a supplied token (surfacing ' +
    'alg:none / weak signing algorithms) and runs an offline dictionary crack to detect ' +
    'JWTs signed with a weak or known secret. Offline only — no requests are sent to the target.',
  inputSchema: JwtToolInput,
  docker: {
    image: 'autoscanner/jwt-tool:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input) {
    if (!input.token) {
      return { cmd: ['sh', '-lc', "printf 'NO_TOKEN\\n' > /out/result.txt"] };
    }
    const token = shEscape(input.token);
    const wl = input.wordlist; // constrained by SAFE_PATH_RE; unescaped to match the parser/CLI literal
    const run =
      `jwt_tool ${token} > /out/result.txt 2>&1; ` +
      `jwt_tool ${token} -C -d ${wl} >> /out/result.txt 2>&1`;
    return { cmd: ['sh', '-lc', run] };
  },
  outputs: [{ format: 'TEXT', capture: { path: '/out/result.txt' }, parser: 'jwt-tool-text' }],
  produces: ['Finding'],
};
