# Repository instructions

- This repository does not use Builderr.
- Do not invoke or assume project-specific CLIs, services, automation, or scripts that are not included or documented in this repository.
- Use the checked-in package scripts, dependencies, and configuration for development and verification.
- CI runs through the GitHub Actions workflows stored in this repository; inspect it through GitHub.

## Content changes: facts, not text

The world model lives on the rule engine's blackboard, not in the words of a rendered message (see «Мир как факты» in DESIGN.md).

- A line states its own requirements: `needs('boris')('…')`, `gate(...)(…)`, `when: [...]`. Never decide what may be said by matching words of the rendered text at runtime.
- A message that changes the world writes a fact where it happens: `remember` on an episode, rule or line, `fx.set` on a scene node. Introducing a character without writing the fact leaves every later line guessing.
- Presence and position are separate facts: `WORLD.razmik` (the crane story exists) vs `WORLD.razmikUp` (he is still up there). A line declares the one it relies on.
- Condition on facts, not on episode numbers: `gte('arc.x', n)` only when the order of episodes is the point, otherwise on the fact that episode set — episodes get reordered and finales replace the last one.
- News happens once: `once` on a rule or scene, a line without `repeat` in a pool; a recurring activity is `repeat` with a cooldown.
- Time comes from time facts: `Due` for deadlines, `since.<event>` for «тогда». Never hardcode months, dates or durations into text.
- System lines are the game's voice: `sys()` text does not go through Alik's line decoration, or it picks up his forms of address.
- A new output path joins the lint: `mentions.test.ts` checks pools, not output, so content reached through a new route is unchecked until it is in its corpus.
- Every new gate gets a negative control: break it, watch the test go red, restore it.
