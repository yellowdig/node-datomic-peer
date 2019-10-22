const R = require('ramda')

function getType(x) {
  if (x.getClassSync) {
    return x.getClassSync().getNameSync()
  }

  return R.type(x)
}

// takes a persistent array map
// returns a js map
const toJSMap = data => {
  const entries = iterateAll(data.iteratorSync())

  const pairs = entries.map(entry => {
    const key = entry.keySync()
    const val = entry.valSync()

    // for some reason,
    // ':db/id' field is producing a
    // null value in MapEntry?
    // could be becase we already have to
    // know the db id
    // console.log({
    //   key: key.toString(),
    //   val: val && val.toString()
    // })

    return [toJS(key), toJS(val)]
  })

  return R.fromPairs(pairs)
}

const toJSArray = data => {
  const entries = iterateAll(data.iteratorSync())
  return entries.map(toJS)
}

const iterateAll = iterator => {
  const entries = []
  while (iterator.hasNextSync()) {
    let entry = iterator.nextSync()
    entries.push(entry)
  }
  return entries
}

// recursive function which
// translates clojure data structures
// (sets, vectors, maps, keywords, etc)
// into js representations
function toJS(x) {
  // nil -> null
  if (x == null) {
    return null
  }

  const type = getType(x)

  if ('clojure.lang.PersistentHashSet' === type) {
    return toJSArray(x)
  }

  if ('java.util.HashSet' === type) {
    return toJSArray(x)
  }

  if ('clojure.lang.PersistentArrayMap' === type) {
    return toJSMap(x)
  }

  if ('clojure.lang.PersistentHashMap' === type) {
    return toJSMap(x)
  }

  if ('clojure.lang.Keyword' === type) {
    return x.toString()
  }

  if ('clojure.lang.PersistentVector' === type) {
    // TODO
    // vector -> list
    return toJSArray(x)
  }

  if ('String' === R.type(x)) {
    return x
  }

  if (x.longValue) {
    // TODO
    // handle case where long exceeds
    // size of js number class
    let val = x.longValue

    if (val.length > 18) {
      return val
    }

    return Number(val)
  }

  if ('Number' === R.type(x)) {
    return x
  }

  if ('Boolean' === type) {
    return Boolean(x)
  }

  // TODO
  // how should we represent Datom type
  if ('datomic.db.Datum' === type) {
    const datomMap = {
      e: x.eSync(),
      a: x.aSync(),
      v: x.vSync(),
      tx: x.txSync(),
      added: x.addedSync()
    }
    const coerced = R.map(toJS, datomMap)
    return [coerced.e, coerced.a, coerced.v, coerced.tx, coerced.added]
  }

  if ('clojure.lang.Symbol' === type) {
    return String(x)
  }

  console.log('NA TYPE', type)
  return 'n/a'
}

module.exports = toJS
