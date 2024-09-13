import AbstractStartable, { state } from '../index'
import { expect, jest } from '@jest/globals'

describe('AbstractStartable', () => {
  it('should be extendable', () => {
    class FooClass extends AbstractStartable {
      protected _start() {
        return Promise.resolve()
      }
      protected _stop() {
        return Promise.resolve()
      }
    }
    const foo = new FooClass()
    expect(foo.start).toEqual(expect.any(Function))
    expect(foo.stop).toEqual(expect.any(Function))
  })

  describe('start', () => {
    it('should resolve if _start resolves', async () => {
      const startImpl = jest.fn(() => Promise.resolve())
      const stopImpl = jest.fn(() => Promise.resolve())
      class FooClass extends AbstractStartable {
        protected _start() {
          return startImpl()
        }
        protected _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(startImpl).toBeCalledTimes(1)
      expect(foo.started).toBe(true)
      // expect(foo.state).toBe(state.STARTED)
    })

    it('should reject if _start rejects', async () => {
      const startErr = new Error('boom')
      class FooClass extends AbstractStartable {
        protected _start() {
          return Promise.reject(startErr)
        }
        protected _stop() {
          return Promise.resolve()
        }
      }
      const foo = new FooClass()
      await expect(foo.start()).rejects.toBe(startErr)
      expect(foo.started).toBe(false)
    })
  })

  describe('stop', () => {
    it('should not invoke _stop if not started', async () => {
      const startImpl = jest.fn(() => Promise.resolve())
      const stopImpl = jest.fn(() => Promise.resolve())
      class FooClass extends AbstractStartable {
        protected _start() {
          return startImpl()
        }
        protected _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.stop()
      expect(foo.started).toBe(false)
    })

    it('should resolve if _stop resolves (after started)', async () => {
      const stopErr = new Error('boom')
      class FooClass extends AbstractStartable {
        protected _start() {
          return Promise.resolve()
        }
        protected _stop() {
          return Promise.reject(stopErr)
        }
      }
      const foo = new FooClass()
      await foo.start()
      await expect(foo.stop()).rejects.toBe(stopErr)
    })
    it('should reject if _stop rejects (after started)', async () => {
      const stopErr = new Error('boom')
      class FooClass extends AbstractStartable {
        protected _start() {
          return Promise.resolve()
        }
        protected _stop() {
          return Promise.reject(stopErr)
        }
      }
      const foo = new FooClass()
      await foo.start()
      await expect(foo.stop()).rejects.toBe(stopErr)
    })

    it('should stop after start completes', async () => {
      const stopImpl = jest.fn(() => Promise.resolve())
      class FooClass extends AbstractStartable {
        protected async _start() {
          await timeout(200)
          return Promise.resolve()
        }
        protected async _stop() {
          await timeout(100)
          return stopImpl()
        }
      }
      const foo = new FooClass()
      const startPromise = foo.start()
      const stopPromise = foo.stop()
      expect(stopImpl).toBeCalledTimes(0)
      await expect(startPromise).rejects.toThrow(/stopping now/)
      expect(foo.started).toBe(true)
      await stopPromise
      expect(stopImpl).toBeCalledTimes(1)
      expect(foo.started).toBe(false)
    })
  })

  describe('parallel start/stop combinations', () => {
    it('should be started after: start, start', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      const startPromise1 = foo.start()
      const startPromise2 = foo.start()
      await startPromise1
      expect(foo.started).toBe(true)
      await startPromise2
      expect(foo.started).toBe(true)
    })

    it('should be stopped after: start, stop', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      const startPromise1 = foo.start()
      const stopPromise1 = foo.stop()
      await expect(startPromise1).rejects.toThrow(/stopping now/)
      expect(foo.started).toBe(true)
      await stopPromise1
      expect(foo.started).toBe(false)
    })

    it('should be stopped after: start, stop, stop', async () => {
      const startImpl = jest.fn(() => timeout(10))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      const startPromise1 = foo.start()
      const stopPromise1 = foo.stop()
      const stopPromise2 = foo.stop()
      await expect(startPromise1).rejects.toThrow(/stopping now/)
      expect(foo.started).toBe(true)
      await stopPromise1
      expect(foo.started).toBe(false)
      await stopPromise2
      expect(foo.started).toBe(false)
    })

    it('should be stopped after: stop, stop (after started)', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(foo.started).toBe(true)
      const stopPromise1 = foo.stop()
      const stopPromise2 = foo.stop()
      await stopPromise1
      expect(foo.started).toBe(false)
      await stopPromise2
      expect(foo.started).toBe(false)
    })

    it('should be started after: start, stop, start', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      const startPromise1 = foo.start()
      const stopPromise1 = foo.stop()
      const startPromise2 = foo.start()
      await expect(startPromise2).rejects.toThrow(/cannot start while stopping/)
      await expect(startPromise1).rejects.toThrow(/stopping now/)
      expect(foo.started).toBe(true)
      await stopPromise1
      expect(foo.started).toBe(false)
      expect(startImpl).toBeCalledTimes(1)
      expect(stopImpl).toBeCalledTimes(1)
    })

    it('should be started after: start, stop, start(force)', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      let startPromise1
      let stopPromise1
      let startPromise2
      // prevent uncaught rejection
      Promise.allSettled([
        (startPromise1 = foo.start()),
        (stopPromise1 = foo.stop()),
        (startPromise2 = foo.start({ force: true })),
      ])
      await startPromise1
      expect(foo.started).toBe(true)
      await expect(stopPromise1).rejects.toThrow(/aborted/)
      expect(foo.started).toBe(true)
      await startPromise2
      expect(foo.started).toBe(true)
      expect(startImpl).toBeCalledTimes(1)
      expect(stopImpl).toBeCalledTimes(0)
    })

    describe('start errors', () => {
      it('should be stopped after: start, stop', async () => {
        const err = new Error('boom')
        const startImpl = jest.fn(() => Promise.reject(err))
        const stopImpl = jest.fn(() => timeout(1))
        class FooClass extends AbstractStartable {
          protected async _start() {
            return startImpl()
          }
          protected async _stop() {
            return stopImpl()
          }
        }
        const foo = new FooClass()
        const startPromise1 = foo.start()
        const stopPromise1 = foo.stop()
        await expect(startPromise1).rejects.toThrow(err)
        expect(foo.started).toBe(false)
        await stopPromise1
        expect(foo.started).toBe(false)
      })
    })

    describe('stop errors', () => {
      it('should be stopped after: start, stop(err)', async () => {
        const err = new Error('boom')
        const startImpl = jest.fn(() => timeout(1))
        const stopImpl = jest.fn(() => Promise.reject(err))
        class FooClass extends AbstractStartable {
          protected async _start() {
            return startImpl()
          }
          protected async _stop() {
            return stopImpl()
          }
        }
        const foo = new FooClass()
        const startPromise1 = foo.start()
        const stopPromise1 = foo.stop()
        await expect(startPromise1).rejects.toThrow(/stopping now/)
        expect(foo.started).toBe(true)
        await expect(stopPromise1).rejects.toThrow(err)
        expect(foo.started).toBe(true)
      })
    })
  })

  describe('series start/stop combinations', () => {
    it('should be started after: start, start', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(foo.started).toBe(true)
      await foo.start()
      expect(foo.started).toBe(true)
    })

    it('should be stopped after: start, stop', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(foo.started).toBe(true)
      await foo.stop()
      expect(foo.started).toBe(false)
    })

    it('should be stopped after: start, stop, stop', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(foo.started).toBe(true)
      await foo.stop()
      expect(foo.started).toBe(false)
      await foo.stop()
      expect(foo.started).toBe(false)
    })

    it('should be started after: start, stop, start', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(foo.started).toBe(true)
      await foo.stop()
      expect(foo.started).toBe(false)
      await foo.start()
      expect(foo.started).toBe(true)
    })

    it('should be started after: start, stop, parallel start(force)', async () => {
      const startImpl = jest.fn(() => timeout(1))
      const stopImpl = jest.fn(() => timeout(1))
      class FooClass extends AbstractStartable {
        protected async _start() {
          return startImpl()
        }
        protected async _stop() {
          return stopImpl()
        }
      }
      const foo = new FooClass()
      await foo.start()
      expect(foo.started).toBe(true)
      let stopPromise1
      let startPromise1
      Promise.allSettled([
        (stopPromise1 = foo.stop()),
        (startPromise1 = foo.start({ force: true })),
      ])
      expect(foo.state).toBe(state.STARTING)
      await stopPromise1
      expect(foo.started).toBe(false)
      await startPromise1
      expect(foo.started).toBe(true)
    })
  })
})

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
