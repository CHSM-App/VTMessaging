-- Meta message templates. Meta is the approval authority: status only becomes APPROVED from Meta.
-- instance_id = the Meta instance (WABA) the template was submitted through.
CREATE TABLE dbo.templates (
    id                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_templates_id DEFAULT NEWSEQUENTIALID(),
    project_id            UNIQUEIDENTIFIER NOT NULL,
    instance_id           UNIQUEIDENTIFIER NULL,
    provider              VARCHAR(20)      NOT NULL CONSTRAINT DF_templates_provider DEFAULT 'META_CLOUD',
    name                  VARCHAR(512)     NOT NULL,
    category              VARCHAR(20)      NOT NULL,
    language              VARCHAR(15)      NOT NULL,
    header                NVARCHAR(60)     NULL,
    body                  NVARCHAR(1024)   NOT NULL,
    footer                NVARCHAR(60)     NULL,
    variables             NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_templates_variables DEFAULT N'[]',
    buttons               NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_templates_buttons DEFAULT N'[]',
    provider_template_id  VARCHAR(100)     NULL,
    status                VARCHAR(20)      NOT NULL CONSTRAINT DF_templates_status DEFAULT 'DRAFT',
    rejection_reason      NVARCHAR(1000)   NULL,
    created_at            DATETIME2(3)     NOT NULL CONSTRAINT DF_templates_created DEFAULT SYSUTCDATETIME(),
    updated_at            DATETIME2(3)     NOT NULL CONSTRAINT DF_templates_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_templates PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_templates_project_name_lang UNIQUE (project_id, name, language),
    CONSTRAINT CK_templates_provider CHECK (provider IN ('META_CLOUD')),
    CONSTRAINT CK_templates_category CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    CONSTRAINT CK_templates_status CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
    CONSTRAINT CK_templates_variables_json CHECK (ISJSON(variables) = 1),
    CONSTRAINT CK_templates_buttons_json CHECK (ISJSON(buttons) = 1),
    CONSTRAINT FK_templates_project FOREIGN KEY (project_id) REFERENCES dbo.projects(id),
    CONSTRAINT FK_templates_instance FOREIGN KEY (instance_id) REFERENCES dbo.whatsapp_instances(id)
);
GO

CREATE INDEX IX_templates_instance ON dbo.templates (instance_id) WHERE instance_id IS NOT NULL;
GO

ALTER TABLE dbo.messages
    ADD CONSTRAINT FK_messages_template FOREIGN KEY (template_id) REFERENCES dbo.templates(id);
GO

CREATE INDEX IX_messages_template ON dbo.messages (template_id) WHERE template_id IS NOT NULL;
GO

-- ==== DOWN ====
DROP INDEX IF EXISTS IX_messages_template ON dbo.messages;
ALTER TABLE dbo.messages DROP CONSTRAINT IF EXISTS FK_messages_template;
DROP TABLE IF EXISTS dbo.templates;
