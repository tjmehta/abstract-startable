export type LoggerType = {
  error: (msg: string, data: {}) => void
}

export type OptsType = { logger?: LoggerType }

export type StartOptsType = {} | undefined
export type StopOptsType = { force?: boolean } | undefined

export enum state {
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  STOPPING = 'STOPPING',
}

export default abstract class AbstractStartable {
  protected abstract async _start(opts?: StartOptsType): Promise<void>
  protected abstract async _stop(opts?: StopOptsType): Promise<void>
  private startPromise: Promise<void> | undefined
  private stopPromise: Promise<void> | undefined
  get state(): state {
    if (this.started) {
      if (this.stopPromise) return state.STOPPING
      return state.STARTED
    } else {
      // not started
      if (this.startPromise) {
        if (this.stopPromise) return state.STOPPING
        return state.STARTING
      }
      return state.STOPPED
    }
  }
  started: boolean = false

  async start(opts?: StartOptsType): Promise<void> {
    if (this.state === state.STARTED) return
    if (this.state === state.STARTING) return this.startPromise
    if (this.state === state.STOPPING) {
      return Promise.reject(
        new Error('cannot start server, server is stopping'),
      )
    }
    // this.state === state.STOPPED
    this.startPromise = this._start(opts)
      .catch((err) => {
        delete this.startPromise
        throw err
      })
      .then(() => {
        this.started = true
        delete this.startPromise
        if (this.state === state.STOPPING) {
          throw new Error('server started successfully, but is stopping now')
        }
      })
    return this.startPromise
  }

  async stop(opts?: StopOptsType): Promise<void> {
    if (this.state === state.STOPPED) return
    if (this.state === state.STOPPING) return this.stopPromise
    // this.state === state.STARTING
    // this.state === state.STARTED
    const stopPromise = this.startPromise
      ? this.startPromise
          .catch((err) => {
            /* ignore start errors */
          })
          .then(() => this._stop(opts))
      : this._stop(opts)
    this.stopPromise = stopPromise
      .then(() => {
        this.started = false
        delete this.stopPromise
      })
      .catch((err: Error) => {
        delete this.stopPromise
        throw err
      })

    return this.stopPromise
  }
}
