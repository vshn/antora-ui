'use strict'

const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const ROOT = path.join(__dirname, '..')
const BRAND = process.env.BRAND || 'vshn'
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands.json'), 'utf8')).brands
const brand = manifest.find((it) => it.name === BRAND)
const STAGED = path.join(ROOT, 'public', '_', 'css')

// PostCSS does not fail on a custom property it cannot resolve: it leaves the var() in the output and
// the browser falls back to its own default. A brand that forgets a token would ship a page styled by
// accident, and no rendering test would call it wrong. Read the packaged CSS instead.
test.describe(`packaged CSS for ${BRAND}`, () => {
  // Only the packaged build resolves the custom properties. The preview build preserves them on
  // purpose, so running this against the preview would fail for a reason that is not a defect.
  test.skip(process.env.PREVIEW_ASSETS !== 'bundle', 'needs the packaged assets: run npm run test:bundle')
  test.skip(!fs.existsSync(STAGED), 'no packaged CSS: the preview server did not build')

  test('resolves every color the brand supplies', () => {
    const file = fs.readdirSync(STAGED).find((name) => /^site(-[0-9a-f]{8})?\.css$/.test(name))
    const css = fs.readFileSync(path.join(STAGED, file), 'utf8')
    const hex = '#' + brand.navbarBackground.match(/\d+/g)
      .map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    expect(css.toLowerCase()).toContain(hex)
    const tokens = fs.readFileSync(path.join(ROOT, 'brands', BRAND, 'css', 'tokens.css'), 'utf8')
    const slots = [...new Set([...tokens.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]))]
      .filter((it) => !it.startsWith(`--${BRAND}-`))
    expect(slots.length, 'no color slots found in tokens.css').toBeGreaterThan(0)
    for (const token of slots) {
      expect(css, `${token} was left unresolved`).not.toContain(`var(${token})`)
    }
  })
})
