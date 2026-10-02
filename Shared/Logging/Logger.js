export class Logger {
  #area;
  #sink;
  #isDebugEnabled;

  constructor(area, { sink = console, isDebugEnabled = false } = {}) {
    this.#area = area;
    this.#sink = sink;
    this.#isDebugEnabled = isDebugEnabled;
  }

  forArea(area) {
    return new Logger(area, { sink: this.#sink, isDebugEnabled: this.#isDebugEnabled });
  }

  debug(message) {
    if (this.#isDebugEnabled) this.#sink.debug(this.#line(message));
  }

  info(message) {
    this.#sink.info(this.#line(message));
  }

  warn(message) {
    this.#sink.warn(this.#line(message));
  }

  error(message) {
    this.#sink.error(this.#line(message));
  }

  #line(message) {
    return `${timeOfDayWithMilliseconds(new Date())} [${this.#area}] ${message}`;
  }
}

function timeOfDayWithMilliseconds(date) {
  const twoDigits = (value) => String(value).padStart(2, '0');
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`
    + `.${String(date.getMilliseconds()).padStart(3, '0')}`;
}
