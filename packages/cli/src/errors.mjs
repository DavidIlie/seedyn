export class CliError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "CliError";
  }
}
