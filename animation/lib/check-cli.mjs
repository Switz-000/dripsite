// npm run check -- scenes/<scene>.mjs     Lists a scene's problems; exit code 1 if there are errors.
import { loadSceneFile } from './load-node.mjs'
import { checkScene, formatIssues } from './check.mjs'
const file = process.argv.slice(2).find(a => /\.m?js$/.test(a))
if (!file){ console.error('Usage: npm run check -- scenes/<scene>.mjs'); process.exit(2) }
try {
  const { S, name } = await loadSceneFile(file)
  const issues = checkScene(S)
  const n = l => issues.filter(i => i.level === l).length
  console.log(`${name}: ${n('error')} errors, ${n('warn')} warnings, ${n('info')} notes\n` + formatIssues(issues))
  process.exit(n('error') ? 1 : 0)
} catch (e) { console.error('The scene did not run: ' + e.message); process.exit(1) }
