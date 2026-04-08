import { describe, expect, test, vi } from "vitest";

import { squeezitAstro } from "../../src/integrations/astro";

describe("astro integration", () => {
  test("creates a build-only astro integration that injects the vite plugin", () => {
    const integration = squeezitAstro({ checkDependencies: false });
    const updateConfig = vi.fn();
    const warn = vi.fn();

    expect(integration.name).toBe("squeezit:astro");
    expect(typeof integration.hooks["astro:config:setup"]).toBe("function");

    integration.hooks["astro:config:setup"]?.({
      command: "build",
      isRestart: false,
      config: {
        output: "static",
      } as never,
      updateConfig,
      addRenderer: vi.fn(),
      addWatchFile: vi.fn(),
      injectScript: vi.fn(),
      injectRoute: vi.fn(),
      addClientDirective: vi.fn(),
      addDevToolbarApp: vi.fn(),
      addMiddleware: vi.fn(),
      createCodegenDir: vi.fn(),
      logger: { warn } as never,
    });

    expect(warn).not.toHaveBeenCalled();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        vite: expect.objectContaining({
          plugins: expect.arrayContaining([
            expect.objectContaining({
              name: "squeezit:vite",
              apply: "build",
              enforce: "post",
            }),
          ]),
        }),
      })
    );
  });

  test("skips non-build commands", () => {
    const integration = squeezitAstro();
    const updateConfig = vi.fn();

    integration.hooks["astro:config:setup"]?.({
      command: "dev",
      isRestart: false,
      config: {
        output: "static",
      } as never,
      updateConfig,
      addRenderer: vi.fn(),
      addWatchFile: vi.fn(),
      injectScript: vi.fn(),
      injectRoute: vi.fn(),
      addClientDirective: vi.fn(),
      addDevToolbarApp: vi.fn(),
      addMiddleware: vi.fn(),
      createCodegenDir: vi.fn(),
      logger: { warn: vi.fn() } as never,
    });

    expect(updateConfig).not.toHaveBeenCalled();
  });

  test("warns and skips server output", () => {
    const integration = squeezitAstro();
    const updateConfig = vi.fn();
    const warn = vi.fn();

    integration.hooks["astro:config:setup"]?.({
      command: "build",
      isRestart: false,
      config: {
        output: "server",
      } as never,
      updateConfig,
      addRenderer: vi.fn(),
      addWatchFile: vi.fn(),
      injectScript: vi.fn(),
      injectRoute: vi.fn(),
      addClientDirective: vi.fn(),
      addDevToolbarApp: vi.fn(),
      addMiddleware: vi.fn(),
      createCodegenDir: vi.fn(),
      logger: { warn } as never,
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("only static Astro builds are supported")
    );
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
