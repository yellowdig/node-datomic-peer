const java = require('java')
const R = require('ramda')

const read = x => {
  return java.callStaticMethodSync('datomic.Util', 'read', x)
}

const toList = (...args) => {
  return java.callStaticMethodSync('datomic.Util', 'list', ...args)
}

const toMap = obj => {
  const pairs = R.flatten(R.toPairs(obj))
  return java.callStaticMethodSync('datomic.Util', 'map', ...pairs)
}

const tempid = () => {
  return java.callStaticMethodSync('datomic.Peer', 'tempid', ':db.part/user')
}

module.exports = {
  read,
  toList,
  toMap,
  tempid
}
