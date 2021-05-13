This doc is still a WIP. Ask questions and I'll improve the doc :)

# GraphQL Client
This is our in-house way of client <-> server communication.

The alternative is to use apollo-client and apollo-server, but at the time of writing they don't do all we need.

- Native RxJS support
- Native WS support
- Batching, but sending back responses in chunks as they're ready (ie not waiting for slowest req)

## Client
Everything is an RxJS observable, so state is updated when the observable updates.

Eg: model.user.getMe() makes a request to the server for the logged in user, and stores the result in cache. Any subsequent call to model.user.getMe() will return the observable that has the result in it (it won't refetch from the server).

Cache is generally cleared in an invalidateAll for most GraphQL mutations we do. When that happens, all observables that are still subscribed to are refetched from the server.

### Streaming results
Chat messages are streamed in as they're created.

### Server-side rendering
When the initial URL is loaded, all of the requests (eg model.user.getMe()) go through in the SSR execution. The result of all of the requests is stored as JSON in the HTML and the client will load that JSON as initial results (so in theory it shouldn't have to fetch twice)

### `auth.js`
Handles validating access token.

`stream` and `call` methods are exposed which add accessToken and orgSlug to the GraphqlClient versions of the methods

### Models
#### `this.auth.stream`
For fetching data.

`stream({ query, variables, streamOptions, pull }, options = {})`
- `query` is the GraphQL query string
- `variables` are the vars the query string references
- `streamOptions` options for streaming back data
  - `isStreamed` true if you want to stream back data
    - Eg for chatMessages, on create, we want to embed info about the user who posted the message *before* publishing to other clients (otherwise they would all have to fetch that info, vs just 1 request)
  - `streamGraphQL` GraphQL string of what the clients that are subscribed to results receive as updates (should be the same structure as whats in the `nodes { }` of the initial request
- `pull` shorthand to take { data: { me: { id } }} -> { id } (when 'me' is specified)
- `options`
  - `clientChangesStream` stream that is merged in with the request stream for immediate UI updates (eg when posting a message)

#### `this.auth.call`
For mutating data.

`call({ query, variables, streamOptions, pull }, options = {})`
- `query` is the GraphQL query string
- `variables` are the vars the query string references
- `streamOptions` options for streaming back data
  - `prepareGraphQL` passed for mutations. GraphQL query string of what should be passed to other clients that are subscribed
- `options`
  - `invalidateAll` invalidate global cache & cause all to refetch (do this for most mutations)

### `graphql_client.js`
- Loads from SSR JSON cache into a dataCacheStream observable
- `stream`
  - checks if cached observable exists, returns it if it does
  - if no cached observable exists, check if cached data exists (from SSR)
  - if no cache period, create new observable that is part of a batch WS request to server
  - listen for WS response for streamId and pass result back to observable
  - continue listening for emitted updates (create, edit, delete) for the streamId if `isStreamed` (eg chatMessages)

## Server
### `ws_server.js`

### `backend-shared/ws.js`

### `backend-shared/base_model.js`

### Models
