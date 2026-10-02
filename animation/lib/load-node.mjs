// Node side of loading a scene: presets and sets from disk, cast from the vault, flags as files.
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runScene } from './scene.mjs'
import { loadCast, flagPath } from './cast.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export async function loadSceneFile(file){
  const presets = Object.fromEntries(fs.readdirSync(path.join(ROOT,'presets')).filter(f=>f.endsWith('.json')).map(f => { const p = JSON.parse(fs.readFileSync(path.join(ROOT,'presets',f),'utf8')); return [p.name, p] }))
  const sets = {}; for (const f of fs.readdirSync(path.join(ROOT,'sets')).filter(f=>f.endsWith('.mjs'))) sets[f.replace(/\.mjs$/,'')] = (await import(pathToFileURL(path.join(ROOT,'sets',f)))).default
  const scene = (await import(pathToFileURL(path.resolve(file)) + '?t=' + Date.now())).default
  const S = runScene(scene, { cast: loadCast(), presets, sets, assets: { flag: n => flagPath(n) } })
  return { S, scene, name: path.basename(file).replace(/\.m?js$/,'') }
}
