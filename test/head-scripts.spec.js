'use strict'

const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')
const { test, expect } = require('@playwright/test')

// Renders a partial with the UI's own helpers, the way Antora does
function render (partial, model) {
  const hbs = handlebars.create()
  const helpersDir = path.join(__dirname, '..', 'src', 'helpers')
  for (const file of fs.readdirSync(helpersDir)) {
    hbs.registerHelper(path.basename(file, '.js'), require(path.join(helpersDir, file)))
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'partials', `${partial}.hbs`), 'utf8')
  return hbs.compile(source)(model)
}

test.describe('head-scripts', () => {
  // Google Analytics sets cookies and sends visitor data to a third party, which needs consent.
  // None of these sites asks for it, so the UI does not load it at all, whatever a playbook says.
  test('loads no Google Analytics, even where a site still configures a key', () => {
    for (const key of ['G-FWQPMNS0R2', 'UA-54393406-8']) {
      const html = render('head-scripts', { site: { keys: { googleAnalytics: key } }, uiRootPath: '_' })
      expect(html).not.toContain('googletagmanager')
      expect(html).not.toContain('gtag(')
      expect(html).not.toContain(key)
    }
  })

  test('loads Plausible from the site\'s own domain', () => {
    const html = render('head-scripts', { site: { keys: { plausibleScript: 'script.js' } }, uiRootPath: '_' })
    expect(html).toContain('<script async src="/js/script.js"></script>')
    expect(html).toContain("plausible.init({endpoint:'/api/event'})")
    // the point of proxying it: no request leaves for plausible.io, so there is nothing to block
    expect(html).not.toContain('plausible.io')
  })

  test('loads no analytics at all without a key', () => {
    const html = render('head-scripts', { site: { keys: {} }, uiRootPath: '_' })
    expect(html).not.toContain('googletagmanager')
    expect(html).not.toContain('plausible')
  })

  test('passes the UI root path and the search page to the scripts', () => {
    const html = render('head-scripts', { site: { keys: { searchPagePath: 'sitesearch.html' } }, uiRootPath: '../_' })
    expect(html).toContain("var uiRootPath = '../_'")
    expect(html).toContain("var searchPagePath = 'sitesearch.html'")
  })
})
