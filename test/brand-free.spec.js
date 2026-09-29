'use strict'

const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

// The whole point of the brand overlay: a brand fills slots, it does not edit the shared UI.
// The day someone puts a VSHN link back into a shared partial, this test says so.
const BRAND_WORDS = /vshn|appuio|k8up|projectsyn|syn\.tools/i
const SRC = path.join(__dirname, '..', 'src')

function walk (dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

test.describe('the shared UI carries no brand', () => {
  // This is the load-bearing test of the whole consolidation. It fails the day someone adds a VSHN
  // link to a shared partial, which is how the four forks came about.
  test('nothing under src names a brand, in its contents or its file name', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file)
      // js/vendor is third-party code we bundle, not UI we write
      if (rel.startsWith(path.join('js', 'vendor'))) continue
      if (BRAND_WORDS.test(rel)) offenders.push(`${rel} (file name)`)
      if (/\.(png|ico|jpe?g|gif|woff2?|ttf|eot)$/.test(file)) continue
      for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
        if (BRAND_WORDS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('every brand fills every slot', () => {
    const slots = ['brand-logo', 'brand-links', 'brand-footer', 'brand-icons', 'brand-meta']
    const brands = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'brands.json'), 'utf8')).brands
    expect(brands.length, 'brands.json lists no brands').toBeGreaterThan(0)
    const missing = []
    for (const { name } of brands) {
      for (const slot of slots) {
        const file = path.join(__dirname, '..', 'brands', name, 'partials', `${slot}.hbs`)
        if (!fs.existsSync(file)) missing.push(`brands/${name}/partials/${slot}.hbs`)
      }
    }
    expect(missing).toEqual([])
  })
})
