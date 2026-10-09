
INSERT INTO credit_modalities (
    code,
    name,
    description,
    min_amount,
    max_amount,
    min_term,
    max_term
)
VALUES
(
    'PERSONAL',
    'Crédito pessoal',
    'Modalidade para simulação de crédito pessoal.',
    500.00,
    50000.00,
    3,
    48
),
(
    'VEHICLE',
    'Financiamento de veículo',
    'Modalidade para simulação de financiamento de veículos.',
    5000.00,
    150000.00,
    12,
    60
),
(
    'HOME',
    'Crédito imobiliário',
    'Modalidade para simulação de crédito imobiliário.',
    10000.00,
    500000.00,
    12,
    240
)
ON DUPLICATE KEY UPDATE code = code;

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 3, 12, 4.5000
FROM credit_modalities
WHERE code = 'PERSONAL'
AND NOT EXISTS (
    SELECT 1
    FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 3 AND r.max_term = 12
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 13, 24, 3.8000
FROM credit_modalities
WHERE code = 'PERSONAL'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 13 AND r.max_term = 24
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 25, 48, 3.2000
FROM credit_modalities
WHERE code = 'PERSONAL'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 25 AND r.max_term = 48
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 12, 24, 2.2000
FROM credit_modalities
WHERE code = 'VEHICLE'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 12 AND r.max_term = 24
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 25, 48, 1.9000
FROM credit_modalities
WHERE code = 'VEHICLE'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 25 AND r.max_term = 48
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 49, 60, 1.7000
FROM credit_modalities
WHERE code = 'VEHICLE'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 49 AND r.max_term = 60
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 12, 60, 1.3000
FROM credit_modalities
WHERE code = 'HOME'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 12 AND r.max_term = 60
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 61, 120, 1.1000
FROM credit_modalities
WHERE code = 'HOME'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 61 AND r.max_term = 120
);

INSERT INTO interest_rate_ranges (
    modality_id,
    min_term,
    max_term,
    monthly_rate
)
SELECT id, 121, 240, 0.9500
FROM credit_modalities
WHERE code = 'HOME'
AND NOT EXISTS (
    SELECT 1 FROM interest_rate_ranges r
    WHERE r.modality_id = credit_modalities.id
      AND r.min_term = 121 AND r.max_term = 240
);