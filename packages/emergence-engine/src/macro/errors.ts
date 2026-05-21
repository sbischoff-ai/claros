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

export class MacroDisplayTemplateError extends Error {
  constructor(
    public readonly macroId: string,
    message: string
  ) {
    super(`display template error in ${macroId}: ${message}`);
    this.name = "MacroDisplayTemplateError";
  }
}
