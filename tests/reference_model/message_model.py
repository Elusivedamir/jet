"""In-memory reference model; not production storage or a Jetson stack choice."""
from dataclasses import dataclass, field
from threading import RLock
from typing import Dict, List, Tuple


class Rejected(Exception): pass
class IdempotencyConflict(Rejected): pass
class UnknownOutcome(Exception): pass
class SimulatedCrash(Exception): pass


@dataclass(frozen=True)
class Message:
    message_id: str
    operation_key: str
    sender_id: str
    conversation_id: str
    payload: str
    position: int


@dataclass
class Delivery:
    message_id: str
    recipient_id: str
    state: str = "pending"
    attempts: int = 0


@dataclass
class Conversation:
    members: Tuple[str, ...]
    next_position: int = 1


@dataclass
class Store:
    """A real adapter must provide equivalent atomic commit semantics."""
    conversations: Dict[str, Conversation] = field(default_factory=dict)
    messages: Dict[str, Message] = field(default_factory=dict)
    idempotency: Dict[Tuple[str, str], Tuple[str, str]] = field(default_factory=dict)
    deliveries: Dict[Tuple[str, str], Delivery] = field(default_factory=dict)
    lock: RLock = field(default_factory=RLock, repr=False)


class FakeDevice:
    """Simulates client-side deduplication by stable message ID."""
    def __init__(self):
        self.visible_message_ids: List[str] = []
        self._seen = set()

    def receive(self, message: Message):
        if message.message_id not in self._seen:
            self._seen.add(message.message_id)
            self.visible_message_ids.append(message.message_id)


class MessageService:
    def __init__(self, store: Store):
        self.store = store

    def create_conversation(self, conversation_id: str, members: Tuple[str, ...]):
        if len(set(members)) != len(members) or len(members) < 2:
            raise ValueError("conversation requires at least two unique members")
        with self.store.lock:
            if conversation_id in self.store.conversations:
                raise ValueError("conversation already exists")
            self.store.conversations[conversation_id] = Conversation(tuple(members))

    def send(self, sender_id: str, conversation_id: str, operation_key: str,
             payload: str, *, fail_before_commit=False, lose_response_after_commit=False):
        if not operation_key or not payload:
            raise Rejected("operation key and payload are required")
        with self.store.lock:
            conversation = self.store.conversations.get(conversation_id)
            if conversation is None or sender_id not in conversation.members:
                raise Rejected("sender is not a conversation member")
            key = (sender_id, operation_key)
            previous = self.store.idempotency.get(key)
            if previous:
                old_payload, old_id = previous
                old_message = self.store.messages[old_id]
                if old_payload != payload:
                    raise IdempotencyConflict("operation key reused with different payload")
                if old_message.conversation_id != conversation_id:
                    raise IdempotencyConflict("operation key reused in a different conversation")
                return old_message
            if fail_before_commit:
                raise Rejected("simulated durable transaction failure")

            position = conversation.next_position
            message_id = f"msg:{conversation_id}:{position}"
            message = Message(message_id, operation_key, sender_id,
                              conversation_id, payload, position)
            deliveries = {
                (message_id, member): Delivery(message_id, member)
                for member in conversation.members if member != sender_id
            }

            # One atomic durable boundary: message + idempotency + delivery intent + sequence.
            self.store.messages[message_id] = message
            self.store.idempotency[key] = (payload, message_id)
            self.store.deliveries.update(deliveries)
            conversation.next_position += 1
            if lose_response_after_commit:
                raise UnknownOutcome("committed; response was lost")
            return message

    def sync(self, account_id: str, conversation_id: str, after_position=0, limit=100):
        with self.store.lock:
            conversation = self.store.conversations.get(conversation_id)
            if conversation is None or account_id not in conversation.members:
                raise Rejected("account is not a conversation member")
            ordered = sorted(
                (m for m in self.store.messages.values()
                 if m.conversation_id == conversation_id and m.position > after_position),
                key=lambda m: m.position,
            )
            page = ordered[:limit]
            cursor = page[-1].position if page else after_position
            return page, cursor

    def dispatch_one(self, message_id: str, recipient_id: str, device: FakeDevice,
                     *, crash_after_device_receive=False):
        key = (message_id, recipient_id)
        with self.store.lock:
            delivery = self.store.deliveries.get(key)
            message = self.store.messages.get(message_id)
            if delivery is None or message is None:
                raise Rejected("unknown delivery")
            if delivery.state == "completed":
                return
            delivery.state = "processing"
            delivery.attempts += 1
        device.receive(message)  # external side effect, outside durable transaction
        if crash_after_device_receive:
            raise SimulatedCrash("device received; completion was not recorded")
        with self.store.lock:
            self.store.deliveries[key].state = "completed"

    def delivery_state(self, message_id: str, recipient_id: str):
        with self.store.lock:
            return self.store.deliveries[(message_id, recipient_id)].state


def apply_page_to_client(existing_ids: List[str], page: List[Message]) -> List[str]:
    seen = set(existing_ids)
    result = list(existing_ids)
    for message in page:
        if message.message_id not in seen:
            result.append(message.message_id)
            seen.add(message.message_id)
    return result
