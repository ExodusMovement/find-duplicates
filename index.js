const crypto = require('crypto')
const Path = require('path')
const { promisify } = require('util')
const globby = require('globby')
const fs = require('fs')
const getPkgDir = require('pkg-dir')
const readFile = promisify(fs.readFile.bind(fs))
const writeFile = promisify(fs.writeFile.bind(fs))
const readJSON = (path) => readFile(path).then((content) => JSON.parse(content))
const pMap = require('p-map')

const log = console.log.bind(console)

const alphabetical = (a, b) => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

const getPkg = async (filePath) => {
  const dir = await getPkgDir(filePath)
  const path = Path.join(dir, 'package.json')
  return {
    path: Path.relative(process.cwd(), path),
    pkg: await readJSON(path),
  }
}

const getFileInfo = async ({ path, algorithm }) => {
  const [content, pkg] = await Promise.all([readFile(path, 'utf8'), getPkg(path)])

  const hash = crypto
    .createHash(algorithm)
    .update(content)
    .digest('hex')

  return {
    path,
    pkg: pkg.pkg,
    pkgPath: pkg.path,
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
      const soFar = byHash.get(info.hash) || { size: info.size, copies: [] }
      soFar.copies.push(info)
      byHash.set(info.hash, soFar)
    },
    {
      concurrency,
    }
  )

  // remove files with no duplicates
  const haveDuplicates = [...byHash].filter(([hash, { copies }]) => copies.length > 1)
  return new Map(haveDuplicates)
}

const chooseOriginal = (copies) => {
  const [original, ...duplicates] = copies.slice().sort((a, b) => alphabetical(a.path, b.path))
  return {
    original,
    duplicates,
  }
}

const remap = ({ copies }) => {
  const { original, duplicates } = chooseOriginal(copies)
  const mapping = {}

  duplicates.forEach((duplicate) => {
    const dupDir = Path.dirname(duplicate.path)
    let pathToOriginal = Path.relative(dupDir, original.path)
    if (!pathToOriginal.startsWith('..')) {
      pathToOriginal = `.${Path.sep}${pathToOriginal}`
    }

    mapping[duplicate.path] = {
      version: original.pkg.version,
      size: original.size,
      original: {
        pkg: original.pkgPath,
        file: original.path,
      },
      duplicate: {
        pkg: duplicate.pkgPath,
      },
    }
  })

  return mapping
}

// find first, then remap, so that we can choose an "original" for each set of duplicates deterministically
const findAndRemap = async (opts) => {
  const byHash = await find(opts)

  const mapping = {}

  byHash.forEach(({ copies }, hash) => {
    Object.assign(mapping, remap({ copies }))
  })

  return mapping
}

module.exports = {
  find,
  remap,
  findAndRemap,
}
