const java = require('java')
const R = require('ramda')

const read = x => {
  return java.callStaticMethodSync('datomic.Util', 'read', x)
}

const toList = (...args) => {
  return java.callStaticMethodSync('datomic.Util', 'list', ...args)
}

const toMap = (...kvs) => {
  return java.callStaticMethodSync('datomic.Util', 'map', ...kvs)
}

const tempid = () => {
  return java.callStaticMethodSync('datomic.Peer', 'tempid', ':db.part/user')
}

const toEdn = x => {
  const type = R.type(x)

  if (x == null) {
    return read('nil')
  }

  if ('String' === type) {
    return x
  }

  if ('Array' === type) {
    return toList(...x.map(toEdn))
  }

  if ('Object' === type) {
    const kvs = R.toPairs(x).reduce(R.concat)
    return toMap(...kvs.map(toEdn))
  }

  // we need to read here to ensure
  // js numbers are cast to longs/doubles etc
  if ('Number' === type) {
    return read(String(x))
  }

  if ('Boolean' === type) {
    return x
  }

  return x
}

module.exports = {
  read,
  toList,
  toMap,
  tempid,
  toEdn
}
