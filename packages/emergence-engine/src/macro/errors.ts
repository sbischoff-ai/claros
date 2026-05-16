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
