/*
================================================================================
CCH WIP Export Script
Builds AA_CCH_WIP staging and CCH_WIP_Export for CCH import.

Process:
  1. Collect all WIP billing activity (invoices, credits, write-offs, OS WIP)
  2. Identify full credit/rebill cycles so duplicates can be removed
  3. Consolidate bills (drop credited-and-rebilled originals/credits)
  4. Build final detail with staff, service, job, task, analysis mapping
  5. Persist AA_CCH_WIP staging
  6. Emit CCH_WIP_Export in the CCH import layout
  7. Insert historical WIP balance adjustments so totals reconcile to PE
  8. Output and reconciliation check

Dependency: AA_CCH_AR must exist (see "4. CCH AR.sql") — used to force-include
            any WIP rows tied to AR docs already in the AR export.
================================================================================
*/

SET NOCOUNT ON;

-- Clean up prior runs
DROP TABLE IF EXISTS #Bills;
DROP TABLE IF EXISTS #CreditRebillMap;
DROP TABLE IF EXISTS #BillsConsolidated;
DROP TABLE IF EXISTS #Final;
DROP TABLE IF EXISTS #WIPDiff;
DROP TABLE IF EXISTS #Adjustments;

GO

-- Cutoff driving how far back WIP history is pulled.
-- Adjust based on data cleanliness / when client converted to Practice Engine.
DECLARE @CutoffDate DATE = '2022-01-01';

/*
--------------------------------------------------------------------------------
STEP 1: Build #Bills - Collect all WIP billing activity
--------------------------------------------------------------------------------
*/

CREATE TABLE #Bills (
    NewWIPIndex    INT IDENTITY(1,1),
    WIPIndex       INT   NOT NULL,
    BillAmount     MONEY NOT NULL,
    BillWOff       MONEY NOT NULL,
    WIPAmount      MONEY NOT NULL,
    DebtTranIndex  INT   NOT NULL,
    WIPDate        DATE  NOT NULL,
    WIPOutstanding MONEY NOT NULL,
    TransTypeIndex INT   NOT NULL,
    ContIndex      INT   NOT NULL,
    WriteOffIndex  INT   NOT NULL,
    WIPService     NVARCHAR(10),
    ServPeriod     INT,
    TaskIndex      INT,
    WIPAnalysis    NVARCHAR(10),
    ProgressIndex  INT NULL,
    EntryType      NVARCHAR(100)
);

-- 1a: Invoice allocations (DebtTranType = 3)
INSERT INTO #Bills (
    WIPIndex, BillAmount, BillWOff, WIPAmount, DebtTranIndex, WIPDate,
    WIPOutstanding, TransTypeIndex, ContIndex, WriteOffIndex,
    WIPService, ServPeriod, TaskIndex, WIPAnalysis, EntryType, ProgressIndex
)
SELECT
    W.WIPIndex,
    SUM(W.BillAmount)                                                       AS BillAmount,
    SUM(W.BillWOff)                                                         AS BillWOff,
    SUM(W.BillAmount) + SUM(W.BillWOff)                                     AS WIPAmount,
    D.DebtTranIndex,
    W.WIPDate,
    0                                                                       AS WIPOutstanding,
    W.TransTypeIndex,
    W.ContIndex,
    0                                                                       AS WriteOffIndex,
    W.WIPService,
    W.ServPeriod,
    W.TaskIndex,
    CASE WHEN W.TransTypeIndex > 2 THEN NULL ELSE W.WIPAnalysis END         AS WIPAnalysis,
    TT.TransTypeDescription,
    CASE WHEN W.TransTypeIndex > 2 THEN -1   ELSE NULL END                  AS ProgressIndex
FROM tblTran_History_WIP_Alloc W
INNER JOIN tblTranDebtor D  ON D.DebtTranIndex   = W.DebtTranIndex
INNER JOIN tblTranTypes  TT ON TT.TransTypeIndex = W.TransTypeIndex
WHERE D.DebtTranType = 3
  AND W.ContIndex < 900000
  AND (
           W.WIPDate      >= @CutoffDate
        OR D.DebtTranDate >= @CutoffDate
        OR W.WIPIndex     IN (SELECT WIPIndex FROM tblTranWIP WHERE WIPDate >= @CutoffDate)
        OR D.DebtTranIndex IN (SELECT DocNum  FROM AA_CCH_AR)
        OR D.DebtTranIndex IN (SELECT ApplyTo FROM AA_CCH_AR)
      )
