import _ from 'lodash'
import graphqlServer from 'graphql'

import PubSubService from './pub_sub.js'

const { graphql } = graphqlServer

/**
when a model is updated/created/deleted, we want to let the client know.
since graphql reqs can embed extra stuff (eg user instead of userId on a chatMessage)
we'd prefer to do the heavy lifiting (query on user) in the create step, then pass the filled out
graphql obj via pubsub to all clients that are listening. ** CURRENTLY we DON'T do this...

*/

class StreamService {
  constructor () {
    this.wsDisconnect = this.wsDisconnect.bind(this)
    this.stream = this.stream.bind(this)
    this.unsubscribe = this.unsubscribe.bind(this)
    this.openSubscriptions = {}
    setInterval(() => {
      const subscriptionsOpen = _.reduce(this.openSubscriptions, function (count, socket) {
        count += _.keys(socket).length
        return count
      }
      , 0)
      if (subscriptionsOpen > 10) {
        return console.log('subscriptions open: ', subscriptionsOpen)
      }
    }
    , 100000)
  }

  wsDisconnect (socket) {
    _.map(this.openSubscriptions[socket.id], subscription => subscription.unsubscribe())
    return delete this.openSubscriptions[socket.id]
  }

  async create (obj, listenerKeys, { streamResolver, globalSchema, context = {} } = {}) {
    const { prepareGraphQL } = context
    if (prepareGraphQL) {
      const { data, errors } = await graphql(globalSchema, `{ ${streamResolver} ${prepareGraphQL} }`, obj, context)
      if (errors) {
        console.error('stream create err', errors)
      }
      obj = data[streamResolver]
    }
    return PubSubService.publish(listenerKeys, { action: 'create', obj })
  }

  incrementChildrenById (id, childKey, children, listenerKeys, { connectionId } = {}) {
    return PubSubService.publish(listenerKeys, { id, action: 'incrementChildren', childKey, children, connectionId })
  }

  updateById (id, obj, listenerKeys) {
    return PubSubService.publish(listenerKeys, { id, action: 'update', obj })
  }

  deleteById (id, listenerKeys) {
    return PubSubService.publish(listenerKeys, { id, action: 'delete' })
  }

  // postFn called when received (many times)
  // best to put in the create method if possible
  stream ({ emit, socket, route, listenerKey, initial, streamResolver, globalSchema, context }) {
    const { streamGraphQL } = context
    const response = initial
    const subscription = PubSubService.subscribe(listenerKey, async (publishedMessage) => {
      const { id, action, obj, childKey, children, connectionId } = publishedMessage
      if (action === 'incrementChildren') {
        emit({
          initial: null,
          connectionId,
          changes: [{
            action,
            oldId: id,
            childKey,
            children: children
          }]
        })
      } else {
        const query = `{ ${streamResolver} ${streamGraphQL} }`
        const { data } = await graphql(globalSchema, query, obj, context)
        emit({
          initial: null,
          changes: [{
            action,
            oldId: action === 'create' ? null : id,
            newVal: action === 'delete' ? null : data[streamResolver]
          }]
        })
      }
    })

    const subscriptionKey = listenerKey

    if (this.openSubscriptions[socket.id]?.[subscriptionKey]) {
      this.openSubscriptions[socket.id][subscriptionKey].unsubscribe()
    }

    this.openSubscriptions[socket.id] = this.openSubscriptions[socket.id] || {}
    this.openSubscriptions[socket.id][subscriptionKey] = subscription

    return response
  }

  unsubscribe ({ socket, listenerKey }) {
    const subscriptionKey = listenerKey
    if (this.openSubscriptions[socket.id]?.[subscriptionKey]) {
      this.openSubscriptions[socket.id][subscriptionKey].unsubscribe()
    }
  }
}

export default new StreamService()
