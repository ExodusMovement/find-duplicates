const { find, remap, findAndRemap } = require('./find')
const {
  getReplacement,
  replace,
  flattenEntry,
  flattenEntries
} = require('./replace')

module.exports = {
  // find
  find,
  remap,
  findAndRemap,
  // replace
  getReplacement,
  replace,
  flattenEntry,
  flattenEntries
}
