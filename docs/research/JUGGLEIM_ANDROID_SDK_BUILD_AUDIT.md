# JuggleIM Android SDK — build and integration audit

Date: 2026-11-23  
Status: [ВЫВОД] static inspection of upstream repository files; no build or runtime execution performed.

## Sources inspected

Upstream repository: https://github.com/juggleim/imsdk-android  
Files inspected on the repository default branch:
- README.md
- settings.gradle
- build.gradle
- gradle/wrapper/gradle-wrapper.properties
- gradle.properties
- JuggleIM/build.gradle
- JetIMKit/build.gradle
- demo/build.gradle
- app/build.gradle

Relevant official references:
- Android SDK: https://github.com/juggleim/imsdk-android
- Android quick start: https://juggle.im/docs/client/quickstart/android/
- Android release notes: https://juggle.im/docs/client/release_note/android/

## Findings

1. **Documented SDK artifact version:** upstream README now documents `com.juggle.im:juggle:1.9.0` from `https://repo.juggle.im/repository/maven-releases/`. Earlier Jetson research recorded 1.8.39 from a prior inspection. Do not carry the old pin forward without checking the exact Maven artifact, release notes, and server compatibility.

2. **Build environment:** upstream README says JDK 17 and Android Studio/Android SDK are required. The repository wrapper points to Gradle 8.0. Root build configuration declares Android Gradle Plugin 8.0 in buildscript and 8.1.0 in the plugins block, and Kotlin plugin 2.0.21 alongside a separate kotlin_version 1.7.10. This mixed configuration must be resolved by a clean build; static inspection does not prove it fails or succeeds.

3. **Machine-specific path:** upstream `gradle.properties` hardcodes `org.gradle.java.home=/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home`. Do not copy this setting into Jetson. Use a portable toolchain/CI configuration.

4. **Demo signing configuration:** `demo/build.gradle` contains hardcoded sample signing values and references a local keystore file. Do not copy this signing configuration or keystore into Jetson. Jetson signing material must be generated and managed separately, outside source control, with release signing isolated from debug builds.

5. **Module API levels differ:** core `JuggleIM` module declares minSdk 19; `JetIMKit` declares minSdk 24; upstream `demo` declares minSdk 24; upstream `app` declares minSdk 26. The effective minimum for Jetson depends on the modules actually used. No Jetson minSdk decision is approved by this audit.

6. **UI Kit dependency concern:** `JetIMKit/build.gradle` includes `com.sendbird.sdk:sendbird-chat:4.16.0` in addition to the JuggleIM core project. This introduces a second messaging vendor dependency into the UI kit. Do not adopt JetIMKit in Jetson until its purpose, runtime dependency path, license obligations, data flows, and necessity are reviewed. Prefer evaluating the core JuggleIM SDK separately for the PoC.

7. **Optional integrations:** upstream demo includes push-vendor and RTC integrations (Firebase/Honor, Zego, Agora, LiveKit and related modules). These are not automatically required for Jetson's first Android messaging PoC. Add no optional vendor plugin unless a specific approved requirement needs it.

8. **Repository configuration:** upstream settings.gradle includes JitPack, Huawei/Honor, Sendbird, and Zego repositories. A Jetson implementation should add only repositories required by the chosen, pinned dependency graph; minimize external repository exposure and run dependency/SCA/license checks.

9. **Credential boundary:** upstream README explicitly says the user token should be issued by the application server and not hard-coded. Jetson must keep app secrets, secure keys, admin/server API credentials, signing keys, and reusable demo tokens out of the APK and repository. Client receives only the scoped user token, public AppKey, and WSS endpoint required by the SDK.

## Jetson implications

- Evaluate the core SDK artifact first; do not import the upstream demo app or JetIMKit by default.
- Pin the exact artifact version and checksums/lock state after verifying the Maven package and transitive dependencies.
- Use JDK 17 and a reproducible Android build toolchain; no machine-specific paths.
- Use separate debug/release signing, secrets outside Git, and CI-managed release signing.
- Determine the minimum supported Android API from actual target-user requirements and dependency compatibility; do not inherit the demo's minSdk by accident.
- Generate an SBOM and review licenses/vulnerabilities for the full dependency tree before accepting any SDK/UI kit.
- Confirm whether the SDK's 1.9.0 Maven artifact is compatible with the inspected server revision and token configuration in runtime tests.

## Verification status

- [x] Upstream README and Gradle configuration statically inspected.
- [x] SDK artifact version in README identified as 1.9.0.
- [x] Machine-specific JDK path and sample signing configuration identified.
- [x] JetIMKit Sendbird dependency identified.
- [ ] Clean Gradle build.
- [ ] APK inspection and secret scan.
- [ ] Runtime auth, messaging, reconnect, offline sync, multi-device and security tests.
- [ ] SBOM, vulnerability and license report.

No APK has been built. No runtime test has passed. JuggleIM remains unselected for production.
