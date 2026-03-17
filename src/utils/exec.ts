import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

import { execa } from "execa";

interface CommandOptions {
  cwd?: string;
  stdio?: "inherit" | "pipe";
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  all: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const result = await execa(command, args, {
    cwd: options.cwd,
    stdio: options.stdio ?? "pipe",
    all: options.stdio === "inherit" ? false : true,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    all:
      result.all ??
      [result.stdout ?? "", result.stderr ?? ""].filter(Boolean).join("\n"),
  };
}

export async function runCheckedCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const result = await runCommand(command, args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      result.all.trim() || `Command failed: ${command} ${args.join(" ")}`
    );
  }

  return result;
}

export async function writeCommandStdoutToFile(
  command: string,
  args: string[],
  outputPath: string,
  cwd?: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = createWriteStream(outputPath);
    const stderrChunks: Buffer[] = [];

    child.stdout.on("error", reject);
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("error", reject);
    output.on("error", reject);
    child.on("error", reject);

    child.stdout.pipe(output);

    child.on("close", (exitCode) => {
      output.end(() => {
        if (exitCode === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            Buffer.concat(stderrChunks).toString("utf8").trim() ||
              `Command failed: ${command} ${args.join(" ")}`
          )
        );
      });
    });
  });
}

export async function commandExists(binary: string): Promise<boolean> {
  const result = await runCommand("which", [binary]);
  return result.exitCode === 0;
}
