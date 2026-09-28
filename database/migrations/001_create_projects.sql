-- Projects: Vengurla Tech applications that consume the messaging platform.
CREATE TABLE dbo.projects (
    id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_projects_id DEFAULT NEWSEQUENTIALID(),
    name                NVARCHAR(150)    NOT NULL,
    slug                VARCHAR(100)     NOT NULL,
    description         NVARCHAR(1000)   NULL,
    status              VARCHAR(20)      NOT NULL CONSTRAINT DF_projects_status DEFAULT 'ACTIVE',
    -- Project webhook (normalized message events). Secret is AES-256-GCM encrypted by the backend.
    webhook_url         NVARCHAR(2048)   NULL,
    webhook_secret_enc  VARCHAR(512)     NULL,
    created_at          DATETIME2(3)     NOT NULL CONSTRAINT DF_projects_created DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2(3)     NOT NULL CONSTRAINT DF_projects_updated DEFAULT SYSUTCDATETIME(),
    deleted_at          DATETIME2(3)     NULL,
    CONSTRAINT PK_projects PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_projects_slug UNIQUE (slug),
    CONSTRAINT CK_projects_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.projects;
