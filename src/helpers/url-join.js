'use strict'

// Joins a base URL and a path with exactly one slash between them.
module.exports = (base, path) => `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
