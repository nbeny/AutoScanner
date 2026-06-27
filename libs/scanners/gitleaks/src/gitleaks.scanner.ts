import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const RepoUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u), 'repo must be an http(s) URL');

const OrgNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'org name must be GitHub-safe');

const SourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), repo: RepoUrlSchema }),
  z.object({
    type: z.literal('org'),
    name: OrgNameSchema,
    githubToken: z.string().min(1).optional(),
  }),
]);

const GitleaksInput = z.object({
  source: SourceSchema,
  deep: z.boolean().default(false),
});
export type GitleaksInputType = z.infer<typeof GitleaksInput>;

const REPORT = '/tmp/gitleaks-report.json';
const CLONE_DIR = '/tmp/clone';

function buildUrlScript(repo: string, deep: boolean): string {
  const depth = deep ? '' : ' --depth 1';
  return [
    `rm -rf ${CLONE_DIR}`,
    `git clone${depth} ${shellQuoteSingle(repo)} ${CLONE_DIR} 2>/dev/null`,
    `gitleaks detect --source ${CLONE_DIR} --report-format json --report-path ${REPORT} --no-banner 2>/dev/null || true`,
    `[ -f ${REPORT} ] || echo '[]' > ${REPORT}`,
  ].join(' && ');
}

function buildOrgScript(orgName: string, deep: boolean): string {
  // Refuse if scope/auth is missing. Engagement-scope verification is the
  // operator's responsibility at template setup time; this in-container
  // check is the second line of defence against a missing GITHUB_TOKEN.
  const depth = deep ? '' : ' --depth 1';
  const org = shellQuoteSingle(orgName);
  return [
    `if [ -z "$GITHUB_TOKEN" ]; then`,
    `  echo "[]" > ${REPORT};`,
    `  echo "refusing org scan: GITHUB_TOKEN absent" >&2;`,
    `  exit 0;`,
    `fi`,
    `: > ${REPORT}.tmp`,
    `curl -s -H "Authorization: token $GITHUB_TOKEN" ` +
      `"https://api.github.com/orgs/${org}/repos?per_page=100" ` +
      `| grep -oE '"clone_url":[[:space:]]*"[^"]+"' ` +
      `| cut -d'"' -f4 ` +
      `| while read URL; do ` +
      `  rm -rf ${CLONE_DIR};` +
      `  git clone${depth} "$URL" ${CLONE_DIR} 2>/dev/null && ` +
      `  gitleaks detect --source ${CLONE_DIR} --report-format json ` +
      `    --report-path ${REPORT} --no-banner 2>/dev/null;` +
      `  [ -f ${REPORT} ] && cat ${REPORT} >> ${REPORT}.tmp;` +
      `done`,
    `mv ${REPORT}.tmp ${REPORT} 2>/dev/null || echo '[]' > ${REPORT}`,
  ].join(' ');
}

export const GitleaksScanner: ScannerDefinition<GitleaksInputType> = {
  name: 'gitleaks',
  displayName: 'gitleaks (git secret scanning)',
  category: [ScannerCategory.OSINT, ScannerCategory.VULN_SCAN],
  description:
    'Scans a single repository URL or all repos of a GitHub org for secret leaks. ' +
    'Org mode refuses to run without a GITHUB_TOKEN credential.',
  inputSchema: GitleaksInput,
  // We do NOT declare requiresCredential here: url-mode works without auth.
  // Org-mode refusal is enforced at runtime by the in-container check above.
  docker: {
    image: 'autoscanner/gitleaks:1.0',
    network: 'bridge',
    capabilities: [],
    // gitleaks writes a detector cache during run; allow writable rootfs.
    // Clone target + report stay inside the tmpfs-mounted /tmp directory.
    readonlyRootfs: false,
    memoryLimitMb: 2048,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(input, _target) {
    const script =
      input.source.type === 'url'
        ? buildUrlScript(input.source.repo, input.deep)
        : buildOrgScript(input.source.name, input.deep);
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: { path: REPORT }, parser: 'gitleaks-json' }],
  produces: ['Finding'],
};
