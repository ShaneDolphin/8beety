# How 8BEETY Was Actually Built — Prompt Engineering Lessons

8BEETY was built by one person directing an AI coding assistant (Claude). Not
in one prompt — across a sequence of specs, plans, implementation sessions, and
review loops. This file distills the method into lessons you can apply to your
own project. Every artifact mentioned here really exists in the repo; nothing
is idealized after the fact.

## Lesson 1: Write the spec before the first prompt

The single highest-leverage artifact is `SPEC.md` — ~630 lines written before
meaningful code. It contains exact formulas (`1789773 / (16·(timer+1))`),
exact data shapes (the `FrameScript` typed arrays), named non-goals ("no
accounts, no server, no macro editor"), and per-milestone acceptance criteria
("compare by ear against a FamiTracker export").

Why it works: an AI assistant fills every gap you leave with a plausible
guess. A spec converts guesses into lookups. When a question came up
mid-implementation, the answer was "read SPEC.md §7.3," not a negotiation.
The spec was also declared **the source of truth** — when code and spec
disagreed, the spec won, and deliberate deviations were written back into it.

**Do this:** before prompting for code, write what you want with numbers in
it. If you can't put numbers in it, you don't know what you want yet — and
neither will the model.

## Lesson 2: Give the assistant standing conventions, separately from the task

The repo has a `CLAUDE.md` — a short file of always-on rules the assistant
reads every session:

> Read SPEC.md before doing anything. TypeScript strict, no `any`. The
> compiler is a pure function — never read global state inside it. The worklet
> must not import from the rest of the app. All timing is 60 fps frames. Do
> not add dependencies without asking. Run `npm test` and `npm run build`
> before declaring a milestone done. Work one milestone at a time.

Conventions belong in a standing file, not repeated in every prompt. Notice
these rules are *architectural invariants and verification gates*, not style
nits. Each one prevented a specific class of expensive mistake.

## Lesson 3: Milestones, not monoliths

The app was built as M0 → M9 (scaffold → import → compiler → poly modes → UI →
Game Boy chip → exports → regions → chord assist → polish), then post-launch
features the same way. Each milestone: small enough to review, ends with the
full test suite and a production build green, and ships something audible.

Asking an AI for "the whole app" produces an unreviewable blob that sort of
works. Asking for one milestone against a spec produces a diff you can
actually judge. The repo's `docs/superpowers/plans/` folder holds all twelve
implementation plans, exactly as executed.

## Lesson 4: Plan → implement → review is a loop, and the review is not optional

The larger features (the 16-bit chips, the console-art video export) used a
strict loop:

1. **Design doc** — decisions and trade-offs, approved by the human.
2. **Implementation plan** — bite-sized tasks, each with the failing test to
   write first, the code to write, and the exact commit message.
3. **Fresh-context implementation** per task — the implementer gets the task
   brief, not the whole conversation history.
4. **Independent review** per task against the spec, by a reviewer who
   *didn't* write the code — then a whole-feature review at the end.

This is where the bugs died. Real catches from those review passes: a codec
level that corrupted exported videos; two silently-dropped octaves on the
SNES; a double-gain bug that clipped all 16-bit audio; WAV exports that lost
a hard-panned channel entirely; an FM release envelope that could never
sound. Every one was found by a review or a test *before* the user ever saw
it.

**Do this:** have the model review its own work in a fresh context, against
the spec, with instructions to verify claims rather than trust them. It will
find things the implementing context can't see.

## Lesson 5: Tests are how the AI proves it, and how you stay fast

Nearly 300 tests, written test-first for anything with behavior worth
pinning: register-math round-trips, LFSR bit sequences, drum priority,
deterministic sample generation, layout invariants for drawn graphics, and
end-to-end "compile a song for every chip and render 2 seconds of non-silent,
in-range audio" smoke tests.

Two habits matter more than the count:

- **"Done" means the verification commands ran and passed** — not that the
  model says it's done. The convention lives in CLAUDE.md, so it's enforced
  every session.
- **Design for testability up front.** The pure compiler and the Node-runnable
  DSP core (Lessons in `03-how-it-works.md`) were spec decisions made
  *because* they make the AI's work checkable. Testable architecture is a
  prompt-engineering choice.

## Lesson 6: Make the assistant show its evidence

When the model claims something works, ask for the run. When it debugs, make
it reproduce first, instrument second, and fix only what the evidence names.
Real example: "video exports are glitchy" was resolved by measuring browser
timer throttling with a probe page, reproducing the codec error in a harness,
decoding the produced files with ffprobe and AVFoundation, and rejecting the
"obvious" fix (avc3) because the evidence showed QuickTime couldn't play it.
The fix that shipped was the one the measurements pointed at.

## Lesson 7: The human's job is taste, constraints, and rulings

The assistant wrote nearly all of the code. The human decided: what the
product is, what it must never do (no Nintendo/Sega trade dress, no servers,
no bundled copyrighted music — including declining that last one repeatedly),
which trade-offs to take (a bigger-than-realistic screen on the drawn Game
Boy, because phone legibility beats fidelity), and when good was good enough.
Every judgment call the assistant made on the human's behalf was surfaced in a
written list of "rulings" for veto.

That division of labor is the whole discipline: **you own intent and
acceptance; the model owns execution; the spec and the tests own the truth.**

## The template, in one box

```
1. SPEC.md            — what to build, with numbers        (write first)
2. CLAUDE.md          — standing conventions + gates       (write second)
3. Milestone plan     — small, testable, shippable slices
4. Per-milestone loop — plan → test-first build → independent review → green gates
5. Ship gate          — full suite + production build + a human trying it
```

Copy that structure, and the size of the app stops mattering.
