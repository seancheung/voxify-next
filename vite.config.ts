import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { build, defineConfig, type Plugin } from "vite";

function jobsPlugin(): Plugin {
  const configFile = "vite.jobs.config.ts";
  let closeWatcher: (() => Promise<void>) | undefined;

  return {
    name: "build-jobs",
    buildApp: {
      order: "pre",
      async handler() {
        await build({ configFile });
      },
    },
    async configureServer() {
      const watcher = await build({
        configFile,
        build: { watch: {} },
      });
      if (!("on" in watcher)) throw new Error("Expected a jobs build watcher");
      closeWatcher = () => watcher.close();
      await new Promise<void>((resolve, reject) => {
        watcher.on("event", (event) => {
          if (event.code === "BUNDLE_END") resolve();
          if (event.code === "ERROR") reject(event.error);
        });
      }).catch(async (error) => {
        await watcher.close();
        throw error;
      });
    },
    async closeBundle() {
      await closeWatcher?.();
    },
  };
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    jobsPlugin(),
    devtools(),
    nitro({
      plugins: ["src/mq/mq.plugin.ts"],
      rollupConfig: { external: ["sidequest", "better-sqlite3"] },
      rolldownConfig: { external: ["sidequest", "better-sqlite3"] },
    }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      importProtection: {
        behavior: "error",
      },
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    host: true,
  },
});

export default config;
