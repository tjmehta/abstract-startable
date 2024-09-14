# abstract-startable

Abstract Class to represent entities that can be started and stopped

# Installation

```sh
npm i --save abstract-startable
```

# Usage

#### Supports both ESM and CommonJS

```js
// esm
import AbstractStartable from 'abstract-startable'
// commonjs
const AbstractStartable = require('abstract-startable')
```

#### Define a StartableClass and start an instance

```js
import AbstractStartable from 'abstract-startable'

class Car extends AbstractStartable {
  protected async _start() {
    await this._startEngine()
    await this._startHeadlights()
    await this._startRadio()
  }
  protected async _stop() {
    await timeout(100)
    console.log('stopped')
  }
  protected async _startEngine() {
    await timeout(100)
    console.log('vroom')
  }
  protected async _startHeadlights() {
    await timeout(100)
    console.log('flash')
  }
  protected async _startRadio() {
    await timeout(100)
    console.log('bass')
  }
}

const tesla = new Car()
console.log(tesla.started) // log: false
await tesla.start()
// log: vroom
// log: flash
// log: bass
console.log(tesla.started) // log: true
```

#### Multiple starts/stops in parallel

```js
const tesla = new Car()
console.log(tesla.started) // log: false
tesla.start().catch((err) => {
  console.log(tesla.started) // log: true
  console.error(err) // log: Error: server started successfully, but is stopping now
})
tesla.stop().then(() => {
  console.log(tesla.started) // log: false
})
tesla.start().catch((err) => {
  console.error(err) // log: Error: cannot start server, server is stopping
})
tesla.stop().then(() => {
  console.log(tesla.started) // log: false
})
```

#### Multiple starts/stops in parallel w/ force

```js
const tesla = new Car()
console.log(tesla.started) // log: false
tesla.start().then((err) => {
  console.log(tesla.started) // log: true
})
tesla.stop().catch((err) => {
  console.error(err) // log: Error: aborted
})
tesla.start({ force: true }).then(() => {
  console.error(err) // log: Error: aborted
})
tesla.stop().catch((err) => {
  console.error(err) // log: Error: aborted
})
tesla.start({ force: true }).then(() => {
  console.log(tesla.started) // log: true
})
```

# License

MIT
