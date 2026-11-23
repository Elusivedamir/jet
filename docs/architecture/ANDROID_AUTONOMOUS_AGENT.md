# Jetson Messenger — Android-resident CI agent (free tier)

## Decision

Use the always-on Android phone as a **control/monitor node**, not as the Android build machine.

- GitHub Actions remains the build/test executor (Android SDK + emulator).
- Termux on Android runs a small polling supervisor and stores reports locally.
- GitHub CLI authenticates the phone to the repository.
- The first release is intentionally read-only: it detects completed runs, downloads failed logs, filters diagnostic markers, writes a report and posts an Android notification.
- It does not push commits, rerun workflows, modify secrets, merge PRs, or touch `main`.

This is the safest free baseline. A local LLM can later be added behind a strict allowlist, but a model is not required for monitoring and should not be trusted to execute arbitrary shell commands.

## Current verified project context

The JuggleIM E2E workflow is `.github/workflows/juggleim-e2e.yml`, on branch `project/foundation-and-juggleim-poc`.

At implementation time, run `45235367532` failed after:
- Android APK builds and unit tests succeeded.
- Independent TLS and WebSocket probe succeeded (`101 Switching Protocols`).
- Bob reached `CONNECTED code=0`.
- The workflow timed out waiting for `POC_MESSAGE_SYNC_COMPLETE` before Alice was started.

Therefore the phone monitor will track the exact E2E workflow and preserve its failure diagnostics; it does not claim that message delivery works.

## Free-tier constraints

- GitHub Actions on a public repository: standard GitHub-hosted runners are free.
- Private repository on GitHub Free: included monthly Actions quota applies; current GitHub documentation lists 2,000 minutes/month and 500 MB artifact storage. If quota is exhausted, hosted jobs can stop until reset or billing is enabled.
- Termux, the monitor script, GitHub CLI, and local report storage are free.
- No paid API, Copilot, cloud LLM, or payment method is required for this monitoring layer.

## Android setup (one-time)

1. Install Termux and Termux:Boot from the same trusted distribution source. The official Termux:Boot project currently documents F-Droid installation.
2. Open Termux once and run:

   ```sh
   pkg update && pkg upgrade -y
   pkg install git gh jq termux-api -y
   ```

3. Clone the project branch:

   ```sh
   git clone --branch project/foundation-and-juggleim-poc https://github.com/Elusivedamir/jet.git ~/jet
   ```

4. Authenticate GitHub CLI:

   ```sh
   gh auth login
   gh auth status
   ```

   Use HTTPS and browser authentication. Do not paste a token into this repository or into chat.

5. Start the monitor:

   ```sh
   bash ~/jet/tools/android-agent/start-monitor.sh
   ```

6. Confirm output:

   ```sh
   tail -f ~/jetson-agent/monitor.log
   ```

## Start after phone reboot

After installing Termux:Boot, open its app once. Create the boot script:

```sh
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/jetson-agent <<'BOOT'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sleep 20
bash "$HOME/jet/tools/android-agent/start-monitor.sh"
BOOT
chmod +x ~/.termux/boot/jetson-agent
```

Termux:Boot runs scripts from `~/.termux/boot/`; its official instructions recommend `termux-wake-lock` when a process must keep running. Also set Android battery usage for Termux and Termux:Boot to **Unrestricted** / **Don't optimize**, allow background data, and keep the phone on reliable power. Android/OEM power management can still terminate processes; this is best-effort, not a carrier-grade 24/7 guarantee.

## What the monitor does

Every 5 minutes:
1. Queries the latest run of `juggleim-e2e.yml` on the working branch.
2. Ignores runs still in progress.
3. Processes each newly completed run once.
4. For failures, downloads failed-step logs through `gh`, filters relevant markers and writes `~/jetson-agent/reports/run-<id>.txt`.
5. Sends an Android notification when Termux:API is installed.

The script is read-only. It will not accidentally create an infinite rerun loop or commit an unreviewed AI patch.

## Known limits / next phase

- This first phase is a persistent CI monitor and diagnostic collector, **not yet an autonomous code-repair agent**.
- It needs the phone to remain powered, connected and allowed to run Termux in the background.
- The current implementation watches the latest run; it is not a queue processor for every historical run.
- Local LLM inference on Android is possible with llama.cpp, but model size, RAM, heat and battery are device-dependent. Do not download a large model until device memory/storage are checked.
- Phase 2: add local log classification and evidence-backed root-cause hypotheses.
- Phase 3: optionally let the agent prepare a patch on a dedicated branch, run focused tests, and open a PR. Require explicit approval for merge, production secrets, destructive actions, or changes outside the allowlist.

## Safety rules

- Never write secrets, tokens, private keys, or message bodies to reports.
- Never give the local model unrestricted shell access.
- Never push to `main` or merge automatically.
- Limit repair attempts; after two failed focused attempts, stop and report.
- Keep each observation, hypothesis, patch and test result in the diagnostic log.
