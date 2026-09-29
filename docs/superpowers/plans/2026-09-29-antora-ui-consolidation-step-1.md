# Antora UI consolidation, step 1: one repository, four brand bundles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repository into one brand-free UI plus four brand overlays, build a bundle per brand from a manifest-driven CI matrix, rename the repository to `vshn/antora-ui`, release it, and point the four VSHN consumers at the new name.

**Architecture:** `src/` becomes the shared UI and carries no brand string. Each brand is a directory under `brands/` holding a colour token file, a brand stylesheet, its logo and favicons, and five Handlebars partials that fill slots the shared templates include. The build stages `src/` into `build/staging`, copies the selected brand over it, and then runs the existing compile, fingerprint and pack pipeline unchanged. `brands.json` lists the brands and drives both the CI matrix and the per-brand tests.

**Tech Stack:** Node 20, gulp 5, PostCSS (postcss-import, postcss-custom-properties), Handlebars 4, Playwright 1.63, GitHub Actions, Docker (`ghcr.io/vshn/antora`).

**Spec:** `docs/superpowers/specs/2026-09-29-antora-ui-consolidation-design.md`

**Before you start:** run `npm ci` and `npx playwright install --with-deps chromium` once. Tasks 10 to 12 touch repositories other than this one; a worktree-isolated session cannot run git against another checkout, so run those from a terminal or a session that is not worktree-isolated.

## Global Constraints

- **`src/` must contain no brand string.** Not in file contents, not in file names. The forbidden set is `vshn`, `appuio`, `k8up`, `projectsyn`, `syn.tools`, case-insensitive. Task 4 makes this a test.
- **The VSHN bundle keeps the file name `ui-bundle.zip`.** Every other brand publishes `ui-bundle-<brand>.zip`. Renaming the VSHN asset would break the pins in handbook, kb, products and appcat at their next bump.
- **One tag, one release, four assets.** All brands share a version.
- **No visual change for VSHN.** Tasks 1 to 4 must leave the rendered VSHN site byte-identical in colour and markup. Every colour value written into `brands/vshn/` comes from today's `src/css/vars.css`.
- **The four brand names are exactly** `vshn`, `appuio`, `k8up`, `syn`.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Writing style:** no em dashes in any file this plan creates or edits, American English.
- **Node version** stays at 20 in CI. `js-yaml` here is 3.15, which has `safeLoad` and not `load`; this plan avoids YAML parsing in new code entirely.

## Review Focus

Five things the spec requires but that no task's main deliverable would exercise on its own. Each has a test assigned to the task that owns the code.

1. **An unknown or misspelled `--brand=` value must fail the build**, not silently produce a VSHN-coloured bundle under another brand's name. Test in Task 2.
2. **A stale file from a previous brand must not survive into the next bundle.** The build stages into one shared directory, so this is the design's sharpest edge: build appuio after vshn in the same workspace and `img/vshn.svg` must be gone. Test in Task 2 (unit, on the stage task) and Task 5 (on the packed zip).
3. **A brand colour token that resolves to nothing must fail loudly.** PostCSS leaves an unresolvable `var(--x)` in the output rather than erroring, and the page then renders with the browser default. Test in Task 2: the packed CSS carries the brand's navbar hex and contains no `var(--navbar-background)`.
4. **A favicon referenced by a brand's markup but absent from its `img/` directory** gives every page of that site a broken icon request, which no rendering test notices. Test in Task 5.
5. **The VSHN bundle's asset name must not drift.** A release that publishes `ui-bundle-vshn.zip` instead of `ui-bundle.zip` breaks four production sites at their next Renovate bump. Test in Task 2 (the packed path) and asserted again in Task 11 against the real release.

---

## File Structure

**Created:**

| path | responsibility |
|---|---|
| `brands.json` | the brand manifest: name, display title, bundle file name, logo path, expected navbar colour. Read by the build, the tests and the CI matrix. |
| `gulp.d/lib/brand.js` | resolves the selected brand from `--brand=` or `BRAND`, validates it against the manifest and the filesystem |
| `gulp.d/tasks/stage.js` | wipes `build/staging`, copies `src/` into it, copies the brand over it |
| `src/css/palette.css` | the brand-free neutral colour scale and the admonition colours, imported before the brand tokens |
| `brands/<name>/css/tokens.css` | that brand's colour literals and the colour slots the shared stylesheets read |
| `brands/<name>/css/brand.css` | that brand's logo rule and any rule only that brand needs |
| `brands/<name>/img/` | that brand's logo and favicons |
| `brands/<name>/partials/brand-logo.hbs` | the navbar logo element |
| `brands/<name>/partials/brand-links.hbs` | the navbar dropdown or links |
| `brands/<name>/partials/brand-footer.hbs` | the footer text |
| `brands/<name>/partials/brand-icons.hbs` | the favicon and apple-touch-icon links |
| `brands/<name>/partials/brand-meta.hbs` | `twitter:site` and the default social image |
| `test/brand-free.spec.js` | the load-bearing invariant: `src/` holds no brand string |
| `test/stage.spec.js` | the stage task leaves nothing of the previous brand behind |
| `test/brand.spec.js` | per-brand: logo served, navbar colour, every favicon resolves |

**Modified:**

| path | change |
|---|---|
| `src/css/vars.css` | loses the VSHN palette and every colour slot that a brand now owns |
| `src/css/site.css` | imports `palette.css`, `tokens.css`, `vars.css` in that order, and `brand.css` last |
| `src/css/base.css`, `doc.css`, `nav.css`, `toolbar.css`, `breadcrumbs.css`, `page-versions.css`, `header.css` | 12 `var(--vshn-*)` references become semantic tokens |
| `src/js/07-vshn-search.js` | renamed to `src/js/07-search.js` |
| `src/partials/header-content.hbs`, `footer-content.hbs`, `head-icons.hbs`, `head-meta.hbs`, `head-info.hbs` | brand markup replaced by `{{> brand-* }}` |
| `gulpfile.js` | staging task, brand-aware build and pack, brand-aware lint glob |
| `gulp.d/tasks/pack.js` | takes the bundle file name instead of a stem |
| `test/bundle.spec.js` | derives the bundle path from `BRAND`, adds the cross-brand leakage test |
| `test/antora-image.sh` | reads the bundle path from `UI_BUNDLE`, writes its own playbook |
| `.github/workflows/gulp.yml` | matrix from `brands.json`, one release job collecting four assets |
| `README.adoc`, `docs/modules/ROOT/pages/*` | how to build a brand, and the new repository name |

---

## Task 1: Give the shared stylesheets brand-free token names

Twelve places in the shared CSS read a `--vshn-*` colour directly. They become semantic tokens with today's values, so nothing renders differently. After this task the only brand strings left in `src/css` are in `vars.css`, which Task 2 empties.

**Files:**
- Modify: `src/css/vars.css`
- Modify: `src/css/base.css:31`, `src/css/base.css:36`, `src/css/base.css:42`
- Modify: `src/css/doc.css:12`
- Modify: `src/css/breadcrumbs.css:42`
- Modify: `src/css/toolbar.css:72`
- Modify: `src/css/nav.css:149`, `src/css/nav.css:258`
- Modify: `src/css/page-versions.css:45`
- Modify: `src/css/header.css:182`, `src/css/header.css:280`
- Rename: `src/js/07-vshn-search.js` to `src/js/07-search.js`
- Test: `test/brand-free.spec.js` (created here, covering `src/css` only; Task 4 widens it)

**Interfaces:**
- Consumes: nothing.
- Produces: the semantic token names `--accent-color`, `--mark-background`, `--link_hover-font-color` (repurposed), used by Task 2 as the contract every brand's `tokens.css` must satisfy.

- [ ] **Step 1: Write the failing test**

Create `test/brand-free.spec.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: FAIL. The first test lists the `--vshn-*` declarations in `vars.css` and the 12 references; the second lists `js/07-vshn-search.js (file name)`.

- [ ] **Step 3: Add the semantic tokens to `src/css/vars.css`**

In the `/* VSHN Colors */` block, after `--vshn-link-hover-color: var(--vshn-capri);`, add:

```css
  /* colour slots the shared stylesheets read; a brand supplies the values */
  --accent-color: var(--vshn-capri);
  --mark-background: var(--vshn-amber);
```

Then change the `/* doc */` block's line 97 from

```css
  --link_hover-font-color: var(--vshn-silver-sand);
```

to

```css
  --link_hover-font-color: var(--vshn-link-hover-color);
```

That token is declared but read nowhere today, so changing its value changes no pixel. Step 4 starts reading it, with the value `a:hover` already used.

- [ ] **Step 4: Replace the 12 direct palette references**

`src/css/base.css`, three replacements:

```css
a {
  text-decoration: none;
  font-weight: normal;
  color: var(--link-font-color);
}

a:hover {
  text-decoration: none;
  color: var(--link_hover-font-color);
}

a:active {
  text-decoration: none;
  background-color: none;
  color: var(--link_hover-font-color);
}
```

`src/css/doc.css:12`:

```css
mark {
  background-color: var(--mark-background);
}
```

`src/css/breadcrumbs.css:42`, `src/css/toolbar.css:72`, `src/css/nav.css:149`, `src/css/nav.css:258`, `src/css/page-versions.css:45`, each currently `color: var(--vshn-capri);`:

```css
  color: var(--accent-color);
```

`src/css/header.css:182` and `src/css/header.css:280`, each inside a `.navbar-dropdown a.navbar-item:hover` rule and currently `color: var(--vshn-rich-black);`:

```css
    color: var(--navbar-menu-font-color);
