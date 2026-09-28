-- Development projects. Idempotent: safe to run repeatedly.
-- No API keys, Meta credentials or WhatsApp credentials are seeded on purpose.
IF NOT EXISTS (SELECT 1 FROM dbo.projects WHERE slug = 'vittam')
    INSERT INTO dbo.projects (name, slug, description) VALUES (N'Vittam', 'vittam', N'Vittam billing and finance application');

IF NOT EXISTS (SELECT 1 FROM dbo.projects WHERE slug = 'hotel-app')
    INSERT INTO dbo.projects (name, slug, description) VALUES (N'Hotel App', 'hotel-app', N'Hotel management application');

IF NOT EXISTS (SELECT 1 FROM dbo.projects WHERE slug = 'crm')
    INSERT INTO dbo.projects (name, slug, description) VALUES (N'CRM', 'crm', N'Customer relationship management');
