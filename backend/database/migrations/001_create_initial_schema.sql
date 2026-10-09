CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE = InnoDB;


CREATE TABLE credit_modalities (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    min_amount DECIMAL(15, 2) NOT NULL,
    max_amount DECIMAL(15, 2) NOT NULL,
    min_term SMALLINT UNSIGNED NOT NULL,
    max_term SMALLINT UNSIGNED NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_credit_modalities PRIMARY KEY (id),
    CONSTRAINT uq_credit_modalities_code UNIQUE (code),
    CONSTRAINT chk_modalities_amounts
        CHECK (min_amount > 0 AND min_amount <= max_amount),
    CONSTRAINT chk_modalities_terms
        CHECK (min_term > 0 AND min_term <= max_term)
) ENGINE = InnoDB;


CREATE TABLE interest_rate_ranges (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    modality_id BIGINT UNSIGNED NOT NULL,
    min_term SMALLINT UNSIGNED NOT NULL,
    max_term SMALLINT UNSIGNED NOT NULL,
    monthly_rate DECIMAL(7, 4) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_interest_rate_ranges PRIMARY KEY (id),
    CONSTRAINT chk_rate_range_terms
        CHECK (min_term > 0 AND min_term <= max_term),
    CONSTRAINT chk_monthly_rate
        CHECK (monthly_rate >= 0),

    INDEX idx_rate_ranges_modality (modality_id),

    CONSTRAINT fk_rate_ranges_modality
        FOREIGN KEY (modality_id)
        REFERENCES credit_modalities (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE = InnoDB;


CREATE TABLE simulations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    modality_id BIGINT UNSIGNED NOT NULL,
    requested_amount DECIMAL(15, 2) NOT NULL,
    term SMALLINT UNSIGNED NOT NULL,
    monthly_rate DECIMAL(7, 4) NOT NULL,
    installment_amount DECIMAL(15, 2) NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    total_interest DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_simulations PRIMARY KEY (id),
    CONSTRAINT chk_simulation_amount
        CHECK (requested_amount > 0),
    CONSTRAINT chk_simulation_term
        CHECK (term > 0),
    CONSTRAINT chk_simulation_rate
        CHECK (monthly_rate >= 0),
    CONSTRAINT chk_simulation_installment
        CHECK (installment_amount >= 0),
    CONSTRAINT chk_simulation_total
        CHECK (total_amount >= 0),
    CONSTRAINT chk_simulation_interest
        CHECK (total_interest >= 0),

    INDEX idx_simulations_user (user_id),
    INDEX idx_simulations_modality (modality_id),

    CONSTRAINT fk_simulations_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    CONSTRAINT fk_simulations_modality
        FOREIGN KEY (modality_id)
        REFERENCES credit_modalities (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE = InnoDB;


CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_audit_logs PRIMARY KEY (id),

    INDEX idx_audit_logs_user (user_id),

    CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE = InnoDB;