```

`--navbar-menu-font-color` is `var(--vshn-rich-black)` today, so the colour is unchanged.

Run this to confirm nothing outside `vars.css` still reads the palette:

```bash
grep -rn -- '--vshn-' src/css/ | grep -v '^src/css/vars.css:'
```

Expected: no output.

- [ ] **Step 5: Rename the search script**

```bash
git mv src/js/07-vshn-search.js src/js/07-search.js
grep -rn '07-vshn-search' . --exclude-dir=node_modules --exclude-dir=.git
```

Expected: no output from the grep. The build globs `js/+([0-9])-*.js` and concatenates into `js/site.js`, so nothing names this file.

- [ ] **Step 6: Run the new test to verify it passes**

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: the `src/js` test PASSES. The `src/css` test still FAILS on the `--vshn-*` declarations in `vars.css`, which Task 2 removes. Add `test.fixme()` as the first statement of that test's body, with the comment `// passes once Task 2 moves the palette into brands/vshn`, and re-run: 1 passed, 1 skipped.

- [ ] **Step 7: Run the whole suite to prove nothing rendered differently**

```bash
npm ci
npx playwright install --with-deps chromium
npm test
```

Expected: PASS, the same tests as before this task.

- [ ] **Step 8: Commit**

```bash
git add src/css test/brand-free.spec.js src/js/07-search.js
git commit -m "refactor: read colours through semantic tokens, not the VSHN palette

The shared stylesheets named VSHN colours directly, which is what made a brand
a fork. They now read --accent-color, --mark-background, --link-font-color and
--link_hover-font-color, whose values still come from the VSHN palette, so the
rendered site is unchanged. --link_hover-font-color was declared and never read;
it takes over the value a:hover already used.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Stage a brand over the shared UI, and make VSHN the first brand

The build gains a staging step. `brands/vshn/` is created by moving today's VSHN pieces out of `src/`, so no brand is the implicit default.

**Files:**
- Create: `brands.json`
- Create: `gulp.d/lib/brand.js`
- Create: `gulp.d/tasks/stage.js`
- Create: `src/css/palette.css`
- Create: `brands/vshn/css/tokens.css`, `brands/vshn/css/brand.css`
- Move: `src/img/vshn.svg` and the eight `src/img/favicon-*.png` into `brands/vshn/img/`
- Modify: `src/css/vars.css`, `src/css/site.css`, `src/css/header.css`
- Modify: `gulpfile.js`, `gulp.d/tasks/pack.js`
- Test: `test/stage.spec.js`, `test/brand-css.spec.js`, `test/brand-free.spec.js` (un-fixme the CSS test)

**Interfaces:**
- Consumes: the semantic token names from Task 1.
- Produces:
  - `require('./gulp.d/lib/brand')` exporting `{ brands(), selected() }`. `brands()` returns the array from `brands.json`. `selected()` returns `{ name, title, bundle, logo, navbarBackground, dir }` where `dir` is `brands/<name>`, and throws on an unknown name or a missing directory.
  - `require('./gulp.d/tasks/stage')(srcDir, brandDir, stagingDir)` returning a gulp task function.
  - `task.pack(src, dest, bundleFileName, onFinish)`, taking the full file name (`ui-bundle.zip`), not a stem.
  - The staged tree at `build/staging`, which `task.build` now reads instead of `src`.
  - The contract every brand's `tokens.css` satisfies, listed in Step 5.

- [ ] **Step 1: Write the failing test**

Create `test/stage.spec.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test test/stage.spec.js --reporter=list`

Expected: FAIL with `Cannot find module '.../gulp.d/tasks/stage'`.

- [ ] **Step 3: Write the brand manifest**

Create `brands.json`. JSON rather than YAML because the CI matrix job reads it with `jq`, which is on the GitHub runner, while a YAML parser is not and installing one would mean an `npm ci` in a job that does nothing else.

```json
{
  "brands": [
    {
      "name": "vshn",
      "title": "VSHN",
      "bundle": "ui-bundle.zip",
      "logo": "img/vshn.svg",
      "navbarBackground": "rgb(246, 247, 249)"
    }
  ]
}
```

`bundle` is `ui-bundle.zip` and not `ui-bundle-vshn.zip` on purpose: handbook, kb, products and appcat pin that name.

- [ ] **Step 4: Write the brand resolver and the stage task**

Create `gulp.d/lib/brand.js`:

```js
'use strict'

const fs = require('fs')
const ospath = require('path')

const ROOT = ospath.join(__dirname, '..', '..')
const DEFAULT_BRAND = 'vshn'

const brands = () => JSON.parse(fs.readFileSync(ospath.join(ROOT, 'brands.json'), 'utf8')).brands

// --brand=appuio on the gulp command line, BRAND=appuio in the environment, otherwise vshn so that
// a bare `gulp preview` works. CI always passes the brand, and an unknown name fails the build
// rather than quietly producing a VSHN-coloured bundle under another brand's name.
function selected () {
  const flag = process.argv.find((it) => it.startsWith('--brand='))
  const name = flag ? flag.slice('--brand='.length) : process.env.BRAND || DEFAULT_BRAND
  const all = brands()
  const brand = all.find((it) => it.name === name)
  if (!brand) {
    throw new Error(`unknown brand '${name}'; brands.json lists ${all.map((it) => it.name).join(', ')}`)
  }
  const dir = ospath.join('brands', brand.name)
  if (!fs.existsSync(ospath.join(ROOT, dir))) throw new Error(`brand '${name}' has no directory at ${dir}`)
  return { ...brand, dir }
}

module.exports = { brands, selected }
```

Create `gulp.d/tasks/stage.js`:

```js
'use strict'

const fs = require('fs-extra')

// The compile step reads one tree. Rather than teach PostCSS, Handlebars and the asset globs about a
// second source directory, put the brand's files where the shared ones are and let the existing
// pipeline run unchanged. The wipe is the load-bearing part: without it a file from the previous
// brand survives into this brand's bundle.
module.exports = (src, brandDir, staging) => () => {
  fs.removeSync(staging)
  fs.copySync(src, staging)
  fs.copySync(brandDir, staging)
  return Promise.resolve()
}
```

- [ ] **Step 5: Move the VSHN colours into the brand**

Create `src/css/palette.css` with the brand-free scale and the admonition colours cut from `vars.css`:

```css
:root {
  /* neutral scale, shared by every brand */
  --color-white: #fff;
  --color-smoke-10: #fefefe;
  --color-smoke-30: #fafafa;
  --color-smoke-50: #f5f5f5;
  --color-smoke-70: #f0f0f0;
  --color-smoke-90: #e1e1e1;
  --color-gray-10: #c1c1c1;
  --color-gray-30: #8e8e8e;
  --color-gray-50: #808080;
  --color-gray-70: #5d5d5d;
  --color-jet-20: #4a4a4a;
  --color-jet-30: #424242;
  --color-jet-50: #333;
  --color-jet-70: #222;
  --color-jet-80: #191919;
  --color-black: #000;
  /* admonitions, identical in all four brands */
  --caution-color: #a0439c;
  --caution-on-color: var(--color-white);
  --important-color: #d32f2f;
  --important-on-color: var(--color-white);
  --note-color: #217ee7;
  --note-on-color: var(--color-white);
  --tip-color: #41af46;
  --tip-on-color: var(--color-white);
  --warning-color: #e18114;
  --warning-on-color: var(--color-white);
}
```

Create `brands/vshn/css/tokens.css`. Every value here is copied from today's `src/css/vars.css`:

```css
:root {
  /* VSHN palette */
  --vshn-rich-black: #000d1a;
  --vshn-amber: #ffbf00;
  --vshn-capri: #4cc3ff;
  --vshn-roman-silver: #818898;
  --vshn-silver-sand: #b9bfc6;
  --vshn-ghost-white: #e9ebf2;
  --vshn-cultured: #f6f7f9;
  --vshn-logo-blue: #2d6bb5;

  /* the colour slots the shared stylesheets read */
  --accent-color: var(--vshn-capri);
  --mark-background: var(--vshn-amber);
  --body-font-color: var(--vshn-rich-black);
  --panel-background: var(--vshn-cultured);
  --panel-border-color: var(--vshn-silver-sand);
  --scrollbar-thumb-color: var(--vshn-silver-sand);
  --navbar-background: var(--vshn-cultured);
  --navbar-font-color: var(--vshn-rich-black);
  --navbar_hover-background: var(--vshn-capri);
  --navbar-menu-background: var(--vshn-cultured);
  --navbar-menu-font-color: var(--vshn-rich-black);
  --navbar-menu_hover-background: var(--vshn-capri);
  --link-font-color: var(--vshn-logo-blue);
  --link_hover-font-color: var(--vshn-capri);
  --admonition-background: var(--vshn-ghost-white);
  --sidebar-background: var(--vshn-ghost-white);
  --footer-background: var(--vshn-cultured);
  --footer-font-color: var(--vshn-roman-silver);
  --footer-link-font-color: var(--vshn-logo-blue);
}
```

Two deliberate differences from today's file, both no-ops on the rendered page: `--vshn-light-periwinkle` is dropped because nothing reads it, and `--footer-font-color` loses the doubled `var(var(...))` that made it invalid, so the footer text now takes the colour that was always intended. If that second change is unwanted, keep `var(var(--vshn-roman-silver))` and say so in the commit; it is the only line in this task that can change a pixel.

Create `brands/vshn/css/brand.css` with the logo rule cut from `header.css:142-150`:

```css
/* VSHN logo */

