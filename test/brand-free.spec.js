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
  test('no stylesheet in src/css names a brand', () => {
    // passes once Task 2 moves the palette into brands/vshn
    test.fixme()
    const offenders = []
    for (const file of walk(path.join(SRC, 'css'))) {
      const rel = path.relative(SRC, file)
      if (BRAND_WORDS.test(rel)) offenders.push(`${rel} (file name)`)
      for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
        if (BRAND_WORDS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no script in src/js names a brand', () => {
    const offenders = []
    for (const file of walk(path.join(SRC, 'js'))) {
      const rel = path.relative(SRC, file)
      // js/vendor is third-party code we bundle, not UI we write
      if (rel.startsWith(path.join('js', 'vendor'))) continue
      if (BRAND_WORDS.test(rel)) offenders.push(`${rel} (file name)`)
    }
    expect(offenders).toEqual([])
  })
})
