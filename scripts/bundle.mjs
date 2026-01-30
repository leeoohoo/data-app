import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const entries = [
  {
    entry: 'plugin/backend/index.mjs',
    outfile: 'plugin/backend/index.bundle.mjs',
  },
  {
    entry: 'plugin/apps/data-app/mcp-server.mjs',
    outfile: 'plugin/apps/data-app/mcp-server.bundle.mjs',
  },
];

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  logLevel: 'info',
  sourcemap: false,
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
};

await Promise.all(
  entries.map(({ entry, outfile }) =>
    build({
      ...common,
      entryPoints: [path.join(rootDir, entry)],
      outfile: path.join(rootDir, outfile),
    })
  )
);
