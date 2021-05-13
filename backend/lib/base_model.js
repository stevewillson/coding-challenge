import _ from 'lodash'
import Promise from 'bluebird'
import autoBind from 'auto-bind'
import createDOMPurify from 'dompurify'
import jsdom from 'jsdom'

import cknex from './cknex.js'
import elasticsearch from './elasticsearch.js'
import Stream from './stream.js'

const { JSDOM } = jsdom

// try to prevent error "xxxx requests are in-flight on a single connection"
// and "Server timeout during write query at consistency LOCAL_ONE (0 peer(s) acknowledged the write over 1 required)"
const BATCH_UPSERT_MAX_CONCURRENCY = 100

const MAX_UNIQUE_ID_ATTEMPTS = 10

// we sanitize 'html' fields
const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)
DOMPurify.addHook('uponSanitizeElement', function (node, data) {
  // allow `c-___` custom tags
  if (node.nodeName && node.nodeName.match(/^c-[a-z0-9_-]+$/i)) {
    data.allowedTags[data.tagName] = true
  }
})

/*
when setting materialized views, don't include any view primary keys that can be
changed (eg username, email) in the main table's primary keys...
*/

export default class Base {
  constructor () {
    autoBind(this)
    this.fieldsWithType = _.reduce(this.getScyllaTables(), function (obj, table) {
      if (table.ignoreUpsert) {
        return obj
      }
      _.forEach(table.fields, (value, key) => {
        obj[key] = {
          type: value?.type || value,
          subType: value?.subType,
          subType2: value?.subType2,
          defaultFn: value?.defaultFn
        }
      })
      return obj
    }
    , {})

    this.fieldsWithDefaultFn = _.pickBy(this.fieldsWithType, ({ type, defaultFn }, key) => defaultFn || ((key === 'id') && ['uuid', 'timeuuid'].includes(type)))
  }

  // make a fake index org_users_${orgId} so we can eventually move popular orgs to own index & shards
  // TODO: SCALING: see https://www.elastic.co/guide/en/elasticsearch/guide/current/user-based.html
  // basically have shared index and create an alias per orgId
  // then when necessary, move from shared index to own index & rm alias

  // for now we have 1 shared index and aliases w/ filter & routing

  // routing is on orgId and all with same orgId go to same shard
  // FIXME: need a warning when an org's shard is getting full
  addAlias (orgId) {
    if (!this.isESOrgAliased) {
      throw new Error('Must be a model with this.isESOrgAliased === true')
    }
    const indexAlias = this.getESIndex({ orgId })
    return elasticsearch.client.indices.putAlias({
      index: this.getElasticSearchIndices?.()[0].name,
      name: indexAlias,
      body: {
        routing: indexAlias,
        filter: { term: { orgId } }
      }
    })
  }

  async searchByOrgId (orgId, options) {
    if (!this.isESOrgAliased) {
      throw new Error('Must be a model with this.isESOrgAliased === true')
    }
    options.index = this.getESIndex({ orgId })
    return this.search(options)
  }

  refreshESIndex () {
    return elasticsearch.client.indices.refresh({ index: this.getElasticSearchIndices?.()[0].name })
  }

  async batchUpsert (rows, { ESIndex, ESRefresh } = {}) {
    const ESRows = await Promise.map(rows, row => {
      return this.upsert(row, { isBatch: true })
    }, { concurrency: BATCH_UPSERT_MAX_CONCURRENCY })
    return this.batchIndex(ESRows, { index: ESIndex, refresh: ESRefresh })
  };

  batchIndex (rows, { index, refresh } = {}) {
    if (_.isEmpty(this.getElasticSearchIndices?.())) {
      return Promise.resolve()
    } else {
      return elasticsearch.client.bulk({
        refresh,
        index: this.getESIndex(rows[0]),
        body: _.flatten(_.map(rows, row => {
          row = this.defaultESInput(row)
          const {
            id
          } = row
          row = _.pick(row, _.keys(this.getElasticSearchIndices?.()[0].mappings))
          if (index) {
            return [{ index: { _id: id } }, row]
          } else {
            return [{ update: { _id: id } }, { doc_as_upsert: true, doc: row }]
          }
        }))
      })
        .then(function (response) {
          if (response.errors) {
            console.log('elasticsearch errors')
          }
          return response
        })
    }
  }

