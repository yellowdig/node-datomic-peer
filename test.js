const R = require('ramda')
const faker = require('faker')
const assert = require('assert')

const java = require('java')
java.classpath.push('./datomic/datomic-node.jar')

const {
  q,
  db,
  createDatabase,
  deleteDatabase,
  pull,
  transact,
  entity,
  connect,
  datoms,
  tempid
} = require('./src/api')

const { read, toEdn } = require('./src/util')
const convert = require('./src/convert')

const uri = 'datomic:mem://localhost:4334/yellowdig'

const makeUser = idx => {
  return [':db/add', tempid(), ':user/username', faker.name.firstName()]
}

const installSchema = conn => {
  var schema = [
    {
      ':db/ident': ':user/username',
      ':db/valueType': ':db.type/string',
      ':db/cardinality': ':db.cardinality/one'
    },
    {
      ':db/ident': ':user/age',
      ':db/valueType': ':db.type/long',
      ':db/cardinality': ':db.cardinality/one'
    },
    {
      ':db/ident': ':user/roles',
      ':db/valueType': ':db.type/keyword',
      ':db/cardinality': ':db.cardinality/many'
    },
    {
      ':db/ident': ':user/email-settings',
      ':db/valueType': ':db.type/ref',
      ':db/cardinality': ':db.cardinality/many',
      ':db/isComponent': true
    },
    {
      ':db/ident': ':email-setting/color',
      ':db/valueType': ':db.type/keyword',
      ':db/cardinality': ':db.cardinality/one'
    },
    {
      ':db/ident': ':lang/title',
      ':db/valueType': ':db.type/string',
      ':db/cardinality': ':db.cardinality/one'
    }
  ]

  return transact(conn, schema)
}

describe('type coercion', () => {
  it('converts vectors', () => {
    const clj = read('["foo" 1 :bar]')

    const data = convert(clj)

    assert.deepEqual(data, ['foo', 1, ':bar'])
  })

  it('converts maps', () => {
    const edn = `
      { :foo 99
        :bar {:baz 88} }
    `

    const clj = read(edn)

    const data = convert(clj)

    const expected = {
      ':foo': 99,
      ':bar': { ':baz': 88 }
    }

    assert.deepEqual(data, expected)
  })

  // TODO
  // we may want to conver to es6 sets
  it('converts sets to arrays', () => {
    const edn = `
     #{:foo 
       :bar 
       {:baz [1 2]}}
    `

    const clj = read(edn)

    const data = convert(clj)

    const expected = [':foo', ':bar', { ':baz': [1, 2] }]

    assert.deepEqual(data.sort(), expected.sort())
  })

  it('converts nil to null', () => {
    const edn = `
     [22 nil]
    `

    const clj = read(edn)

    const data = convert(clj)

    const expected = [22, null]

    assert.deepEqual(data.sort(), expected.sort())
  })

  it('convers js to edn', () => {
    const input = {
      ':foo': {
        ':bar': [1, 2, 3]
      }
    }
    const data = toEdn(input)
    const str = data.toString()
    assert.equal(str, '{:foo={:bar=[1, 2, 3]}}')
  })
})

