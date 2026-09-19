# Energy / tokens (no fabricated joules)

Official LLM path: **Kiln `gpt-oss-120b`** (`LLM_PROVIDER=kiln`).

See **[JUDGE.md](../JUDGE.md)** § “Official LLM path · tokens · energy”.

- Capture real prompt/completion split from API `usage.propose` / `usage.explain`.
- If no meter: **Energy: UNKNOWN — report tokens only.**
- NPU watt assumptions only if from kit docs; else UNKNOWN.
- Unverifiable “Nx cheaper than GPU” is not evidence.
