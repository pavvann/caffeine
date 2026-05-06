import { query, type Options, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { CAFFEINE_SYSTEM_PROMPT, composeUserPrompt } from "./prompts";
import { loadAgents, toAgentsRecord } from "./loader";
import { buildHooks } from "./hooks";
import { PromptBus } from "./promptBus";
import { emitSessionEvent } from "../ipc";
import { readConfig, verificationPromptSection } from "../repo/config";
import { readPipeline } from "../pipeline/parser";
import { runPipeline } from "../pipeline/orchestrator";
import type {
  AssistantTextEvent,
  CostEvent,
  StatusEvent,
} from "@shared/types";

export type SessionStartArgs = {
  targetRepoPath: string;
  model?: string;
  resumeSessionId?: string;
  costCeilingUsd?: number;
  onSessionId?: (id: string) => void;
};

export type RunningSession = {
  /** Lazily-resolved query handle. Reading before iteration starts returns a no-op stub. */
  readonly query: Query;
  abort: AbortController;
  bus: PromptBus;
  done: Promise<void>;
};

export function startSession(args: SessionStartArgs): RunningSession {
  const abort = new AbortController();
  const bus = new PromptBus();

  // Seed the protocol with the initial kickoff prompt; pause/stop/intervene
  // push more messages onto the same bus.
  bus.push(composeUserPrompt());

  const optionsPromise = buildOptions(args, abort);
  const queryHandle: { current: Query | null } = { current: null };

  const done = (async () => {
    emit({ kind: "status", status: "running", at: Date.now() });
    try {
      const options = await optionsPromise;
      const q = query({ prompt: bus.iter(), options });
      queryHandle.current = q;

      // Pipeline mode: if pipeline.md is present, kick the orchestrator
      // off concurrently with the SDK loop. The orchestrator pushes
      // stage prompts onto the same bus and observes BACKLOG.md /
      // STATE.md mutations the agent makes. A `PipelineParseError`
      // from `readPipeline` is intentionally NOT caught here — it
      // propagates to the outer catch as a session-level error so
      // the user is told their pipeline.md is malformed instead of
      // silently falling back to v1 mode.
      const pipeline = await readPipeline(args.targetRepoPath);
      const orchestratorPromise: Promise<void> = pipeline
        ? runPipeline(pipeline, args.targetRepoPath, bus, q, {
            signal: abort.signal,
          }).catch((err) => {
            // Tear the SDK loop down so `Promise.all` can settle even
            // if the SDK is mid-tool-execution.
            q.interrupt().catch(() => {});
            throw err;
          })
        : Promise.resolve();

      const sdkPromise = (async () => {
        for await (const message of q) {
          handleMessage(message, args.onSessionId);
        }
      })();

      await Promise.all([sdkPromise, orchestratorPromise]);
      emit({ kind: "status", status: "idle", at: Date.now() });
    } catch (err) {
      const reason =
        err instanceof Error ? err.message
          : typeof err === "string" ? err
            : "unknown";
      emit({ kind: "status", status: "error", reason, at: Date.now() });
      throw err;
    } finally {
      bus.close();
    }
  })();

  return {
    get query() {
      return queryHandle.current ?? STUB_QUERY;
    },
    abort,
    bus,
    done,
  };
}

async function buildOptions(
  args: SessionStartArgs,
  abort: AbortController,
): Promise<Options> {
  const config = await readConfig(args.targetRepoPath).catch(
    (): import("@shared/types").CaffeineConfig => ({}),
  );
  const systemPrompt = CAFFEINE_SYSTEM_PROMPT + verificationPromptSection(config);

  return {
    cwd: args.targetRepoPath,
    systemPrompt,
    allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Agent"],
    // Agents are discovered from markdown files: bundled `agents/*.md`
    // ship with Caffeine, and any `agents/*.md` in the user's target
    // repo override bundled defaults by name. Users can drop their
    // own files to add custom stages.
    agents: toAgentsRecord(await loadAgents(args.targetRepoPath)),
    hooks: buildHooks(args.targetRepoPath),
    resume: args.resumeSessionId,
    model: args.model ?? "claude-opus-4-7",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    abortController: abort,
    maxBudgetUsd: args.costCeilingUsd ?? config.costCeilingUsd,
    // No ANTHROPIC_API_KEY set — the SDK falls back to the Claude Code CLI's
    // OAuth credentials in ~/.claude/. Each user authenticates once via
    // `claude` and Caffeine inherits that login.
    env: {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: "caffeine/0.0.3",
    },
  };
}

const STUB_QUERY = {
  interrupt: async () => {},
} as unknown as Query;

function handleMessage(
  msg: SDKMessage,
  onSessionId?: (id: string) => void,
): void {
  if (msg.type === "system" && msg.subtype === "init") {
    onSessionId?.(msg.session_id);
    return;
  }

  if (msg.type === "assistant") {
    const content = (msg.message as { content?: unknown[] }).content ?? [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "text"
      ) {
        const text = (block as { text?: string }).text ?? "";
        if (text.trim().length === 0) continue;
        const event: AssistantTextEvent = {
          kind: "assistant-text",
          id: msg.uuid,
          text,
          at: Date.now(),
        };
        emit(event);
      }
    }
    return;
  }

  if (msg.type === "result" && msg.subtype === "success") {
    const cost: CostEvent = {
      kind: "cost",
      inputTokens: msg.usage.input_tokens ?? 0,
      outputTokens: msg.usage.output_tokens ?? 0,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
      costUsd: msg.total_cost_usd ?? 0,
    };
    emit(cost);
  }
}

function emit(event: StatusEvent | AssistantTextEvent | CostEvent): void {
  emitSessionEvent(event);
}