describe('datomic interop', () => {
  var conn

  before(async () => {
    await createDatabase(uri)
    conn = await connect(uri)

    // what data to we expect from 'trasact()',
    // db2 implementation returns tempids only,
    // but we would prefer if we had access to db before/after
    await installSchema(conn)
  })

  after(async () => {
    deleteDatabase(uri)
  })

  it('transact returns map of tempids', async () => {
    const users = R.range(0, 4).map(makeUser)
    const { tempids } = await transact(conn, users)
    assert(R.type(tempids) === 'Object')
    assert(R.type(R.head(R.keys(tempids))) === 'String')
    assert(R.type(R.head(R.values(tempids))) === 'Number')
  })

  it('can transact temp id strings', async () => {
    const row = [read(':db/add'), 'temp-user', ':user/username', 'kevin']
    const { tempids } = await transact(conn, [row])
    assert(!!tempids['temp-user'])
  })

  it('can transact nested objects', async () => {
    const row = {
      ':db/id': 'temp-user',
      ':user/email-settings': [
        {
          ':email-setting/color': ':red'
        }
      ]
    }
    const { tempids } = await transact(conn, [row])
  })

  it('can query for data', async () => {
    const users = R.range(0, 50).map(makeUser)
    const res = await transact(conn, users)

    const _db = db(conn)

    const query = `
     [:find ?e ?v
      :where [?e :user/username ?v]]
    `

    const data = q(query, _db)

    assert('Array' === R.type(data))

    const validRow = x => {
      return R.type(R.head(x)) === 'Number' && R.type(R.last(x)) === 'String'
    }

    assert(R.all(validRow, data))
  })

  it('can destructure :find', async () => {
    const _db = db(conn)

    const query = `
     [:find [?v ...]
      :where [?e :user/username ?v]]
    `

    const data = q(query, _db)

    const validRow = x => {
      return R.type(x) === 'String'
    }

    assert(R.all(validRow, data))
  })

  it('can pass vectors as input to q()', async () => {
    const users = [
      { ':user/username': 'foo' },
      { ':user/username': 'bar' },
      { ':user/username': 'baz' }
    ]

    const res = await transact(conn, users)

    const _db = db(conn)

    const query = `
     [:find [?e ...]
      :in $ [?names ...]
      :where [?e :user/username ?names]]
    `

    const data = q(query, _db, ['foo', 'bar'])

    const validRow = x => {
      return R.type(x) === 'Number'
    }

    assert(R.all(validRow, data))
  })

  it('can pass rules', async () => {
    const users = [
      { ':user/username': 'foo', ':user/age': 10 },
      { ':user/username': 'bar', ':user/age': 64 },
      { ':user/username': 'baz', ':user/age': 62 }
    ]

    const res = await transact(conn, users)

    const _db = db(conn)

    const query = `
     [:find [?e ...]
      :in $ %
      :where (senior? ?e)]
    `

    const rules = ` 
     [[(senior? ?e)
      [?e :user/age ?age]
      [(> ?age 60)]]]
    `

    const data = q(query, _db, rules)

    const validRow = x => {
      return R.type(x) === 'Number'
    }

    assert(R.all(validRow, data))

    assert(data.length === 2)
  })

  it('can pull attrs', async () => {
    const tmpid = tempid()

    const users = [
      {
        ':db/id': 'temp-user',
        ':user/username': 'foo',
        ':user/age': 11,
        ':user/roles': ':admin'
      }
    ]

    const { tempids, dbAfter } = await transact(conn, users)

    const eid = tempids['temp-user']

    const res = pull(db(conn), '[:user/age :user/roles]', eid)

    assert.equal(res[':user/age'], 11)
  })

  it('can access attrs via entity api', async () => {
    const users = [
      {
        ':db/id': 'temp-user',
        ':user/username': 'ahab',
        ':user/roles': ':captain'
      }
    ]

    const { tempids, dbAfter } = await transact(conn, users)

    const eid = tempids['temp-user']
    const ent = entity(dbAfter, eid)

    assert.deepEqual(ent.get(':user/username'), 'ahab')
    assert.deepEqual(ent.get(':user/roles'), [':captain'])
  })

  it('can iterate datoms', async () => {
    const rows = ['angular', 'beam', 'clojure', 'datascript', 'elm', 'fortran']

    const languages = rows.map(name => {
      return {
        ':db/id': `temp-${name}`,
        ':lang/title': name
      }
    })

    const { tempids, dbAfter } = await transact(conn, languages)

    const iter = datoms(dbAfter, ':aevt', ':lang/title')
    const results = []

    while (iter.hasNext()) {
      results.push(iter.next())
    }

    assert.deepEqual(rows, results.map(x => x[2]))
  })
})
