"""Implementation-neutral outbox dispatch reference model.

Logical timestamps make lease and retry boundaries deterministic. This is a
contract oracle, not production queue code.
"""


class OutboxError(Exception):
    pass


class OutboxConflict(OutboxError):
    pass


class StaleClaim(OutboxError):
    pass


def exponential_backoff_seconds(attempt, base_seconds=2, max_seconds=300):
    if attempt < 1 or base_seconds < 1 or max_seconds < 1:
        raise ValueError("attempt, base and cap must be positive")
    return min(base_seconds * (2 ** (attempt - 1)), max_seconds)


class OutboxReferenceModel:
    def __init__(self, max_attempts=5, base_seconds=2, max_delay_seconds=300):
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        self.max_attempts = max_attempts
        self.base_seconds = base_seconds
        self.max_delay_seconds = max_delay_seconds
        self._items = {}

    def enqueue(self, message_id, conversation_id, position, recipient_id):
        if not all((message_id, conversation_id, recipient_id)) or position < 1:
            raise ValueError("message, conversation, recipient and positive position are required")
        key = (message_id, recipient_id)
        metadata = (conversation_id, position)
        existing = self._items.get(key)
        if existing is not None:
            if (existing["conversation_id"], existing["position"]) != metadata:
                raise OutboxConflict("outbox identity reused with conflicting metadata")
            return False
        self._items[key] = {
            "message_id": message_id,
            "conversation_id": conversation_id,
            "position": position,
            "recipient_id": recipient_id,
            "state": "pending",
            "attempts": 0,
            "next_attempt_at": 0,
            "lease_token": None,
            "lease_owner": None,
            "lease_until": None,
            "dispatched_at": None,
            "dead_letter_at": None,
            "last_error": None,
        }
        return True

    def claim_next(self, worker_id, claim_token, now, lease_seconds):
        if not worker_id or not claim_token or lease_seconds <= 0 or now < 0:
            raise ValueError("worker, token, non-negative time and positive lease are required")

        for item in self._items.values():
            if (item["state"] == "leased" and item["lease_until"] <= now
                    and item["attempts"] >= self.max_attempts):
                self._dead_letter(item, now, item["last_error"] or "lease expired after final attempt")

        candidates = []
        for item in self._items.values():
            pending_due = item["state"] == "pending" and item["next_attempt_at"] <= now
            lease_expired = item["state"] == "leased" and item["lease_until"] <= now
            if item["state"] == "dead_letter" or item["state"] == "dispatched":
                continue
            if item["attempts"] >= self.max_attempts or not (pending_due or lease_expired):
                continue
            blocked = any(
                prior["recipient_id"] == item["recipient_id"]
                and prior["conversation_id"] == item["conversation_id"]
                and prior["position"] < item["position"]
                and prior["state"] != "dispatched"
                for prior in self._items.values()
            )
            if not blocked:
                candidates.append(item)

        if not candidates:
            return None
        item = min(
            candidates,
            key=lambda row: (row["conversation_id"], row["position"], row["recipient_id"]),
        )
        item["state"] = "leased"
        item["attempts"] += 1
        item["lease_token"] = claim_token
        item["lease_owner"] = worker_id
        item["lease_until"] = now + lease_seconds
        item["dispatched_at"] = None
        claim = self._copy(item)
        claim["claim_token"] = item["lease_token"]
        return claim

    def acknowledge_dispatch(self, message_id, recipient_id, claim_token, now):
        item = self._get(message_id, recipient_id)
        if (item["state"] != "leased" or item["lease_token"] != claim_token
                or item["lease_until"] <= now):
            raise StaleClaim("claim is stale, unknown, expired or already completed")
        item["state"] = "dispatched"
        item["dispatched_at"] = now
        item["lease_token"] = None
        item["lease_owner"] = None
        item["lease_until"] = None
        item["last_error"] = None

    def release_claim(self, message_id, recipient_id, claim_token, *,
                      failed_at, retry_at, error=None):
        if failed_at < 0 or retry_at < failed_at:
            raise ValueError("failure time and retry time are invalid")
        item = self._get(message_id, recipient_id)
        if (item["state"] != "leased" or item["lease_token"] != claim_token
                or item["lease_until"] <= failed_at):
            raise StaleClaim("claim is stale, unknown or expired")
        item["lease_token"] = None
        item["lease_owner"] = None
        item["lease_until"] = None
        item["last_error"] = error
        if item["attempts"] >= self.max_attempts:
            self._dead_letter(item, failed_at, error or "retry limit reached")
            return "dead_letter"
        item["state"] = "pending"
        item["next_attempt_at"] = retry_at
        return "pending"

    def retry_time_for_attempt(self, attempt, failed_at):
        return failed_at + exponential_backoff_seconds(
            attempt, self.base_seconds, self.max_delay_seconds
        )

    def snapshot(self):
        return [self._copy(item) for item in sorted(
            self._items.values(),
            key=lambda row: (row["conversation_id"], row["position"], row["recipient_id"]),
        )]

    def _get(self, message_id, recipient_id):
        try:
            return self._items[(message_id, recipient_id)]
        except KeyError as exc:
            raise StaleClaim("unknown outbox item") from exc

    @staticmethod
    def _dead_letter(item, at, error):
        item["state"] = "dead_letter"
        item["dead_letter_at"] = at
        item["last_error"] = error
        item["lease_token"] = None
        item["lease_owner"] = None
        item["lease_until"] = None

    @staticmethod
    def _copy(item):
        return dict(item)
