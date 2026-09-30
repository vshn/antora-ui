'use strict'

const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')
const { test, expect } = require('@playwright/test')

// Renders a partial or layout with the UI's own helpers, the way Antora does
function render (kind, name, model) {
  const hbs = handlebars.create()
  const srcDir = path.join(__dirname, '..', 'src')
  const helpersDir = path.join(srcDir, 'helpers')
  for (const file of fs.readdirSync(helpersDir)) {
    hbs.registerHelper(path.basename(file, '.js'), require(path.join(helpersDir, file)))
  }
  // head-meta includes the brand slot, which the brand-free UI leaves empty
  hbs.registerPartial('brand-meta', '')
  const source = fs.readFileSync(path.join(srcDir, kind, `${name}.hbs`), 'utf8')
  return hbs.compile(source)(model)
}

const keys = { opensearch: true, searchPagePath: 'user/search.html' }
const site = (over = {}) => ({ site: { url: 'https://docs.example.org', title: 'Example Docs', keys, ...over } })

test.describe('head-meta opensearch link', () => {
  test('renders the discovery link when all three keys are present', () => {
    const html = render('partials', 'head-meta', site())
    const link = html.match(/<link rel="search"[^>]*>/)[0]
    expect(link).toContain('type="application/opensearchdescription+xml"')
    expect(link).toContain('title="Example Docs"')
    expect(link).toContain('href="https://docs.example.org/opensearchdescription.xml"')
  })

  test('joins the site URL without doubling the slash', () => {
    const html = render('partials', 'head-meta', site({ url: 'https://docs.example.org/' }))
    expect(html).toContain('href="https://docs.example.org/opensearchdescription.xml"')
  })

  test('does not render without site.keys.opensearch', () => {
    const html = render('partials', 'head-meta', site({ keys: { searchPagePath: 'user/search.html' } }))
    expect(html).not.toContain('opensearch')
  })

  test('does not render without site.keys.searchPagePath', () => {
    const html = render('partials', 'head-meta', site({ keys: { opensearch: true } }))
    expect(html).not.toContain('opensearch')
  })

  test('does not render without site.url', () => {
    const html = render('partials', 'head-meta', site({ url: undefined }))
    expect(html).not.toContain('opensearch')
  })

  test('keeps the other meta tags', () => {
    const html = render('partials', 'head-meta', site())
    for (const t of ['og:type', 'og:site_name', 'twitter:card', 'og:locale']) expect(html).toContain(t)
  })
})

test.describe('opensearch layout', () => {
  const layout = (over) => render('layouts', 'opensearch', site(over))

  test('is well-formed as far as it can be checked without an XML parser', () => {
    const xml = layout()
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">')
    const stack = []
    for (const m of xml.replace(/<\?[\s\S]*?\?>/, '').matchAll(/<(\/?)([A-Za-z][\w-]*)[^>]*?(\/?)>/g)) {
      if (m[3]) continue
      if (m[1]) expect(stack.pop()).toBe(m[2])
      else stack.push(m[2])
    }
    expect(stack).toEqual([])
    // no stray angle brackets or ampersands in text
    expect(xml.replace(/<[^>]*>/g, '')).not.toMatch(/[<>]|&(?!(amp|lt|gt|quot|#x27|#x3D|#x60);)/)
  })

  test('emits every value from the site configuration', () => {
    const xml = layout()
    expect(xml).toContain('<ShortName>Example Docs</ShortName>')
    expect(xml).toContain('<Description>Example Docs</Description>')
    expect(xml).toContain('<SearchForm>https://docs.example.org/user/search.html</SearchForm>')
    expect(xml).toContain('<Image width="16" height="16">https://docs.example.org/_/img/favicon-16x16.png</Image>')
    expect(xml).toContain('<InputEncoding>UTF-8</InputEncoding>')
    expect(xml).not.toContain('<Tags>')
  })

  for (const url of ['https://docs.example.org', 'https://docs.example.org/']) {
    for (const searchPagePath of ['user/search.html', '/user/search.html']) {
      test(`Url template for url=${url} searchPagePath=${searchPagePath}`, () => {
        const xml = layout({ url, keys: { opensearch: true, searchPagePath } })
        const template = xml.match(/<Url [^>]*template="([^"]*)"/)[1]
        expect(template).toBe('https://docs.example.org/user/search.html?q={searchTerms}')
        expect(template.split('?q={searchTerms}').length - 1).toBe(1)
        expect(template.replace('https://', '')).not.toContain('//')
        expect(xml).toContain('<SearchForm>https://docs.example.org/user/search.html</SearchForm>')
      })
    }
  }

  test('escapes markup characters in the title', () => {
    const xml = layout({ title: 'R&D <Docs>' })
    expect(xml).toContain('<ShortName>R&amp;D &lt;Docs&gt;</ShortName>')
    expect(xml).toContain('<Description>R&amp;D &lt;Docs&gt;</Description>')
    expect(xml).not.toContain('R&D')
  })

  test('uses opensearchShortName when set, the title otherwise', () => {
    const withKey = layout({ keys: { ...keys, opensearchShortName: 'Short' } })
    expect(withKey).toContain('<ShortName>Short</ShortName>')
    expect(withKey).toContain('<Description>Example Docs</Description>')
    expect(layout()).toContain('<ShortName>Example Docs</ShortName>')
  })
})
