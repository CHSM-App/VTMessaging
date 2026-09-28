-- API keys: only a SHA-256 hash of the full key is stored. key_prefix is the public lookup part.
CREATE TABLE dbo.api_keys (
    id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_api_keys_id DEFAULT NEWSEQUENTIALID(),
    project_id    UNIQUEIDENTIFIER NOT NULL,
    name          NVARCHAR(100)    NOT NULL,
    key_prefix    VARCHAR(20)      NOT NULL,
    key_hash      CHAR(64)         NOT NULL,
    status        VARCHAR(20)      NOT NULL CONSTRAINT DF_api_keys_status DEFAULT 'ACTIVE',
    expires_at    DATETIME2(3)     NULL,
    last_used_at  DATETIME2(3)     NULL,
    created_at    DATETIME2(3)     NOT NULL CONSTRAINT DF_api_keys_created DEFAULT SYSUTCDATETIME(),
    revoked_at    DATETIME2(3)     NULL,
    CONSTRAINT PK_api_keys PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_api_keys_prefix UNIQUE (key_prefix),
    CONSTRAINT CK_api_keys_status CHECK (status IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT FK_api_keys_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id)
);
GO

CREATE INDEX IX_api_keys_project ON dbo.api_keys (project_id);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.api_keys;
