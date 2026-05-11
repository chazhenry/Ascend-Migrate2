/*
================================================================================
CCH AR Export Script
Builds AA_CCH_AR staging and CCH_AR_Export for CCH import.

Process:
  1. Seed AR transactions from tblTranDebtor (cutoff: 2021-01-01 or open unpaid)
  2. Walk tblTranDebtorClear iteratively to pull in all linked clearing txns
  3. Build #AR detail with base debits, credit allocations (both directions),
     and reversal lines
  4. Run diagnostics to reconcile against raw tblTranDebtor
  5. Emit CCH_AR_Export in the final import layout
================================================================================
*/

SET NOCOUNT ON;

-- Clean up prior runs
DROP TABLE IF EXISTS AA_CCH_AR;
DROP TABLE IF EXISTS CCH_AR_Export;
DROP TABLE IF EXISTS #AR;
DROP TABLE IF EXISTS #ARAll;

GO

DECLARE @PeriodEndIndex INT = 9999999;

/*
--------------------------------------------------------------------------------
STEP 1: Seed AR transactions
--------------------------------------------------------------------------------
*/

CREATE TABLE #ARAll (DebtTranIndex INT NOT NULL);

INSERT INTO #ARAll (DebtTranIndex)
SELECT DebtTranIndex
FROM   tblTranDebtor
WHERE  DebtTranDate >= '2021-01-01'
   OR  DebtTranUnpaid <> 0;

CREATE CLUSTERED INDEX IX_ARAll ON #ARAll (DebtTranIndex);

/*
--------------------------------------------------------------------------------
STEP 2: Expand to include all linked clearing transactions
--------------------------------------------------------------------------------
*/

DECLARE @InsertedRows INT = 1;

WHILE @InsertedRows > 0
BEGIN
    -- Pull in CreditIndex values linked to transactions already in #ARAll
    INSERT INTO #ARAll (DebtTranIndex)
    SELECT DC.CreditIndex
    FROM   tblTranDebtorClear DC
    WHERE  EXISTS     (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = DC.DebitIndex)
      AND  NOT EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = DC.CreditIndex)
    GROUP BY DC.CreditIndex;

    SET @InsertedRows = @@ROWCOUNT;

    -- Pull in DebitIndex values linked to transactions already in #ARAll
    INSERT INTO #ARAll (DebtTranIndex)
    SELECT DC.DebitIndex
    FROM   tblTranDebtorClear DC
    WHERE  NOT EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = DC.DebitIndex)
      AND  EXISTS     (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = DC.CreditIndex)
    GROUP BY DC.DebitIndex;

    SET @InsertedRows = @InsertedRows + @@ROWCOUNT;
END;

/*
--------------------------------------------------------------------------------
STEP 3: Build #AR detail (base + allocations + reversals)
--------------------------------------------------------------------------------
*/

CREATE TABLE #AR (
    ContIndex     INT,
    DebtTranIndex INT,
    Amount        MONEY,
    UnpaidAmount  MONEY,
    InvoiceIndex  INT
);

-- 3a: Base debtor transactions
INSERT INTO #AR (ContIndex, DebtTranIndex, Amount, UnpaidAmount, InvoiceIndex)
SELECT D.ContIndex,
       D.DebtTranIndex,
       SUM(CASE WHEN D.PeriodIndex <= @PeriodEndIndex THEN D.DebtTranTotal ELSE 0 END),
       SUM(D.DebtTranUnpaid),
       0
FROM   tblTranDebtor D
WHERE  EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = D.DebtTranIndex)
GROUP BY D.ContIndex, D.PracID, D.DebtTranIndex;

-- 3b: Credit allocations (DebitIndex -> CreditIndex)
INSERT INTO #AR (ContIndex, DebtTranIndex, Amount, UnpaidAmount, InvoiceIndex)
SELECT D.ContIndex,
       D.DebtTranIndex,
       SUM(CASE WHEN D.PeriodIndex <= @PeriodEndIndex
                THEN DC.Amount * CASE WHEN D.DebtTranTotal < 0 THEN -1 ELSE 1 END
                ELSE 0
           END),
       0,
       DC.CreditIndex
