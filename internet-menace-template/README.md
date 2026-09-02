# 8BEETY — How to Build a Real App With AI (A Beginner's Template)

> This template guide is available at **[internetmenace.com](https://internetmenace.com)**.

## What is this?

This folder shows you, step by step, how a real web application was built by
one person working with an AI coding assistant. The app is **8BEETY**
(https://www.8beety.com) — it turns any MIDI music file into authentic
NES, Game Boy, Super Nintendo, or Sega Genesis-style chiptune music, right in
your browser. It's live, it's free, and its source code is public.

You don't need to know music, and you don't need to be an expert programmer.
What you'll learn here is the *method*: how to talk to an AI assistant so it
builds a real, finished, working application — instead of a demo that falls
apart the moment you touch it.

## The big idea (read this even if you read nothing else)

**A finished application does not come from one clever prompt.**

It comes from three things, used together:

1. **A written specification** — a document that says exactly what you want,
   with real numbers and real details, written *before* any code.
2. **A set of standing rules** — a short file of "always do this, never do
   that" the AI reads every time it works.
3. **A loop** — build one small piece, test it, have the AI review its own
   work with fresh eyes, fix what's wrong, and only then move on.

Every file in this folder is one of those pieces, taken from the real project.

## What's in this folder

Read them in this order:

| # | File | What you'll learn |
|---|---|---|
| 1 | [05-prompt-engineering-lessons.md](05-prompt-engineering-lessons.md) | **Start here.** The seven lessons — the method that everything else plugs into |
| 2 | [02-what-it-does.md](02-what-it-does.md) | What the finished app actually does, in plain language |
| 3 | [01-design-spec.md](01-design-spec.md) | The specification the AI built from. Notice how *specific* it is — that's the secret |
| 4 | [03-how-it-works.md](03-how-it-works.md) | How the app is put together under the hood (skimmable if you're new) |
| 5 | [04-hosting-and-running.md](04-hosting-and-running.md) | How to run the app on your own computer and put it on the internet |

Don't worry if `01` and `03` feel technical on a first pass — the point isn't
to understand every formula. The point is to see what "specific enough for an
AI to build correctly" looks like.

## Try it yourself (the exercise)

1. Play with the real app for five minutes: https://www.8beety.com — drop in
   any `.mid` file (search the web for "free MIDI files" if you need one).
2. Read the lessons file, then skim the spec.
3. Now pick a *small* idea of your own — a timer, a flashcard app, a tip
   calculator — and write your own one-page spec for it before you prompt
   anything. Include numbers. Include what it should NOT do.
4. Give your spec to an AI assistant and ask it to plan the **first small
   milestone only** — not the whole app.
5. Make it write tests, run them, and fix failures before moving to the next
   milestone. Repeat until you're done.

That's the entire method. The size of the app stops mattering once you have
the habit.

## Want to go deeper?

- The full source code, with every specification and implementation plan
  preserved exactly as they were used:
  https://github.com/ShaneDolphin/8beety
- More guides and templates: **[internetmenace.com](https://internetmenace.com)**

---
*8BEETY was designed and built by Shane Morris (Beautiful Majestic Dolphin)
with Claude. MIT licensed. This template guide lives at
[internetmenace.com](https://internetmenace.com).*
