import createDeferredPromise, { DeferredPromise } from 'p-defer'

export type LoggerType = {
  error: (msg: string, data: {}) => void
}

export type OptsType = { logger?: LoggerType }

export type StartOptsType = { force?: boolean } | undefined
export type StopOptsType = { force?: boolean } | undefined

export enum state {
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  STOPPING = 'STOPPING',
}

export enum Op {
  START = 'START',
  STOP = 'STOP',
}

type PendingOp<
  StartOpts extends StartOptsType = StartOptsType,
  StopOpts extends StopOptsType = StopOptsType
> =
  | {
      op: Op.START
      deferred: DeferredPromise<void>
      opts?: StartOpts
    }
  | {
      op: Op.STOP
      deferred: DeferredPromise<void>
      opts?: StopOpts
    }

type CurrentOp<
  StartOpts extends StartOptsType = StartOptsType,
  StopOpts extends StopOptsType = StopOptsType
> =
  | {
      op: Op.START
      promise: Promise<void>
      opts?: StartOpts
    }
  | {
      op: Op.STOP
      promise: Promise<void>
      opts?: StopOpts
    }

export default abstract class AbstractStartable<
  StartOpts extends StartOptsType = StartOptsType,
  StopOpts extends StopOptsType = StopOptsType
> {
  protected abstract _start(opts?: StartOpts): Promise<void>
  protected abstract _stop(opts?: StopOpts): Promise<void>
  protected currentOp: CurrentOp<StartOpts, StopOpts> | null = null
  protected pendingOp: PendingOp<StartOpts, StopOpts> | null = null
  get state(): state {
    if (this.pendingOp?.op === Op.START) {
      return state.STARTING
    } else if (this.pendingOp?.op === Op.STOP) {
      return state.STOPPING
    } else if (this.currentOp?.op === Op.START) {
      return state.STARTING
    } else if (this.currentOp?.op === Op.STOP) {
      return state.STOPPING
    } else if (this.started) {
      return state.STARTED
    } else {
      return state.STOPPED
    }
  }
  started: boolean = false

  protected async schedulePendingOp(
    nextPendingOp: Omit<PendingOp<StartOpts, StopOpts>, 'deferred'>,
  ): Promise<void> {
    // console.log('schedulePendingOp', {
    //   nextPendingOp,
    //   pendingOp: this.pendingOp,
    // })
    if (this.pendingOp && this.pendingOp.op !== nextPendingOp.op) {
      this.pendingOp.deferred.reject(new Error('aborted'))
      this.pendingOp = null
      // fall through
    }
    if (this.pendingOp == null) {
      this.pendingOp = {
        ...nextPendingOp,
        deferred: createDeferredPromise<void>(),
      } as PendingOp<StartOpts, StopOpts>
    }

    return this.pendingOp.deferred.promise
  }

  protected async runPendingOp(finishedOp?: Op): Promise<void> {
    const pendingOp = this.pendingOp
    if (pendingOp == null) {
      return
    }

    this.pendingOp = null

    if (pendingOp.op === finishedOp) {
      pendingOp.deferred.resolve()
      return
    }
    try {
      if (pendingOp.op === Op.START) {
        await this.start(pendingOp.opts)
      } else {
        // pendingOp.op === op.STOP
        await this.stop(pendingOp.opts)
      }
      pendingOp.deferred.resolve()
    } catch (err) {
      pendingOp.deferred.reject(err)
    }
  }

  async start(opts?: StartOpts): Promise<void> {
    if (this.state === state.STARTED) return
    if (this.state === state.STARTING) return this.currentOp!.promise
    if (this.state === state.STOPPING) {
      if (opts?.force) {
        return this.schedulePendingOp({ op: Op.START, opts })
      }
      return Promise.reject(new Error('cannot start while stopping'))
    }

    // this.state === state.STOPPED
    let currentOp
    try {
      currentOp = this.currentOp = {
        op: Op.START,
        promise: this._start(opts),
        opts,
      }
      await this.currentOp.promise
    } catch (err) {
      this.runPendingOp(Op.STOP)
      throw err
    } finally {
      if (this.currentOp === currentOp) {
        this.currentOp = null
      }
    }

    // start was successful
    this.started = true

    // check for pending op
    this.runPendingOp(Op.START)

    // @ts-ignore this.state could have changed
    if (this.state === state.STOPPING) {
      throw new Error('started successfully, but stopping now')
    }
  }

  async stop(opts?: StopOpts): Promise<void> {
    if (this.state === state.STOPPED) return
    if (this.state === state.STOPPING) return this.currentOp!.promise
    if (this.state === state.STARTING) {
      return this.schedulePendingOp({ op: Op.STOP, opts })
    }

    // this.state === state.STARTED
    let currentOp
    try {
      currentOp = this.currentOp = {
        op: Op.STOP,
        promise: this._stop(opts),
        opts,
      }
      await this.currentOp.promise
    } catch (err) {
      throw err
    } finally {
      if (this.currentOp === currentOp) {
        this.currentOp = null
      }
    }

    // stop was successful
    this.started = false

    // check for pending op
    this.runPendingOp(Op.STOP)
  }
}