FROM   tblTranDebtor        D
INNER  JOIN tblTranDebtorClear DC  ON D.DebtTranIndex   = DC.DebitIndex
INNER  JOIN tblTranDebtor      DD2 ON DC.CreditIndex    = DD2.DebtTranIndex
WHERE  D.DebtTranType NOT IN (3, 6, 10)
  AND  EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = D.DebtTranIndex)
  AND  DC.UnallocatedOn IS NULL
GROUP BY D.ContIndex, DD2.PracID, D.DebtTranIndex, DC.CreditIndex;

-- 3c: Credit allocations (CreditIndex -> DebitIndex)
INSERT INTO #AR (ContIndex, DebtTranIndex, Amount, UnpaidAmount, InvoiceIndex)
SELECT D.ContIndex,
       D.DebtTranIndex,
       SUM(CASE WHEN D.PeriodIndex <= @PeriodEndIndex
                THEN DC.Amount * CASE WHEN D.DebtTranTotal < 0 THEN -1 ELSE 1 END
                ELSE 0
           END),
       0,
       DC.DebitIndex
FROM   tblTranDebtor        D
INNER  JOIN tblTranDebtorClear DC  ON D.DebtTranIndex   = DC.CreditIndex
INNER  JOIN tblTranDebtor      DD2 ON DC.DebitIndex     = DD2.DebtTranIndex
WHERE  D.DebtTranType NOT IN (3, 6, 10)
  AND  EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = D.DebtTranIndex)
  AND  DC.UnallocatedOn IS NULL
GROUP BY D.ContIndex, DD2.PracID, D.DebtTranIndex, DC.DebitIndex;

-- 3d: Reversals (DebitIndex -> CreditIndex, sign flipped)
INSERT INTO #AR (ContIndex, DebtTranIndex, Amount, UnpaidAmount, InvoiceIndex)
SELECT D.ContIndex,
       D.DebtTranIndex,
       SUM(CASE WHEN D.PeriodIndex <= @PeriodEndIndex
                THEN DC.Amount * CASE WHEN D.DebtTranTotal < 0 THEN 1 ELSE -1 END
                ELSE 0
           END),
       0,
       0
FROM   tblTranDebtor        D
INNER  JOIN tblTranDebtorClear DC  ON D.DebtTranIndex   = DC.DebitIndex
INNER  JOIN tblTranDebtor      DD2 ON DC.CreditIndex    = DD2.DebtTranIndex
WHERE  D.DebtTranType NOT IN (3, 6, 10)
  AND  EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = D.DebtTranIndex)
  AND  DC.UnallocatedOn IS NULL
GROUP BY D.ContIndex, D.PracID, D.DebtTranIndex, DC.CreditIndex;

-- 3e: Reversals (CreditIndex -> DebitIndex, sign flipped)
INSERT INTO #AR (ContIndex, DebtTranIndex, Amount, UnpaidAmount, InvoiceIndex)
SELECT D.ContIndex,
       D.DebtTranIndex,
       SUM(CASE WHEN D.PeriodIndex <= @PeriodEndIndex
                THEN DC.Amount * CASE WHEN D.DebtTranTotal < 0 THEN 1 ELSE -1 END
                ELSE 0
           END),
       0,
       0
