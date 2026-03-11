# Contributing to Grappie

Thank you for your interest in contributing! This document explains how to get involved.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/your-username/grappie/issues) to avoid duplicates
2. Open a new issue using the **Bug Report** template
3. Include: browser + OS, steps to reproduce, expected vs actual behaviour, console errors

### Suggesting Features

1. Open a new issue with the label `enhancement`
2. Describe the use case clearly — what problem does it solve?
3. Check the [Roadmap in README.md](README.md#roadmap) first

### Submitting Code

---

## Fork & Pull Request Workflow

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/grappie.git
cd grappie

# 2. Create a feature branch
git checkout -b feat/your-feature-name

# 3. Make your changes (no build step needed)
#    Open index.html in your browser to test

# 4. Commit using Conventional Commits (see below)
git add .
git commit -m "feat: add difficulty level selector"

# 5. Push your branch
git push origin feat/your-feature-name

# 6. Open a Pull Request on GitHub against the main branch
```

---

## Commit Message Style

We use **[Conventional Commits](https://www.conventionalcommits.org/)**:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code restructuring (no feature/fix) |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `chore` | Build process, dependency updates |

**Examples:**
```
feat(interview): add difficulty level selector
fix(mic): prevent recognition restart after interview ends
docs(readme): add Firefox compatibility note
style(css): normalise spacing in timer card
```

---

## Pull Request Process

1. **Keep PRs focused** — one feature or fix per PR
2. **Reference the issue** — include `Closes #123` in the PR description if applicable
3. **Describe your changes** — fill in the PR template fully
4. **Test in Chrome and Edge** — these are the fully supported browsers
5. **Don't break existing functionality** — test the full flow: setup → interview → report
6. **Keep the single-file-per-concern architecture** — don't merge JS modules

---

## Project Architecture

Before making significant changes, read [docs/architecture.md](docs/architecture.md) to understand:
- How the global `state` object works
- The `interviewActive` flag pattern (critical for preventing race conditions)
- The single permission prompt design
- How CSS custom properties are structured

---

## Code Style Guidelines

- **JavaScript:** ES2020, `'use strict'`, 2-space indent, JSDoc comments on all exported functions
- **CSS:** Properties grouped logically (positioning, box model, typography, visual), variables for all colours
- **HTML:** Semantic elements where possible, `aria-label` on icon-only buttons
- **No dependencies:** Do not add npm packages. CDN scripts for pdf.js and mammoth.js are the only allowed external JS.
- **No frameworks:** Keep it plain HTML + CSS + Vanilla JS — that's the whole point

---

## Getting Help

- Open a [GitHub Discussion](https://github.com/your-username/grappie/discussions) for questions
- Tag your issue with `question` if you're unsure about something

We appreciate every contribution, no matter how small. Thank you! 🙌
