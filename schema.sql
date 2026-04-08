DROP TABLE IF EXISTS installments CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE loan_frequency AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE loan_status AS ENUM ('ACTIVO', 'FINALIZADO', 'MOROSO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE installment_status AS ENUM ('PENDIENTE', 'PAGADO', 'ATRASADO', 'TRANSFERIDO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    frequency loan_frequency NOT NULL,
    total_installments INT NOT NULL,
    status loan_status DEFAULT 'ACTIVO'::loan_status,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    installment_number INT NOT NULL,
    due_date DATE NOT NULL,
    original_amount DECIMAL(12,2) NOT NULL,
    carried_over_amount DECIMAL(12,2) DEFAULT 0.00,
    paid_amount DECIMAL(12,2) DEFAULT 0.00,
    total_due DECIMAL(12,2) GENERATED ALWAYS AS (original_amount + carried_over_amount) STORED,
    status installment_status DEFAULT 'PENDIENTE'::installment_status
);

-- Vista para ver las deudas actuales por cliente
CREATE OR REPLACE VIEW current_debts AS
SELECT 
    c.id AS customer_id,
    c.full_name,
    c.phone,
    SUM(i.total_due) AS total_debt
FROM customers c
JOIN loans l ON c.id = l.customer_id
JOIN installments i ON l.id = i.loan_id
WHERE i.status = 'PENDIENTE'
GROUP BY c.id, c.full_name, c.phone;
