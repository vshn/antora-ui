'use strict'

const fs = require('fs-extra')
const path = require('path')
const { test, expect } = require('@playwright/test')

const ROOT = path.join(__dirname, '..')
const STAGING = path.join(ROOT, 'build', 'staging-test')
const stage = require(path.join(ROOT, 'gulp.d', 'tasks', 'stage'))

function run (brand) {
  return stage(path.join(ROOT, 'src'), path.join(ROOT, 'brands', brand), STAGING)()
}

test.describe('staging a brand over the shared UI', () => {
  test.afterEach(() => fs.removeSync(STAGING))

  test('puts the brand files next to the shared ones', async () => {
    await run('vshn')
    expect(fs.existsSync(path.join(STAGING, 'css', 'site.css'))).toBe(true)
    expect(fs.existsSync(path.join(STAGING, 'css', 'tokens.css'))).toBe(true)
    expect(fs.existsSync(path.join(STAGING, 'img', 'vshn.svg'))).toBe(true)
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
