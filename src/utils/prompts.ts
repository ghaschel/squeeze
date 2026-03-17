import inquirer from "inquirer";

export async function confirmDependencyInstall(
  platform: "macos" | "debian",
  packages: string[]
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const packageManager = platform === "macos" ? "Homebrew" : "APT";
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      default: true,
      message: `Install ${packages.length} missing package${packages.length === 1 ? "" : "s"} with ${packageManager}?`,
    },
  ]);

  return confirmed;
}
