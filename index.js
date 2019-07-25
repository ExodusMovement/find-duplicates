const crypto = require('crypto')
const path = require('path')
const { promisify } = require('util')
const globby = require('globby')
const fs = require('fs')
const readFile = promisify(fs.readFile.bind(fs))
const writeFile = promisify(fs.writeFile.bind(fs))
const pMap = require('p-map')

const log = console.log.bind(console)

const alphabetical = (a, b) => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

const getFileInfo = async ({ path, algorithm }) => {
  const content = await readFile(path, 'utf8')
  const hash = crypto
    .createHash(algorithm)
    .update(content)
    .digest('hex')

  return {
    path,
    hash,
    size: content.length,
    content,
  }
}

const getHumanReadableSize = (size) => (size / 1000).toFixed(1) + 'KB'

const find = async ({ target, globs, concurrency = Infinity, algorithm = 'sha1' }) => {
  const paths = await globby(globs, {
    onlyFiles: true,
    followSymbolicLinks: false,
  })

  const byHash = new Map()
  await pMap(
    paths,
    async (path) => {
      const info = await getFileInfo({ path, algorithm })
      const soFar = byHash.get(info.hash) || { size: info.size, paths: [] }
      soFar.paths.push(info.path)
      byHash.set(info.hash, soFar)
    },
    {
      concurrency,
    }
  )

  // remove files with no duplicates
  const haveDuplicates = [...byHash].filter(([hash, { paths }]) => paths.length > 1)
  return new Map(haveDuplicates)
}

const chooseOriginal = (paths) => {
  const [original, ...duplicates] = paths.slice().sort(alphabetical)
  return {
    original,
    duplicates,
  }
}

const remap = ({ paths }) => {
  const { original, duplicates } = chooseOriginal(paths)
  const mapping = {}

  duplicates.forEach((duplicate) => {
    let pathToOriginal = path.relative(path.dirname(duplicate), original)
    if (!pathToOriginal.startsWith('..')) {
      pathToOriginal = `.${path.sep}${pathToOriginal}`
    }

    mapping[duplicate] = `module.exports = require('${pathToOriginal}')`
  })

  return mapping
}

// find first, then remap, so that we can choose an "original" for each set of duplicates deterministically
const findAndRemap = async (opts) => {
  const byHash = await find(opts)

  const mapping = {}

  byHash.forEach(({ paths }, hash) => {
    Object.assign(mapping, remap({ paths }))
  })

  return mapping
}

module.exports = {
  find,
  remap,
  findAndRemap,
}