GROUP BY W.WIPIndex, D.DebtTranIndex, W.WIPDate, W.TransTypeIndex, W.ContIndex,
         W.WIPService, W.ServPeriod, W.TaskIndex, W.WIPAnalysis, TT.TransTypeDescription;

-- 1b: Credit memo allocations (DebtTranType = 6)
INSERT INTO #Bills (
    WIPIndex, BillAmount, BillWOff, WIPAmount, DebtTranIndex, WIPDate,
    WIPOutstanding, TransTypeIndex, ContIndex, WriteOffIndex,
    WIPService, ServPeriod, TaskIndex, WIPAnalysis, EntryType, ProgressIndex
)
SELECT
    W.WIPIndex,
    SUM(W.BillAmount) * -1                                                  AS BillAmount,
    SUM(W.BillWOff)   * -1                                                  AS BillWOff,
    SUM(W.BillAmount) * -1 + SUM(W.BillWOff) * -1                           AS WIPAmount,
    D.DebtTranIndex,
    W.WIPDate,
    CAST(0 AS MONEY)                                                        AS WIPOutstanding,
    W.TransTypeIndex,
    W.ContIndex,
    0                                                                       AS WriteOffIndex,
    W.WIPService,
    W.ServPeriod,
    W.TaskIndex,
    CASE WHEN W.TransTypeIndex > 2 THEN NULL ELSE W.WIPAnalysis END         AS WIPAnalysis,
    TT.TransTypeDescription,
    CASE WHEN W.TransTypeIndex > 2 THEN -1   ELSE NULL END                  AS ProgressIndex
FROM tblTran_History_WIP_Alloc W
INNER JOIN tblTranTypes  TT ON TT.TransTypeIndex = W.TransTypeIndex
INNER JOIN tblTranDebtor D  ON D.DebtTranIndex   = W.DebtTranIndex
WHERE D.DebtTranType = 6
  AND W.ContIndex < 900000
  AND (
           W.WIPDate      >= @CutoffDate
        OR D.DebtTranDate >= @CutoffDate
        OR W.WIPIndex     IN (SELECT WIPIndex FROM tblTranWIP WHERE WIPDate >= @CutoffDate)
        OR D.DebtTranIndex IN (SELECT DocNum  FROM AA_CCH_AR)
        OR D.DebtTranIndex IN (SELECT ApplyTo FROM AA_CCH_AR)
      )
GROUP BY W.WIPIndex, D.DebtTranIndex, W.WIPDate, W.TransTypeIndex, W.ContIndex,
         W.WIPService, W.ServPeriod, W.TaskIndex, W.WIPAnalysis, TT.TransTypeDescription;

-- 1c: Write-off allocations
INSERT INTO #Bills (
    WIPIndex, BillAmount, BillWOff, WIPAmount, DebtTranIndex, WIPDate,
    WIPOutstanding, TransTypeIndex, ContIndex, WriteOffIndex,
    WIPService, ServPeriod, TaskIndex, WIPAnalysis, EntryType, ProgressIndex
)
SELECT
    W.WIPIndex,
    0                                                                       AS BillAmount,
    SUM(W.BillWOff)                                                         AS BillWOff,
    SUM(W.BillWOff)                                                         AS WIPAmount,
    0                                                                       AS DebtTranIndex,
    W.WIPDate,
    CAST(0 AS MONEY)                                                        AS WIPOutstanding,
    W.TransTypeIndex,
    W.ContIndex,
    H.WriteOffIndex,
    W.WIPService,
    W.ServPeriod,
    W.TaskIndex,
    CASE WHEN W.TransTypeIndex > 2 THEN NULL ELSE W.WIPAnalysis END         AS WIPAnalysis,
    TT.TransTypeDescription,
    CASE WHEN W.TransTypeIndex > 2 THEN -1   ELSE NULL END                  AS ProgressIndex
