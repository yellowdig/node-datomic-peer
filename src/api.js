const R = require('ramda')
const java = require('java')
const assert = require('assert')

const { read, toList, toMap } = require('./util')
const convert = require('./convert')

var Clojure = java.import('clojure.java.api.Clojure')
var Connection = java.import('datomic.Connection')
var Database = java.import('datomic.Database')
var Peer = java.import('datomic.Peer')
var Util = java.import('datomic.Util')

java.import('clojure.lang.RT')
java.import('java.util.List')

// ===== API

function connect(uri) {
  return java.callStaticMethodSync('datomic.Peer', 'connect', uri)
}

function createDatabase(uri) {
  return java.callStaticMethodSync('datomic.Peer', 'createDatabase', uri)
}

function deleteDatabase(uri) {
  return java.callStaticMethodSync('datomic.Peer', 'deleteDatabase', uri)
}

function transact(conn, data) {
  assert(R.type(data), 'Array')

  // TODO
  // need js->clj function
  const fmtRow = x => {
    if ('Object' === R.type(x)) {
      return toMap(x)
    }
    if ('Array' === R.type(x)) {
      return toList(x)
    }
  }

  const fmtData = toList(R.map(fmtRow, data))

  return new Promise((resolve, reject) => {
    conn.transact(fmtData, (err, res) => {
      if (err) reject(err)
      const txResponse = res.getSync()

      const tempids = txResponse.getSync(Connection.TEMPIDS)
      const jsIds = convert(tempids)

      const dbAfter = txResponse.getSync(read(':db-after'))

      resolve({
        dbAfter,
        tempids: jsIds
      })
    })
  })
}

function pull(db, pattern, eid) {
  const res = db.pullSync(
    pattern,
    // we read() here to
    // ensure input eid is read as a Long
    read(String(eid))
  )
  return convert(res)
}

// TODO
// expose other entity operations?
// https://docs.datomic.com/on-prem/javadoc/datomic/Entity.html
function entity(db, eid) {
  const res = db.entitySync(read(String(eid)))
  return {
    get: k => convert(res.getSync(k))
  }
}

// TODO
// not sure how best to represent
// an iterable in node.js
function datoms(db, index, ...components) {
  const _datoms = db.datomsSync(read(index), components.map(read))
  const iter = _datoms.iteratorSync()

  return {
    next: () => {
      return convert(iter.nextSync())
    },
    hasNext: () => {
      return iter.hasNextSync()
    }
  }
}

function q(...args) {
  const res = java.callStaticMethodSync('datomic.Peer', 'q', ...args)
  return convert(res)
}

function db(conn) {
  return conn.dbSync()
}

const tempid = () => {
  return java.callStaticMethodSync('datomic.Peer', 'tempid', ':db.part/user')
}

module.exports = {
  connect,
  createDatabase,
  deleteDatabase,
  pull,
  q,
  db,
  transact,
  entity,
  datoms,
  tempid
}
