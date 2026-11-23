# Android Emulator E2E: operating and troubleshooting runbook

**Status:** [АКТУАЛЬНО — В РАЗРАБОТКЕ]
**Scope:** Jetson Messenger Android/JuggleIM isolated PoC only.
**Workflow:** `.github/workflows/juggleim-e2e.yml`
**Diagnostic collector:** `deploy/juggleim-poc/scripts/collect-emulator-diagnostics.sh`
**E2E test:** `deploy/juggleim-poc/scripts/run-android-e2e.sh`

This runbook is the operational memory for the emulator E2E pipeline. Update it in the same change whenever workflow behavior, emulator configuration, scripts, expected log markers, or troubleshooting procedures change.

## 1. What this test proves

The workflow provisions an isolated JuggleIM server and two synthetic users, builds two debug APK flavors, starts one Android emulator, installs both APKs, connects Bob and Alice, sends a unique test message from Alice, and requires the receiver-side log marker from Bob.

A successful APK build is **not** a successful E2E test. The required end condition is all of:

- Bob's JuggleIM connection reaches `CONNECTED code=0`.
- Alice's JuggleIM connection reaches `CONNECTED code=0`.
- Alice emits `POC_MESSAGE_SENT package=com.jetson.poc.alice`.
- Bob emits `POC_MESSAGE_RECEIVED package=com.jetson.poc.bob`.
- The script prints `E2E_PASS: Bob received Alice's private message`.

Until all conditions are observed in the same successful run, live private-message exchange remains [НЕ ПРОВЕРЕНО].

## 2. Pipeline stages and failure boundaries

| Stage | Workflow step / script | Evidence | Typical failure domain |
|---|---|---|---|
| 1. Checkout | Checkout | checked-out commit SHA | GitHub/repository |
| 2. Toolchain | JDK, Android SDK, Gradle | versions and installed SDK packages | runner/toolchain |
| 3. Server bootstrap | `bootstrap.sh` | server health, synthetic user provisioning | Docker/network/JuggleIM |
| 4. APK build + unit tests | Gradle tasks | Gradle task results and APK outputs | Android source/build |
| 5. Emulator acceleration preflight | KVM step | KVM permissions or explicit TCG fallback warning | runner virtualization |
| 6. Emulator process + boot | `android-emulator-runner` | emulator action output, ADB, boot completion | runner/AVD/system image |
| 7. Install and trust setup | `run-android-e2e.sh` | ADB install and CA setup exit codes | ADB/certificate/package |
| 8. Bob connect | E2E script | Bob `CONNECTED` marker | WSS/TLS/auth/SDK |
| 9. Alice connect and send | E2E script | Alice `CONNECTED` and `POC_MESSAGE_SENT` | WSS/auth/peer ID/send |
| 10. Bob receive | E2E script | `POC_MESSAGE_RECEIVED` | server routing/peer mapping/SDK callback |
| 11. Diagnostics + cleanup | diagnostics script and teardown | uploaded diagnostic artifact; Docker teardown | CI post-failure handling |

The emulator action must complete its own boot before it invokes the supplied E2E script. If the action reports `Timeout waiting for emulator to boot`, stages 7–10 did not run. Do not diagnose that as a message-delivery defect.

## 3. Emulator configuration currently in use

The workflow currently requests:

- GitHub-hosted `ubuntu-24.04` runner.
- Android API 34, `google_apis`, `x86_64`, `pixel_2` profile.
- Headless mode, SwiftShader GPU, no audio, no boot animation, no camera.
- Emulator boot timeout: 600 seconds.
- KVM permission setup when `/dev/kvm` exists; explicit TCG fallback when it does not.
- Android Emulator action is currently referenced as `reactivecircus/android-emulator-runner@v2`. Pinning actions to reviewed full commit SHAs remains a supply-chain hardening item.

KVM device existence and read/write permissions are a preflight signal, not proof that QEMU actually selected hardware acceleration. Confirm from emulator startup logs where possible.

## 4. Failure diagnosis matrix