FROM tblTran_History_WO_WIP_Alloc W
INNER JOIN tblTran_History_WO_Header H  ON H.WriteOffIndex  = W.WriteOffIndex
INNER JOIN tblTranTypes              TT ON TT.TransTypeIndex = W.TransTypeIndex
WHERE W.ContIndex < 900000
  AND (
           W.WIPDate        >= @CutoffDate
        OR H.WriteOffDate   >= @CutoffDate
        OR W.WIPIndex       IN (SELECT WIPIndex FROM tblTranWIP WHERE WIPDate >= @CutoffDate)
      )
GROUP BY W.WIPIndex, H.WriteOffIndex, W.WIPDate, W.TransTypeIndex, W.ContIndex,
         W.WIPService, W.ServPeriod, W.TaskIndex, W.WIPAnalysis, TT.TransTypeDescription;

-- 1d: Outstanding WIP (open, unbilled)
INSERT INTO #Bills (
    WIPIndex, BillAmount, BillWOff, WIPAmount, DebtTranIndex, WIPDate,
    WIPOutstanding, TransTypeIndex, ContIndex, WriteOffIndex,
    WIPService, TaskIndex, WIPAnalysis, EntryType, ServPeriod, ProgressIndex
)
SELECT
    W.WIPIndex,
    0                                                                       AS BillAmount,
    0                                                                       AS BillWOff,
    W.WIPOutstanding                                                        AS WIPAmount,
    CASE WHEN W.TransTypeIndex > 2 THEN W.WIPRef ELSE 0 END                 AS DebtTranIndex,
    W.WIPDate,
    W.WIPOutstanding,
    W.TransTypeIndex,
    W.ContIndex,
    0                                                                       AS WriteOffIndex,
    W.WIPService,
    W.TaskIndex,
    W.WIPAnalysis,
    CASE WHEN W.TransTypeIndex > 2 THEN 'OS Progress' ELSE 'OS WIP' END     AS EntryType,
    W.ServPeriod,
    CASE WHEN W.TransTypeIndex > 2 THEN W.WIPRef ELSE 0 END                 AS ProgressIndex
FROM tblTranWIP W
WHERE W.ContIndex < 900000
  AND W.WIPOutstanding <> 0
  AND W.TransTypeIndex < 3;

/*
--------------------------------------------------------------------------------
STEP 2: Build Credit/Rebill Map - Identify complete credit/rebill cycles
--------------------------------------------------------------------------------
*/

;WITH CreditMapping AS (
    SELECT
        B1.WIPIndex,
        DC.DebitIndex                                                       AS OriginalInvoice,
        DC.CreditIndex                                                      AS CreditMemo,
        B1.BillAmount                                                       AS OriginalAmount,
        B2.BillAmount                                                       AS CreditAmount
    FROM tblTranDebtorClear DC
    INNER JOIN #Bills B1 ON B1.DebtTranIndex = DC.DebitIndex
    INNER JOIN #Bills B2 ON B2.DebtTranIndex = DC.CreditIndex
                        AND B2.WIPIndex      = B1.WIPIndex
    WHERE DC.DebitType  = 3
      AND DC.CreditType = 6
)
SELECT
    CM.WIPIndex,
    CM.OriginalInvoice,
    CM.CreditMemo,
    COALESCE(
        (SELECT TOP 1 B3.DebtTranIndex
         FROM   #Bills B3
         INNER  JOIN tblTranDebtor D3  ON D3.DebtTranIndex  = B3.DebtTranIndex
         INNER  JOIN tblTranDebtor DCM ON DCM.DebtTranIndex = CM.CreditMemo
         WHERE  B3.WIPIndex       = CM.WIPIndex
           AND  D3.DebtTranType   = 3
           AND  D3.DebtTranDate  >= DCM.DebtTranDate
           AND  B3.DebtTranIndex NOT IN (CM.OriginalInvoice, CM.CreditMemo)
         ORDER BY D3.DebtTranDate),
        0
    )                                                                       AS RebillInvoice,
    CASE WHEN ABS(CM.OriginalAmount + CM.CreditAmount) < 0.01 THEN 1 ELSE 0 END AS IsFullCredit
INTO #CreditRebillMap
FROM CreditMapping CM;

/*
--------------------------------------------------------------------------------
STEP 3: Consolidate Bills - Remove fully credited/rebilled duplicates
--------------------------------------------------------------------------------
*/

