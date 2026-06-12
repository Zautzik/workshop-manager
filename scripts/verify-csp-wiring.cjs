const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relPath) {
  const abs = path.join(root, relPath);
  return fs.readFileSync(abs, 'utf8');
}

function assertContains(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message + ` Missing: ${needle}`);
  }
}

try {
  const proxyTs = read('src/proxy.ts');
  const nextConfig = read('next.config.js');
  const layoutTsx = read('src/app/layout.tsx');

  assertContains(
    proxyTs,
    "res.headers.set('Content-Security-Policy'",
    'CSP header is no longer set in src/proxy.ts.'
  );

  assertContains(
    proxyTs,
    "requestHeaders.set('x-nonce'",
    'x-nonce forwarding is missing in src/proxy.ts.'
  );

  assertContains(
    nextConfig,
    'src/proxy.ts',
    'next.config.js no longer documents src/proxy.ts as CSP owner.'
  );

  assertContains(
    layoutTsx,
    "headers()).get('x-nonce')",
    'Root layout no longer reads x-nonce from request headers.'
  );

  console.log('CSP wiring check passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
