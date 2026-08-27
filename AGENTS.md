<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

Read the relevant guide in `node_modules/next/dist/docs/` before writing code. APIs, conventions, and file structure may differ from training data. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Project boundaries

This directory is the independent `regret-button` repository. Do not change sibling projects or the parent repository.

## Product rules

- Keep this toy harmless. No payment, forced navigation, permissions for private device data, or deceptive system dialogs.
- All counts and preferences stay in localStorage. Never send timestamps, exact running totals, or identifiers to analytics; only the fixed 100/500/1000 milestone category may be sent.
- Sound is synthesized with Web Audio, off by default, and requires an explicit user gesture.
- Respect reduced motion and keyboard operation. A long press must count exactly once.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run secret-scan` before publishing.
