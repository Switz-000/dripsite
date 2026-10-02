// Lets plain Node import the site's portrait engine, which imports parts.json the Vite way
// (without `with { type: 'json' }`). Used as: node --import ./lib/register.mjs <script>
import { register } from 'node:module'
register('./json-hook.mjs', import.meta.url)
