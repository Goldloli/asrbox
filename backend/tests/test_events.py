from __future__ import annotations

import asyncio

from backend.utils.events import EventBus, MAX_SUBSCRIBER_QUEUE_SIZE


async def _event_bus_filters_heartbeat_and_disconnect_cleanup() -> None:
    bus = EventBus()
    stream = bus.subscribe(task_id="task-1", event_type="task.updated", heartbeat_seconds=0.01)
    connected = await anext(stream)
    assert connected["event"] == "connected"
    assert bus.subscriber_count == 1

    bus.publish("task.updated", {"id": "other", "progress": 10})
    heartbeat = await anext(stream)
    assert heartbeat["event"] == "ping"

    bus.publish("task.updated", {"id": "task-1", "progress": 20})
    event = await anext(stream)
    assert event["event"] == "task.updated"
    assert "task-1" in event["data"]

    await stream.aclose()
    assert bus.subscriber_count == 0


def test_event_bus_filters_heartbeat_and_disconnect_cleanup() -> None:
    asyncio.run(_event_bus_filters_heartbeat_and_disconnect_cleanup())


def test_event_bus_drops_slow_subscriber_without_blocking() -> None:
    bus = EventBus()
    subscriber = __import__("queue").Queue(maxsize=MAX_SUBSCRIBER_QUEUE_SIZE)
    bus._subscribers.add(subscriber)
    for index in range(MAX_SUBSCRIBER_QUEUE_SIZE + 5):
        bus.publish("task.updated", {"id": f"task-{index}"})
    assert bus.dropped_events == 5
    assert subscriber.qsize() == MAX_SUBSCRIBER_QUEUE_SIZE
