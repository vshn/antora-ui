'use strict'

const fs = require('fs')
const ospath = require('path')

const ROOT = ospath.join(__dirname, '..', '..')
const DEFAULT_BRAND = 'vshn'

const brands = () => JSON.parse(fs.readFileSync(ospath.join(ROOT, 'brands.json'), 'utf8')).brands

// --brand=appuio on the gulp command line, BRAND=appuio in the environment, otherwise vshn so that
// a bare `gulp preview` works. CI always passes the brand, and an unknown name fails the build
// rather than quietly producing a VSHN-colored bundle under another brand's name.
function selected () {
  // `--brand vshn` would otherwise be ignored and fall back to the default, which is a silent wrong build
  if (process.argv.includes('--brand')) {
    throw new Error('write the brand as --brand=<name>, with an equals sign and no space, as in --brand=k8up')
  }
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
