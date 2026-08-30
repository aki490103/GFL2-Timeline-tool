import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/GFL2-Timeline-tool/",
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // 純粋ロジックは node、UI は各テストの環境コメントで jsdom を指定する
    environment: "node",
  },
});
