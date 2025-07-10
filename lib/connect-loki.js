'use strict'

/**
 * CONNECT-LOKI
 * A Loki.js session store for Connect/Express
 * MIT Licensed
 */

const Loki = require('lokijs')
const util = require('util')
const LokiFsStructuredAdapter = require('lokijs/src/loki-fs-structured-adapter.js')

const _ = {
  noop: () => {},
  isNil: (v) => v == null
}

module.exports = (session) => {
  /**
   * Express's session Store.
   */
  const Store = session.Store

  /**
   * Initialize LokiStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */
  function LokiStore (options) {
    if (!(this instanceof LokiStore)) {
      throw new TypeError('Cannot call LokiStore constructor as a function')
    }

    const self = this

    // Parse options

    options = options || {}
    Store.call(this, options)

    this.autosave = options.autosave !== false
    this.storePath = options.path || './session-store.db'
    this.ttl = options.ttl || 1209600
    if (this.ttl === 0) { this.ttl = null }
    this.collectionName = options.collection || 'Sessions'

    // Initialize Loki.js

    this.client = new Loki(this.storePath, {
      env: 'NODEJS',
      autosave: self.autosave,
      autosaveInterval: 5000,
      adapter: new LokiFsStructuredAdapter()
    })

    // Setup error logging

    if (options.logErrors) {
      if (typeof options.logErrors !== 'function') {
        options.logErrors = function (err) {
          console.error('Warning: connect-loki reported a client error: ' + err)
        }
      }
      this.logger = options.logErrors
    } else {
      this.logger = _.noop
    }

    // Get / Create collection

    this.client.loadDatabase({}, () => {
      self.collection = self.client.getCollection(self.collectionName)
      if (_.isNil(self.collection)) {
        self.collection = self.client.addCollection(self.collectionName, {
          indices: ['_id'],
          ttlInterval: self.ttl
        })
      }
      self.collection.on('error', (err) => {
        return self.logger(err)
      })
      self.emit('connect')
    })
  }

  /**
   * Inherit from `Store`.
   */
  util.inherits(LokiStore, Store)

  /**
   * Attempt to fetch session by the given `_id`.
   *
   * @param {String} _id
   * @param {Function} fn
   * @api public
   */
  LokiStore.prototype.get = function (_id, fn) {
    if (!fn) { fn = _.noop }
    if (!this.collection) {
      return fn(null)
    }
    const s = this.collection.find({ _id })
    if (s[0] && s[0].session) {
      fn(null, s[0].session)
    } else {
      fn(null)
    }
  }

  /**
   * Commit the given `sess` object associated with the given `_id`.
   *
   * @param {String} _id
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */
  LokiStore.prototype.set = function (_id, sess, fn) {
    if (!fn) { fn = _.noop }

    const s = this.collection.find({ _id })
    if (s[0] && s[0].session) {
      s[0].session = sess
      s[0].updatedAt = new Date()
      this.collection.update(s[0])
    } else {
      this.collection.insert({
        _id,
        session: sess,
        updatedAt: new Date()
      })
    }

    fn(null)
  }

  /**
   * Destroy the session associated with the given `_id`.
   *
   * @param {String} _id
   * @param {Function} fn
   * @api public
   */
  LokiStore.prototype.destroy = function (_id, fn) {
    if (!fn) { fn = _.noop }
    this.collection.findAndRemove({ _id })
    fn(null)
  }

  /**
   * Clear all sessions in the store
   *
   * @param {Function} fn
   * @api public
   */
  LokiStore.prototype.clear = function (fn) {
    if (!fn) { fn = _.noop }
    this.collection.clear()
    fn(null)
  }

  /**
   * Count of all sessions in the store
   *
   * @param {Function} fn
   * @api public
   */
  LokiStore.prototype.length = function (fn) {
    if (!fn) { fn = _.noop }
    const c = this.collection.count()
    fn(null, c)
  }

  /**
   * Refresh the time-to-live for the session with the given `_id`.
   *
   * @param {String} _id
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */
  LokiStore.prototype.touch = function (_id, sess, fn) {
    if (!fn) { fn = _.noop }

    const s = this.collection.find({ _id })
    if (s[0] && s[0].updatedAt) {
      s[0].updatedAt = new Date()
      this.collection.update(s[0])
    }

    return fn()
  }

  return LokiStore
}
