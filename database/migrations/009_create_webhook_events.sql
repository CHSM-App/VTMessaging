-- Raw inbound provider webhook events (stored first, processed asynchronously by the worker).
CREATE TABLE dbo.webhook_events (
    id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_webhook_events_id DEFAULT NEWSEQUENTIALID(),
    provider           VARCHAR(20)      NOT NULL,
    event_type         VARCHAR(50)      NOT NULL,
    external_event_id  VARCHAR(300)     NULL,
    payload            NVARCHAR(MAX)    NOT NULL,
    processed          BIT              NOT NULL CONSTRAINT DF_webhook_events_processed DEFAULT 0,
    processed_at       DATETIME2(3)     NULL,
    error              NVARCHAR(1000)   NULL,
    created_at         DATETIME2(3)     NOT NULL CONSTRAINT DF_webhook_events_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_webhook_events PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_webhook_events_payload_json CHECK (ISJSON(payload) = 1)
);
GO

-- Providers redeliver webhooks; dedupe on the provider's own event identity when it has one.
CREATE UNIQUE INDEX UX_webhook_events_provider_external
    ON dbo.webhook_events (provider, external_event_id)
    WHERE external_event_id IS NOT NULL;
CREATE INDEX IX_webhook_events_created ON dbo.webhook_events (created_at DESC);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.webhook_events;