SELECT
    ROW_NUMBER() OVER (ORDER BY B.WIPIndex, B.DebtTranIndex)                AS NewWIPIndex,
    B.WIPIndex,
    B.BillAmount,
    B.BillWOff,
    B.WIPAmount,
    B.DebtTranIndex,
    B.WIPDate,
    B.WIPOutstanding,
    B.TransTypeIndex,
    B.ContIndex,
    B.WriteOffIndex,
    B.WIPService,
    B.ServPeriod,
    B.TaskIndex,
    B.WIPAnalysis,
    B.ProgressIndex,
    B.EntryType
INTO #BillsConsolidated
FROM #Bills B
WHERE NOT EXISTS (
        SELECT 1 FROM #CreditRebillMap CRM
        WHERE CRM.WIPIndex        = B.WIPIndex
          AND CRM.OriginalInvoice = B.DebtTranIndex
          AND CRM.IsFullCredit    = 1
          AND CRM.RebillInvoice   > 0
    )
  AND NOT EXISTS (
        SELECT 1 FROM #CreditRebillMap CRM
        WHERE CRM.WIPIndex        = B.WIPIndex
          AND CRM.CreditMemo      = B.DebtTranIndex
          AND CRM.IsFullCredit    = 1
          AND CRM.RebillInvoice   > 0
    );

/*
--------------------------------------------------------------------------------
STEP 4: Build Final Detail Table
--------------------------------------------------------------------------------
*/

SELECT
    B.NewWIPIndex,
    B.WIPIndex                                                              AS WIPIdent,
    E.ContIndex,
    E.ClientCode                                                            AS ClientCode,
    CAST('' AS NVARCHAR(255))                                               AS ClientIdent,
    CAST('' AS NVARCHAR(255))                                               AS StaffIdent,
    B.WIPDate                                                               AS TransactionDate,
    S.StaffName,
    S.StaffIndex                                                            AS EmployeeID,
    S.StaffUser,
    S.StaffEMail,
    CASE WHEN B.WIPAmount <> 0 AND W.WIPHours <> 0
         THEN ROUND((B.WIPAmount / W.WIPAmount) * W.WIPHours, 2)
         ELSE 0
    END                                                                     AS Hours,
    B.WIPAmount                                                             AS AdjAmount,
    B.WIPAmount                                                             AS StdAmount,
    CASE WHEN W.TransTypeIndex = 1
           AND CASE WHEN B.WIPAmount <> 0 AND W.WIPHours <> 0
                    THEN ROUND((B.WIPAmount / W.WIPAmount) * W.WIPHours, 2)
                    ELSE 0 END <> 0
         THEN B.WIPAmount / (CASE WHEN B.WIPAmount <> 0 AND W.WIPHours <> 0
                                  THEN ROUND((B.WIPAmount / W.WIPAmount) * W.WIPHours, 2)
                                  ELSE 1 END)
         ELSE 0
    END                                                                     AS Rate,
    0                                                                       AS Cost,
    0                                                                       AS Units,
    W.Narrative                                                             AS Narrative,
    B.BillAmount                                                            AS [Billed Amount],
    0                                                                       AS Surcharge,
    B.BillWOff                                                              AS [Write-up/Down],
    B.DebtTranIndex                                                         AS InvoiceIndex,
    B.WriteOffIndex,
    B.ProgressIndex,
    D.DebtTranDate                                                          AS InvoiceDate,
    H.WriteOffDate,
    CASE WHEN COALESCE(B.ProgressIndex, 0) <> 0 THEN 'Progress Bill'
         ELSE TT.TransTypeName
    END                                                                     AS Type,
    SV.ServIndex                                                            AS ServIndex,
    SV.ServTitle                                                            AS Service,
    THT.Job_Name                                                            AS Job_Template,
    J.Job_Name,
    T.Task_Subject                                                          AS Task,
    CC.ChargeName                                                           AS Analysis,
    B.EntryType,
    CAST(0  AS INT)                                                         AS ServiceCodeID,
    CAST('' AS NVARCHAR(255))                                               AS ServiceCode,
    CAST('' AS NVARCHAR(255))                                               AS AddServiceCode,
    CAST('' AS NVARCHAR(255))                                               AS MappingNotes,
    B.ServPeriod,
    B.WIPOutstanding
