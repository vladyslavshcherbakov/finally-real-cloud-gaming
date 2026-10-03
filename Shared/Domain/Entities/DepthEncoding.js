export const DEPTH_ENCODING_KINDS = Object.freeze({ disparity: 'disparity', depth: 'depth' });

export class DepthEncoding {
  constructor({ kind, lowestCode, highestCode, lowestValue, highestValue }) {
    this.kind = kind;
    this.lowestCode = lowestCode;
    this.highestCode = highestCode;
    this.lowestValue = lowestValue;
    this.highestValue = highestValue;
  }

  valueOfCode(code) {
    const shareOfRange = (code - this.lowestCode) / (this.highestCode - this.lowestCode);
    return this.lowestValue + shareOfRange * (this.highestValue - this.lowestValue);
  }

  relativeDepthOfCode(code) {
    switch (this.kind) {
      case DEPTH_ENCODING_KINDS.disparity:
        return 1 / this.valueOfCode(code);
      case DEPTH_ENCODING_KINDS.depth:
        return this.valueOfCode(code);
    }
  }
}
