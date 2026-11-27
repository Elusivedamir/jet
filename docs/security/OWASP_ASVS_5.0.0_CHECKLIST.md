# Jetson security verification checklist — OWASP ASVS 5.0.0

**Reference standard:** OWASP Application Security Verification Standard 5.0.0 (stable).  
**Official source:** https://github.com/OWASP/ASVS/tree/v5.0.0_release  
**License:** CC BY-SA 4.0. This file is a Jetson-specific tracking checklist, not a reproduction of the standard.

## How to use

For each feature/PR, select the applicable ASVS requirement IDs from the official v5.0.0 standard. Do not mark a requirement verified from code inspection alone when runtime or deployment evidence is required. Add exact test/report links and reviewer/date. Use `N/A` only with a reason.

Status values: `OPEN`, `IN PROGRESS`, `VERIFIED`, `NOT APPLICABLE`, `BLOCKED`.

## Jetson control areas

| ASVS area | Jetson-specific questions / evidence expected | Status |
|---|---|---|
| V1 Architecture, design and threat modeling | Are assets, trust boundaries, abuse cases, data flows and security assumptions documented? Are security decisions linked to ADRs? | OPEN |
| V2 Authentication | Are registration, login, credential recovery, MFA policy and authentication errors resistant to account takeover and enumeration? | OPEN |
| V3 Session management | Are sessions/device tokens rotated, revoked, expired and protected against replay? | OPEN |
| V4 Access control | Are authorization checks server-side and deny-by-default? Are direct-message, group, channel, CRM and campaign resources tenant-/membership-scoped? | OPEN |
| V5 Validation, sanitization and encoding | Are all untrusted inputs validated at boundaries? Are output contexts encoded and injection paths tested? | OPEN |
| V6 Stored cryptography | Are approved algorithms/libraries and key lifecycle documented? Is cryptography never invented or improvised? | OPEN |
| V7 Error handling and logging | Are errors non-revealing? Are logs privacy-safe, redacted, access-controlled and useful for incident response? | OPEN |
| V8 Data protection | Are personal data minimized, encrypted where appropriate, retained/deleted according to policy, and protected in backups/exports? | OPEN |
| V9 Communications | Are TLS, certificate validation, transport security and service-to-service trust correctly configured? | OPEN |
| V10 Malicious code | Are uploads, attachments, previews, links and user-generated content handled safely? | OPEN |
| V11 Business logic | Are trial, subscription, campaign, consent, unsubscribe, suppression, rate-limit and billing state transitions enforced atomically? | OPEN |
| V12 Files and resources | Are attachment type/size limits, storage permissions, download authorization and malware handling defined? | OPEN |
| V13 API and web service | Are authentication, authorization, schema validation, pagination, rate limits, idempotency and abuse protections enforced on every endpoint? | OPEN |
| V14 Configuration | Are defaults secure, secrets externalized, debug endpoints disabled, permissions minimized and deployment configuration reviewed? | OPEN |
| V15 Secure coding and architecture | Are dependency boundaries, code review, static analysis, tests and secure coding practices applied consistently? | OPEN |
| V16 Security logging and monitoring | Are security events observable without collecting message contents or unnecessary personal data? Are alerts and retention defined? | OPEN |
| V17 WebRTC / communication-specific areas, where applicable | If real-time media is introduced, are signaling, authorization, TURN credentials and abuse controls reviewed? | NOT APPLICABLE until such features exist |

## Per-PR evidence record

Copy this block into the PR or security review report and fill it in:

- Commit SHA:
- Feature / threat boundary:
- Applicable ASVS IDs:
- Test evidence:
- Static-analysis / dependency evidence:
- Manual reviewer:
- Findings and dispositions:
- Unverified / blocked requirements:
- Residual risk owner:
- Date:

## Release gate

A release cannot be labelled ASVS-verified unless the exact applicable requirement IDs, test evidence, deployment evidence and unresolved exceptions have been reviewed. This checklist alone does not establish ASVS compliance or certification.