FROM   tblTranDebtor        D
INNER  JOIN tblTranDebtorClear DC  ON D.DebtTranIndex   = DC.CreditIndex
INNER  JOIN tblTranDebtor      DD2 ON DC.DebitIndex     = DD2.DebtTranIndex
WHERE  D.DebtTranType NOT IN (3, 6, 10)
  AND  EXISTS (SELECT 1 FROM #ARAll A WHERE A.DebtTranIndex = D.DebtTranIndex)
  AND  DC.UnallocatedOn IS NULL
GROUP BY D.ContIndex, D.PracID, D.DebtTranIndex, DC.DebitIndex;

CREATE INDEX IX_AR_Cont ON #AR (ContIndex, DebtTranIndex);

/*
--------------------------------------------------------------------------------
STEP 4: Diagnostics (reconciliation vs raw tblTranDebtor)
--------------------------------------------------------------------------------
*/

-- Compare #AR amounts vs raw for 2025 invoices
SELECT SUM(A.Amount) AS Cl_Bal_AR
FROM   tblEngagement E
INNER  JOIN #AR            A ON E.ContIndex     = A.ContIndex
INNER  JOIN tblTranDebtor  D ON D.DebtTranIndex = A.DebtTranIndex
WHERE  D.DebtTranDate BETWEEN '2025-01-01' AND '2025-12-31'
  AND  D.DebtTranType = 3;

SELECT SUM(D.DebtTranTotal) AS Cl_Bal_Raw
FROM   tblEngagement E
INNER  JOIN tblTranDebtor D ON D.ContIndex = E.ContIndex
WHERE  D.DebtTranDate BETWEEN '2025-01-01' AND '2025-12-31'
  AND  D.DebtTranType = 3;

-- Compare unpaid totals
SELECT SUM(A.UnpaidAmount) AS Cl_Bal_Unpaid,
       SUM(A.Amount)       AS Cl_Bal_Amount
FROM   tblEngagement E
INNER  JOIN #AR           A ON E.ContIndex     = A.ContIndex
INNER  JOIN tblTranDebtor D ON D.DebtTranIndex = A.DebtTranIndex;

SELECT SUM(D.DebtTranTotal) AS Cl_Bal_Total
FROM   tblEngagement E
INNER  JOIN tblTranDebtor D ON D.ContIndex = E.ContIndex;

/*
--------------------------------------------------------------------------------
STEP 5: Build AA_CCH_AR staging table
--------------------------------------------------------------------------------
*/

SELECT E.ClientCode                                                         AS [Cltnum],
       0                                                                    AS [Engagement],
       CASE D.DebtTranType
           WHEN 3  THEN 'Invoice'
           WHEN 6  THEN 'Invoice'
           WHEN 9  THEN 'Payment'
           WHEN 10 THEN 'Finance Charge'
           WHEN 15 THEN 'Payment'
           ELSE         'Write Off'
       END                                                                  AS [ARType],
       A.DebtTranIndex                                                      AS [DocNum],
       D.DebtTranRefAlpha                                                   AS [PERefNo],
       A.InvoiceIndex                                                       AS [ApplyTo],
       D.DebtTranDate                                                       AS [TransDate],
       SUM(A.Amount)                                                        AS [Amount],
       0                                                                    AS [Finance Amount],
       0                                                                    AS [Tax],
       0                                                                    AS [Progress Amount],
       0                                                                    AS [Applied Progress Amount]
INTO   AA_CCH_AR
FROM   #AR A
INNER  JOIN tblTranDebtor D ON D.DebtTranIndex = A.DebtTranIndex
INNER  JOIN tblEngagement E ON E.ContIndex     = D.ContIndex
GROUP BY A.ContIndex, A.DebtTranIndex, A.InvoiceIndex,
         D.DebtTranType, D.DebtTranDate, D.DebtTranRefAlpha, E.ClientCode
ORDER BY A.DebtTranIndex;

-- Drop zero-amount non-invoice rows
DELETE FROM AA_CCH_AR
WHERE  [ARType] <> 'Invoice'
  AND  [Amount] = 0;

/*
--------------------------------------------------------------------------------
STEP 6: Build CCH_AR_Export (final import table)
--------------------------------------------------------------------------------
*/

SELECT *
INTO CCH_AR_Export
FROM AA_CCH_AR
ORDER BY [TransDate], [Cltnum];

/*
--------------------------------------------------------------------------------
STEP 7: Final Output
--------------------------------------------------------------------------------
*/

SELECT *
FROM CCH_AR_Export
ORDER BY [TransDate], [Cltnum];

/*
--------------------------------------------------------------------------------
Cleanup
--------------------------------------------------------------------------------
*/

DROP TABLE IF EXISTS #AR;
DROP TABLE IF EXISTS #ARAll;

GO
