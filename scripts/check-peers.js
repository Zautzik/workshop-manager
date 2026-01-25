const { execSync } = require('child_process');
const pkg = require('../package.json');
const deps = Object.keys(pkg.dependencies || {});
const results = [];
for (const d of deps) {
  try {
    const out = execSync(`npm view ${d} peerDependencies --json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 60000 }).trim();
    if (!out) continue;
    let pd;
    try { pd = JSON.parse(out); } catch (e) { pd = null; }
    if (pd && pd.react) {
      results.push({ pkg: d, peerReact: pd.react });
    }
  } catch (e) {
    // ignore
  }
}
console.log(JSON.stringify(results, null, 2));
