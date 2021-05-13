import uuid from 'node-uuid'
import _ from 'lodash'
import Redis from 'ioredis'

class PubSubService {
  constructor () {
    this.publish = this.publish.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.subscriptions = {}
  }

  setup (host, port, prefix) {
    this.redisPub = new Redis({ host, port })
    this.redisSub = new Redis({ host, port })

    this.redisSub.on('message', (chatWithPrefix, message) => {
      const chat = chatWithPrefix.replace(`${this.prefix}:`, '')
      message = (() => {
        try {
          return JSON.parse(message)
        } catch (err) {
          console.log('redis json parse error', chatWithPrefix)
          return {}
        }
      })()
      return _.forEach(this.subscriptions[chat], ({ fn }) => fn(message))
    })
  }

  publish (chats, message) {
    if (typeof chats === 'string') {
      chats = [chats]
    }

    return _.forEach(chats, chat => {
      const chatWithPrefix = `${this.prefix}:${chat}`
      return this.redisPub?.publish(chatWithPrefix, JSON.stringify(message))
    })
  }

  subscribe (chat, fn) {
    const chatWithPrefix = `${this.prefix}:${chat}`

    if (!this.subscriptions[chat]) {
      this.redisSub.subscribe((chatWithPrefix))
      if (!this.subscriptions[chat]) {
        this.subscriptions[chat] = {}
      }
    }

    const id = uuid.v4()
    this.subscriptions[chat][id] = {
      fn,
      unsubscribe: () => {
        if (this.subscriptions[chat]) {
          delete this.subscriptions[chat][id]
        }
        const count = _.keys(this.subscriptions[chat]).length
        if (!count) {
          this.redisSub.unsubscribe(chatWithPrefix)
          return delete this.subscriptions[chat]
        }
      }
    }
    return this.subscriptions[chat][id]
  }
}

export default new PubSubService()
