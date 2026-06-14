import { Command } from 'commander';
import { ApiClient } from './lib/api-client';
import { ConfigStore } from './lib/config-store';
import { AgentStore } from './lib/agent-store';
import { runLogin } from './commands/login';
import { runScanRun } from './commands/scan';
import { runAgentRegister, runAgentRun, runAgentList } from './commands/agent';

async function buildAuthenticatedClient(store: ConfigStore): Promise<ApiClient> {
  const cfg = await store.load();
  if (!cfg.apiUrl || !cfg.accessToken) {
    throw new Error('Not logged in. Run `autoscanner login` first.');
  }
  return new ApiClient(cfg.apiUrl, cfg.accessToken);
}

async function main(): Promise<void> {
  const store = new ConfigStore();
  const agentStore = new AgentStore();
  const program = new Command();

  program.name('autoscanner').description('AutoScanner command-line client').version('0.1.0');

  program
    .command('login')
    .description('Authenticate against an api-gateway and persist tokens locally')
    .requiredOption('--api-url <url>', 'api-gateway base URL, e.g. http://localhost:3000')
    .requiredOption('--email <email>', 'operator email')
    .requiredOption('--password <password>', 'operator password')
    .action(async (opts: { apiUrl: string; email: string; password: string }) => {
      await runLogin(
        {
          store,
          buildClient: (url) => new ApiClient(url),
          log: (m) => console.log(m),
        },
        opts,
      );
    });

  const engagement = program.command('engagement').description('Manage engagements');
  engagement
    .command('create')
    .description('Create a new engagement')
    .requiredOption('--name <name>', 'engagement name')
    .requiredOption('--client <clientName>', 'client/organisation name')
    .option('--description <text>', 'optional description')
    .action(async (opts: { name: string; client: string; description?: string }) => {
      const api = await buildAuthenticatedClient(store);
      const eng = await api.createEngagement({
        name: opts.name,
        clientName: opts.client,
        description: opts.description,
      });
      console.log(`${eng.id}\t${eng.name}\t${eng.clientName}\t${eng.status}`);
    });
  engagement
    .command('list')
    .description('List your engagements')
    .action(async () => {
      const api = await buildAuthenticatedClient(store);
      const list = await api.listEngagements();
      for (const e of list) console.log(`${e.id}\t${e.name}\t${e.clientName}\t${e.status}`);
    });

  const scan = program.command('scan').description('Manage scans');
  scan
    .command('run')
    .description('Queue a scan')
    .requiredOption('-e, --engagement <id>', 'engagement id')
    .requiredOption('-s, --scanner <name>', 'scanner name (e.g. nmap)')
    .requiredOption('-t, --target <target>', 'scan target (ip / cidr / host)')
    .option('-o, --options <json>', 'scanner options as JSON string')
    .option('-n, --name <name>', 'optional scan label')
    .action(
      async (opts: {
        engagement: string;
        scanner: string;
        target: string;
        options?: string;
        name?: string;
      }) => {
        const api = await buildAuthenticatedClient(store);
        await runScanRun(
          { client: api, log: (m) => console.log(m) },
          {
            engagementId: opts.engagement,
            scannerName: opts.scanner,
            target: opts.target,
            optionsJson: opts.options,
            name: opts.name,
          },
        );
      },
    );
  scan
    .command('status <scanId>')
    .description('Show the current status of a scan and its jobs')
    .action(async (scanId: string) => {
      const api = await buildAuthenticatedClient(store);
      const s = await api.getScan(scanId);
      console.log(`scan=${s.id} status=${s.status}`);
      for (const j of s.jobs ?? []) {
        console.log(`  job=${j.id} scanner=${j.scannerName} target=${j.target} status=${j.status}`);
      }
    });
  scan
    .command('raw <scanJobId>')
    .description('Print a 1h-TTL presigned URL for the scan job raw output')
    .action(async (scanJobId: string) => {
      const api = await buildAuthenticatedClient(store);
      const url = await api.fetchRawOutputUrl(scanJobId);
      console.log(url);
    });

  const agent = program.command('agent').description('Manage distributed scan agents');

  agent
    .command('register')
    .description('Enrol this machine as a scan agent using a one-time bootstrap token')
    .requiredOption('--api-url <url>', 'api-gateway base URL, e.g. http://localhost:3000')
    .requiredOption('--token <token>', 'one-time bootstrap token from createAgentRegistration')
    .option('--name <name>', 'optional agent label')
    .action(async (opts: { apiUrl: string; token: string; name?: string }) => {
      const api = new ApiClient(opts.apiUrl);
      await runAgentRegister(
        {
          enrollAgent: (body) => api.enrollAgent(body),
          store: agentStore,
          log: (m) => console.log(m),
        },
        { apiUrl: opts.apiUrl, token: opts.token, name: opts.name },
      );
    });

  agent
    .command('run')
    .description('Start the agent poll loop (heartbeat → claim → run → submit)')
    .option('--interval <ms>', 'poll interval in milliseconds', '30000')
    .option('--once', 'run a single iteration and exit (useful for tests)')
    .action(async (opts: { interval: string; once?: boolean }) => {
      await runAgentRun(
        {
          store: agentStore,
          buildClient: (apiUrl) => new ApiClient(apiUrl),
          log: (m) => console.log(m),
        },
        { intervalMs: Number(opts.interval), once: opts.once },
      );
    });

  agent
    .command('list')
    .description('List agents visible to the authenticated operator')
    .action(async () => {
      const api = await buildAuthenticatedClient(store);
      await runAgentList({
        listAgents: () => api.listAgents(),
        log: (m) => console.log(m),
      });
    });

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`error: ${msg}`);
  process.exitCode = 1;
});
