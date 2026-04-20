import { AsyncLocalStorage } from "node:async_hooks";

const globalWithAsyncLocalStorage = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
};

if (typeof globalWithAsyncLocalStorage.AsyncLocalStorage !== "function") {
  globalWithAsyncLocalStorage.AsyncLocalStorage = AsyncLocalStorage;
}