.vshn_logo {
  background: transparent url(../img/vshn.svg) no-repeat center;
  background-size: contain;
  width: 60px;
  height: 40px;
  margin: 0 10px 0 0;
}
```

Move the images:

```bash
mkdir -p brands/vshn/img
git mv src/img/vshn.svg brands/vshn/img/vshn.svg
git mv src/img/favicon-16x16.png brands/vshn/img/
git mv src/img/favicon-32x32.png brands/vshn/img/
git mv src/img/favicon-96x96.png brands/vshn/img/
git mv src/img/favicon-152x152.png brands/vshn/img/
git mv src/img/favicon-167x167.png brands/vshn/img/
git mv src/img/favicon-180x180.png brands/vshn/img/
git mv src/img/favicon-192x192.png brands/vshn/img/
git mv src/img/favicon-196x196.png brands/vshn/img/
```

Now delete from `src/css/vars.css` the neutral scale, the admonition block, the whole `/* VSHN Colors */` block, and these nineteen declarations, which `brands/vshn/css/tokens.css` now owns: `--accent-color`, `--mark-background`, `--body-font-color`, `--panel-background`, `--panel-border-color`, `--scrollbar-thumb-color`, `--navbar-background`, `--navbar-font-color`, `--navbar_hover-background`, `--navbar-menu-background`, `--navbar-menu-font-color`, `--navbar-menu_hover-background`, `--link-font-color`, `--link_hover-font-color`, `--admonition-background`, `--sidebar-background`, `--footer-background`, `--footer-font-color`, `--footer-link-font-color`.

Everything else in `vars.css` stays: fonts, the `--doc-*`, `--nav-*`, `--toolbar-*`, `--toc-*` and `--navbar-button-*` derivations, the dimensions and the stacking order.

Finally, delete the `/* VSHN Logo */` rule from `src/css/header.css`.

- [ ] **Step 6: Set the import order in `src/css/site.css`**

```css
@import "typeface-montserrat.css";
@import "typeface-ubuntu-mono.css";
@import "fontawesome.css";
@import "palette.css";
@import "tokens.css";
@import "vars.css";
@import "base.css";
@import "body.css";
@import "nav.css";
@import "main.css";
@import "toolbar.css";
@import "breadcrumbs.css";
@import "page-versions.css";
@import "toc.css";
@import "doc.css";
@import "pagination.css";
@import "header.css";
@import "footer.css";
@import "highlight.css";
@import "print.css";
@import "brand.css";
```

The order is not cosmetic. postcss-custom-properties resolves a `var()` against the declarations it has already walked, so the neutral scale must precede the brand tokens, which must precede the `vars.css` derivations that read them. `tokens.css` and `brand.css` exist only in the staged tree, which is why the build must stage before it compiles.

- [ ] **Step 7: Wire staging into `gulpfile.js`**

Replace the `srcDir`/`destDir` header and the build, bundle and pack tasks:

```js
const brand = require('./gulp.d/lib/brand').selected()
const buildDir = 'build'
const stagingDir = `${buildDir}/staging`
const previewSrcDir = 'preview-src'
const previewDestDir = 'public'
const srcDir = 'src'
const destDir = `${previewDestDir}/_`
```

Change the lint glob so a brand's CSS is linted too:

```js
const glob = {
  all: [srcDir, 'brands', previewSrcDir],
  css: [`${srcDir}/css/**/*.css`, 'brands/*/css/*.css'],
  js: ['.'], // ESLint picks the files and ignores from eslint.config.js
}
```

Add the stage task and make the asset build read the staged tree:

```js
const stageTask = createTask({
  name: 'build:stage',
  desc: 'Copy the shared UI and the selected brand into one tree to compile',
  call: task.stage(srcDir, brand.dir, stagingDir),
})

const buildAssetsTask = createTask({
  name: 'build:assets',
  call: task.build(
    stagingDir,
    destDir,
    process.argv.slice(2).some((name) => name.startsWith('preview'))
  ),
})

const buildTask = createTask({
  name: 'build',
  desc: 'Build and stage the UI assets for bundling',
  call: series(stageTask, buildAssetsTask, fingerprintTask),
})
```

And give pack the brand's file name:

```js
const bundlePackTask = createTask({
  name: 'bundle:pack',
  desc: 'Create a bundle of the staged UI assets for publishing',
  call: task.pack(
    destDir,
    buildDir,
    brand.bundle,
    (bundlePath) => !process.env.CI && log(`Antora option: --ui-bundle-url=${bundlePath}`)
  ),
})
```

Add one line at the top of the exported task list so a developer always knows which brand they built:

```js
log(`Brand: ${brand.name} (${brand.title}) -> ${brand.bundle}`)
```

Put that immediately after the `const brand = ...` line.

- [ ] **Step 8: Take the file name in `gulp.d/tasks/pack.js`**

```js
module.exports = (src, dest, bundleFileName, onFinish) => () => {
  const bundlePath = path.join(dest, bundleFileName)
```

Delete the old `` `${bundleName}-bundle.zip` `` expression. Nothing else in the file changes.

- [ ] **Step 9: Run the stage test to verify it passes**

Run: `npx playwright test test/stage.spec.js --reporter=list`

Expected: PASS, 2 tests.

- [ ] **Step 10: Un-fixme the brand-free CSS test and run it**

Remove the `test.fixme()` added in Task 1 Step 6.

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: PASS, 2 tests. `src/css` now holds no brand string.

- [ ] **Step 11: Write the failing tests for the three Review Focus items this task owns**

Append to `test/stage.spec.js`:

```js
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
```

Create `test/brand-css.spec.js`:

```js
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

  test('resolves every colour the brand supplies', () => {
    const file = fs.readdirSync(STAGED).find((name) => /^site(-[0-9a-f]{8})?\.css$/.test(name))
    const css = fs.readFileSync(path.join(STAGED, file), 'utf8')
    const hex = '#' + brand.navbarBackground.match(/\d+/g)
      .map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    expect(css.toLowerCase()).toContain(hex)
    for (const token of ['--navbar-background', '--accent-color', '--link-font-color', '--panel-background']) {
      expect(css, `${token} was left unresolved`).not.toContain(`var(${token})`)
    }
  })
})
```

- [ ] **Step 12: Run them**

```bash
npx playwright test test/stage.spec.js --reporter=list
BRAND=vshn PREVIEW_ASSETS=bundle npx playwright test test/brand-css.spec.js --reporter=list
```

Expected: all PASS. If `--navbar-background` survives unresolved, the import order in Step 6 is wrong; fix the order rather than the test.

- [ ] **Step 13: Prove the VSHN bundle is unchanged**

```bash
npx gulp bundle
ls -l build/ui-bundle.zip
sh test/antora-image.sh
npm test
npm run test:bundle
```

Expected: `build/ui-bundle.zip` exists (not `ui-bundle-vshn.zip`), the Antora image check prints `OK`, and both suites pass with the same results as before Task 1.

- [ ] **Step 14: Commit**

```bash
git add brands.json brands gulp.d gulpfile.js src test
git commit -m "feat: build the UI from a shared tree plus a brand overlay

The build stages src/ into build/staging, copies the selected brand over it and
then compiles as before, so PostCSS, Handlebars and the asset globs need to know
nothing about a second source directory. VSHN becomes brands/vshn rather than
staying the implicit default: its palette, its logo rule and its images move out
of src/, which now holds no brand string in its stylesheets.

An unknown --brand= fails the build instead of producing a VSHN-coloured bundle
under another brand's name, and the VSHN bundle keeps the file name ui-bundle.zip
because handbook, kb, products and appcat pin it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Give the templates brand slots

The five partials that carry VSHN markup become includes. A brand owns what goes in the slot and not the markup around it, so the navbar, the search box and the admonition rendering cannot drift per brand.

**Files:**
- Create: `brands/vshn/partials/brand-logo.hbs`, `brand-links.hbs`, `brand-footer.hbs`, `brand-icons.hbs`, `brand-meta.hbs`
- Modify: `src/partials/header-content.hbs`, `src/partials/footer-content.hbs`, `src/partials/head-icons.hbs`, `src/partials/head-meta.hbs`, `src/partials/head-info.hbs`
- Test: `test/brand-free.spec.js`

**Interfaces:**
- Consumes: the staged tree from Task 2. Antora and `gulp.d/tasks/build-preview-pages.js` both register every `partials/*.hbs` in the staged tree by its file stem, so a brand partial is available to `{{> brand-logo }}` with no registration code.
- Produces: the five slot names `brand-logo`, `brand-links`, `brand-footer`, `brand-icons`, `brand-meta`. Every brand directory must contain all five; Tasks 5 to 7 fill them.

- [ ] **Step 1: Write the failing test**

In `test/brand-free.spec.js`, add a third test inside the existing describe block:

```js
  test('no template or image in src names a brand', () => {
    const offenders = []
    for (const dir of ['partials', 'layouts', 'img', 'helpers']) {
      for (const file of walk(path.join(SRC, dir))) {
        const rel = path.relative(SRC, file)
        if (BRAND_WORDS.test(rel)) offenders.push(`${rel} (file name)`)
        if (/\.(png|svg|ico|woff2?)$/.test(file)) continue
        for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
          if (BRAND_WORDS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test('every brand fills every slot', () => {
    const slots = ['brand-logo', 'brand-links', 'brand-footer', 'brand-icons', 'brand-meta']
    const brands = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'brands.json'), 'utf8')).brands
    const missing = []
    for (const { name } of brands) {
      for (const slot of slots) {
        const file = path.join(__dirname, '..', 'brands', name, 'partials', `${slot}.hbs`)
        if (!fs.existsSync(file)) missing.push(`brands/${name}/partials/${slot}.hbs`)
      }
    }
    expect(missing).toEqual([])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: FAIL. The third test lists the VSHN markup in `header-content.hbs`, `footer-content.hbs`, `head-meta.hbs` and `head-info.hbs`; the fourth lists five missing files under `brands/vshn/partials/`.

- [ ] **Step 3: Create the VSHN partials**

`brands/vshn/partials/brand-logo.hbs`:

```handlebars
<div class="vshn_logo"></div>
```

`brands/vshn/partials/brand-links.hbs`:

```handlebars
<div class="navbar-item has-dropdown is-hoverable">
  <a class="navbar-link" href="#">VSHN</a>
  <div class="navbar-dropdown">
    <a class="navbar-item" target="_blank" href="https://www.vshn.ch/">Main website</a>
    <a class="navbar-item" target="_blank" href="https://handbook.vshn.ch/">Handbook</a>
    <a class="navbar-item" target="_blank" href="https://kb.vshn.ch/">Knowledge Base</a>
    <a class="navbar-item" target="_blank" href="https://products.vshn.ch/">Products</a>
    <a class="navbar-item" target="_blank" href="https://docs.appuio.cloud/">APPUiO Cloud Docs</a>
    <a class="navbar-item" target="_blank" href="https://docs.appcat.ch/">AppCat Docs</a>
    <a class="navbar-item" target="_blank" href="https://syn.tools/">Project Syn</a>
    <a class="navbar-item" target="_blank" href="https://k8up.io/">K8up</a>
  </div>
