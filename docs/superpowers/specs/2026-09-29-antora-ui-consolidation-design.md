# Consolidating the Antora UI forks into per-brand bundles

Design for [issue #176](https://github.com/vshn/antora-ui-default/issues/176), 29 September 2026.

## The problem

Four repositories build a near-identical Antora UI:

| repository | latest release | what it actually is |
|---|---|---|
| `vshn/antora-ui-default` | v2.8.0 | the maintained one: in-browser search, fingerprinted assets, Plausible, 43 tests |
| `appuio/antora-ui-default` | 1.9, Sep 2026 (1.8 was Mar 2023) | a 2023 copy of the VSHN UI with APPUiO colours |
| `k8up-io/antora-ui-default` | 1.5.0, Sep 2026 | the same, with K8up colours |
| `projectsyn/antora-ui-default` | 2.1.0 | the same, with Project Syn colours |

They are not forks of upstream Antora. Each carries `src/js/07-vshn-search.js`, our own file, in an
older revision. Measured against `origin/master`:

```
                 search JS         doc.css      head-scripts   pagefind build tasks
appuio 1.9       207 vs our 402    266 lines    7 vs 11        absent
k8up-io 1.5.0    187 vs our 402     85 lines    7 vs 11        absent
```

Of appuio's `vars.css` drift, 66 of 71 changed lines are colour tokens; of k8up's, 39 of 44. Of the
`doc.css` drift, 6 lines in each are colour. **The brand-specific part is a palette, a logo and a few
header rules. Everything else is staleness.**

The cost is concrete and current:

- `docs.appuio.cloud`, `docs.appuio.ch` and `docs.k8up.io` still run the search container, because
  their bundles predate Pagefind. That is what keeps `/search` in the shared nginx image, the
  `serverSearch` fallback in the UI, and `vshn/embedded-search-engine` and
  `vshn/antora-indexer-cli` alive (issue #177).
- k8up's `doc.css` still renders admonition icons with Font Awesome glyphs, the exact construct that
  produced square boxes on the VSHN sites in September 2026.
- Any UI improvement has to be made three more times, by hand, or not at all. It has been "not at
  all" since March 2023.

## Intent

One repository builds one UI. A brand contributes a palette, a logo and three small partials, and
gets everything else, including future work, for free. After the rollout, the three fork-built sites
search in the reader's browser and the search container is gone from the estate.

Success is checkable, not a feeling:

1. `src/` contains no brand string (`vshn`, `appuio`, `k8up`, `syn`). Enforced by a test.
2. One release publishes four bundles; a brand's bundle carries only that brand's assets.
3. The three sites render their own brand, search from a Pagefind index, and answer `/search` with 404.
4. No consumer's pinned bundle URL breaks.

## Decisions taken

| question | decision |
|---|---|
| Visual fidelity for the migrating sites | Brand tokens and logo only. Those sites adopt the current shared UI and will look updated, not identical. |
| Where the UI lives | `vshn/antora-ui-default`, **renamed to `vshn/antora-ui`**. The three fork repositories get a pointer in their README and are archived. |
| Rollout scope per site | One merge request carrying everything: brand bundle, Pagefind, container removal, `/search` 404, nginx `1.31.6.2`, Renovate rule, Plausible. |
| Build mechanism | A brand overlay directory and one build per brand (approach A), rejecting a single all-brands bundle (ships four sets of favicons to everyone) and per-site `supplemental_files` (puts brand assets back in site repos, which is the drift we are removing). |

## Design

### Layout

```
src/                              shared, brand-free
  partials/header-content.hbs       navbar, search box, burger
                                    includes {{> brand-logo }} and {{> brand-links }}
  partials/footer-content.hbs       includes {{> brand-footer }}
  css/vars.css                      structural tokens only: spacing, fonts, sizes
  css/site.css                      @import "brand/tokens.css"  first
                                    ... shared stylesheets ...
                                    @import "brand/brand.css"   last

brands/<name>/
  brand.yml                         display name, favicon sizes present
  css/tokens.css                    the colour palette
  css/brand.css                     the logo rule and any brand-only rule
  img/logo.svg, favicon-*.png
  partials/brand-logo.hbs
  partials/brand-links.hbs
  partials/brand-footer.hbs

brands.yml                          the list CI builds from
```

A brand fills **slots**. It does not own the markup around them, so the navbar, the search box and
the admonition rendering cannot drift per brand. A brand needing a structural change changes the
shared file, where every brand gets it.

`brands/vshn/` is created by **moving** today's VSHN pieces out of `src/`: the `--color-vshn-*`
tokens from `vars.css`, the `.vshn_logo` rule from `header.css`, `img/vshn.svg` and the eight
favicons, the VSHN dropdown in `header-content.hbs`, and the copyright line in
`footer-content.hbs`. If VSHN stayed the implicit default, the other brands would remain
second-class and the drift would return.

### Build and release

```
gulp bundle --brand=appuio
  1. stage src/ into build/
  2. copy brands/appuio/{css,img,partials} over the staged tree
  3. compile, fingerprint, pack  ->  build/ui-bundle-appuio.zip
```

- `brands.yml` drives a CI matrix. A fifth brand is one directory and one line, no workflow edit.
- Local development defaults to `--brand=vshn` so `gulp preview` works bare. CI always passes the
  brand explicitly, and a missing brand directory fails the build rather than producing a
  VSHN-coloured bundle under another brand's name.
- One tag, one release, four assets. One version for all brands means no brand falls behind
  silently; each site still chooses when to take it, because each pins its own version.

**The VSHN bundle keeps the file name `ui-bundle.zip`.** Renaming it to `ui-bundle-vshn.zip` would
break the pins in handbook, kb, products and appcat at their next bump: a self-inflicted outage in
exchange for symmetry. The asymmetry is documented in `brands.yml` and the README.

### Testing

Per brand, because four bundles means four chances to break something quietly:

- **The existing 43 tests, per brand.** They cover admonition icons, self-hosted fonts, the
  third-party allowlist, search, `?q=` and the Plausible snippet. Against each brand's preview they
  answer the question that matters: does this brand's CSS break the shared UI? k8up's fork carries
  Font Awesome glyph admonitions, so this is not hypothetical.
- **Per-brand assertions**: the brand's logo is referenced and served; a known element's computed
  colour matches a token from that brand's palette; every favicon named in `brand.yml` exists.
- **No cross-brand leakage**: `ui-bundle-appuio.zip` contains appuio's logo and no other brand's
  assets.
- **The real Antora image check per brand** (`test/antora-image.sh`), which is how the Node 24 zip
  bug surfaced: a bundle Antora cannot load makes Antora exit 0 and write nothing.
- **The brand-free invariant**: `src/` must contain no brand string. This is the load-bearing test.
  It fails the day someone adds a VSHN link to a shared partial, which is how this started.

Cost is roughly two minutes of CI: the suite is about thirty seconds per brand.

## Rollout

Order matters: consolidate and release, then move the sites, then archive the forks. Archiving
first would strand them.

### Step 1: consolidate, rename, release

1. Restructure into `src/` plus `brands/`, with the four brand directories populated from the forks'
   palettes and logos.
2. Per-brand build, CI matrix, tests as above.
3. **Rename the repository to `vshn/antora-ui`.** "Default" described a fork of upstream's default
   UI, which this has not been for years, and the repository now serves four brands.
4. **Rewrite every consumer's pinned URL to the new path**, rather than leaning on the redirect.

   Renaming is safe, verified against `vshn/k8up`, which really moved to `k8up-io/k8up`:

   ```
   gh api repos/vshn/k8up            -> k8up-io/k8up       the API follows
   gh api repos/vshn/k8up/releases   -> v2.16.0            what Renovate queries follows
   old release asset URL             -> 200, 2 redirects   Antora builds keep working
   ```

   So nothing breaks on the day of the rename. The reason to rewrite the pins anyway: GitHub keeps
   the redirect only while nothing occupies the old path. Anyone in the org creating a repository
   called `antora-ui-default` later would silently break every documentation build. Pins are
   rewritten in the same merge requests that already touch each `playbook.yml`, so the cost is a
   word per repository:

   | repository | file | pin becomes |
   |---|---|---|
   | `vshn/handbook` | `playbook.yml` | `vshn/antora-ui` release, `ui-bundle.zip` |
   | `vshn/docs/kb` | `playbook.yml` | same |
   | `vshn/docs/products` | `playbook.yml` | same |
   | `vshn/appcat-user-docs` | `playbook.yml` | same |
   | the three rollout sites | `playbook.yml` | `ui-bundle-<brand>.zip`, in step 2 |

   The redirect then serves only stale links and documentation, which is what a redirect is for.

### Step 2: one merge request per site

| | docs.appuio.cloud | docs.appuio.ch | docs.k8up.io |
|---|---|---|---|
| repository | `appuio-public/appuio-cloud-docs-antora-pipeline` | `appuio-public/appuio-managed-docs` | `vshn/k8up_documentation` |
| bundle | `ui-bundle-appuio.zip` | `ui-bundle-appuio.zip` | `ui-bundle-k8up.zip` |
| nginx | 1.31.6 → 1.31.6.2 | **1.23.3** → 1.31.6.2 | 1.31.6 → 1.31.6.2 |
| Plausible script | `pa-2WznlZYJKTVC_60EGuIBt.js` | `pa-bFObuAhjSVRR380IH6di7.js` | `pa-AueQAYxG_VHFLdhSijCCE.js` |
| search | Pagefind index, container removed, `location ~ ^/search(/\|$)` returns 404 | same | same |
| Renovate | `versioning: loose` for the two `ghcr.io/vshn` images | same | same |

All three dashboards exist. `docs.k8up.io`'s was created on 29 September once the account was no
longer at its 50-site limit.

Each site is verified the way products was, in a browser and not by reading a pipeline: a real
search rendering results with `pagefind-worker.js` in the network and **no** request to `/search`,
a screenshot of the branded page, `/search` answering 404, and `POST /api/event` returning 202.

`has_plausible: true` for the three sites in `vshn/landingpager`'s `sites/_external/` registers the
`Search` and `Search Result Click` goals. Separate repository, does not block.

### Step 3: archive the forks that are done

`appuio/antora-ui-default` and `k8up-io/antora-ui-default` each get a README note pointing at
`vshn/antora-ui` **before** the archive flag, because archived repositories are read-only. This is
what was done for `vshn/antora-bootstrap`.

`projectsyn/antora-ui-default` stays live: no Project Syn site moves in this rollout, so archiving
it would strand whatever builds `syn.tools`. Two repositories are archived here, not three.

### Step 4: what this unlocks

Issue #177 closes: `/search` comes out of the nginx image, `serverSearch` comes out of the UI, and
`vshn/embedded-search-engine` and `vshn/antora-indexer-cli` are archived.

## Implementation order

This spec is deliberately two implementation plans, not one:

1. **Consolidation, rename and release.** Everything in step 1, ending with a release that publishes
   four bundles and consumers pinned to `vshn/antora-ui`. Nothing about the three migrating sites
   changes yet, and the four sites already on the shared bundle keep working throughout.
2. **The rollout**, written once that release exists, because each site's merge request pins a real
   version and a real asset name. Steps 2 and 3 belong to it.

Writing one plan for both would mean planning against a release that does not exist, and the second
half would be rewritten as soon as the first half taught us something.

## Non-goals and known gaps

- **Project Syn sites do not move in this rollout.** The syn brand gets a bundle, but I could not
  find what builds `syn.tools`: `docs.syn.tools` redirects to `syn.tools`, which answers from
  Caddy, not from the shared nginx image. `projectsyn/antora-ui-default` therefore stays live until
  someone identifies that pipeline, and step 3 archives two repositories rather than three.
- **No visual redesign.** The migrating sites get the current shared UI with their palette. Any
  wish to change how the UI looks is a separate piece of work.
- **The `/search` proxy stays in the nginx image until step 4**, so sites that have not migrated
  keep working throughout.
- **Antora versions are not touched.** `appuio-managed-docs` builds with `ghcr.io/vshn/antora:3.1.2.2`
  and that stays as it is; only nginx moves, because that pin is frozen and a 2022 nginx is a
  security argument rather than a tidiness one.

## Risks

| risk | mitigation |
|---|---|
| A brand's palette does not cover a token the shared UI expects, so something renders unstyled | The per-brand test suite renders every page type; the computed-colour assertion catches a missing palette |
| The migrating sites look different enough that their owners object | Deliberate and agreed: tokens and logo only. Screenshots go in each merge request before it is merged |
| The rename breaks a consumer I did not find | Redirects hold (verified), and the pin rewrite covers the consumers inventoried on 29 September: four VSHN sites plus the three rollout sites |
| Removing the search container breaks search on a site whose index is wrong | Each site is checked in a browser after deploy; one revert restores the container |
| Someone recreates `vshn/antora-ui-default` and kills the redirect | Pins no longer depend on it after step 1 |
