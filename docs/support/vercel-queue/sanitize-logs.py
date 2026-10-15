"""Export only Queue protocol facts from Vercel CLI JSONL logs.

Usage: python3 sanitize-logs.py RAW.jsonl SAFE.jsonl [messageId ...]
Raw logs must remain outside the support attachment directory.
"""
import json
import re
import sys
from pathlib import Path

source, target, *message_ids = sys.argv[1:]
rows = [json.loads(line) for line in Path(source).read_text().splitlines() if line.strip()]
logs = [row["data"] for row in rows if row.get("type") == "log"]
allowed = set(message_ids)
requests = {row.get("requestId") for row in logs if any(mid in row.get("message", "") for mid in allowed)}
metadata = ["timestamp", "deploymentId", "requestId", "region", "traceId", "spanId", "level", "truncated"]
fields = {
    "ts", "event", "messageId", "deliveryCount", "callbackType", "hasReceiptHandle",
    "visibilityRemainingSeconds", "deploymentId", "createdAt", "expiresAt", "topicName",
    "topic", "consumerGroup", "region", "processed", "skipped", "failures", "operation",
    "method", "deploymentIdHeader", "receiptMatchesCallback", "startedAt", "status",
    "serviceRequestId", "httpStatus", "reason", "errorName", "authEnvironment",
}
errors = {
    "Message is not currently in-flight": "Message is not currently in-flight",
    "Invalid destination delivery queue payload": "Intentional invalid payload",
    "Intentional first-delivery failure": "Intentional first-delivery failure",
    "MessageNotFoundError": "MessageNotFoundError",
    "skipped (not_available)": "Queue callback skipped (not_available)",
}
safe = []
for row in logs:
    if row.get("requestId") not in requests or "/destinations/queue" not in row.get("requestPath", ""):
        continue
    raw = row.get("message", "")
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        parsed = None
    entry = {k: row[k] for k in metadata if k in row}
    if isinstance(parsed, dict):
        event = parsed.get("event", "")
        if not (event.startswith("probe.") or event in {
            "destination_delivery.queue.callback", "destination_delivery.queue.received",
            "destination_delivery.queue.retry", "destination_delivery.queue.callback.error",
            "destination_delivery.tick",
        }):
            continue
        entry["data"] = {k: v for k, v in parsed.items() if k in fields}
        for pattern, label in errors.items():
            if pattern in str(parsed.get("error", "")):
                entry["data"]["errorClass"] = label
                break
    else:
        label = next((label for pattern, label in errors.items() if pattern in raw), None)
        if label is None:
            continue
        entry["data"] = {"event": "sdk.log", "classification": label}
        match = re.search(r"Message ([A-Za-z0-9-]+) not found", raw)
        if match and match.group(1) in allowed:
            entry["data"]["messageId"] = match.group(1)
    safe.append(entry)
safe.sort(key=lambda row: row["data"].get("ts", row["timestamp"]))
Path(target).write_text("".join(json.dumps(row, separators=(",", ":")) + "\n" for row in safe))
print(f"Exported {len(safe)} allowlisted records.")
