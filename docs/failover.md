# Failover

Company policy: **Baileys is the priority** (no per-message charges) and **Meta Cloud API is the fallback**. This is not hard-coded anywhere. Each project's WhatsApp Service row (`project_whatsapp_services`) names a priority instance and an optional fallback instance, and the worker follows it.

```text
Priority → health → safe fallback → UNKNOWN state → recovery to priority
```

## 1. Priority

Every send attempt starts with the project's priority instance, including retries. Rules, enforced in `whatsapp-service/domain/serviceRules.ts` and by a DB check constraint:

- the priority instance must be assigned to the project
- the fallback is optional, but must also be assigned to the project
- priority and fallback cannot be the same instance
- a disabled assignment (`is_enabled = 0`) or a deleted instance drops out of the route

## 2. Health

Instances report `HEALTHY` / `DEGRADED` / `UNAVAILABLE`:

- **Baileys:** connected with fewer than 3 consecutive send failures = HEALTHY; connecting/reconnecting or repeated failures = DEGRADED; disconnected/logged out = UNAVAILABLE. Tracked details: connection state, reconnect attempts, last success, last disconnect reason.
- **Meta:** READY with fewer than 3 consecutive failures = HEALTHY; otherwise DEGRADED/UNAVAILABLE. Credentials and registration are re-validated every 15 minutes.

**Health never changes the route or the priority.** A disconnected Baileys instance fails fast with `PROVIDER_NOT_CONNECTED` (definitely not sent), so the fallback is used for that message. The next message tries Baileys first again.

## 3. Safe fallback

Every provider failure is normalized (`providers/whatsapp/contracts/errors.ts`):

| Code | sendState | Retry later | Try fallback |
|---|---|---|---|
| PROVIDER_NOT_CONNECTED | NOT_SENT | yes | yes |
| PROVIDER_NOT_READY (Meta not READY) | NOT_SENT | no | yes |
| PROVIDER_UNAVAILABLE, NETWORK_ERROR (before sending) | NOT_SENT | yes | yes |
| RATE_LIMITED | NOT_SENT | yes | yes |
| AUTH_FAILED, INVALID_CREDENTIALS | NOT_SENT | no | yes |
| INVALID_TEMPLATE, TEMPLATE_NOT_APPROVED | NOT_SENT | no | yes |
| MEDIA_UNAVAILABLE | NOT_SENT | if 5xx/network | yes |
| INVALID_RECIPIENT (not on WhatsApp) | NOT_SENT | no | **no**: the message itself is bad |
| INVALID_REQUEST | NOT_SENT | no | no (Meta 4xx: yes) |
| SEND_TIMEOUT, SEND_OUTCOME_UNKNOWN | **UNKNOWN** | **no** | **no** |

- The fallback is tried only when the priority failure is **NOT_SENT** and `fallbackAllowed`.
- If all instances failed and at least one failure was temporary, the job is retried with backoff. Otherwise the message is `FAILED`.

How providers decide NOT_SENT vs UNKNOWN:

- **Baileys:** "not connected", media download failure, and recipient lookup (`onWhatsApp`) failure all happen before anything is sent, so they are NOT_SENT. Once `sendMessage` has been called, **any** error or timeout is UNKNOWN.
- **Meta:** connection refused or DNS failure is NOT_SENT. A timeout, a dropped connection mid-request, or an unexplained 5xx on send is UNKNOWN. Meta's documented 4xx error codes are NOT_SENT.
- Any unexpected exception from provider code is treated as UNKNOWN. That is the safe default.

## 4. UNKNOWN state

```text
Baileys timeout after the request may have been accepted
→ attempt UNKNOWN, message UNKNOWN
→ Meta is NOT tried, the job is NOT retried
```

An UNKNOWN message is resolved by:

1. **A late receipt:** the provider message id was fixed before sending (Baileys: derived from the attempt id; Meta: returned id), so a later `SENT`/`DELIVERED`/`READ` receipt moves the message forward and marks the attempt `SENT`.
2. **An operator:** Messages › open › Retry, with an explicit "may duplicate" confirmation.

A worker crash between "handed to provider" and "recorded result" leaves the message in `SENDING`. The next run marks it UNKNOWN instead of sending again.

## 5. Recovery to priority

Nothing is sticky. Each message, and each retry of a message, starts from the priority instance. When Baileys reconnects, new messages go through Baileys again, and messages waiting for retry also try Baileys first on their next attempt.

The whole policy is unit-tested with fake providers in `backend/tests/unit/processMessage.test.ts` (fallback on NOT_SENT, no fallback on UNKNOWN, no fallback on a bad recipient, retry, final failure, return to priority, crash recovery, idempotent skips).
