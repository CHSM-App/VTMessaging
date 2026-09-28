-- Outbound normalized events delivered to project webhook URLs.
CREATE TABLE dbo.webhook_deliveries (
    id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_webhook_deliveries_id DEFAULT NEWSEQUENTIALID(),
    project_id       UNIQUEIDENTIFIER NOT NULL,
    event_type       VARCHAR(50)      NOT NULL,
    payload          NVARCHAR(MAX)    NOT NULL,
    target_url       NVARCHAR(2048)   NOT NULL,
    status           VARCHAR(20)      NOT NULL CONSTRAINT DF_webhook_deliveries_status DEFAULT 'PENDING',
    attempts         INT              NOT NULL CONSTRAINT DF_webhook_deliveries_attempts DEFAULT 0,
    last_attempt_at  DATETIME2(3)     NULL,
    delivered_at     DATETIME2(3)     NULL,
    failure_reason   NVARCHAR(1000)   NULL,
    created_at       DATETIME2(3)     NOT NULL CONSTRAINT DF_webhook_deliveries_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_webhook_deliveries PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_webhook_deliveries_status CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED')),
    CONSTRAINT CK_webhook_deliveries_payload_json CHECK (ISJSON(payload) = 1),
    CONSTRAINT FK_webhook_deliveries_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id)
);
GO

CREATE INDEX IX_webhook_deliveries_project_created ON dbo.webhook_deliveries (project_id, created_at DESC);
CREATE INDEX IX_webhook_deliveries_created ON dbo.webhook_deliveries (created_at DESC);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.webhook_deliveries;
