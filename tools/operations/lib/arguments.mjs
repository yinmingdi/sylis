export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

const append = (options, name, value) => {
  const current = options[name];
  if (current === undefined) options[name] = value;
  else if (Array.isArray(current)) current.push(value);
  else options[name] = [current, value];
};

export function parseArguments(argv) {
  const [command, ...tokens] = argv;
  if (!command || command.startsWith("-")) {
    throw new UsageError("A command is required");
  }
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new UsageError(`Unexpected positional argument: ${token}`);
    }
    const separator = token.indexOf("=");
    if (separator > 2) {
      append(options, token.slice(2, separator), token.slice(separator + 1));
      continue;
    }
    const name = token.slice(2);
    const next = tokens[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      append(options, name, next);
      index += 1;
    } else {
      append(options, name, true);
    }
  }
  return { command, options };
}

export function option(options, name, { required = false } = {}) {
  const value = options[name];
  if (Array.isArray(value)) {
    throw new UsageError(`--${name} may only be supplied once`);
  }
  if (required && (value === undefined || value === true || value === "")) {
    throw new UsageError(`--${name} is required`);
  }
  return value;
}

export function optionsList(options, name) {
  const value = options[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export function confirm(options, expected) {
  const supplied = option(options, "confirm", { required: true });
  if (supplied !== expected) {
    throw new UsageError(`--confirm must exactly equal ${expected}`);
  }
}

export function choice(options, name, allowed) {
  const value = option(options, name, { required: true });
  if (!allowed.includes(value)) {
    throw new UsageError(`--${name} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}