  upsertByRow (row, diff, options = {}) {
    const keyColumns = _.filter(_.uniq(_.flatten(_.map(this.getScyllaTables(), (table) =>
      table.primaryKey.partitionKey.concat(
        table.primaryKey.clusteringColumns
      )
    ))))
    const primaryKeyValues = _.pick(row, keyColumns)

    return this.upsert(
      _.defaults(diff, primaryKeyValues),
      _.defaults(options, { skipAdditions: Boolean(row) })
    )
  }

  // TODO: cleanup isBatch part of this
  // if batching, we skip the ES index, and spit that back so it can be done bulk
  async upsert (row, options = {}) {
    const { context, isUpdate, isStreamed = this.shouldStreamAll, skipAdditions, isBatch, skipES } = options

    const scyllaRow = this.defaultInput(row, { skipAdditions })
    const ESRow = _.defaults({ id: scyllaRow.id }, row)

    await Promise.all(_.filter(_.map(this.getScyllaTables(), (table) => {
      if (table.ignoreUpsert) {
        return
      }
      return this._upsertScyllaRowByTableAndRow(table, scyllaRow, options)
    }).concat([
      !isBatch && !skipES && this.index(ESRow)
    ])))

    await this.clearCacheByRow?.(scyllaRow)

    if (isUpdate && isStreamed) {
      this.streamUpdateById(scyllaRow.id, scyllaRow, { context })
    } else if (isStreamed) {
      this.streamCreate(scyllaRow, { context })
    }
    const res = this.defaultOutput(scyllaRow)

    if (isBatch) {
      return ESRow
    } else {
      return res
    }
  };

  _upsertScyllaRowByTableAndRow (table, scyllaRow, options = {}) {
    const { ttl, add, remove, isLwt, isInsert } = options

    const scyllaTableRow = _.pick(scyllaRow, _.keys(table.fields))

    const keyColumns = _.filter(table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    ))

    const missing = _.find(keyColumns, column => !scyllaTableRow[column])
    if (missing) {
      return console.log(`missing ${missing} in ${table.name} upsert`)
    }

    const set = _.omit(scyllaTableRow, keyColumns)

