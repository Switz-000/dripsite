// The one vault the site uses in the browser. Hooks and pages import this;
// the build makes its own from the disk adapter (scripts/vault.mjs).
import { createVault } from './vault.js'
import { githubAdapter } from './githubAdapter.js'

export const vault = createVault(githubAdapter())
