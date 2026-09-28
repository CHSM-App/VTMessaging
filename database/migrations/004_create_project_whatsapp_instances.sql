-- Many-to-many: one instance can serve many projects, a project can use many instances.
CREATE TABLE dbo.project_whatsapp_instances (
    id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pwi_id DEFAULT NEWSEQUENTIALID(),
    project_id   UNIQUEIDENTIFIER NOT NULL,
    instance_id  UNIQUEIDENTIFIER NOT NULL,
    is_enabled   BIT              NOT NULL CONSTRAINT DF_pwi_enabled DEFAULT 1,
    created_at   DATETIME2(3)     NOT NULL CONSTRAINT DF_pwi_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_project_whatsapp_instances PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_pwi_project_instance UNIQUE (project_id, instance_id),
    CONSTRAINT FK_pwi_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_pwi_instance FOREIGN KEY (instance_id) REFERENCES dbo.whatsapp_instances(id)
);
GO

-- project_id is covered by the unique constraint; instance_id needs its own index (reverse lookup + FK).
CREATE INDEX IX_pwi_instance ON dbo.project_whatsapp_instances (instance_id);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.project_whatsapp_instances;
