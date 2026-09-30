'use strict'

const fs = require('fs-extra')

const BRAND_MARKER = '.brand'

// The compile step reads one tree. Rather than teach PostCSS, Handlebars and the asset globs about a
// second source directory, put the brand's files where the shared ones are and let the existing
// pipeline run unchanged. The wipe is the load-bearing part: without it a file from the previous
// brand survives into this brand's bundle.
module.exports = (src, brandDir, staging, brandName) => () => {
  fs.removeSync(staging)
  fs.copySync(src, staging)
  fs.copySync(brandDir, staging)
  // which brand this tree was built for; bundle:pack refuses a tree that is another brand's
  fs.writeFileSync(`${staging}/${BRAND_MARKER}`, `${brandName}\n`)
  return Promise.resolve()
}
