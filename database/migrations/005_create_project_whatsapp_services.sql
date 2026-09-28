-- Project-level WhatsApp Service: priority instance + optional fallback.
-- "Both instances must be assigned to the project" is validated in the application layer.
CREATE TABLE dbo.project_whatsapp_services (
    id                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pws_id DEFAULT NEWSEQUENTIALID(),
    project_id            UNIQUEIDENTIFIER NOT NULL,
    priority_instance_id  UNIQUEIDENTIFIER NOT NULL,
    fallback_instance_id  UNIQUEIDENTIFIER NULL,
    created_at            DATETIME2(3)     NOT NULL CONSTRAINT DF_pws_created DEFAULT SYSUTCDATETIME(),
    updated_at            DATETIME2(3)     NOT NULL CONSTRAINT DF_pws_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_project_whatsapp_services PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_pws_project UNIQUE (project_id),
    CONSTRAINT CK_pws_distinct CHECK (fallback_instance_id IS NULL OR fallback_instance_id <> priority_instance_id),
    CONSTRAINT FK_pws_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_pws_priority FOREIGN KEY (priority_instance_id) REFERENCES dbo.whatsapp_instances(id),
    CONSTRAINT FK_pws_fallback FOREIGN KEY (fallback_instance_id) REFERENCES dbo.whatsapp_instances(id)
);
GO

CREATE INDEX IX_pws_priority ON dbo.project_whatsapp_services (priority_instance_id);
CREATE INDEX IX_pws_fallback ON dbo.project_whatsapp_services (fallback_instance_id) WHERE fallback_instance_id IS NOT NULL;
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.project_whatsapp_services;
