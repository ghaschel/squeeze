import chalk from "chalk";
import { Command } from "commander";

import { registerCompressCommand } from "./commands";

export async function createCli(): Promise<Command> {
  const packageJson = await import("../package.json");

  const program = new Command()
    .name("squeezit")
    .description("Compress images with maximum safe lossless optimization.")
    .version(packageJson.version ?? "0.0.0")
    .showHelpAfterError();

  program.configureOutput({
    outputError: (message, write) => {
      write(chalk.red(message));
    },
  });

  registerCompressCommand(program);
  return program;
}

export async function main(argv: string[]): Promise<void> {
  const program = await createCli();
  await program.parseAsync(argv, { from: "user" });
}
