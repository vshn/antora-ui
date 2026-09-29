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

  // A slot a brand forgets is not an error anywhere: PostCSS leaves the var() in place and the browser
  // discards the declaration, so the page renders with a default and no other test notices.
  test('every brand declares the same color slots, and they are the ones src reads', () => {
    const brands = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'brands.json'), 'utf8')).brands
    const slotsByBrand = {}
    for (const { name } of brands) {
      const css = fs.readFileSync(path.join(__dirname, '..', 'brands', name, 'css', 'tokens.css'), 'utf8')
      const declared = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]))
      slotsByBrand[name] = new Set([...declared].filter((it) => !it.startsWith(`--${name}-`)))
    }
    const union = new Set(Object.values(slotsByBrand).flatMap((set) => [...set]))
    const problems = []
    for (const [name, set] of Object.entries(slotsByBrand)) {
      const missing = [...union].filter((it) => !set.has(it)).sort()
      if (missing.length) problems.push(`${name} is missing ${missing.join(', ')}`)
    }
    expect(problems, 'brands disagree on their color slots').toEqual([])

    const read = new Set()
    const written = new Set()
    for (const file of walk(SRC).filter((it) => it.endsWith('.css'))) {
      if (path.relative(SRC, file).startsWith(path.join('js', 'vendor'))) continue
      const css = fs.readFileSync(file, 'utf8')
      for (const m of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) read.add(m[1])
      for (const m of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) written.add(m[1])
    }
    const suppliedByBrand = [...read].filter((it) => !written.has(it)).sort()
    const shared = [...union].sort()
    expect({
      'read by src but declared by no brand': suppliedByBrand.filter((it) => !union.has(it)),
      'declared by every brand but never read by src': shared.filter((it) => !suppliedByBrand.includes(it)),
    }).toEqual({
      'read by src but declared by no brand': [],
      'declared by every brand but never read by src': [],
    })
  })
})
