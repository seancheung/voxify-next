import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  resolve: { tsconfigPaths: true },
  build: {
    ssr: "src/mq/jobs.ts",
    outDir: ".jobs",
    rolldownOptions: {
      output: { entryFileNames: "index.mjs", keepNames: true },
    },
  },
});
