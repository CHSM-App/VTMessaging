-- Every provider attempt for a message is recorded (priority, fallback, retries).
CREATE TABLE dbo.message_attempts (
    id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_message_attempts_id DEFAULT NEWSEQUENTIALID(),
    message_id           UNIQUEIDENTIFIER NOT NULL,
    instance_id          UNIQUEIDENTIFIER NOT NULL,
    provider             VARCHAR(20)      NOT NULL,
    attempt_number       INT              NOT NULL,
    status               VARCHAR(20)      NOT NULL CONSTRAINT DF_message_attempts_status DEFAULT 'STARTED',
    provider_message_id  VARCHAR(200)     NULL,
    error_code           VARCHAR(60)      NULL,
    error_message        NVARCHAR(1000)   NULL,
    started_at           DATETIME2(3)     NOT NULL CONSTRAINT DF_message_attempts_started DEFAULT SYSUTCDATETIME(),
    completed_at         DATETIME2(3)     NULL,
    created_at           DATETIME2(3)     NOT NULL CONSTRAINT DF_message_attempts_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_message_attempts PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_message_attempts_number UNIQUE (message_id, attempt_number),
    CONSTRAINT CK_message_attempts_provider CHECK (provider IN ('BAILEYS', 'META_CLOUD')),
    CONSTRAINT CK_message_attempts_status CHECK (status IN ('STARTED', 'SENT', 'FAILED', 'UNKNOWN')),
    CONSTRAINT FK_message_attempts_message FOREIGN KEY (message_id) REFERENCES dbo.messages(id),
    CONSTRAINT FK_message_attempts_instance FOREIGN KEY (instance_id) REFERENCES dbo.whatsapp_instances(id)
);
GO

-- message_id is covered by UQ_message_attempts_number (leading column).
CREATE INDEX IX_message_attempts_instance ON dbo.message_attempts (instance_id);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.message_attempts;
