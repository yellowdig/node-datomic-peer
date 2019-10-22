const R = require('ramda')
const java = require('java')
const assert = require('assert')

const { read, toEdn } = require('./util')
const convert = require('./convert')

java.options.push('-Xmx2048m')
java.classpath.push('./datomic/datomic-http.jar')
console.log('IMPORT CLOJURE')

var Clojure = java.import('clojure.java.api.Clojure')
var Connection = java.import('datomic.Connection')
var Database = java.import('datomic.Database')
var Peer = java.import('datomic.Peer')
var Util = java.import('datomic.Util')

java.import('clojure.lang.RT')
java.import('java.util.List')

const cljRequire = Clojure.varSync('clojure.core', 'require')
cljRequire.invokeSync(Clojure.readSync('datomic.api'))

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
  const isArray = 'Array' === R.type(data)
  const inputData = isArray ? toEdn(data) : read(data)

  return new Promise((resolve, reject) => {
    conn.transact(inputData, (err, res) => {
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

function pull(db, pattern, eidOrRef) {
  return new Promise((resolve, reject) => {
    const res = db.pull(pattern, toEdn(eidOrRef), (err, res) => {
      if (err) reject(err)
      resolve(convert(res))
    })
  })
}

function pullMany(db, pattern, eidsOrRefs) {
  const res = db.pullManySync(read(pattern), toEdn(eidsOrRefs))
  return convert(res)
}

// TODO
// expose other entity operations?
// https://docs.datomic.com/on-prem/javadoc/datomic/Entity.html
function entity(db, eidOrRef) {
  const res = db.entitySync(toEdn(eidOrRef))
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
  const inputs = args.map(toEdn)
  return new Promise((resolve, reject) => {
    const res = java.callStaticMethod(
      'datomic.Peer',
      'query',
      ...inputs,
      (err, res) => {
        if (err) reject(err)
        resolve(convert(res))
      }
    )
  })
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
  pullMany,
  q,
  db,
  transact,
  entity,
  datoms,
  tempid
}
