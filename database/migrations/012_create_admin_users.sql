-- Dashboard users (separate from project API-key authentication).
CREATE TABLE dbo.admin_users (
    id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_admin_users_id DEFAULT NEWSEQUENTIALID(),
    email          VARCHAR(254)     NOT NULL,
    name           NVARCHAR(150)    NOT NULL,
    password_hash  VARCHAR(255)     NOT NULL,
    role           VARCHAR(20)      NOT NULL CONSTRAINT DF_admin_users_role DEFAULT 'VIEWER',
    is_active      BIT              NOT NULL CONSTRAINT DF_admin_users_active DEFAULT 1,
    last_login_at  DATETIME2(3)     NULL,
    created_at     DATETIME2(3)     NOT NULL CONSTRAINT DF_admin_users_created DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2(3)     NOT NULL CONSTRAINT DF_admin_users_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_admin_users PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_admin_users_email UNIQUE (email),
    CONSTRAINT CK_admin_users_role CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER'))
);
GO

-- ==== DOWN ====
DROP TABLE IF EXISTS dbo.admin_users;
