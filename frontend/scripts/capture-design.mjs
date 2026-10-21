// Captures the design review screenshots from the static Storybook build.
// Usage: npm run capture:design (builds Storybook first). Writes PNGs to
// docs/design/<target>-<theme>-<width>.png at the repository root.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = fileURLToPath(new URL('.', import.meta.url))
const staticDir = resolve(here, '../storybook-static')
const outDir = resolve(here, '../../docs/design')

const TARGETS = [
  ['foundations', 'foundations--overview'],
  ['key-variants', 'atoms-key--all-variants'],
  ['status-pill', 'molecules-statuspill--gallery'],
  ['expression-line', 'molecules-expressionline--gallery'],
  ['display-value', 'molecules-displayvalue--gallery'],
  ['error-notice', 'molecules-errornotice--gallery'],
  ['history-item', 'molecules-historyitem--gallery'],
]
const THEMES = ['light', 'dark']
const WIDTHS = [375, 1024]

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

function serve(dir) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    let file = join(dir, path)
    if (!file.startsWith(dir)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, 'index.html')
    }
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

async function open(page, base, id, theme) {
  await page.goto(`${base}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`)
  await page.waitForSelector(`.sb-theme[data-theme="${theme}"]`)
  // The Foundations tables fill in after layout; wait until no ratio is pending.
  await page.waitForFunction(() => !document.body.innerText.includes('…'))
  await page.evaluate(() => document.fonts.ready)
}

if (!existsSync(join(staticDir, 'iframe.html'))) {
  console.error('storybook-static is missing; run `npm run build-storybook` first.')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const server = await serve(staticDir)
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const written = []
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    for (const theme of THEMES) {
      for (const [name, id] of TARGETS) {
        await open(page, base, id, theme)
        const file = join(outDir, `${name}-${theme}-${width}.png`)
        await page.screenshot({ path: file, fullPage: true })
        written.push(file)
      }
      // Hover only renders under a real pointer, so it gets its own capture.
      await open(page, base, 'atoms-key--all-variants', theme)
      await page.getByRole('button', { name: '7', exact: true }).hover()
      const file = join(outDir, `key-hover-${theme}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      written.push(file)
    }
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
for (const file of written) {
  console.log(file.slice(resolve(here, '../..').length + 1))
}
