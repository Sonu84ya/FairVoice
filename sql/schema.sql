-- ============================================================
-- Gender Equality & Workplace Safe Reporting Platform
-- MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS gender_equality_platform
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE gender_equality_platform;

-- ------------------------------------------------------------
-- USERS
-- Roles:
--   end_user        -> employee who files reports
--   admin           -> first-level reviewer
--   supreme_admin   -> second-level / senior reviewer
--   ngo             -> external NGO/INGO, final escalation + legal
-- ------------------------------------------------------------
CREATE TABLE users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('end_user','admin','supreme_admin','ngo') NOT NULL DEFAULT 'end_user',
  department      VARCHAR(120) DEFAULT NULL,
  phone           VARCHAR(30)  DEFAULT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- REPORTS
-- current_level tracks which dashboard currently owns the case
-- status tracks the case lifecycle
-- ------------------------------------------------------------
CREATE TABLE reports (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  report_code      VARCHAR(20) NOT NULL UNIQUE,          -- public tracking code e.g. GEP-2026-000123
  reporter_id      INT DEFAULT NULL,                     -- NULL when fully anonymous
  is_anonymous     TINYINT(1) NOT NULL DEFAULT 0,
  category         ENUM(
                     'harassment',
                     'gender_discrimination',
                     'bullying',
                     'abuse',
                     'unfair_treatment',
                     'mental_harassment',
                     'toxic_workplace',
                     'safety_violation',
                     'other'
                   ) NOT NULL,
  title            VARCHAR(200) NOT NULL,
  description      TEXT NOT NULL,
  incident_date    DATE DEFAULT NULL,
  location         VARCHAR(200) DEFAULT NULL,
  accused_info     VARCHAR(255) DEFAULT NULL,             -- optional, free text, no forced identification
  priority         ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status           ENUM(
                     'submitted',
                     'under_review_admin',
                     'escalated_supreme',
                     'under_review_supreme',
                     'escalated_ngo',
                     'under_review_ngo',
                     'legal_action',
                     'resolved',
                     'closed'
                   ) NOT NULL DEFAULT 'submitted',
  current_level    ENUM('admin','supreme_admin','ngo','closed') NOT NULL DEFAULT 'admin',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- EVIDENCE (securely uploaded files linked to a report)
-- ------------------------------------------------------------
CREATE TABLE evidence (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  report_id      INT NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,   -- randomized name on disk
  original_name  VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INT NOT NULL,
  uploaded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- REPORT ACTIONS / TIMELINE (comments, escalations, resolutions)
-- This doubles as the audit trail for accountability
-- ------------------------------------------------------------
CREATE TABLE report_actions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  report_id      INT NOT NULL,
  actor_id       INT DEFAULT NULL,        -- NULL if system-generated
  actor_role     VARCHAR(30) DEFAULT NULL,
  action_type    ENUM(
                    'submitted',
                    'comment',
                    'status_change',
                    'escalated',
                    'resolved',
                    'closed',
                    'legal_action'
                  ) NOT NULL,
  note           TEXT DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SUPPORT RESOURCES (hotlines, counseling, legal aid, articles)
-- ------------------------------------------------------------
CREATE TABLE resources (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  resource_type ENUM('hotline','counseling','legal_aid','article','policy') NOT NULL,
  contact_info  VARCHAR(255) DEFAULT NULL,   -- phone/email/link
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Seed a few default support resources
-- ------------------------------------------------------------
INSERT INTO resources (title, description, resource_type, contact_info) VALUES
('24/7 Confidential Support Hotline', 'Speak with a trained counselor any time, day or night.', 'hotline', '+1-800-555-0199'),
('Employee Assistance Program (EAP)', 'Free, confidential counseling sessions for any employee.', 'counseling', 'eap@company.example.com'),
('Legal Aid Referral Network', 'Connect with employment law advocates for serious cases.', 'legal_aid', 'legalaid@company.example.com'),
('Know Your Rights: Workplace Harassment', 'A plain-language guide to workplace harassment protections.', 'article', 'https://example.com/know-your-rights'),
('Company Anti-Harassment Policy', 'The full internal policy document on prohibited conduct.', 'policy', 'https://example.com/policy.pdf');

-- ------------------------------------------------------------
-- Seed one account per role for local testing
-- (passwords are bcrypt hashes of: Password123!)
-- Generated at setup time by backend/sql/seed_users.js — see README
-- ------------------------------------------------------------
