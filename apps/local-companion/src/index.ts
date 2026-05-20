#!/usr/bin/env node
import * as path from "node:path";
import { DEFAULT_ALLOWED_ORIGINS, createLocalCompanionServer } from "./server.js";

interface CliOptions {
  projectRoot: string;
  host: string;
  port: number;
  origins: string[];
  webUrl: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_WEB_URL = "http://127.0.0.1:5173";

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const allowedOrigins = [
    ...new Set([...DEFAULT_ALLOWED_ORIGINS, options.webUrl, ...options.origins]),
  ];
  const companion = createLocalCompanionServer({
    projectRoot: options.projectRoot,
    allowedOrigins,
  });
  const address = await companion.listen(options.port, options.host);
  const companionUrl = `http://${address.host}:${address.port}`;
  const openUrl = new URL(options.webUrl);
  openUrl.searchParams.set("clarosCompanion", companionUrl);
  openUrl.searchParams.set("clarosToken", companion.token);

  console.log(`Claros local files companion`);
  console.log(`Project: ${options.projectRoot}`);
  console.log(`Server:  ${companionUrl}`);
  console.log(`Token:   ${companion.token}`);
  console.log(`Open:    ${openUrl.toString()}`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const origins: string[] = [];
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  let webUrl = DEFAULT_WEB_URL;
  let projectRoot = "";

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === undefined) {
      break;
    }
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--host") {
      host = requiredValue(arg, args.shift());
      continue;
    }
    if (arg === "--port") {
      port = Number.parseInt(requiredValue(arg, args.shift()), 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("Invalid --port value");
      }
      continue;
    }
    if (arg === "--origin") {
      origins.push(requiredValue(arg, args.shift()));
      continue;
    }
    if (arg === "--web") {
      webUrl = requiredValue(arg, args.shift());
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (projectRoot.length > 0) {
      throw new Error("Expected only one project root");
    }
    projectRoot = arg;
  }

  if (projectRoot.length === 0) {
    projectRoot = process.cwd();
  }
  if (origins.length === 0) {
    origins.push(...DEFAULT_ALLOWED_ORIGINS);
  }

  return {
    projectRoot: path.resolve(projectRoot),
    host,
    port,
    origins,
    webUrl,
  };
}

function requiredValue(option: string, value: string | undefined): string {
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: claros-local-files [projectRoot] [options]

Options:
  --host <host>       Bind host, defaults to 127.0.0.1
  --port <port>       Bind port, defaults to 3000
  --origin <origin>   Allowed web origin; may be repeated
  --web <url>         Web app URL printed with connection params
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
