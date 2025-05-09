import { type Plugin, defineConfig } from "vite";

interface Rewrite {
  from: RegExp;
  to: string;
}

interface HistoryOptions {
  rewrites?: Rewrite[];
}

function spaFallbackPlugin({ rewrites = [] }: HistoryOptions): Plugin {
  return {
    name: "spa-fallback",
    configureServer(server) {
      return () => {
        server.middlewares.use((req, _res, next) => {
          // @ts-ignore
          if (req.url && req.headers?.accept?.includes("text/html")) {
            for (const rewrite of rewrites) {
              // @ts-ignore
              if (rewrite.from.test(req.url)) {
                // @ts-ignore
                // console.log(`Rewrite ${req.url} to ${rewrite.to}`);
                // @ts-ignore
                req.url = rewrite.to; // Rewrite the URL
                break; // Stop processing further rewrite rules
              }
            }
          }
          return next();
        });
      };
    },
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        puzzle: "puzzle.html",
      },
    },
  },
  appType: "mpa",
  plugins: [
    spaFallbackPlugin({
      rewrites: [
        // Serve index.html for the root
        { from: /^\/$/, to: "/index.html" },
        // Serve puzzles.html for anything else
        { from: /^\/(?!index\.html$)([^.\s]+)(\/)?$/, to: "/puzzle.html" },
      ],
    }),
  ],
});
