# Contributing to Legion

Hey! Thanks for wanting to contribute to Legion. Whether it's a bug fix, new feature, or just improving docs — we appreciate it. 🙌

## Code of Conduct

Be kind, be constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). TL;DR: treat people well.

## How to Help

### 🐛 Report Bugs

Found something broken? [Open an issue](https://github.com/wearethelegion/legion/issues/new) with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Bun version, Legion version)

### 💡 Suggest Features

Got an idea? [Open an issue](https://github.com/wearethelegion/legion/issues/new) and tag it as a feature request. Describe the problem you're solving and your proposed approach.

### 🏷️ Good First Issues

New here? Look for issues labeled [`good first issue`](https://github.com/wearethelegion/legion/labels/good%20first%20issue) — these are scoped and beginner-friendly.

## Development Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/legion.git
cd legion

# Install dependencies
bun install

# Run tests
bun test

# Run Legion locally
bun run src/index.ts
```

**Requirements:** [Bun](https://bun.sh/) v1.0+

## Pull Request Process

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/my-awesome-thing
   ```

2. **Make your changes.** Write tests if applicable.

3. **Run checks** before pushing:
   ```bash
   bun test
   bun run lint    # if configured
   ```

4. **Push** and open a PR against `main`.

5. **Describe** what you changed and why. Link related issues.

6. A maintainer will review. We aim to respond within a few days.

### PR Tips

- Keep PRs focused — one feature or fix per PR
- Update docs if your change affects user-facing behavior
- Rebase on `main` if your branch falls behind

## Coding Standards

- **Language:** TypeScript (strict mode)
- **Runtime:** Bun
- **Style:** Follow existing patterns in the codebase
- **Formatting:** Use the project's formatter config (Prettier/Biome if configured)
- **Naming:** `camelCase` for variables/functions, `PascalCase` for types/classes
- **Imports:** Prefer explicit imports over barrel files
- **Tests:** Co-locate tests or use `__tests__/` directories

## Project Structure

```
src/           # Source code
tests/         # Test files
docs/          # Documentation
```

## Community

- 💬 [Discord](https://discord.gg/eX5GqGx4) — ask questions, share ideas
- 🐙 [GitHub Discussions](https://github.com/wearethelegion/legion/discussions) — longer-form conversations

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thanks for being part of Legion. Let's build something great. ⚔️