</div>
```

`brands/vshn/partials/brand-footer.hbs`:

```handlebars
<p>Copyright © VSHN {{year}} – All Rights Reserved. <a href="https://legal.docs.vshn.ch/legal/privacy_policy_en.html">Privacy Policy</a>, <a href="https://vshn.ch/en/imprint/">Imprint</a>, and <a href="https://vshn.ch/en/contact/">Contact</a>.</p>
```

`brands/vshn/partials/brand-icons.hbs`, copied from today's `head-icons.hbs` without the leading comment:

```handlebars
<link rel="apple-touch-icon" sizes="152x152" href="/_/img/favicon-152x152.png">
<link rel="apple-touch-icon" sizes="167x167" href="/_/img/favicon-167x167.png">
<link rel="apple-touch-icon" sizes="180x180" href="/_/img/favicon-180x180.png">

{{! Beware: Firefox does not support the sizes attribute and uses the last PNG icon it finds. Declare the 32x32 picture last: it is good enough for Firefox and stops it downloading a big picture it does not need.}}
<link rel="icon" type="image/png" href="/_/img/favicon-196x196.png" sizes="196x196">
<link rel="icon" type="image/png" href="/_/img/favicon-192x192.png" sizes="192x192">
<link rel="icon" type="image/png" href="/_/img/favicon-96x96.png" sizes="96x96">
<link rel="icon" type="image/png" href="/_/img/favicon-16x16.png" sizes="16x16">
<link rel="icon" type="image/png" href="/_/img/favicon-32x32.png" sizes="32x32">
```

`brands/vshn/partials/brand-meta.hbs`:

```handlebars
<meta name="twitter:site" content="vshn_ch">
```

- [ ] **Step 4: Cut the slots into the shared templates**

`src/partials/header-content.hbs`, line 5 becomes the logo slot and lines 19 to 31 become the links slot:

```handlebars
<header class="header">
  <nav class="navbar">
    <div class="navbar-brand">
      <div class="navbar-item">
        {{> brand-logo }}
        <a href="{{or site.url (or siteRootUrl siteRootPath)}}">{{site.title}}
          {{#unless (eq page.componentVersion.displayVersion "default")}}{{#unless (eq
          page.componentVersion.displayVersion "master")}}{{#unless (eq page.layout '404')}} –
          v{{page.componentVersion.displayVersion}}{{/unless}}{{/unless}}{{/unless}}</a>
      </div>
      <button class="navbar-burger" aria-label="Toggle navigation menu" data-target="topbar-nav">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>
    <div id="topbar-nav" class="navbar-menu">
      <div class="navbar-end">
        {{> brand-links }}
        <div class="navbar-item">
          <div class="search-field">
            <input id="search-input" class="search-input" type="search" placeholder="Search" aria-label="Search">
            <button type="submit" class="search-button" aria-label="Search">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>
</header>
```

`src/partials/footer-content.hbs`:

```handlebars
<footer class="footer">
  {{> brand-footer }}
</footer>
```

`src/partials/head-icons.hbs`:

```handlebars
{{! Apple iOS stuff}}
<meta name="apple-mobile-web-app-capable" content="yes" />

{{! Favicons, supplied by the brand because each brand ships a different set of sizes}}
{{> brand-icons }}
```

`src/partials/head-meta.hbs`, line 5 becomes the slot:

```handlebars
    {{!-- Add additional meta tags here --}}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="{{site.title}}" />
    <meta name="twitter:card" content="summary_large_image">
    {{> brand-meta }}
    <meta property="og:locale" content="en_US" />
```

`src/partials/head-info.hbs`, line 24 loses the hardcoded VSHN image. The page attribute keeps working; a page without one now simply has no social image, which is better than every brand's pages advertising the VSHN logo:

```handlebars
    {{#with page.attributes.image}}
    <meta property="og:image" content="{{this}}">
    <link itemprop="image" href="{{this}}">
    <meta name="twitter:image" content="{{this}}">
    {{/with}}
```

- [ ] **Step 5: Run the brand-free test to verify it passes**

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: PASS, 4 tests.

- [ ] **Step 6: Prove the rendered page is unchanged**

```bash
npx gulp preview:build
grep -c 'vshn_logo' public/index.html
grep -c 'navbar-dropdown' public/index.html
grep -c 'favicon-32x32' public/index.html
grep -c 'Privacy Policy' public/index.html
npm test
```

Expected: each `grep -c` prints `1`, and `npm test` passes with the same results as before this task. A `0` means the partial was not registered: check that the file is under `brands/vshn/partials/` and that `gulp build:stage` ran.

- [ ] **Step 7: Commit**

```bash
git add src/partials brands/vshn/partials test/brand-free.spec.js
git commit -m "feat: fill the navbar, footer, icons and meta tags from the brand

Five partials carried VSHN markup inside shared templates, so a second brand
meant a second copy of the navbar. The templates now include brand-logo,
brand-links, brand-footer, brand-icons and brand-meta, which each brand supplies.
A brand owns what goes in the slot and not the markup around it, so the navbar,
the search box and the admonition rendering cannot drift per brand.

head-info no longer falls back to the VSHN logo as the social image: a page
without page-image now has none, rather than every brand advertising VSHN.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Make the brand-free invariant cover all of `src/`

The three tests written so far each cover one subtree. This folds them into one test over the whole of `src/`, which is the test that fails the day someone puts a brand string back.

**Files:**
- Modify: `test/brand-free.spec.js`

**Interfaces:**
- Consumes: the finished `src/` from Task 3.
- Produces: nothing other tasks read.

- [ ] **Step 1: Rewrite the test to walk all of `src/`**

Replace the three per-subtree tests with one, keeping the slot test:

```js
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
      if (/\.(png|svg|ico|jpe?g|gif|woff2?|ttf|eot)$/.test(file)) continue
      for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
        if (BRAND_WORDS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('every brand fills every slot', () => {
    // unchanged from Task 3
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: PASS, 2 tests. If it fails, it has found a brand string in a subtree the earlier tests did not walk, for example `src/helpers` or `src/layouts`. Move that string into a brand partial rather than loosening the regex.

- [ ] **Step 3: Prove the test can fail**

```bash
echo '/* vshn */' >> src/css/base.css
npx playwright test test/brand-free.spec.js --reporter=list
git checkout src/css/base.css
```

Expected: the middle command FAILS and names `css/base.css` with the line number. A test that has never been seen failing is not evidence of anything.

- [ ] **Step 4: Commit**

```bash
git add test/brand-free.spec.js
git commit -m "test: fail the build if the shared UI names a brand again

Three tests each walked one subtree of src/. One test now walks all of it,
contents and file names, which is the invariant the whole consolidation rests on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add the APPUiO brand, and the per-brand test harness

The first brand that is not VSHN. It proves the overlay works and it is where the per-brand tests get written, so that Tasks 6 and 7 really are one directory and one line.

Colour values come from `appuio/antora-ui-default`'s `src/css/vars.css` at tag 1.9. The APPUiO fork already read the structural tokens rather than its palette, so its mapping transfers directly.

**Files:**
- Create: `brands/appuio/css/tokens.css`, `brands/appuio/css/brand.css`
- Create: `brands/appuio/img/` (logo and favicons fetched from the fork)
- Create: `brands/appuio/partials/brand-logo.hbs`, `brand-links.hbs`, `brand-footer.hbs`, `brand-icons.hbs`, `brand-meta.hbs`
- Create: `test/brand.spec.js`
- Modify: `brands.json`, `test/bundle.spec.js`, `test/antora-image.sh`

**Interfaces:**
- Consumes: `brands.json` fields `name`, `title`, `bundle`, `logo`, `navbarBackground` from Task 2; the five slot names from Task 3.
- Produces: `BRAND` (the brand name), read by every test. The JavaScript tests derive the zip path from it through `brands.json`; `test/antora-image.sh` is a shell script with no JSON parser, so it takes `UI_BUNDLE` instead.

- [ ] **Step 1: Write the failing tests**

Create `test/brand.spec.js`:

```js
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

  test('paints the navbar in its own colour', async ({ page }) => {
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
})
```

In `test/bundle.spec.js`, replace the `BUNDLE` constant and add the leakage test:

```js
const BRANDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'brands.json'), 'utf8')).brands
const BRAND = process.env.BRAND || 'vshn'
// derive the bundle from the brand, so `BRAND=appuio npm test` cannot end up checking the VSHN zip
const BUNDLE = path.join(__dirname, '..', process.env.UI_BUNDLE ||
  path.join('build', BRANDS.find((it) => it.name === BRAND).bundle))
```

and, inside the existing `test.describe('UI bundle', ...)`:

```js
  test('ships this brand\'s images and no other brand\'s', async () => {
    const names = (await readZip(BUNDLE)).map(({ entry }) => entry.fileName)
    const mine = BRANDS.find((it) => it.name === BRAND)
    expect(names, `${mine.logo} is missing`).toContain(mine.logo)
    for (const other of BRANDS.filter((it) => it.name !== BRAND)) {
      expect(names, `${other.logo} leaked into the ${BRAND} bundle`).not.toContain(other.logo)
    }
  })
```

Also change line 49's skip message to use the variable:

```js
  test.skip(!fs.existsSync(BUNDLE), `${BUNDLE} is missing: run gulp bundle first`)
```

- [ ] **Step 2: Run them to verify they fail**

```bash
BRAND=appuio npx playwright test test/brand.spec.js --reporter=list
```

Expected: FAIL with `Cannot read properties of undefined` because `brands.json` has no `appuio` entry.

- [ ] **Step 3: Teach the Antora image check about the brand**

Replace the top of `test/antora-image.sh` down to the `docker run`:

```sh
#!/bin/sh
# Builds a small site with the brand's bundle inside the Antora image the documentation sites use.
# A bundle that image cannot load makes Antora exit 0 without writing anything, so check the output.
set -e
IMAGE=${ANTORA_IMAGE:-ghcr.io/vshn/antora:3.1.14}
BUNDLE=${UI_BUNDLE:-build/ui-bundle.zip}
cd "$(dirname "$0")/.."
[ -f "$BUNDLE" ] || { echo "$BUNDLE is missing: run gulp bundle first"; exit 1; }
rm -rf build/antora-site
# the fixture playbook names one bundle; write a copy that names the one under test
sed "s|/antora/build/ui-bundle.zip|/antora/$BUNDLE|" test/fixtures/antora-playbook.yml > build/antora-playbook.yml
```

and change the last line of the container script from

```
  antora test/fixtures/antora-playbook.yml'
```

to

```
  antora build/antora-playbook.yml'
```

- [ ] **Step 4: Fetch the APPUiO images**

```bash
mkdir -p brands/appuio/img
base=https://raw.githubusercontent.com/appuio/antora-ui-default/master/src/img
for f in appuio.svg favicon-16x16.png favicon-32x32.png apple-touch-icon.png \
         android-chrome-96x96.png favicon.ico; do
  curl -sfL "$base/$f" -o "brands/appuio/img/$f" || echo "MISSING $f"
done
ls -l brands/appuio/img
file brands/appuio/img/*
```

Expected: six files, `file` reporting SVG, PNG and MS Windows icon. A `MISSING` line means the fork's default branch is not `master`; retry with `main`.

- [ ] **Step 5: Write the APPUiO stylesheets**

`brands/appuio/css/tokens.css`. Values from the fork's `vars.css`; the fork assigned the same structural tokens this UI reads, so this is a transcription and not a redesign:

```css
:root {
  /* APPUiO palette */
  --appuio-dark-blue: #0e2f47;
  --appuio-turquoise: #15b0bf;
  --appuio-light-blue: #b2e6ec;
  --appuio-yellow: #ffd301;

  /* the colour slots the shared stylesheets read */
  --accent-color: var(--appuio-turquoise);
  --mark-background: var(--appuio-yellow);
  --body-font-color: var(--color-jet-70);
  --panel-background: var(--color-smoke-30);
  --panel-border-color: var(--color-smoke-90);
  --scrollbar-thumb-color: var(--color-gray-10);
  --navbar-background: var(--appuio-turquoise);
  --navbar-font-color: var(--color-white);
  --navbar_hover-background: var(--appuio-yellow);
  --navbar-menu-background: var(--appuio-light-blue);
  --navbar-menu-font-color: var(--appuio-dark-blue);
  --navbar-menu_hover-background: var(--appuio-yellow);
  --link-font-color: var(--appuio-turquoise);
  --link_hover-font-color: var(--appuio-dark-blue);
  --admonition-background: var(--color-smoke-30);
  --sidebar-background: var(--color-smoke-90);
  --footer-background: var(--color-smoke-90);
  --footer-font-color: var(--color-gray-70);
  --footer-link-font-color: var(--appuio-turquoise);
}
```

`brands/appuio/css/brand.css`:

```css
/* APPUiO logo */

.appuio_logo {
  background: transparent url(../img/appuio.svg) no-repeat center;
  background-size: contain;
  width: 80px;
  height: 40px;
  margin: 0 10px 0 0;
}
```

- [ ] **Step 6: Write the APPUiO partials**

`brands/appuio/partials/brand-logo.hbs`:

```handlebars
<div class="appuio_logo"></div>
```

`brands/appuio/partials/brand-links.hbs`:

```handlebars
<div class="navbar-item has-dropdown is-hoverable">
  <a class="navbar-link" href="#">APPUiO</a>
  <div class="navbar-dropdown">
    <a class="navbar-item" target="_blank" href="https://www.appuio.ch/en/offering/cloud/">Main website</a>
    <a class="navbar-item" target="_blank" href="https://portal.appuio.cloud/">Portal</a>
    <a class="navbar-item" target="_blank" href="https://status.appuio.cloud/">Status</a>
  </div>
</div>
<div class="navbar-item has-dropdown is-hoverable">
  <a class="navbar-link" href="#">VSHN</a>
  <div class="navbar-dropdown">
    <a class="navbar-item" target="_blank" href="https://www.vshn.ch/">Main website</a>
    <a class="navbar-item" target="_blank" href="https://handbook.vshn.ch/">Handbook</a>
    <a class="navbar-item" target="_blank" href="https://kb.vshn.ch/">Knowledge Base</a>
    <a class="navbar-item" target="_blank" href="https://products.vshn.ch/">Products</a>
    <a class="navbar-item" target="_blank" href="https://syn.tools/">Project Syn</a>
    <a class="navbar-item" target="_blank" href="https://k8up.io/">K8up</a>
  </div>
</div>
```

The fork's list pointed at `products.docs.vshn.ch` and a separate `legal.docs.vshn.ch`. Both are stale: products moved to `products.vshn.ch` and legal was merged into products and archived. The corrected URLs are used here.

`brands/appuio/partials/brand-footer.hbs`:

```handlebars
<p>Copyright © VSHN {{year}} – All Rights Reserved. <a href="https://legal.docs.vshn.ch/legal/privacy_policy_en.html">Privacy Policy</a>, <a href="https://vshn.ch/en/imprint/">Imprint</a>, and <a href="https://vshn.ch/en/contact/">Contact</a>.</p>
```

`brands/appuio/partials/brand-icons.hbs`, naming only the files fetched in Step 4:

```handlebars
<link rel="apple-touch-icon" sizes="180x180" href="/_/img/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/_/img/android-chrome-96x96.png" sizes="96x96">
<link rel="icon" type="image/png" href="/_/img/favicon-16x16.png" sizes="16x16">
<link rel="icon" type="image/png" href="/_/img/favicon-32x32.png" sizes="32x32">
```

`brands/appuio/partials/brand-meta.hbs`:

```handlebars
<meta name="twitter:site" content="vshn_ch">
```

- [ ] **Step 7: Add APPUiO to the manifest**

```json
    {
      "name": "appuio",
      "title": "APPUiO",
      "bundle": "ui-bundle-appuio.zip",
      "logo": "img/appuio.svg",
      "navbarBackground": "rgb(21, 176, 191)"
    }
```

- [ ] **Step 8: Build and test the brand**

```bash
npx gulp bundle --brand=appuio
ls -l build/ui-bundle-appuio.zip
BRAND=appuio UI_BUNDLE=build/ui-bundle-appuio.zip sh test/antora-image.sh
BRAND=appuio PREVIEW_ASSETS=bundle npx playwright test test/brand-css.spec.js --reporter=list
BRAND=appuio npx playwright test test/bundle.spec.js --reporter=list
BRAND=appuio npx playwright test test/brand.spec.js --reporter=list
BRAND=appuio npm test
```

Expected: every command passes. `brand.spec.js` proves the turquoise navbar, the served logo and four resolving favicons. `bundle.spec.js` proves `img/vshn.svg` did not leak in, which is the staging wipe doing its job on a real build.

- [ ] **Step 9: Prove VSHN still builds after a brand switch in the same workspace**

```bash
npx gulp bundle
BRAND=vshn npx playwright test test/bundle.spec.js --reporter=list
BRAND=vshn npm test
```

Expected: PASS. If `img/appuio.svg` appears in the VSHN bundle, `gulp.d/tasks/stage.js` is not wiping; fix the task, not the test.

- [ ] **Step 10: Look at it**

```bash
npx gulp preview --brand=appuio
```

Open `http://localhost:5252/index.html`, confirm the APPUiO logo and the turquoise navbar, and take a screenshot for the eventual rollout merge request. Then stop the server.

- [ ] **Step 11: Commit**

```bash
git add brands/appuio brands.json test
git commit -m "feat: add the APPUiO brand, and test every brand the same way

APPUiO is the first brand that is not VSHN, so this is where the per-brand tests
get written: the logo is referenced and served, the navbar takes the brand's own
colour, and every favicon the brand's markup asks for exists. bundle.spec now
proves no other brand's images leaked in, which is what the staging wipe is for.

Colours are transcribed from appuio/antora-ui-default 1.9. Two stale links in the
navbar are corrected: products moved to products.vshn.ch and legal was merged
into products.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add the K8up brand

One directory and one line, with the harness from Task 5 doing the checking. K8up's fork is the one carrying Font Awesome glyph admonitions, so the shared suite running against this brand is the point.

**Files:**
- Create: `brands/k8up/css/tokens.css`, `brands/k8up/css/brand.css`, `brands/k8up/img/`, `brands/k8up/partials/*.hbs`
- Modify: `brands.json`

**Interfaces:**
- Consumes: everything from Task 5. Nothing new is produced.

- [ ] **Step 1: Add K8up to the manifest and watch the slot test fail**

```json
    {
      "name": "k8up",
      "title": "K8up",
      "bundle": "ui-bundle-k8up.zip",
      "logo": "img/k8up.svg",
      "navbarBackground": "rgb(201, 182, 190)"
    }
```

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: FAIL, listing five missing files under `brands/k8up/partials/`.

- [ ] **Step 2: Fetch the K8up images**

```bash
mkdir -p brands/k8up/img
base=https://raw.githubusercontent.com/k8up-io/antora-ui-default/master/src/img
for f in k8up.svg cncf.svg favicon-16x16.png favicon-32x32.png apple-touch-icon.png \
         android-chrome-192x192.png favicon.ico; do
  curl -sfL "$base/$f" -o "brands/k8up/img/$f" || echo "MISSING $f"
done
file brands/k8up/img/*
```

Expected: seven files, no `MISSING`.

- [ ] **Step 3: Write the K8up stylesheets**

`brands/k8up/css/tokens.css`:

```css
:root {
  /* K8up palette */
  --k8up-blue: #1a5ce6;
  --k8up-teal: #a08794;
  --k8up-salmon: #bb7e8c;
  --k8up-brick: #c9b6be;
  --k8up-purple: #d1becf;
  --k8up-rich-black: #000d1a;
  --k8up-roman-silver: #818898;
  --k8up-silver-sand: #b9bfc6;
  --k8up-ghost-white: #e9ebf2;
  --k8up-cultured: #f6f7f9;

  /* the colour slots the shared stylesheets read */
  --accent-color: var(--k8up-blue);
  --mark-background: var(--k8up-brick);
  --body-font-color: var(--k8up-rich-black);
  --panel-background: var(--k8up-cultured);
  --panel-border-color: var(--k8up-silver-sand);
  --scrollbar-thumb-color: var(--k8up-silver-sand);
  --navbar-background: var(--k8up-brick);
  --navbar-font-color: var(--color-black);
  --navbar_hover-background: var(--k8up-salmon);
  --navbar-menu-background: var(--k8up-brick);
  --navbar-menu-font-color: var(--color-black);
  --navbar-menu_hover-background: var(--k8up-salmon);
  --link-font-color: var(--k8up-blue);
  --link_hover-font-color: var(--k8up-blue);
  --admonition-background: var(--k8up-ghost-white);
  --sidebar-background: var(--k8up-ghost-white);
  --footer-background: var(--k8up-cultured);
  --footer-font-color: var(--k8up-roman-silver);
  --footer-link-font-color: var(--k8up-blue);
}
```

The five neutral tones the fork inherited under `--vshn-*` names are renamed to `--k8up-*` with the same values, because a brand file naming another brand is exactly the drift being removed.

`brands/k8up/css/brand.css`:

```css
/* K8up logo */

.k8up_logo {
  background: transparent url(../img/k8up.svg) no-repeat center;
  background-size: contain;
  width: 40px;
  height: 40px;
  margin: 0 10px 0 0;
}

.footer .cncf-logo {
  display: block;
  margin: 0.5rem auto 0;
  width: 240px;
}
```

- [ ] **Step 4: Write the K8up partials**

`brands/k8up/partials/brand-logo.hbs`:

```handlebars
<div class="k8up_logo"></div>
```

`brands/k8up/partials/brand-links.hbs`:

```handlebars
<div class="navbar-item has-dropdown is-hoverable">
  <a class="navbar-link" href="#">K8up</a>
  <div class="navbar-dropdown">
    <a class="navbar-item" target="_blank" href="https://k8up.io/">Main website</a>
    <a class="navbar-item" target="_blank" href="https://github.com/k8up-io/k8up">Source code</a>
    <a class="navbar-item" target="_blank" href="https://syn.tools/">Project Syn</a>
    <a class="navbar-item" target="_blank" href="https://www.vshn.ch/">VSHN</a>
  </div>
</div>
```

`brands/k8up/partials/brand-footer.hbs`, keeping the Linux Foundation trademark notice the fork carries:

```handlebars
<p>Copyright © K8up Authors {{year}} – All Rights Reserved.</p>
<p>The Linux Foundation has registered trademarks and uses trademarks. For a list of trademarks of The Linux Foundation, please see the <a href="https://www.linuxfoundation.org/trademark-usage" target="_blank">trademark usage page</a>.</p>
<img class="cncf-logo" src="/_/img/cncf.svg" alt="Cloud Native Computing Foundation">
```

`brands/k8up/partials/brand-icons.hbs`:

```handlebars
<link rel="apple-touch-icon" sizes="180x180" href="/_/img/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/_/img/android-chrome-192x192.png" sizes="192x192">
<link rel="icon" type="image/png" href="/_/img/favicon-16x16.png" sizes="16x16">
<link rel="icon" type="image/png" href="/_/img/favicon-32x32.png" sizes="32x32">
```

`brands/k8up/partials/brand-meta.hbs`:

```handlebars
<meta name="twitter:site" content="k8up_io">
```

- [ ] **Step 5: Build and test the brand**

```bash
npx gulp bundle --brand=k8up
BRAND=k8up UI_BUNDLE=build/ui-bundle-k8up.zip sh test/antora-image.sh
BRAND=k8up PREVIEW_ASSETS=bundle npx playwright test test/brand-css.spec.js --reporter=list
BRAND=k8up npx playwright test test/bundle.spec.js --reporter=list
BRAND=k8up npx playwright test test/brand.spec.js test/brand-free.spec.js --reporter=list
BRAND=k8up npm test
```

Expected: all pass. `npm test` includes the admonition and self-hosted-font checks, which is what proves the K8up site gets the fixed admonition icons rather than the fork's Font Awesome glyphs.

- [ ] **Step 6: Look at it**

```bash
npx gulp preview --brand=k8up
```

Open `http://localhost:5252/index.html`, confirm the K8up logo, the brick navbar and the CNCF logo in the footer, take a screenshot, stop the server.

- [ ] **Step 7: Commit**

```bash
git add brands/k8up brands.json
git commit -m "feat: add the K8up brand

One directory and one manifest line: the tests written for APPUiO cover it
unchanged. The fork's neutral tones carried --vshn-* names; they keep their
values under --k8up-* names, because a brand file naming another brand is the
drift this consolidation removes.

The shared suite running against this brand is the point: the K8up fork still
draws admonition icons with Font Awesome glyphs, the construct that produced
square boxes on the VSHN sites in September 2026.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Add the Project Syn brand

The fourth brand. No Project Syn site moves in this rollout, so this bundle is published and not yet consumed; `projectsyn/antora-ui-default` stays live until someone identifies what builds `syn.tools`.

**Files:**
- Create: `brands/syn/css/tokens.css`, `brands/syn/css/brand.css`, `brands/syn/img/`, `brands/syn/partials/*.hbs`
- Modify: `brands.json`

**Interfaces:**
- Consumes: everything from Task 5. Nothing new is produced.

- [ ] **Step 1: Add Project Syn to the manifest and watch the slot test fail**

```json
    {
      "name": "syn",
      "title": "Project Syn",
      "bundle": "ui-bundle-syn.zip",
      "logo": "img/projectsyn.svg",
      "navbarBackground": "rgb(26, 30, 84)"
    }
```

Run: `npx playwright test test/brand-free.spec.js --reporter=list`

Expected: FAIL, listing five missing files under `brands/syn/partials/`.

- [ ] **Step 2: Fetch the Project Syn images**

```bash
mkdir -p brands/syn/img
base=https://raw.githubusercontent.com/projectsyn/antora-ui-default/master/src/img
for f in projectsyn.svg favicon-16x16.png favicon-32x32.png apple-touch-icon.png \
         android-chrome-192x192.png favicon.ico; do
  curl -sfL "$base/$f" -o "brands/syn/img/$f" || echo "MISSING $f"
done
file brands/syn/img/*
```

Expected: six files, no `MISSING`.

- [ ] **Step 3: Write the Project Syn stylesheets**

`brands/syn/css/tokens.css`:

```css
:root {
  /* Project Syn palette */
  --syn-purple: #1a1e54;
  --syn-red: #ab3643;
  --syn-yellow: #ffbf00;
  --syn-light-blue: #a1e0e9;
  --syn-rich-black: #000d1a;
  --syn-roman-silver: #818898;
  --syn-silver-sand: #b9bfc6;
  --syn-ghost-white: #e9ebf2;
  --syn-cultured: #f6f7f9;

  /* the colour slots the shared stylesheets read */
  --accent-color: var(--syn-red);
  --mark-background: var(--syn-yellow);
  --body-font-color: var(--syn-rich-black);
  --panel-background: var(--syn-cultured);
  --panel-border-color: var(--syn-silver-sand);
  --scrollbar-thumb-color: var(--syn-silver-sand);
  --navbar-background: var(--syn-purple);
  --navbar-font-color: var(--syn-light-blue);
  --navbar_hover-background: var(--syn-yellow);
  --navbar-menu-background: var(--syn-purple);
  --navbar-menu-font-color: var(--syn-light-blue);
  --navbar-menu_hover-background: var(--syn-yellow);
  --link-font-color: var(--syn-red);
  --link_hover-font-color: var(--syn-light-blue);
  --admonition-background: var(--syn-ghost-white);
  --sidebar-background: var(--syn-ghost-white);
  --footer-background: var(--syn-cultured);
  --footer-font-color: var(--syn-roman-silver);
  --footer-link-font-color: var(--syn-red);
}
```

`brands/syn/css/brand.css`:

```css
/* Project Syn logo */

.syn_logo {
  background: transparent url(../img/projectsyn.svg) no-repeat center;
  background-size: contain;
  width: 40px;
  height: 40px;
  margin: 0 10px 0 0;
}
```

- [ ] **Step 4: Write the Project Syn partials**

`brands/syn/partials/brand-logo.hbs`:

```handlebars
<div class="syn_logo"></div>
```

`brands/syn/partials/brand-links.hbs`:

```handlebars
<div class="navbar-item has-dropdown is-hoverable">
  <a class="navbar-link" href="#">Tools</a>
  <div class="navbar-dropdown">
    <a class="navbar-item" target="_blank" href="https://syn.tools/commodore/">Commodore</a>
    <a class="navbar-item" target="_blank" href="https://hub.syn.tools/">Commodore Components Hub</a>
    <a class="navbar-item" target="_blank" href="https://syn.tools/lieutenant-api/">Lieutenant API</a>
    <a class="navbar-item" target="_blank" href="https://syn.tools/lieutenant-operator/">Lieutenant Operator</a>
    <a class="navbar-item" target="_blank" href="https://syn.tools/steward/">Steward</a>
    <a class="navbar-item" target="_blank" href="https://k8up.io/">K8up</a>
  </div>
</div>
<div class="navbar-item has-dropdown is-hoverable">
  <a class="navbar-link" href="#">VSHN</a>
  <div class="navbar-dropdown">
    <a class="navbar-item" target="_blank" href="https://www.vshn.ch/">Main website</a>
    <a class="navbar-item" target="_blank" href="https://handbook.vshn.ch/">Handbook</a>
    <a class="navbar-item" target="_blank" href="https://kb.vshn.ch/">Knowledge Base</a>
    <a class="navbar-item" target="_blank" href="https://products.vshn.ch/">Products</a>
    <a class="navbar-item" target="_blank" href="https://docs.appuio.ch/">APPUiO Documentation</a>
  </div>
</div>
```

`brands/syn/partials/brand-footer.hbs`:

```handlebars
<p>Copyright © VSHN {{year}} – All Rights Reserved. <a href="https://legal.docs.vshn.ch/legal/privacy_policy_en.html">Privacy Policy</a>, <a href="https://vshn.ch/en/imprint/">Imprint</a>, and <a href="https://vshn.ch/en/contact/">Contact</a>.</p>
```

The fork's footer says 2021 because it hardcodes the year. `{{year}}` is a helper this UI already ships.

`brands/syn/partials/brand-icons.hbs`:

```handlebars
<link rel="apple-touch-icon" sizes="180x180" href="/_/img/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/_/img/android-chrome-192x192.png" sizes="192x192">
<link rel="icon" type="image/png" href="/_/img/favicon-16x16.png" sizes="16x16">
<link rel="icon" type="image/png" href="/_/img/favicon-32x32.png" sizes="32x32">
```

`brands/syn/partials/brand-meta.hbs`:

```handlebars
<meta name="twitter:site" content="vshn_ch">
```

- [ ] **Step 5: Build and test the brand**

```bash
npx gulp bundle --brand=syn
BRAND=syn UI_BUNDLE=build/ui-bundle-syn.zip sh test/antora-image.sh
BRAND=syn PREVIEW_ASSETS=bundle npx playwright test test/brand-css.spec.js --reporter=list
BRAND=syn npx playwright test test/bundle.spec.js --reporter=list
BRAND=syn npx playwright test test/brand.spec.js test/brand-free.spec.js --reporter=list
BRAND=syn npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add brands/syn brands.json
git commit -m "feat: add the Project Syn brand

The fourth brand. No Project Syn site moves in this rollout, so this bundle is
published and not yet consumed, and projectsyn/antora-ui-default stays live until
someone identifies what builds syn.tools. The bundle exists now so that whoever
does find it has nothing left to build.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Build every brand in CI and release four bundles

**Files:**
- Modify: `.github/workflows/gulp.yml`

**Interfaces:**
- Consumes: `brands.json`, `BRAND`, `UI_BUNDLE`.
- Produces: one release per tag carrying four assets, named exactly as `brands.json` says.

- [ ] **Step 1: Rewrite the workflow**

Replace the whole of `.github/workflows/gulp.yml`:

```yaml
name: build & release

on:
  push:
    branches: [ '*' ]
    tags: [ '*' ]
  # every base branch, so a pull request stacked on another one gets CI too
  pull_request:

jobs:
  brands:
    runs-on: ubuntu-latest
    outputs:
      names: ${{ steps.read.outputs.names }}
    steps:
    - name: Checkout
      uses: actions/checkout@v7

    # jq is on the runner and a YAML parser is not, which is why the manifest is JSON.
    # A fifth brand is one directory and one line here, with no change to this workflow.
    - name: Read the brand manifest
      id: read
      run: echo "names=$(jq -c '[.brands[].name]' brands.json)" >> "$GITHUB_OUTPUT"

  build:
    needs: brands
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        brand: ${{ fromJSON(needs.brands.outputs.names) }}

    steps:
    - name: Checkout
      uses: actions/checkout@v7

    - name: Setup Node.js
      uses: actions/setup-node@v7
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Read this brand's bundle name
      run: echo "UI_BUNDLE=build/$(jq -r --arg b '${{ matrix.brand }}' '.brands[] | select(.name == $b) | .bundle' brands.json)" >> "$GITHUB_ENV"

    - name: Build UI bundle
      run: npx gulp bundle --brand=${{ matrix.brand }}

    - name: Build a page with the bundle in the sites' Antora image
      run: sh test/antora-image.sh

    - name: Install Playwright browser
      run: npx playwright install --with-deps chromium

    - name: Test preview
      run: npm test
      env:
        BRAND: ${{ matrix.brand }}

    - name: Test the published bundle assets
      run: npm run test:bundle
      env:
        BRAND: ${{ matrix.brand }}

    - name: Upload test results
      if: failure()
      uses: actions/upload-artifact@v7
      with:
        name: test-results-${{ matrix.brand }}
        path: test-results/

    - name: Upload Artifact
      uses: actions/upload-artifact@v7
      with:
        name: ui-bundle-${{ matrix.brand }}
        path: ${{ env.UI_BUNDLE }}

  release:
    needs: build
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
    - name: Collect every brand's bundle
      uses: actions/download-artifact@v7
      with:
        pattern: ui-bundle-*
        merge-multiple: true
        path: dist

    - name: List what is about to be released
      run: ls -l dist

    - name: Create Release
      uses: ncipollo/release-action@v1.21.0
      with:
        artifacts: "dist/*.zip"
        artifactContentType: "application/zip"
        generateReleaseNotes: true
        token: ${{ secrets.GITHUB_TOKEN }}
```

`npm test` and `npm run test:bundle` both read `BRAND` and derive the zip path from `brands.json`. `UI_BUNDLE` exists for `test/antora-image.sh` and for the artifact upload path, which are shell and YAML rather than JavaScript.

- [ ] **Step 2: Make `test:bundle` build the right brand**

`package.json` currently hardcodes nothing brand-specific, but `test/serve-bundle.sh` runs `gulp bundle:preview` with no brand. Pass it through:

```sh
#!/bin/sh
# Serves the preview pages with the assets from the published bundle, so the tests cover what the
# sites actually get: CSS minified by cssnano with the custom properties resolved, not the preview build.
set -e
cd "$(dirname "$0")/.."
node_modules/.bin/gulp bundle:preview ${BRAND:+--brand=$BRAND} > /dev/null
exec node_modules/.bin/gulp preview:serve
```

- [ ] **Step 3: Push the branch and read the run**

```bash
git add .github/workflows/gulp.yml test/serve-bundle.sh
git commit -m "ci: build, test and release one bundle per brand

The matrix comes from brands.json through jq, which is on the runner while a YAML
parser is not, so a fifth brand needs no change to this workflow. A separate
release job collects the four artifacts and publishes them under one tag, because
each matrix leg only ever holds its own bundle.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin HEAD
gh run watch
```

Expected: four `build` legs, all green. `release` is skipped because this is not a tag.

- [ ] **Step 4: Confirm the four artifacts and their names**

```bash
gh run view --json databaseId --jq '.databaseId' | xargs -I{} gh api repos/:owner/:repo/actions/runs/{}/artifacts --jq '.artifacts[].name'
```

Expected: `ui-bundle-vshn`, `ui-bundle-appuio`, `ui-bundle-k8up`, `ui-bundle-syn`. Download the vshn one and confirm the file inside is called `ui-bundle.zip` and not `ui-bundle-vshn.zip`.

---

## Task 9: Document how a brand works

**Files:**
- Modify: `README.adoc`
- Modify: `docs/modules/ROOT/pages/build-preview-ui.adoc`, `docs/modules/ROOT/pages/set-up-project.adoc`, `docs/modules/ROOT/nav.adoc`
- Create: `docs/modules/ROOT/pages/brands.adoc`

**Interfaces:**
- Consumes: the finished build. Produces nothing code reads.

- [ ] **Step 1: Write the brand page**

Create `docs/modules/ROOT/pages/brands.adoc`:

```adoc
= Brands

One repository builds four UIs. The shared UI lives in `src/` and carries no brand string; each brand
is a directory under `brands/` that fills the slots the shared templates leave open.

== What a brand owns

[cols="1,3"]
|===
| `css/tokens.css` | the palette, and the colour slots the shared stylesheets read
| `css/brand.css` | the logo rule and any rule only this brand needs
| `img/` | the logo and the favicons
| `partials/brand-logo.hbs` | the element in the navbar
| `partials/brand-links.hbs` | the navbar dropdowns
| `partials/brand-footer.hbs` | the footer text
| `partials/brand-icons.hbs` | the favicon and apple-touch-icon links
| `partials/brand-meta.hbs` | `twitter:site` and any other brand meta tag
|===

A brand does not own the markup around its slots. The navbar, the search box and the admonition
rendering are shared, so they cannot drift per brand. A brand that needs a structural change changes
the shared file, where every brand gets it.

== Building one

[source,console]
----
$ npx gulp bundle --brand=appuio     # build/ui-bundle-appuio.zip
$ npx gulp preview --brand=k8up      # http://localhost:5252
----

Without `--brand`, the build uses `vshn`. An unknown name fails the build rather than producing a
VSHN-coloured bundle under another brand's name.

The VSHN bundle is called `ui-bundle.zip` and not `ui-bundle-vshn.zip`, because handbook, kb, products
and appcat pin that name. `brands.json` records the file name for every brand.

== Adding one

. Create `brands/<name>/` with the eight files above.
. Add one object to `brands.json`: `name`, `title`, `bundle`, `logo` and `navbarBackground`, the last
  being the colour the tests expect `.navbar` to compute to.
. Run `BRAND=<name> npx playwright test` and `npx gulp bundle --brand=<name>`.

The CI matrix reads `brands.json`, so there is no workflow to edit.

== The rule that keeps this working

`test/brand-free.spec.js` fails if anything under `src/` names a brand, in its contents or in its file
name. That test is the whole consolidation: it fails the day someone adds a VSHN link to a shared
partial, which is how the four forks came about.
```

Add `* xref:brands.adoc[]` to `docs/modules/ROOT/nav.adoc`.

- [ ] **Step 2: Update the README**

In `README.adoc`, replace the project URLs at the top, which still point at upstream Antora:

```adoc
:url-project: https://github.com/vshn/antora-ui
:url-preview: https://github.com/vshn/antora-ui/releases
```

and add, immediately after the first paragraph:

```adoc
This UI is built for four brands from one source tree.
Run `npx gulp bundle --brand=<vshn|appuio|k8up|syn>`; see the `Brands` page in `docs/` for what a brand
owns and how to add one.
A release publishes `ui-bundle.zip` for VSHN and `ui-bundle-<brand>.zip` for the others.
```

- [ ] **Step 3: Check the build commands in the existing docs**

```bash
grep -rn 'gulp bundle\|gulp preview\|ui-bundle' README.adoc docs/
```

Every hit that shows a build command gets `--brand=<name>` or a sentence saying the default is VSHN. Leave the hits that describe the output.

- [ ] **Step 4: Commit**

```bash
git add README.adoc docs
git commit -m "docs: say what a brand owns and how to add one

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Rename the repository to `vshn/antora-ui`

"Default" described a fork of upstream Antora's default UI, which this has not been for years, and the repository now serves four brands.

**This task changes something outside the repository and affects other people. Ask the user to confirm before running Step 2, and offer to let them do it in the GitHub UI instead.**

**Files:**
- Modify: `README.adoc`, `package.json`, any file naming the old path

**Interfaces:**
- Consumes: a merged, green default branch.
- Produces: the repository at its new path, which Task 11 releases from and Task 12 pins to.

- [ ] **Step 1: Record the evidence that the rename is safe**

```bash
gh api repos/vshn/k8up --jq '.full_name'
gh api repos/vshn/k8up/releases --jq '.[0].tag_name'
curl -sIL -o /dev/null -w '%{http_code} %{num_redirects}\n' \
  https://github.com/vshn/k8up/releases/download/v2.16.0/k8up.tgz
```

Expected: `k8up-io/k8up`, a tag name, and a `200` after redirects. `vshn/k8up` really moved, so this is the same redirect behaviour this rename will get: the API follows, the releases API that Renovate queries follows, and an old release asset URL still resolves, so no Antora build breaks on the day.

- [ ] **Step 2: Rename**

```bash
gh repo rename antora-ui --repo vshn/antora-ui-default
gh api repos/vshn/antora-ui --jq '.full_name'
```

Expected: `vshn/antora-ui`.

- [ ] **Step 3: Point the local remote at the new path**

```bash
git remote set-url origin https://github.com/vshn/antora-ui.git
git remote -v
git fetch origin
```

- [ ] **Step 4: Update the references inside the repository**

```bash
grep -rn 'antora-ui-default' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build
```

Rewrite each hit to `antora-ui`, except in `docs/superpowers/specs/` and `docs/superpowers/plans/`, which record what was true when they were written. `package.json`'s `name`, `homepage` and `repository.url` still point at `gitlab.com/antora/antora-ui-default`; set them to this repository:

```json
  "name": "@vshn/antora-ui",
  "homepage": "https://github.com/vshn/antora-ui",
  "repository": {
    "type": "git",
    "url": "https://github.com/vshn/antora-ui.git"
  },
```

- [ ] **Step 5: Verify CI still runs under the new name**

```bash
git add -A
git commit -m "chore: rename the repository to vshn/antora-ui

'Default' described a fork of upstream Antora's default UI, which this has not
been for years, and the repository now builds four brands. GitHub keeps the
redirect from the old path, verified against vshn/k8up, which really moved: the
API, the releases API Renovate queries and old release asset URLs all follow. The
pins are rewritten anyway, because the redirect lasts only while nothing occupies
the old path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push
gh run watch
```

Expected: green, four brand legs.

---

## Task 11: Release v3.0.0

**Files:** none. This task tags and verifies.

**Interfaces:**
- Consumes: a green default branch at the new repository path.
- Produces: `https://github.com/vshn/antora-ui/releases/download/v3.0.0/ui-bundle.zip` and the three brand assets, which Task 12 pins.

- [ ] **Step 1: Merge to the default branch**

Open the pull request if the work is on a branch, wait for the four green legs, merge.

- [ ] **Step 2: Tag**

The previous release was `v2.8.0`. This is `v3.0.0`: the repository moved, the bundle set changed from one to four, and a consumer that copies files out of the bundle by path sees a different tree.

```bash
git checkout master
git pull
git tag -a v3.0.0 -m "One UI, four brand bundles"
git push origin v3.0.0
gh run watch
```

- [ ] **Step 3: Verify the release carries four assets under the right names**

```bash
gh release view v3.0.0 --json assets --jq '.assets[].name'
```

Expected, exactly:

```
ui-bundle.zip
ui-bundle-appuio.zip
ui-bundle-k8up.zip
ui-bundle-syn.zip
```

A `ui-bundle-vshn.zip` in that list is a release that will break four production sites at their next bump. Delete the release and the tag, fix `brands.json`, and tag again.

- [ ] **Step 4: Verify a consumer can actually fetch it**

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' \
  https://github.com/vshn/antora-ui/releases/download/v3.0.0/ui-bundle.zip
curl -sIL -o /dev/null -w '%{http_code}\n' \
  https://github.com/vshn/antora-ui-default/releases/download/v3.0.0/ui-bundle.zip
```

Expected: `200` from both. The second is the redirect from the old path, which is what keeps every unrewritten pin working until Task 12 lands.

---

## Task 12: Point the four VSHN consumers at the new name

Four repositories pin this bundle. Each gets the new path and the new version in one small change. The three rollout sites are step 2 of the spec and are not touched here.

**Files:** one `playbook.yml` per consumer repository, outside this repository.

**Interfaces:**
- Consumes: the release from Task 11.
- Produces: nothing this repository reads. It removes the last dependency on the GitHub redirect.

- [ ] **Step 1: appcat, on GitHub**

Work outside this repository, in a scratch directory rather than `/tmp`:

```bash
cd "$SCRATCHPAD"     # any directory outside this checkout
gh repo clone vshn/appcat-user-docs
cd appcat-user-docs
git checkout -b chore/antora-ui-rename
grep -n 'antora-ui-default' playbook.yml
```

Expected, one hit:

```
url: https://github.com/vshn/antora-ui-default/releases/download/v2.8.0/ui-bundle.zip
```

Rewrite it:

```bash
sed -i '' 's|vshn/antora-ui-default/releases/download/v2.8.0/ui-bundle.zip|vshn/antora-ui/releases/download/v3.0.0/ui-bundle.zip|' playbook.yml
grep -n 'antora-ui' playbook.yml
```

`sed -i ''` is the macOS form; on Linux use `sed -i`.

- [ ] **Step 2: Open the pull request**

```bash
git add playbook.yml
git commit -m "chore: follow the UI bundle to vshn/antora-ui v3.0.0

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --title "chore: follow the UI bundle to vshn/antora-ui v3.0.0" --body "$(cat <<'BODY'
The shared UI repository is now `vshn/antora-ui`, and v3.0.0 builds one bundle per brand. This site keeps `ui-bundle.zip`, which is the VSHN brand's asset and deliberately keeps its old file name so pins like this one do not break.

GitHub redirects the old path, so nothing was broken while this sat unmerged. The pin is rewritten anyway because the redirect lasts only while nothing occupies the old path: anyone in the org creating a repository called `antora-ui-default` later would silently break every documentation build.

Nothing about this site's content, search or analytics changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: handbook, kb and products, on GitLab**

These are GitLab repositories and this session has no GitLab token, so the executor clones each one with the credentials they already have. For each of `vshn/handbook`, `vshn/docs/kb` and `vshn/docs/products`:

```bash
cd "$SCRATCHPAD"     # any directory outside this checkout
git clone git@gitlab.com:vshn/handbook.git
cd handbook
git checkout -b chore/antora-ui-rename
grep -n 'antora-ui' playbook.yml
```

Expected: one line naming `vshn/antora-ui-default` and a version. Rewrite the path to `vshn/antora-ui` and the version to `v3.0.0`, keeping the asset name `ui-bundle.zip`:

```bash
sed -i '' -E 's|vshn/antora-ui-default/releases/download/v[0-9.]+/ui-bundle.zip|vshn/antora-ui/releases/download/v3.0.0/ui-bundle.zip|' playbook.yml
grep -n 'antora-ui' playbook.yml
```

Confirm the grep shows the new URL. A `sed` that matches nothing still exits 0, so read the output rather than trusting the exit code.

- [ ] **Step 4: Open the merge requests**

For each of the three:

```bash
git add playbook.yml
git commit -m "chore: follow the UI bundle to vshn/antora-ui v3.0.0

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin HEAD -o merge_request.create \
  -o merge_request.title="chore: follow the UI bundle to vshn/antora-ui v3.0.0" \
  -o merge_request.remove_source_branch
```

Then open each merge request in the browser and paste the same description used for appcat in Step 2.

- [ ] **Step 5: Verify each site after it deploys**

For each of handbook.vshn.ch, kb.vshn.ch, products.vshn.ch and docs.appcat.ch:

```bash
curl -s https://handbook.vshn.ch/ | grep -oE '_/css/site-[0-9a-f]{8}\.css'
curl -s https://handbook.vshn.ch/ | grep -c 'vshn_logo'
```

Expected: a fingerprinted stylesheet name and a `1`. The stylesheet name should differ from the one the site served before the bump, which is how you know the new bundle is live rather than a cached old one.

- [ ] **Step 6: Report**

State which of the four are merged and deployed, which are still open, and the fingerprinted asset name each site serves. Step 2 of the spec, the rollout to docs.appuio.cloud, docs.appuio.ch and docs.k8up.io, gets its own plan written against this release.

---

## Deviations from the spec, and why

Four, all small, all recorded here so the spec and the plan do not silently disagree.

1. **`brands.json`, not `brands.yml`.** The CI matrix has to read the manifest before `npm ci` has run. `jq` is on the GitHub runner and a YAML parser is not, and adding a job that installs one to read five lines is worse than the format change.
2. **No per-brand `brand.yml`.** One manifest rather than one plus four files. The favicon check reads the brand's own markup instead of a declared list, which is stronger: it catches an icon that is referenced and missing, which a list of sizes cannot.
3. **Five partial slots, not three.** The spec named logo, links and footer. Favicons and `twitter:site` are also brand data that today sit in shared partials, and leaving them behind would leave brand strings in `src/`, which the invariant test forbids.
4. **`tokens.css` is imported after `palette.css`, not first.** Brand tokens read the neutral scale, and postcss-custom-properties resolves against declarations it has already walked. `palette.css` (shared, brand-free) then `tokens.css` (brand) then `vars.css` (shared derivations) is the only order in which every reference resolves forward.