INTO #Final
FROM #BillsConsolidated B
LEFT  JOIN tblTranWIP               W   ON W.WIPIndex       = B.WIPIndex
LEFT  JOIN tblServices              SV  ON SV.ServIndex     = COALESCE(W.WIPService, B.WIPService)
LEFT  JOIN tblJob_Task              T   ON T.TaskIndex      = COALESCE(W.TaskIndex,  B.TaskIndex)
LEFT  JOIN tblTimeChargeCode        CC  ON CC.ChargeCode    = COALESCE(W.WIPAnalysis, B.WIPAnalysis)
LEFT  JOIN tblEngagement            E   ON E.ContIndex      = B.ContIndex
LEFT  JOIN tblStaff                 S   ON S.StaffIndex     = COALESCE(W.StaffIndex, 0)
LEFT  JOIN tblTranDebtor            D   ON D.DebtTranIndex  = B.DebtTranIndex
LEFT  JOIN tblTran_History_WO_Header H  ON H.WriteOffIndex  = B.WriteOffIndex
LEFT  JOIN tblJob_Header            J   ON J.Job_Idx        = B.ServPeriod
LEFT  JOIN tblJob_Tmplt_Header      TH  ON TH.JobTmp_Idx    = J.Job_Template
LEFT  JOIN tblJob_Header            THT ON THT.Job_Idx      = TH.Job_Idx
LEFT  JOIN tblTranTypes             TT  ON TT.TransTypeIndex = W.TransTypeIndex
WHERE B.WIPAmount <> 0 OR B.BillAmount <> 0 OR B.BillWOff <> 0
ORDER BY E.ClientCode, B.WIPDate;

/*
--------------------------------------------------------------------------------
STEP 5: Build AA_CCH_WIP staging table
--------------------------------------------------------------------------------
*/

DROP TABLE IF EXISTS AA_CCH_WIP;

SELECT *
INTO AA_CCH_WIP
FROM #Final;

/*
--------------------------------------------------------------------------------
STEP 6: Build CCH_WIP_Export (final import table)
--------------------------------------------------------------------------------
*/

DROP TABLE IF EXISTS CCH_WIP_Export;

SELECT
    W.ClientCode                                                            AS [Cltnum],
    0                                                                       AS [Engagement],
    W.TransactionDate                                                       AS [TransDate],
    CASE WHEN W.ProgressIndex = -1 THEN NULL ELSE W.EmployeeID END          AS [Employee],
    CASE WHEN W.ProgressIndex = -1 THEN NULL ELSE W.Service    END          AS [Service/Work Code],
    CASE WHEN W.ProgressIndex = -1 THEN NULL ELSE W.ServPeriod END          AS [Project],
    CASE WHEN W.ProgressIndex = -1 THEN NULL ELSE W.Job_Name   END          AS [ProjectName],
    'Billable'                                                              AS [Billable/Non-billable],
    W.Hours                                                                 AS [Hours],
    W.AdjAmount                                                             AS [Amount],
    W.Rate                                                                  AS [Rate],
    W.Cost                                                                  AS [Cost],
    W.Units                                                                 AS [Units],
    LEFT(W.Narrative, 500)                                                  AS [Memo],
    W.[Billed Amount]                                                       AS [Billed Amount],
    W.Surcharge                                                             AS [Surcharge (If any)],
    W.[Write-up/Down]                                                       AS [Write-up/down],
    W.InvoiceIndex                                                          AS [Invoice Number],
    W.InvoiceDate                                                           AS [Invoice Date],
    W.WriteOffIndex                                                         AS [Write Off Number],
    W.WriteOffDate                                                          AS [Write Off Date],
    W.Task                                                                  AS [Task],
    W.Analysis                                                              AS [Analysis],
    W.EntryType                                                             AS [EntryType]
INTO CCH_WIP_Export
FROM AA_CCH_WIP W
ORDER BY W.ClientCode, W.TransactionDate;

-- Add identity column for stable ordering
ALTER TABLE CCH_WIP_Export ADD Idx INT IDENTITY(1,1);

/*
--------------------------------------------------------------------------------
STEP 7: Calculate and Insert WIP Balance Adjustments
--------------------------------------------------------------------------------
*/

