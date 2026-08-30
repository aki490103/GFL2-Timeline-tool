import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/GFL2-Timeline-tool/",
  // 画面のバージョン表記を package.json と二重管理しない
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // 純粋ロジックは node、UI は各テストの環境コメントで jsdom を指定する
    environment: "node",
  },
});
