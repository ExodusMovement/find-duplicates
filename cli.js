#!/usr/bin/env node

const argv = require('minimist')(process.argv.slice(2), {
  default: {
    glob: ['node_modules/**/*.js'],
    concurrency: 1000,
  },
})
const { findAndRemap } = require('./')
const { glob, concurrency } = argv

const prettify = (obj) => JSON.stringify(obj, null, 2)
const prettyLog = (obj) => console.log(prettify(obj))

findAndRemap({ globs: [].concat(glob), concurrency }).then(prettyLog, (err) => {
  console.error(err)
  process.exitCode = 1
})
