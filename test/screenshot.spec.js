'use strict'

const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

const ROOT = path.join(__dirname, '..')
const BRAND = process.env.BRAND || 'vshn'
const OUT = path.join(ROOT, 'screenshots', BRAND)
// read the way brand.spec.js reads it, so an unknown name fails loudly here instead of producing
// a directory of VSHN images under another brand's name
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands.json'), 'utf8'))
  .brands.find((it) => it.name === BRAND)

test.describe(`screenshots of the ${BRAND} brand`, () => {
  // Writing four images on every `npm test` would slow a suite that already runs in CI for no gain,
  // so this only runs when asked to: SCREENSHOTS=1 BRAND=<name> npx playwright test test/screenshot.spec.js
  test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1 to capture screenshots')

  // one fixed size, above the UI's 1024px breakpoint, so the brands can be compared side by side
  test.use({ viewport: { width: 1280, height: 900 } })

  test.beforeAll(() => {
    expect(brand, `brands.json does not list ${BRAND}`).toBeDefined()
    fs.mkdirSync(OUT, { recursive: true })
  })

  // animations: 'disabled' settles CSS transitions, so a hover color is captured at its final value
  const shot = (page, name, options = {}) =>
    page.screenshot({ path: path.join(OUT, name), animations: 'disabled', ...options })

  // The style guide page exercises every element type, so it is the most useful single image.
  test('style-guide.png', async ({ page }) => {
    await page.goto('/index.html')
    await shot(page, 'style-guide.png', { fullPage: true })
  })

  test('404.png', async ({ page }) => {
    await page.goto('/404.html')
    await shot(page, '404.png')
  })

  // The navbar hover state is where two brands once shipped unreadable text, and the broken pair was the
  // hovered dropdown ITEM (text and background), so the item is hovered, not just the trigger. The dropdown
  // opens on :hover of .has-dropdown (CSS only), and the item sits inside it, so moving the mouse onto the
  // item keeps it open. The first dropdown is used because the brands differ in how many they have.
  const dropdownItem = '.navbar-item.has-dropdown .navbar-dropdown a.navbar-item'

  test('navbar-hover.png', async ({ page }) => {
    await page.goto('/index.html')
    const dropdown = page.locator('.navbar-item.has-dropdown .navbar-dropdown').first()
    await page.locator('.navbar-item.has-dropdown .navbar-link').first().hover()
    await expect(dropdown).toBeVisible()
    const item = page.locator(dropdownItem).first()
    await item.hover()
    // hover() moves the mouse once; a second explicit move to the center makes sure :hover has applied
    const itemBox = await item.boundingBox()
    await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2)
    // the dropdown must still be open, or this would capture a closed menu labelled as a hover
    await expect(dropdown).toBeVisible()
    // animations: 'disabled' in shot() settles any hover transition
    const box = await dropdown.boundingBox()
    await shot(page, 'navbar-hover.png', { clip: { x: 0, y: 0, width: 1280, height: Math.ceil(box.y + box.height) + 8 } })
  })

  // Below 1024px a different media query styles the same hover, so the desktop image covers only half.
  // The burger (JS toggle) opens the menu; the dropdowns are then always shown, so no trigger hover is needed.
  test('navbar-hover-mobile.png', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await page.goto('/index.html')
    await page.locator('.navbar-burger').click()
    await expect(page.locator('#topbar-nav')).toHaveClass(/is-active/)
    const item = page.locator(dropdownItem).first()
    await expect(item).toBeVisible()
    await item.hover()
    const itemBox = await item.boundingBox()
    await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2)
    await expect(item).toBeVisible()
    await shot(page, 'navbar-hover-mobile.png')
  })

  // Search results render into the article, not into a panel, so the area is the navbar with the
  // search box plus the top of the results below it. It opens the way preview.spec.js does: fill the
  // input, press Enter, wait for the results heading.
  test('search.png', async ({ page }) => {
    await page.goto('/index.html')
    await page.locator('#search-input').fill('TOML')
    await page.locator('#search-input').press('Enter')
    await expect(page.locator('article.doc h1.page')).toHaveText('Search Results for "TOML"')
    await expect(page.locator('article.doc .search-entry').first()).toBeVisible()
    // move the mouse off the results so no entry is captured in its hover state
    await page.mouse.move(0, 0)
    const first = await page.locator('article.doc .search-div').first().boundingBox()
    const height = Math.min(900, Math.ceil(first.y + first.height * 3))
    await shot(page, 'search.png', { clip: { x: 0, y: 0, width: 1280, height } })
  })
})
