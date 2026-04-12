/**
 * Generic fixed-capacity ring buffer with FIFO eviction.
 *
 * `push` returns the evicted value once the buffer is full, otherwise `undefined`.
 * Callers that store a type which can legitimately contain `undefined` should
 * track fullness via `size` instead of relying on the return value.
 */
export class CircularBuffer<T> {
  #buffer: T[];
  #head = 0;
  #size = 0;

  constructor(capacity: number) {
    this.#buffer = new Array<T>(capacity);
  }

  get size(): number {
    return this.#size;
  }

  /**
   * Push a value onto the buffer.
   * Returns the evicted value if the buffer was full, otherwise undefined.
   */
  push(value: T): T | undefined {
    const evicted = this.#size === this.#buffer.length ? this.#buffer[this.#head] : undefined;
    this.#buffer[this.#head] = value;
    this.#head = (this.#head + 1) % this.#buffer.length;
    if (this.#size < this.#buffer.length) {
      this.#size++;
    }
    return evicted;
  }

  clone(): CircularBuffer<T> {
    const copy = new CircularBuffer<T>(this.#buffer.length);
    copy.#buffer = [...this.#buffer];
    copy.#head = this.#head;
    copy.#size = this.#size;
    return copy;
  }
}
