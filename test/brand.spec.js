'use strict'

const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const ROOT = path.join(__dirname, '..')
const BRAND = process.env.BRAND || 'vshn'
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands.json'), 'utf8'))
  .brands.find((it) => it.name === BRAND)

test.describe(`the ${BRAND} brand`, () => {
  test('shows its own logo, and the image is served', async ({ page }) => {
    const responses = new Map()
    page.on('response', (response) => responses.set(response.url(), response.status()))
    await page.goto('/index.html')
    const logo = path.basename(brand.logo)
    const css = await page.evaluate(() => [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)).join('\n'))
    expect(css, `no rule references ${logo}`).toContain(logo)
    const served = [...responses].find(([url]) => url.endsWith(`/img/${logo}`))
    expect(served, `${logo} was never requested`).toBeDefined()
    expect(served[1]).toBe(200)
  })

  test('paints the navbar in its own color', async ({ page }) => {
    await page.goto('/index.html')
    const background = await page.locator('.navbar').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(background).toBe(brand.navbarBackground)
  })

  // A missing favicon is a request on every page of the site that nobody notices, because the page
  // renders perfectly without it.
  test('serves every favicon its markup asks for', async ({ page }) => {
    await page.goto('/index.html')
    const hrefs = await page.locator('link[rel*="icon"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      const response = await page.request.get(href)
      expect(response.status(), `${href} is referenced but not shipped`).toBe(200)
    }
  })

  // A sizes attribute that disagrees with the file makes browsers pick or scale the wrong icon.
  test('declares the real pixel size of every PNG icon', async ({ page }) => {
    await page.goto('/index.html')
    const icons = await page.locator('link[rel*="icon"][sizes]').evaluateAll((links) =>
      links.map((link) => ({ href: link.getAttribute('href'), sizes: link.getAttribute('sizes') })))
    const checked = icons.filter(({ href, sizes }) => /\.png$/.test(href) && /^\d+x\d+$/.test(sizes))
    expect(checked.length).toBeGreaterThan(0)
    for (const { href, sizes } of checked) {
      const buf = await (await page.request.get(href)).body()
      const [width, height] = sizes.split('x').map(Number)
      expect(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, `${href} declares sizes="${sizes}"`)
        .toBe(`${width}x${height}`)
    }
  })
})
