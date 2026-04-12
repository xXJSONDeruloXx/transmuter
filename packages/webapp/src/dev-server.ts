/**
 * Development server for the Transmuter webapp.
 * Usage: npx tsx src/dev-server.ts <path-to-session-report.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { type Plugin, createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const jsonPath = process.argv.slice(2).find((arg) => arg !== '--');

  if (!jsonPath) {
    console.error('Usage: npx tsx src/dev-server.ts <path-to-session-report.json>');
    process.exit(1);
  }

  // INIT_CWD is set by pnpm to the directory where the user ran the command,
  // since --filter changes cwd to the package directory.
  const resolveBase = process.env.INIT_CWD ?? process.cwd();
  const absoluteJsonPath = path.isAbsolute(jsonPath) ? jsonPath : path.resolve(resolveBase, jsonPath);

  if (!fs.existsSync(absoluteJsonPath)) {
    console.error(`Error: File not found: ${absoluteJsonPath}`);
    process.exit(1);
  }

  let reportData = JSON.parse(fs.readFileSync(absoluteJsonPath, 'utf-8'));

  let server: Awaited<ReturnType<typeof createServer>>;

  fs.watch(absoluteJsonPath, (eventType) => {
    if (eventType === 'change') {
      try {
        reportData = JSON.parse(fs.readFileSync(absoluteJsonPath, 'utf-8'));
        console.log(`\n[dev-server] Report data reloaded from ${path.basename(absoluteJsonPath)}`);
        server?.ws.send({ type: 'full-reload' });
      } catch (e) {
        console.error('[dev-server] Failed to reload JSON:', e);
      }
    }
  });

  const injectReportDataPlugin: Plugin = {
    name: 'inject-session-report',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const jsonString = JSON.stringify(reportData);
        const base64Data = Buffer.from(jsonString).toString('base64');
        const script = `<script>
  window.__SESSION_REPORT__ = JSON.parse(atob('${base64Data}'));
</script>`;
        return html.replace('</head>', `${script}</head>`);
      },
    },
  };

  server = await createServer({
    configFile: path.join(__dirname, '..', 'vite.config.ts'),
    server: {
      port: 3001,
      open: true,
    },
    plugins: [injectReportDataPlugin],
  });

  await server.listen();

  console.log(`\n  Transmuter Session Report`);
  console.log(`  -------------------------`);
  console.log(`  Local:   http://localhost:${server.config.server.port}/`);
  console.log(`  Data:    ${absoluteJsonPath}`);
  console.log(`\n  Watching for changes to the JSON file.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
