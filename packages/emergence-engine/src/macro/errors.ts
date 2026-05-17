export class MacroParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacroParseError";
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export class MissingParamError extends Error {
  constructor(paramName: string) {
    super(`required param missing: ${paramName}`);
    this.name = "MissingParamError";
  }
}
