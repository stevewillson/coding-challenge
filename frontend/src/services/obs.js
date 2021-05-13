import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'
import * as _ from 'lodash-es'

export function streamsOrStream (streams, stream) {
  return streams?.stream || stream
}

export function setStreamsOrStream (streams, stream, value) {
  if (streams) {
    return streams.next(value)
  } else {
    return stream.next(value)
  }
}

// stream with initial value, but can be set to non-streams after.
// if initial stream is updated, use that value instead
// also has methods for isChanged, reset and replaceStream
export function streams (stream, { distinctUntilChanged = true } = {}) {
  let cachedStreamResult, cachedSubjectValue
  const replaySubject = new Rx.ReplaySubject(0) // nextable w/ non-streams
  const replayStream = new Rx.ReplaySubject(0) // streams (modified with replaceStream)
  replayStream.next(stream)

  const combinedStream = Rx.merge(
    replaySubject.pipe(
      rx.tap((value) => {
        cachedSubjectValue = value
      })
    ),
    replayStream.pipe(
      rx.switchAll(),
      // this breaks where eg stream value is 0, then behav sub changes to 1, then stream changes back to 0
      // generally we want this functionality
      // (eg when editing something, cache gets invalidated when leaving /
      // returning to tab - don't want to reset the client changes)
      // if you want it to always reset, use distinctUntilChanged option
      distinctUntilChanged ? rx.distinctUntilChanged(_.isEqual) : rx.tap((val) => val),
      rx.tap((result) => {
        cachedStreamResult = result
        cachedSubjectValue = null
      })
    )
  ).pipe(
    // this line very important. makes sure the ordering is consistent
    // when new subscriptions occur (so the most recent of stream or subject)
    // is chosen instead of always the stream first
    rx.publishReplay(1), rx.refCount()
  )

  return {
    stream: combinedStream,
    next: replaySubject.next.bind(replaySubject),
    isChanged: () => {
      return cachedSubjectValue !== null &&
        cachedStreamResult !== cachedSubjectValue
    },
    reset: () => replaySubject.next(cachedStreamResult),
    replaceStream: (stream) => replayStream.next(stream),
    // try not to use this. last resort
    getValue: () => cachedStreamResult || cachedSubjectValue
  }
}
