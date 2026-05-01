import type { CaffeineApi } from "../preload";

declare global {
  interface Window {
    caffeine: CaffeineApi;
  }
}

export {};
