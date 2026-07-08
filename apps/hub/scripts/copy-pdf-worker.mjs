// Copies the pdf.js worker to public/ so the viewer can load it as a plain
// static asset — webpack cannot bundle the worker module itself.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const workerSrc = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build/pdf.worker.min.mjs')
const dest = join(here, '../public/pdf-worker.min.mjs')
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(workerSrc, dest)
console.log('pdf.js worker copied to public/pdf-worker.min.mjs')
