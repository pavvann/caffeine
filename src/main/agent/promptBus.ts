// PromptBus is the async iterable handed to the SDK's `query({ prompt })`.
// It lets the host process push new user messages mid-session, which is
// what makes pause/intervene possible — the SDK's streaming input mode
// expects a long-lived iterator, not a one-shot.
//
// Pattern: bounded producer/consumer queue with a pending resolver.

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export class PromptBus {
  private queue: SDKUserMessage[] = [];
  private waiter: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(text: string): void {
    if (this.closed) return;
    const msg: SDKUserMessage = {
      type: "user",
      session_id: "",
      uuid: crypto.randomUUID(),
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: msg, done: false });
    } else {
      this.queue.push(msg);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: undefined, done: true });
    }
  }

  iter(): AsyncIterable<SDKUserMessage> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
        return {
          next(): Promise<IteratorResult<SDKUserMessage>> {
            if (self.queue.length > 0) {
              return Promise.resolve({ value: self.queue.shift()!, done: false });
            }
            if (self.closed) {
              return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
              self.waiter = resolve;
            });
          },
          return(): Promise<IteratorResult<SDKUserMessage>> {
            self.close();
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }
}
