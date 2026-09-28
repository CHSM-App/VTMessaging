-- Append-only audit trail. BIGINT identity keeps the clustered key narrow and ever-increasing.
-- SQL Express has a 10 GB database cap: archive old rows before this table grows unbounded.
CREATE TABLE dbo.audit_logs (
    id             BIGINT IDENTITY(1,1) NOT NULL,
    actor_type     VARCHAR(20)      NOT NULL,
    actor_id       VARCHAR(100)     NULL,
    action         VARCHAR(100)     NOT NULL,
    resource_type  VARCHAR(50)      NOT NULL,
    resource_id    VARCHAR(100)     NULL,
    metadata       NVARCHAR(MAX)    NULL,
    created_at     DATETIME2(3)     NOT NULL CONSTRAINT DF_audit_logs_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_audit_logs PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_audit_logs_actor_type CHECK (actor_type IN ('ADMIN', 'PROJECT', 'SYSTEM')),
    CONSTRAINT CK_audit_logs_metadata_json CHECK (metadata IS NULL OR ISJSON(metadata) = 1)
);
GO

CREATE INDEX IX_audit_logs_created ON dbo.audit_logs (created_at DESC);
CREATE INDEX IX_audit_logs_resource ON dbo.audit_logs (resource_type, resource_id);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.audit_logs;
