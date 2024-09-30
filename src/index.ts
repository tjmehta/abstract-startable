import BaseError from 'baseerr'
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

type OpInfo<
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

export default abstract class AbstractStartable<
  StartOpts extends StartOptsType = StartOptsType,
  StopOpts extends StopOptsType = StopOptsType
> {
  protected abstract _start(opts?: StartOpts): Promise<void>
  protected abstract _stop(opts?: StopOpts): Promise<void>
  protected currentOp: OpInfo<StartOpts, StopOpts> | null = null
  protected pendingOp: OpInfo<StartOpts, StopOpts> | null = null
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

  async start(opts?: StartOpts): Promise<void> {
    if (this.state === state.STARTED) return
    if (this.state === state.STARTING) return this.currentOp!.deferred.promise
    if (this.state === state.STOPPING) {
      if (opts?.force) {
        const startPromise = this.scheduleOp({ op: Op.START, opts })
        this.forceStop().catch(() => {
          /* noop */
        })
        return startPromise
      }
      return Promise.reject(new Error('cannot start while stopping'))
    }

    // this.state === state.STOPPED
    await this.runOp({ op: Op.START, opts })

    // @ts-ignore this.state could have changed
    if (this.state === state.STOPPING) {
      throw new Error('started successfully, but stopping now')
    }
  }

  async stop(opts?: StopOpts): Promise<void> {
    if (this.state === state.STOPPED) return
    if (this.state === state.STOPPING) {
      if (opts?.force) {
        return this.forceStop(opts)
      }
      return this.currentOp!.deferred.promise
    }
    if (this.state === state.STARTING) {
      return this.scheduleOp({ op: Op.STOP, opts })
    }

    // this.state === state.STARTED
    return this.runOp({ op: Op.STOP, opts })
  }

  private async scheduleOp(
    pendingOp: Omit<OpInfo<StartOpts, StopOpts>, 'deferred'>,
  ): Promise<void> {
    console.log('scheduleOp', {
      nextPendingOp: pendingOp,
      pendingOp: this.pendingOp,
    })
    if (this.pendingOp) {
      if (this.pendingOp.op === pendingOp.op) {
        // based on scheduleOp invocations, this should only happen with forceStop?
        if (
          Boolean(pendingOp.opts?.force) &&
          !Boolean(this.pendingOp.opts?.force)
        ) {
          // override old pending with new pending
          this.pendingOp = {
            ...pendingOp,
            deferred: this.pendingOp.deferred,
          } as OpInfo<StartOpts, StopOpts>
          return this.pendingOp.deferred.promise
        } else {
          // use existing pending
          // pendingOp.deferred == null
          return this.pendingOp.deferred.promise
        }
      } else {
        this.pendingOp.deferred.reject(new Error('aborted'))
        this.pendingOp = null
        // fall through to this.pendingOp = null
      }
    }
    if (this.pendingOp == null) {
      this.pendingOp = {
        ...pendingOp,
        deferred: createDeferredPromise<void>(),
      } as OpInfo<StartOpts, StopOpts>
    }

    return this.pendingOp.deferred.promise
  }

  private async runPendingOp(successfulFinishedOp?: Op) {
    const pendingOp = this.pendingOp
    if (pendingOp == null) {
      return
    }

    this.pendingOp = null

    if (pendingOp.op === successfulFinishedOp) {
      pendingOp.deferred.resolve()
      return
    }
    // try {
    this.runOp(pendingOp).catch((err) => {
      //noop
    })
  }

  private async runOp(
    _currentOp:
      | OpInfo<StartOpts, StopOpts>
      | Omit<OpInfo<StartOpts, StopOpts>, 'deferred'>,
  ): Promise<void> {
    const deferred =
      (_currentOp as OpInfo<StartOpts, StopOpts>).deferred ??
      createDeferredPromise<void>()
    const currentOp = { ..._currentOp, deferred } as OpInfo<StartOpts, StopOpts>
    this.currentOp = currentOp

    // run op in bg
    const self = this
    ;(async () => {
      try {
        if (currentOp.op === Op.START) {
          await self._start(currentOp.opts as StartOpts)
        } else {
          // op === op.STOP
          await self._stop(currentOp.opts as StopOpts)
        }
        // stop was sucessful
        if (self.currentOp == currentOp) {
          self.started = currentOp.op === Op.START
          self.currentOp = null
          self.runPendingOp(currentOp.op) // kick off next op first..
          currentOp!.deferred.resolve()
        }
      } catch (err) {
        if (self.currentOp == currentOp) {
          // self.started ? depends on implementation..
          self.currentOp = null
          self.runPendingOp() // kick off next op first..
          currentOp!.deferred.reject(err)
        }
      }
    })()

    return currentOp.deferred.promise
  }

  private async forceStop(
    opts?: StartOpts | StopOpts | undefined,
  ): Promise<void> {
    const currentOp = this.currentOp
    const pendingOp = this.pendingOp

    BaseError.assert(
      currentOp?.op === Op.STOP || pendingOp?.op === Op.STOP,
      'cannot override start with stop',
      {
        currentOp: currentOp?.op,
        pendingOp: pendingOp?.op,
      },
    )

    if (currentOp?.op === Op.STOP) {
      if (currentOp.opts?.force) {
        // already forcing, no need to override
        return currentOp.deferred.promise
      }

      // run force stop, and only "listen" to the force stop
      this.currentOp = null
      return this.runOp({
        op: Op.STOP,
        opts,
        deferred: currentOp.deferred,
      } as OpInfo<StartOpts, StopOpts>)
    } else {
      // pendingOp?.op === Op.STOP
      return this.scheduleOp({
        op: Op.STOP,
        opts,
      })
    }
  }
}
