const ExtrinsicPromise = require("extrinsic-promises");

const complete = (p, tracker, timer) => {
    tracker.finished = true;
    p.fulfill({
        failed: tracker.failed,
        timedout: tracker.timedout,
        synchronous: tracker.synchronous,
        error: tracker.error,
        value: tracker.value
    });
    if (timer) {
        clearTimeout(timer);
    }
    return tracker;
};

const TIMEOUT = Symbol("timeout");

module.exports = function track(what, timeout) {
    const p = new ExtrinsicPromise();
    const tracker = p.hide();
    tracker.finished = false;
    tracker.value = undefined;
    tracker.error = undefined;
    tracker.failed = undefined;
    tracker.timedout = undefined;
    let syncReturn;
    const race = new ExtrinsicPromise();
    let timer =
        timeout == null
            ? null
            : setTimeout(() => {
                  timer = null;
                  race.fulfill(TIMEOUT);
              }, timeout);
    try {
        syncReturn = typeof what === "function" ? what() : what;
    } catch (syncError) {
        tracker.failed = true;
        tracker.synchronous = true;
        tracker.error = syncError;
        tracker.timedout = false;
        return complete(p, tracker, timer);
    }
    if (
        syncReturn === null ||
        typeof syncReturn === "undefined" ||
        typeof syncReturn.then !== "function"
    ) {
        tracker.failed = false;
        tracker.synchronous = true;
        tracker.value = syncReturn;
        tracker.timedout = false;
        return complete(p, tracker, timer);
    } else {
        tracker.synchronous = false;
        const returnedPromise = syncReturn;
        const promise =
            timeout == null
                ? returnedPromise
                : returnedPromise
                      .then(race.fulfill, race.reject)
                      .then(() => race);
        try {
            promise.then(
                fulfillValue => {
                    if (fulfillValue === TIMEOUT) {
                        tracker.failed = undefined;
                        tracker.timedout = true;
                    } else {
                        tracker.failed = false;
                        tracker.timedout = false;
                        tracker.value = fulfillValue;
                    }
                    complete(p, tracker, timer);
                    return null;
                },
                reason => {
                    tracker.failed = true;
                    tracker.timedout = false;
                    tracker.error = reason;
                    complete(p, tracker, timer);
                    return null;
                }
            );
        } catch (error) {
            const customError = new Error(
                `Returned value looked like a thennable, but threw the following error when registering handlers: ${error.message ||
                    error}`
            );
            customError.name = "InvalidThennableError";
            customError.cause = error;
            throw customError;
        }
        return tracker;
    }
};
