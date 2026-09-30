'use strict'

const fs = require('fs-extra')
const path = require('path')
const { test, expect } = require('@playwright/test')

const ROOT = path.join(__dirname, '..')
const STAGING = path.join(ROOT, 'build', 'staging-test')
const stage = require(path.join(ROOT, 'gulp.d', 'tasks', 'stage'))
const pack = require(path.join(ROOT, 'gulp.d', 'tasks', 'pack'))

function run (brand) {
  return stage(path.join(ROOT, 'src'), path.join(ROOT, 'brands', brand), STAGING, brand)()
}

test.describe('staging a brand over the shared UI', () => {
  test.afterEach(() => fs.removeSync(STAGING))

  test('puts the brand files next to the shared ones', async () => {
    await run('vshn')
    expect(fs.existsSync(path.join(STAGING, 'css', 'site.css'))).toBe(true)
    expect(fs.existsSync(path.join(STAGING, 'css', 'tokens.css'))).toBe(true)
    expect(fs.existsSync(path.join(STAGING, 'img', 'vshn.svg'))).toBe(true)
  })

  test('marks the staged tree with the brand it was built for', async () => {
    await run('vshn')
    expect(fs.readFileSync(path.join(STAGING, '.brand'), 'utf8')).toBe('vshn\n')
    await run('appuio')
    expect(fs.readFileSync(path.join(STAGING, '.brand'), 'utf8')).toBe('appuio\n')
  })

  test('leaves nothing of the previous brand behind', async () => {
    await run('vshn')
    expect(fs.existsSync(path.join(STAGING, 'img', 'vshn.svg'))).toBe(true)
    await run('vshn')
    // a second brand exists from Task 5 onwards; until then, prove the wipe itself
    fs.writeFileSync(path.join(STAGING, 'img', 'left-over.svg'), '<svg/>')
    await run('vshn')
    expect(fs.existsSync(path.join(STAGING, 'img', 'left-over.svg'))).toBe(false)
  })
})

test.describe('choosing a brand', () => {
  const brand = require(path.join(ROOT, 'gulp.d', 'lib', 'brand'))

  test('refuses a name that is not in the manifest', () => {
    process.argv.push('--brand=vhsn')
    try {
      expect(() => brand.selected()).toThrow(/unknown brand 'vhsn'/)
    } finally {
      process.argv.pop()
    }
  })

  test('publishes the VSHN bundle under the name four sites already pin', () => {
    expect(brand.brands().find((it) => it.name === 'vshn').bundle).toBe('ui-bundle.zip')
  })
})

test.describe('packing a staged tree', () => {
  const BUILT = path.join(ROOT, 'build', 'pack-test-built')
  const DEST = path.join(ROOT, 'build', 'pack-test-dest')

  test.beforeEach(() => {
    fs.emptyDirSync(BUILT)
    fs.emptyDirSync(DEST)
    fs.writeFileSync(path.join(BUILT, 'file.txt'), 'x')
  })
  test.afterEach(() => {
    fs.removeSync(BUILT)
    fs.removeSync(DEST)
  })

  // This drives the task function that bundle:pack wraps, so the guard is exercised where it lives in
  // gulp.d/tasks/pack.js, without starting gulp.
  test('refuses a tree that was built for a different brand', () => {
    fs.writeFileSync(path.join(BUILT, '.brand'), 'appuio\n')
    expect(() => pack(BUILT, DEST, 'ui-bundle.zip', undefined, 'vshn')())
      .toThrow(/holds the 'appuio' brand, not 'vshn'/)
    expect(fs.existsSync(path.join(DEST, 'ui-bundle.zip'))).toBe(false)
  })

  test('refuses a tree with no brand marker', () => {
    expect(() => pack(BUILT, DEST, 'ui-bundle.zip', undefined, 'vshn')())
      .toThrow(/holds no brand marker, not 'vshn'/)
  })

  test('packs a tree built for the requested brand', async () => {
    fs.writeFileSync(path.join(BUILT, '.brand'), 'vshn\n')
    await pack(BUILT, DEST, 'ui-bundle.zip', undefined, 'vshn')()
    expect(fs.existsSync(path.join(DEST, 'ui-bundle.zip'))).toBe(true)
  })
})
