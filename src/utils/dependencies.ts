import chalk from "chalk";
import ora from "ora";

import {
  buildMissingDependencyMessage,
  collectRequiredDependencies,
  detectPlatform,
  findMissingDependencies,
  installDependencies,
  uniquePackages,
} from "../core";
import type { CompressCommandOptions, ResolvedInput } from "../types";
import { confirmDependencyInstall } from "./prompts";

export {
  buildMissingDependencyMessage,
  collectRequiredDependencies,
  detectPlatform,
  findMissingDependencies,
  installDependencies,
  uniquePackages,
} from "../core";

export async function ensureDependencies(
  options: CompressCommandOptions,
  inputs: ResolvedInput[]
): Promise<void> {
  const spinner = ora("Checking required system tools").start();
  const platform = await detectPlatform();

  if (!platform) {
    spinner.fail("Unsupported OS");
    throw new Error("squeezit supports macOS and Debian/Ubuntu Linux only.");
  }

  const dependencies = collectRequiredDependencies(
    inputs,
    options,
    options.installDeps
  );
  let missing = await findMissingDependencies(dependencies);

  if (missing.length === 0) {
    spinner.succeed("System tools are available");
    return;
  }

  if (!options.installDeps) {
    spinner.fail("Missing required system tools");
    throw new Error(
      `${buildMissingDependencyMessage(missing, platform)}\nInstall with ${chalk.cyan("--install-deps")} or install these packages manually.`
    );
  }

  const packages = uniquePackages(missing, platform);
  spinner.stop();

  const confirmed = await confirmDependencyInstall(platform, packages);
  if (!confirmed) {
    throw new Error("Dependency installation cancelled.");
  }

  spinner.start(
    `Installing ${packages.length} package${packages.length === 1 ? "" : "s"}`
  );
  spinner.stop();
  await installDependencies(platform, packages);
  spinner.start("Re-checking required system tools");

  missing = await findMissingDependencies(dependencies);
  if (missing.length > 0) {
    spinner.fail("Dependencies are still missing after installation");
    throw new Error(
      `${buildMissingDependencyMessage(missing, platform)}\nInstall with ${chalk.cyan("--install-deps")} or install these packages manually.`
    );
  }

  spinner.succeed("System tools are available");
}