-- Outstanding WIP per client from export vs. actual PE outstanding
SELECT
    [Cltnum],
    SUM(CASE WHEN [Analysis] IS NOT NULL
             THEN [Amount] - ([Billed Amount] + [Write-up/down])
             ELSE [Amount] * -1
        END)                                                                AS CCH_Outstanding,
    CAST(0 AS MONEY)                                                        AS PE_Outstanding
INTO #WIPDiff
FROM CCH_WIP_Export
GROUP BY [Cltnum]

UNION ALL

SELECT
    E.ClientCode                                                            AS [Cltnum],
    0                                                                       AS CCH_Outstanding,
    SUM(W.WIPOutstanding)                                                   AS PE_Outstanding
FROM tblTranWIP W
INNER JOIN tblEngagement E ON E.ContIndex = W.ContIndex
WHERE E.ContIndex < 900000
GROUP BY E.ClientCode;

-- Clients needing a balancing adjustment
SELECT
    [Cltnum],
    SUM(PE_Outstanding) - SUM(CCH_Outstanding)                              AS AdjustmentAmount
INTO #Adjustments
FROM #WIPDiff
GROUP BY [Cltnum]
HAVING ABS(SUM(PE_Outstanding) - SUM(CCH_Outstanding)) >= 0.01;

-- Insert balancing rows (dated day before cutoff as a historical summary entry)
INSERT INTO CCH_WIP_Export (
    [Cltnum], [Engagement], [TransDate], [Employee], [Service/Work Code],
    [Project], [ProjectName], [Billable/Non-billable], [Hours], [Amount],
    [Rate], [Cost], [Units], [Memo], [Billed Amount], [Surcharge (If any)],
    [Write-up/down], [Invoice Number], [Invoice Date], [Write Off Number],
    [Write Off Date], [Task], [Analysis], [EntryType]
)
SELECT
    A.[Cltnum],
    0,                                                      -- Engagement
    DATEADD(DAY, -1, @CutoffDate),                          -- TransDate
    NULL,                                                   -- Employee
    NULL,                                                   -- Service/Work Code
    NULL,                                                   -- Project
    NULL,                                                   -- ProjectName
    'Billable',                                             -- Billable/Non-billable
    0,                                                      -- Hours
    A.AdjustmentAmount * -1,                                -- Amount
    0,                                                      -- Rate
    0,                                                      -- Cost
    0,                                                      -- Units
    'WIP Balance Adjustment - Historical Reconciliation',   -- Memo
    0,                                                      -- Billed Amount
    0,                                                      -- Surcharge
    0,                                                      -- Write-up/down
    0,                                                      -- Invoice Number
    NULL,                                                   -- Invoice Date
    0,                                                      -- Write Off Number
    NULL,                                                   -- Write Off Date
    NULL,                                                   -- Task
    NULL,                                                   -- Analysis
    'Summary Progress Bill'                                 -- EntryType
FROM #Adjustments A
WHERE A.AdjustmentAmount <> 0;

-- Report adjustments made
SELECT
    [Cltnum],
    AdjustmentAmount,
    'Adjustment inserted' AS Status
FROM #Adjustments
WHERE AdjustmentAmount <> 0
ORDER BY [Cltnum];

/*
--------------------------------------------------------------------------------
STEP 8: Final Output and Reconciliation
--------------------------------------------------------------------------------
*/

-- Reconciliation check: export outstanding vs PE outstanding
SELECT
    'CCH Export Outstanding' AS Source,
    SUM(CASE WHEN [Analysis] IS NOT NULL
             THEN [Amount] - ([Billed Amount] + [Write-up/down])
             ELSE [Amount] * -1
        END) AS TotalOutstanding
FROM CCH_WIP_Export

UNION ALL

SELECT
    'PE Actual Outstanding',
    SUM(WIPOutstanding)
FROM tblTranWIP
WHERE ContIndex < 900000;

-- Final export
SELECT TOP 800000 *
FROM CCH_WIP_Export
ORDER BY Idx;

/*
--------------------------------------------------------------------------------
Cleanup
--------------------------------------------------------------------------------
*/

DROP TABLE IF EXISTS #Bills;
DROP TABLE IF EXISTS #CreditRebillMap;
DROP TABLE IF EXISTS #BillsConsolidated;
DROP TABLE IF EXISTS #Final;
DROP TABLE IF EXISTS #WIPDiff;
DROP TABLE IF EXISTS #Adjustments;

GO
