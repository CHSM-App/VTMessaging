-- Provider-independent outbound messages. MSSQL is the source of truth; Redis only holds jobs.
CREATE TABLE dbo.messages (
    id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_messages_id DEFAULT NEWSEQUENTIALID(),
    project_id           UNIQUEIDENTIFIER NOT NULL,
    instance_id          UNIQUEIDENTIFIER NULL,   -- instance of the latest attempt
    recipient            VARCHAR(20)      NOT NULL,
    message_type         VARCHAR(20)      NOT NULL,
    content              NVARCHAR(MAX)    NOT NULL,
    template_id          UNIQUEIDENTIFIER NULL,   -- FK added in 008 once templates exists
    status               VARCHAR(20)      NOT NULL CONSTRAINT DF_messages_status DEFAULT 'CREATED',
    idempotency_key      NVARCHAR(200)    NULL,
    provider_message_id  VARCHAR(200)     NULL,
    failure_code         VARCHAR(60)      NULL,
    failure_reason       NVARCHAR(1000)   NULL,
    created_at           DATETIME2(3)     NOT NULL CONSTRAINT DF_messages_created DEFAULT SYSUTCDATETIME(),
    queued_at            DATETIME2(3)     NULL,
    processing_at        DATETIME2(3)     NULL,
    sent_at              DATETIME2(3)     NULL,
    delivered_at         DATETIME2(3)     NULL,
    read_at              DATETIME2(3)     NULL,
    failed_at            DATETIME2(3)     NULL,
    updated_at           DATETIME2(3)     NOT NULL CONSTRAINT DF_messages_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_messages PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_messages_type CHECK (message_type IN ('TEXT', 'IMAGE', 'DOCUMENT', 'TEMPLATE')),
    CONSTRAINT CK_messages_status CHECK (status IN (
        'CREATED', 'QUEUED', 'PROCESSING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN'
    )),
    CONSTRAINT CK_messages_content_json CHECK (ISJSON(content) = 1),
    CONSTRAINT FK_messages_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_messages_instance FOREIGN KEY (instance_id) REFERENCES dbo.whatsapp_instances(id)
);
GO

CREATE INDEX IX_messages_project_created ON dbo.messages (project_id, created_at DESC);
CREATE INDEX IX_messages_status_created ON dbo.messages (status, created_at);
CREATE INDEX IX_messages_created ON dbo.messages (created_at DESC);
CREATE INDEX IX_messages_instance ON dbo.messages (instance_id) WHERE instance_id IS NOT NULL;
CREATE INDEX IX_messages_provider_message_id ON dbo.messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Idempotency: one message per (project, key). Filtered so messages without a key don't collide.
CREATE UNIQUE INDEX UX_messages_project_idempotency
    ON dbo.messages (project_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.messages;