| Symptom | First evidence to inspect | Likely causes | Next controlled action |
|---|---|---|---|
| Emulator process never starts | action log, process exit, emulator version | SDK install, incompatible image, runner resource issue | capture diagnostics; verify image and emulator package versions |
| `/dev/kvm` absent | KVM section of diagnostic artifact | runner does not expose hardware virtualization | use a runner class that supports KVM or validate TCG on a smaller/compatible image |
| KVM exists but inaccessible | permissions and udev output | group/udev permissions, runner policy | inspect device owner/group and action startup output; do not assume acceleration |
| KVM accessible but boot still times out | emulator startup log, CPU/RAM, AVD config | AVD/image issue, resource pressure, GPU/snapshot issue | test one configuration change at a time; preserve baseline |
| ADB shows `offline` or no device | `adb devices -l`, emulator process | ADB startup race, emulator crash, port conflict | inspect emulator process/log; restart only after capturing evidence |
| ADB device exists but boot property is not `1` | `sys.boot_completed`, boot animation property, AndroidRuntime errors | Android boot hang, insufficient resources, bad snapshot/image | cold boot/no snapshot experiment; compare boot timing |
| Boot completes but install fails | install command output, package manager/runtime errors | ABI mismatch, package conflict, storage | verify APK ABI, package IDs, free data partition |
| Bob cannot connect | Bob state marker, TLS/server logs | CA trust, WSS URL, token, server readiness | isolate TLS, server health, and SDK connection in that order |
| Alice cannot connect or send | Alice markers, app runtime errors | auth, peer ID, SDK lifecycle, send API | validate user mapping and sender callback |
| Alice sends but Bob does not receive | sent/received markers, server logs | peer routing, wrong peer ID, offline recipient, callback | verify server-side recipient mapping and SDK receipt callback; do not blindly retry as proof |
| Intermittent failure | run attempt, resource data, timing | race, startup readiness, resource contention | compare repeated run evidence and add bounded readiness polling, not arbitrary sleeps |

## 5. Required diagnostic evidence

On every E2E failure, preserve:

- runner OS/architecture, CPU virtualization flags, memory and disk;
- KVM presence and permissions;
- Java, ADB and emulator versions;
- ADB device states;
- Android boot properties for connected devices;
- bounded AndroidRuntime error output;
- selected non-secret AVD configuration keys;
- bounded emulator log files if the action leaves them available;
- exact workflow run ID and attempt.

The collector must not print the full environment, tokens, AppSecret, private message bodies, or arbitrary application logs. Diagnostic artifacts should have short retention and be treated as potentially sensitive operational data.

The current collector writes `artifacts/emulator-diagnostics/runner-and-emulator.txt`. The workflow should upload this folder with `if: always()`, including failed emulator boots.

## 6. How to reproduce and inspect a run

1. Open the GitHub Actions run for **JuggleIM Android end-to-end PoC** on branch `project/foundation-and-juggleim-poc`.
2. Confirm the run checked out the expected commit.
3. Inspect the first failed step, not only the final job status.
4. If the emulator boot action failed, verify that the E2E script did not start; then inspect the diagnostic artifact and emulator action log.
5. If the E2E script started, locate the last required marker in order: Bob connected → Alice connected → Alice sent → Bob received.
6. Download and inspect the diagnostic artifact. Never paste tokens, secrets, or private test data into issues or chat.
7. Record the run URL/ID, commit SHA, failed stage, observed evidence, root-cause hypothesis, and next experiment in the decision log or a dated incident note.
8. Change one major variable per experiment (runner class, image/API, acceleration, GPU/snapshot setting, timeout) so the result is attributable.
9. Re-run the complete scenario after a fix. A boot-only smoke test is useful but does not replace Alice-to-Bob message verification.

## 7. Change protocol

For every change to this pipeline:

1. Inspect the current workflow, scripts, and relevant docs before editing.
2. State the failure hypothesis and the evidence supporting it.
3. Update code and this runbook together.
4. Run cheap checks first: shell syntax (`bash -n`), YAML parse/lint where available, diff review, secret-safety review.
5. Run the relevant CI workflow.
6. Record exact commit and run ID, test scope, results, and remaining unknowns.
7. Do not mark a stage passed without its actual evidence.
8. Do not merge to `main` unless the owner explicitly authorizes it.

## 8. Current known incident

**Incident:** emulator boot timeout, workflow run `45196295552`, job `137767507635`.

**Observed:** build/bootstrap reached emulator launch; the emulator action polled `sys.boot_completed` and timed out after approximately 600 seconds. The Alice/Bob test script did not start.

**First mitigation committed:** `2333732963b62e35159f1bcfb44b7f370c655815` added conditional KVM permission setup and a TCG fallback when KVM is unavailable.

