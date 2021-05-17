# Challenge

We're a small team and each engineer will have a ton of autonomy over the part of the product they focus on. So the goal here is to see if you can adapt and learn quickly and independently :)

In this repo is a barebones setup that is basically a stripped down version of Spore's tech stack. It currently has a single model type (Note) and a couple components/pages for listing notes, and creating/editing.

The actual prompt for what to build is fairly vague, mostly just want to see a grasp of the tech stack and general abilities. Ideally you build something other than just notes. Notes was just an easy way for this challenge to have a straight-forward model as an example. So feel free to scrap all of the notes stuff, or build on top of it (though keep the general infrastructure)

Some ideas (mostly from [here](https://blog.bitsrc.io/15-app-ideas-to-build-and-level-up-your-coding-skills-28612c72a3b1)):
- Recipe book
- Quizzes
- Basic store
- Todo list
- Basic chat
- Weather forecast
- If you do want to stick with the notes theme:
  - Improve the actual editor with something like [Slate](https://www.slatejs.org) (we use Slate)
  - Organize notes better
  - Auto-save drafts in the browser
  - Add polish

---

# Pre-Reqs

### If on Windows install WSL

If you already have Node & Docker setup, you can skip this

[](https://docs.microsoft.com/en-us/windows/wsl/install-win10#manual-installation-steps)<https://docs.microsoft.com/en-us/windows/wsl/install-win10#manual-installation-steps>

When you get to the appropriate step, install Ubuntu 20.04. Once installed, any `commands` should be done through the Ubuntu terminal

For the rest of the install steps, you should treat it like you're using Ubuntu instead of Windows (eg follow the Ubuntu instructions for Docker)

Here's how to use VSCode with WSL: [](https://code.visualstudio.com/docs/remote/wsl)<https://code.visualstudio.com/docs/remote/wsl>

### Install nvm

`curl -o- <https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh> | bash`

### Install Node

`nvm install 14.15.4`

### Install Docker

[](https://docs.docker.com/engine/install/#server)<https://docs.docker.com/engine/install/#server>

*Make sure to do post-install instructions:* [](https://stackoverflow.com/a/33596140)<https://stackoverflow.com/a/33596140>

### Install docker-compose

[](https://docs.docker.com/compose/install)<https://docs.docker.com/compose/install>

---

# Setup

### Frontend

`cd frontend`

`npm install`

### Backend

`cd backend`

`npm install`

### Running everything

New terminal: `cd backend` `docker-compose up`

New terminal: `cd frontend` `npm run dev`

New terminal: `cd backend` `npm run dev`

Browser: http://localhost:50340

---

# Frontend Concepts

The frontend is React with a couple variations (more info below). The main folders you'll work inside of are `pages`, `components`, `models`, & a bit in app.js. We use GraphQL passed via websockets to fetch data from the backend (via models js files).

## Observables & State

One of the key differences in the Spore codebase compared to typical React hooks setups is **we use useStream instead of useState**.

### useState

If you're familiar with React, you know useState works like:

```javascript
const [count, setCount] = useState(0)
const [isLoading, setIsLoading] = useState(false)

```

In the above scenario, `count` holds the current value in state, and `setCount` is a function that updates the value in state

### useStream

The useStream equivalent to this looks like

```javascript
const { countStream, isLoadingStream } = useMemo(() => {
  return {
    countStream: new Rx.BehaviorSubject(0),
    isLoadingStream: new Rx.BehaviorSubject(false)
}, [])

const { count, isLoading } = useStream(() => ({
  count: countStream,
  isLoading: isLoadingStream
}))

```

Our approach is obviously more verbose initially, but comes with some added benefits, particularly around passing data between components, and streaming data from the server.

Instead of having to pass *both* count and setCount to a child component, you only have to pass countStream.

It's also helpful in having parent components re-render less often. An example would be if you have a parent component that doesn't need to use the value of count, but 3 child components do. You can create the stream in the parent component, then pass it to the child components which can call useStream with it.

### RxJS

We use [RxJS](https://www.learnrxjs.io/) to create our streams. You don't necessarily need to learn all the ins and outs of RxJS - we mostly use Rx.BehaviorSubject, Rx.combineLatest, and the various piped in operators (.map, .switchMap, ...)

We typically always use one of `new Rx.BehaviorSubject(initialValue)` or our own data structure pulled from services/obs.js `streams(initialValueStream)`

When using Rx.BehaviorSubject, variables should be postfixed with `Stream`, eg `isLoadingStream`. When using streams(), variables should be postfixed with `Streams` eg `nameStreams`

`**___Stream` (Rx.BehaviorSubject)**

Use this when you're storing a string/boolean/object

`**___Streams` (streams())**

Use this when the initial value is a stream or derived from a stream.

```javascript
// eg. a stream that starts from value from db
const nameStream = streams(userStream.pipe(rx.map((user) => user?.name)))
// can still be updated with .next
nameStream.next('new name')

```

## Hyperscript instead of JSX

Typically React uses JSX, which feels more like HTML with JS embedded inside of braces

Here's an example with JSX:

```javascript
import CustomComponent from '../CustomComponent.jsx'

return (
  <div className="my-class">
    <a href="<https://google.com>">Google</a>
    <CustomComponent thisIsAProp="prop-value" />
  </div>
)

```

We use hyperscript, which is just a pure JS representation of the DOM (which is what JSX more or less compiles to anyways).

Our equivalent hyperscript example above (with our naming conventions too) looks like this

```javascript
import $customComponent from '../custom_component'

return z('.my-class', [ // if no element name is specified, it defaults to div
  z('a', { href: '<https://google.com>' }, 'Google'),
  z($customComponent, { thisIsAProp: 'prop-value' })
])

```

---

# Backend Concepts

You'll also want to learn a bit about GraphQL, Cassandra/ScyllaDB, and Elasticsearch

You should be able to do everything within the `graphql/<model_name>` folders.

Each model folder:
- `model.js` - lays out the structure for Cassandra/ScyllaDB keyspaces & Elasticsearch indices.
- `mutations.js` - GraphQL mutations (creates, updates, deletes)
- `resolvers.js` - GraphQL resolvers (reads)
- `type.graphql` - GraphQL types

[Here](https://blog.discord.com/how-discord-stores-billions-of-messages-7fa6ec7ee4c7?gi=a62ca1029850) is a great write up on Cassandra/ScyllaDB
