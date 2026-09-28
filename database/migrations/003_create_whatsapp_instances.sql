-- WhatsApp instances: one number + one provider connection. Shared by projects via
-- project_whatsapp_instances (no project_id here on purpose).
-- provider_config is JSON; secrets inside it (e.g. Meta access token) are encrypted by the backend.
-- Baileys session/auth data is NOT stored here; it lives on disk under BAILEYS_AUTH_DIR.
CREATE TABLE dbo.whatsapp_instances (
    id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_whatsapp_instances_id DEFAULT NEWSEQUENTIALID(),
    name              NVARCHAR(150)    NOT NULL,
    provider          VARCHAR(20)      NOT NULL,
    phone_number      VARCHAR(20)      NULL,
    status            VARCHAR(40)      NOT NULL,
    status_detail     NVARCHAR(500)    NULL,
    health_status     VARCHAR(20)      NOT NULL CONSTRAINT DF_whatsapp_instances_health DEFAULT 'UNAVAILABLE',
    provider_config   NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_whatsapp_instances_config DEFAULT N'{}',
    last_activity_at  DATETIME2(3)     NULL,
    created_at        DATETIME2(3)     NOT NULL CONSTRAINT DF_whatsapp_instances_created DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(3)     NOT NULL CONSTRAINT DF_whatsapp_instances_updated DEFAULT SYSUTCDATETIME(),
    deleted_at        DATETIME2(3)     NULL,
    CONSTRAINT PK_whatsapp_instances PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_whatsapp_instances_provider CHECK (provider IN ('BAILEYS', 'META_CLOUD')),
    CONSTRAINT CK_whatsapp_instances_health CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE')),
    CONSTRAINT CK_whatsapp_instances_status CHECK (status IN (
        -- Baileys lifecycle
        'CREATING', 'WAITING_FOR_PAIRING', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'ERROR',
        -- Meta Cloud API lifecycle
        'CREATED', 'CONFIGURING', 'CREDENTIALS_VALID', 'PHONE_REGISTERED', 'WEBHOOK_VERIFIED', 'READY',
        'CONFIG_ERROR', 'AUTH_ERROR', 'PHONE_REGISTRATION_FAILED', 'WEBHOOK_ERROR'
    )),
    CONSTRAINT CK_whatsapp_instances_config_json CHECK (ISJSON(provider_config) = 1)
);
GO

CREATE INDEX IX_whatsapp_instances_provider ON dbo.whatsapp_instances (provider) WHERE deleted_at IS NULL;
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.whatsapp_instances;