**Status:** [НЕ ПРОВЕРЕНО] whether the mitigation resolves the incident. A successful follow-up run and Bob's `POC_MESSAGE_RECEIVED` marker are still required. The fallback may be too slow on a standard runner.

**Next actions:** collect the new diagnostic artifact; establish whether KVM is truly usable; if not, evaluate a KVM-capable runner or a better-supported runner configuration. Do not remove the receiver assertion or silently downgrade the E2E test.

## 9. Maintenance history

- 2026-11-23: initial runbook created alongside the CI diagnostic collector. Update this section with commit SHA and verified workflow run whenever the pipeline changes.

## 10. Bounded diagnostics (2026-11-23)

**Incident under investigation:** run `45201616287`, job `137786313978`. The E2E step completed with failure, then the diagnostics collector remained `in_progress` for at least 15 minutes. Artifact listing was empty while upload was pending, and GitHub's job-log download endpoint returned `BlobNotFound` while the job was still active.

**Finding:** static inspection of the collector found multiple ADB calls without per-command timeouts (`adb devices`, `adb shell getprop`, `adb logcat`). ADB can remain blocked when the emulator/device is unhealthy. This is a confirmed unbounded-wait risk in the collector, but it is **not yet confirmed** that one of these commands caused the observed 15-minute stall; the in-progress runner logs were unavailable.

**Mitigation committed:**
- Added a `run_bounded` wrapper using GNU `timeout` with TERM/KILL escalation.
- ADB calls now have short per-command limits; logcat is limited to 8 seconds.
- AVD discovery and local log reads are bounded.
- The workflow diagnostics step now has `timeout-minutes: 2` and a 90-second shell-level timeout.
- Timed-out diagnostic commands emit an explicit `[DIAGNOSTIC_TIMEOUT ...]` marker and do not prevent the remaining report sections from being attempted.

**Files:** `deploy/juggleim-poc/scripts/collect-emulator-diagnostics.sh`, `.github/workflows/juggleim-e2e.yml`.

**Acceptance checks still required:** run `bash -n deploy/juggleim-poc/scripts/collect-emulator-diagnostics.sh`; inspect workflow YAML; verify on a fresh CI run that the collector finishes or is forcibly bounded, the artifact uploads, and the report contains either command output or timeout markers. This mitigation does not fix the underlying Alice/Bob E2E failure and does not establish successful message delivery.

**Remaining unknowns:** exact command that stalled in run `45201616287`; root cause of the E2E failure; whether KVM hardware acceleration was actually active.


## 11. Live failure snapshot before emulator teardown (2026-11-23)

**Reason:** earlier CI failures showed that the post-action collector may run after the emulator action has already stopped the emulator. ADB then reports no device/offline and cannot preserve the connection-time evidence needed to distinguish client TLS/WSS failure from server-side authentication or readiness failure.

**Change:** `run-android-e2e.sh` now tracks the current stage and captures a bounded snapshot immediately when a required marker times out or a command exits non-zero. This runs inside the emulator action, before the action tears down the emulator.

**Snapshot:** `artifacts/emulator-diagnostics/e2e-live-failure.txt` contains:
- run ID/attempt, UTC timestamp, current E2E stage and failure marker/exit line;
- bounded ADB device state and selected Android boot properties;
- filtered JetsonPoC and network/TLS exception markers, excluding message bodies;
- filtered JuggleIM server and WSS proxy warning/error lines from the last ten minutes;
- basic redaction for token/authorization/secret/password assignments.

The existing post-job collector remains in place for runner/KVM/AVD information and uploads the same diagnostics directory. Both files should be present when the live script ran and failed; a boot failure before script invocation will only produce post-job diagnostics.

**Safety boundary:** this is a test-only diagnostic artifact with three-day retention. Do not add full environment dumps, raw tokens, AppSecret, message bodies, or unrestricted application/server logs. Filtered logs can still contain operational identifiers; treat the artifact as sensitive.

**Acceptance checks:** verify shell syntax; run the E2E workflow; on a deliberately failing or naturally failing client-connect stage, confirm the live snapshot exists and contains the stage plus available Android/server error markers. A successful run should not create a failure snapshot. Do not infer the root cause from the presence of a generic warning; correlate timestamps and client/server evidence.

**Current status:** code committed; fresh CI verification pending. This diagnostic change does not itself fix TLS, WSS, authentication, or SDK connectivity and does not weaken the required Bob receive assertion.
