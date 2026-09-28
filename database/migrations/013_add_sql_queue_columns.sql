-- RUN_MODE=single (no Redis): the tables themselves are the queue.
-- next_attempt_at = when a row may be picked up again (retry backoff, or a lease while being processed).
ALTER TABLE dbo.messages ADD
    next_attempt_at  DATETIME2(3) NULL,
    retry_count      INT          NOT NULL CONSTRAINT DF_messages_retry_count DEFAULT 0;
GO

ALTER TABLE dbo.webhook_events ADD next_attempt_at DATETIME2(3) NULL;
ALTER TABLE dbo.webhook_deliveries ADD next_attempt_at DATETIME2(3) NULL;
GO

-- Small filtered indexes: only unfinished rows, which is all the pollers ever read.
CREATE INDEX IX_messages_due ON dbo.messages (next_attempt_at)
    WHERE status IN ('CREATED', 'QUEUED', 'PROCESSING', 'SENDING');
CREATE INDEX IX_webhook_events_due ON dbo.webhook_events (next_attempt_at) WHERE processed = 0;
CREATE INDEX IX_webhook_deliveries_due ON dbo.webhook_deliveries (next_attempt_at) WHERE status = 'PENDING';
GO

-- ==== DOWN ====
DROP INDEX IF EXISTS IX_webhook_deliveries_due ON dbo.webhook_deliveries;
DROP INDEX IF EXISTS IX_webhook_events_due ON dbo.webhook_events;
DROP INDEX IF EXISTS IX_messages_due ON dbo.messages;
ALTER TABLE dbo.webhook_deliveries DROP COLUMN IF EXISTS next_attempt_at;
ALTER TABLE dbo.webhook_events DROP COLUMN IF EXISTS next_attempt_at;
ALTER TABLE dbo.messages DROP CONSTRAINT IF EXISTS DF_messages_retry_count;
ALTER TABLE dbo.messages DROP COLUMN IF EXISTS retry_count, next_attempt_at;
