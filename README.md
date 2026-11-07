# Host CI probe (throwaway)

Throwaway research for visual-check, a visual regression tool for Storybook: can GitHub-hosted Windows and macOS runners run its browser container, and what else from those hosts works? Not production code. It will be archived or deleted once the question is answered.

visual-check runs the browser in the official Playwright image, forced to `linux/amd64`. Chromium is driven over raw CDP through a pipe (`docker run -i`), and WebKit through Playwright's `run-server`. This repo's workflow (`.github/workflows/probe.yml`) checks, on every runner OS:

- **probe:** what each runner image offers for Linux containers (nested virtualization, WSL, Docker).
- **linux:** reference captures of [storybookjs/mealdrop](https://github.com/storybookjs/mealdrop) at a pinned commit, plus hazard stories, live and offline.
- **host:** baseline file names from story IDs, git round trips, changed files, Fallow, and starting and stopping a Storybook, with no Docker.
- **windows-docker:** docker.io inside WSL2 on `windows-2025` (and `windows-2022`), the runner's `docker.exe` as its client, NAT and mirrored networking, the SOCKS proxy route to the Windows host, captures, and container cleanup when the process is killed.
- **windows-wslc:** WSL containers (`wslc.exe`).
- **macos-docker:** `docker/setup-docker-action` (Lima), Colima, Docker Desktop and OrbStack on Intel runners, and arm64 as a negative control.
- **parity:** Windows and macOS host snapshots against the Linux runners'.

`harness/` holds the capture harness (a raw CDP driver, a Playwright WebKit driver and a SOCKS proxy) and the checks. Node 24 runs the `.ts` files directly. Launch arguments and the font table are data copied from Playwright 1.64.1 (Apache-2.0), with links in the code.

MIT licensed.
