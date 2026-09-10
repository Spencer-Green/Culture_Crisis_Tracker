-- Additive: retain historical researcher outcomes and all staging relations.
ALTER TYPE "ResearchRunStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
