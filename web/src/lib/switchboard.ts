/** Runs one thing per id (the hub's watchers for each active session kind), starting and stopping them as the set of ids changes. */

export type Stop = () => void;

export class Switchboard<Id> {
  #running = new Map<Id, Promise<Stop>>();
  #start: (id: Id) => Stop | Promise<Stop>;
  #onError: (id: Id, err: unknown) => void;

  constructor(start: (id: Id) => Stop | Promise<Stop>, onError: (id: Id, err: unknown) => void = () => {}) {
    this.#start = start;
    this.#onError = onError;
  }

  /** Starts the ids not running and stops the running ones not in `ids`; resolves once every start and stop is done. */
  sync(ids: Iterable<Id>): Promise<void> {
    const want = new Set(ids);
    const done: Promise<unknown>[] = [];
    for (const [id, running] of this.#running) {
      if (want.has(id)) continue;
      this.#running.delete(id);
      done.push(running.then((stop) => stop()));
    }
    for (const id of want) {
      if (this.#running.has(id)) continue;
      const started = Promise.resolve()
        .then(() => this.#start(id))
        .catch((err): Stop => {
          this.#onError(id, err);
          return () => {};
        });
      this.#running.set(id, started);
    }
    return Promise.all([...done, ...this.#running.values()]).then(() => {});
  }

  running(): Id[] {
    return [...this.#running.keys()];
  }
}
