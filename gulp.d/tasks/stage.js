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