    let q
    if (_.isEmpty(set) || isInsert) {
      q = cknex(this.keyspace).insert(scyllaTableRow)
        .into(table.name)
    } else {
      q = cknex(this.keyspace).update(table.name)
        .set(set)
      _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaTableRow[column]))
    }
    if (ttl) {
      q.usingTTL(ttl)
    }
    if (add) {
      q.add(add)
    }
    if (remove) {
      q.remove(remove)
    }
    if (isLwt && isInsert) {
      q.ifNotExists()
    } else if (isLwt && !isInsert) {
      q.ifExists()
    }
    return q.run({ isLwtWrite: isLwt })
  }

  getESIndex ({ orgId }) {
    return this.isESOrgAliased
      ? `${this.getElasticSearchIndices?.()[0].name}_${orgId}`
      : this.getElasticSearchIndices?.()[0].name
  }

  getESIndexQuery (row) {
    const index = this.getESIndex(row)
    row = this.defaultESInput(row)
    return {
      index,
      id: row.id,
      body: {
        doc:
          _.pick(row, _.keys(this.getElasticSearchIndices?.()[0].mappings)),
        doc_as_upsert: true
      }
    }
  }

  index (row) {
    const query = this.getESIndexQuery(row)
    if (_.isEmpty(this.getElasticSearchIndices?.()) || _.isEmpty(query.body.doc)) {
      return Promise.resolve()
    } else {
      return elasticsearch.client.update(query)
        .catch(err => {
          // console.log 'elastic err', @getElasticSearchIndices?()[0].name, err
          throw err
        })
    }
  }

  async search (options) {
    const {
      query, sort, trackTotalHits, isRandomized,
      index = this.getElasticSearchIndices()[0].name, limit = 50
    } = options

    // console.log(JSON.stringify(query, null, 2))

    const { hits } = await elasticsearch.client.search({
      index,
      body: {
        track_total_hits: trackTotalHits, // get accurate "total"
        query:
          isRandomized ? {
            // random ordering so they don't clump on map
            function_score: {
              query,
              boost_mode: 'replace'
            }
          }
            : query,
        sort,
        from: 0,
        // it'd be nice to have these distributed more evently
        // grab ~2,000 and get random 250?
        // is this fast/efficient enough?
        size: limit
      }
    })

    const total = hits.total?.value
    return {
      total,
      rows: _.map(hits.hits, ({ _id, _source }) => {
        return this.defaultESOutput(_.defaults(_source, { id: _id }))
      })
    }
  };

  // parts of row -> full row
  getByRow (row) {
    const scyllaRow = this.defaultInput(row)
    const table = this.getScyllaTables()[0]
    const keyColumns = _.filter(table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    ))
    const q = cknex(this.keyspace).select('*')
      .from(table.name)
    _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaRow[column]))
    return q.run({ isSingle: true })
  }

  // returns row that was deleted
  async _deleteScyllaRowByTableAndRow (table, row) {
    const scyllaRow = this.defaultInput(row)

    const keyColumns = _.filter(table.primaryKey.partitionKey.concat(
      table.primaryKey.clusteringColumns
    ))
    let q = cknex(this.keyspace).select('*')
      .from(table.name)
    _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaRow[column]))
    const response = await q.run({ isSingle: true })

    q = cknex(this.keyspace).delete()
      .from(table.name)
    _.forEach(keyColumns, column => q.andWhere(column, '=', scyllaRow[column]))
    await q.run()

    return response
  };

  // requires this.getBySlug to exist or passed in
  async getUniqueSlug (baseSlug, { getBySlug, suffix, attempts = 0 } = {}) {
    if (!suffix || !attempts) {
      baseSlug = removeNonAlphanumberic(baseSlug)
    }
    const slug = suffix ? `${baseSlug}-${suffix}` : baseSlug
    const existingModel = await (getBySlug ? getBySlug(slug) : this.getBySlug(slug))

    if (attempts > MAX_UNIQUE_ID_ATTEMPTS) {
      return `${baseSlug}-${Date.now()}`
    }
    if (existingModel?.id) {
      return this.getUniqueSlug(baseSlug, {
        getBySlug, suffix: (suffix || 0) + 1, attempts: attempts + 1
      })
    } else {
      return slug
    }
  }

  // to prevent dupe upserts, elasticsearch id needs to be combination of all
  // of scylla primary key values
  getESIdByRow (row) {
    const scyllaTable = _.find(this.getScyllaTables(), ({ ignoreUpsert }) => !ignoreUpsert)
    const keyColumns = _.filter(scyllaTable.primaryKey.partitionKey.concat(
      scyllaTable.primaryKey.clusteringColumns
    )
    )
    return _.map(keyColumns, column => row[column]).join('|').substr(0, 512) // 512b max limit
  }

  async deleteByRow (row, { isStreamed } = {}) {
    await Promise.all(_.filter(_.map(this.getScyllaTables(), table => {
      if (table.ignoreUpsert) {
        return
      }
      return this._deleteScyllaRowByTableAndRow(table, row)
    }).concat([this.deleteESByRow(row)])))

    await this.clearCacheByRow?.(row)

    if (isStreamed || this.shouldStreamAll) {
      this.streamDeleteById(row.id, row)
    }
    return null
  };

  deleteESByRow (row) {
    const id = row.id || this.getESIdByRow(row)
    const index = this.getESIndex(row)
    if (_.isEmpty(this.getElasticSearchIndices?.())) {
      return Promise.resolve()
    } else {
      return elasticsearch.client.delete({
        index,
        id: `${id}`
      })
        .catch(err => console.log('elastic err', err))
    }
  }

  defaultInput (row, { skipAdditions } = {}) {
    if (!skipAdditions) {
      _.map(this.fieldsWithDefaultFn, function (field, key) {
        const value = row[key]
        if (value == null && !skipAdditions && field.defaultFn) {
          row[key] = field.defaultFn(row)
        } else if (!value && !skipAdditions && (field.type === 'uuid')) {
          row[key] = cknex.getUuid()
        } else if (!value && !skipAdditions && (field.type === 'timeuuid')) {
          row[key] = cknex.getTimeUuidStr()
        }
        return row[key]
      })
    }
    return _.mapValues(row, (value, key) => {
      const { type, subType, subType2 } = this.fieldsWithType[key] || {}

      if (type === 'html') {
        console.log('sanitizing html')
        return DOMPurify.sanitize(value)
      } else if (type === 'json') {
        return JSON.stringify(value)
      } else if (type === 'set' && subType === 'json') {
        return _.map(value, (obj) => JSON.stringify(obj))
      } else if (type === 'map' && subType2 === 'json') {
        return _.mapValues(value, (obj) => JSON.stringify(obj))
      } else {
        return value
      }
    })
  }

  defaultOutput (row) {
    if (row == null) {
      return null
    }

    return _.mapValues(row, (value, key) => {
      const { type, subType, subType2, defaultFn, defaultOutputFn } = this.fieldsWithType[key] || {}
      if (type === 'json' && value && typeof value === 'object') {
        return value
      } else if (type === 'json' && value) {
        try {
          return JSON.parse(value)
        } catch (error) {
          return defaultFn?.() || defaultOutputFn?.() || {}
        }
      } else if (type === 'json') {
        return defaultFn?.() || defaultOutputFn?.() || {}
      } else if (type === 'map' && subType2 === 'json') {
        return _.mapValues(value, (str) => {
          try {
            return typeof str === 'string'
              ? JSON.parse(str)
              : str
          } catch (err) { return str }
        })
      } else if (type === 'set' && subType === 'json') {
        return _.map(value, (str) => {
          try {
            return typeof str === 'string'
              ? JSON.parse(str)
              : str
          } catch (err) { return str }
        })
      } else if (type === 'counter') {
        return parseInt(value)
      } else if (value && ['uuid', 'timeuuid'].includes(type)) {
        return `${value}`
      } else if (value && type === 'set' && ['uuid', 'timeuuid'].includes(subType)) {
        return _.map(value, (item) => `${item}`)
      } else {
        return value
      }
    })
  }

  defaultESInput (row) {
    if (!row.id) {
      row.id = this.getESIdByRow(row)
    }
    return _.mapValues(row, (value, key) => {
      const { type } = this.fieldsWithType[key] || {}

      if ((type === 'json') && (typeof value === 'string')) {
        return JSON.parse(value)
      } else {
        return value
      }
    })
  }

  defaultESOutput (row) { return row }

  // streaming fns
  streamCreate (obj, { context }) {
    obj = this.defaultOutput(obj)
    const listenerKeys = _.map(this.streamListenBy, (listenBy) => {
      const listenerId = obj[listenBy]
      return `${this.streamListenerKey}:${listenBy}:${listenerId}`
    })
    return Stream.create(obj, listenerKeys, {
      globalSchema: this.globalSchema,
      streamResolver: this.streamResolver,
      context
    })
  }

  streamIncrementChildrenById (id, obj, childKey, children, { connectionId } = {}) {
    const listenerKeys = _.map(this.streamListenBy, (listenBy) => {
      const listenerId = obj?.[listenBy]
      return `${this.streamListenerKey}:${listenBy}:${listenerId}`
    })
    return Stream.incrementChildrenById(id, childKey, children, listenerKeys, { connectionId })
  }

  streamUpdateById (id, obj) {
    obj = this.defaultOutput(obj)
    const listenerKeys = _.map(this.streamListenBy, (listenBy) => {
      const listenerId = obj?.[listenBy]
      return `${this.streamListenerKey}:${listenBy}:${listenerId}`
    })
    return Stream.updateById(id, obj, listenerKeys)
  }

  streamDeleteById (id, obj) {
    obj = this.defaultOutput(obj)
    const listenerKeys = _.map(this.streamListenBy, (listenBy) => {
      const listenerId = obj?.[listenBy]
      return `${this.streamListenerKey}:${listenBy}:${listenerId}`
    })
    return Stream.deleteById(id, listenerKeys)
  }

  stream (options) {
    const {
      emit, socket, route, listenBy, listenerId,
      initial, context
    } = options
    return Stream.stream({
      listenerKey: `${this.streamListenerKey}:${listenBy}:${listenerId}`,
      emit,
      socket,
      route,
      initial,
      streamResolver: this.streamResolver,
      context,
      globalSchema: this.globalSchema
    })
  }

  unsubscribe ({ socket, listenBy, listenerId }) {
    return Stream.unsubscribe({
      socket,
      listenerKey: `${this.streamListenerKey}:${listenBy}:${listenerId}`
    })
  }
}

function removeNonAlphanumberic (str) {
  const regex = /[^a-zA-Z0-9-_]/g

  return str.replace(regex, '')
}
